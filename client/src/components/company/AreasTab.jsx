import { useEffect, useMemo, useState, useRef } from 'react'
import { usePermissions } from '../../hooks/usePermissions'
import { useAreas } from '../../hooks/useAreas'
import { useLocations } from '../../hooks/useLocations'
import { useDepartments } from '../../hooks/useDepartments'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { getAreasTemplate, bulkUploadAreas, deleteArea } from '../../lib/api'
import GooToggle from '../ui/GooToggle'
import TrashIcon from '../ui/TrashIcon'
import EditIcon from '../ui/EditIcon'
import AreaModal from './AreaModal'
import TablePagination from '../shared/TablePagination'
import TableColumnPicker from '../shared/TableColumnPicker'
import TableFilterToolbar from '../shared/TableFilterToolbar'
import { useTablePagination } from '../../hooks/useTablePagination'
import { useTableColumnPrefs } from '../../hooks/useTableColumnPrefs'
import { TABLE_SORT_OPTIONS, applyTableFilters } from '../../lib/tableFilters'
import { stopTableRowClick, tableRowClickProps } from '../../lib/clickableTableRow'
import RecordDetailModal from '../shared/RecordDetailModal'
import { AreaDetailContent } from './CompanyRecordDetails'
import {
  useMasterBulkUpload,
  MasterBulkActions,
  MasterBulkResult,
} from './MasterBulkUpload'
import '../shared/TableColumnPicker.css'
import '../shared/TableFilterToolbar.css'
import '../workorders/WorkOrdersPage.css'
import './CompanyShared.css'

function canPickAnyLocation({ isOrgAdmin, accessRole }) {
  if (isOrgAdmin) return true
  const roleName = accessRole?.name?.trim().toLowerCase() || ''
  return roleName === 'admin'
}

function areaSearchHaystack(area) {
  const parts = [
    area.name,
    area.code,
    area.org_locations?.name,
    area.org_locations?.code,
    area.departments?.name,
    area.departments?.code,
    area.is_active === false ? 'inactive' : 'active',
  ]
  return parts.filter(Boolean).join(' ').toLowerCase()
}

const AREA_FILTER_FIELDS = [
  { value: 'name', label: 'Name' },
  { value: 'code', label: 'Code' },
  { value: 'location', label: 'Location' },
  { value: 'department', label: 'Department' },
  { value: 'status', label: 'Status', placeholder: 'active or inactive' },
]

export default function AreasTab({ canManage }) {
  const { isOrgAdmin, locationId: myLocationId, accessRole } = usePermissions()
  const canSelectAnyLocation = canPickAnyLocation({ isOrgAdmin, accessRole })

  const [search, setSearch] = useState('')
  const [filterField, setFilterField] = useState('')
  const [filterValue, setFilterValue] = useState('')
  const [sortBy, setSortBy] = useState('name_asc')
  const debouncedSearch = useDebouncedValue(search.trim())

  const scopedLocationId = canSelectAnyLocation ? undefined : (myLocationId || undefined)

  const { locations } = useLocations()
  const { departments } = useDepartments(scopedLocationId)
  const [listTotal, setListTotal] = useState(0)
  const paginationResetKey = `${debouncedSearch}|${filterField}|${filterValue}|${sortBy}|${scopedLocationId || ''}`
  const pagination = useTablePagination(listTotal, { resetKey: paginationResetKey })
  const { areas, total, loading, saving, error, create, update, remove, toggleActive, reload } = useAreas({
    locationId: scopedLocationId,
    search: debouncedSearch,
    limit: pagination.pageSize,
    offset: pagination.offset,
  })
  useEffect(() => { setListTotal(total) }, [total])
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [togglingId, setTogglingId] = useState(null)

  const activeLocations = locations.filter((l) => l.is_active !== false)
  const activeDepartments = departments.filter((d) => d.is_active !== false)

  const filteredAreas = useMemo(() => applyTableFilters(areas, {
    fieldFilter: { field: filterField, value: filterValue },
    fieldFilterGetters: {
      name: (area) => area.name,
      code: (area) => area.code,
      location: (area) => area.org_locations?.name,
      department: (area) => area.departments?.name,
      status: (area) => (area.is_active === false ? 'inactive' : 'active'),
    },
    sortBy,
    getName: (area) => area.name,
    getCreatedAt: (area) => area.created_at,
  }), [areas, filterField, filterValue, sortBy])

  const pagedAreas = filteredAreas
  const [selected, setSelected] = useState(() => new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)
  const selectAllRef = useRef(null)
  const visibleIds = useMemo(() => pagedAreas.map((area) => area.id), [pagedAreas])
  const selectedVisibleCount = visibleIds.filter((id) => selected.has(id)).length
  const allVisibleSelected = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someVisibleSelected
    }
  }, [someVisibleSelected])

  const {
    bulkInputRef,
    bulkBusy,
    bulkError,
    bulkResult,
    handleDownloadTemplate,
    handleBulkFile,
  } = useMasterBulkUpload({
    downloadTemplate: getAreasTemplate,
    upload: bulkUploadAreas,
    onSuccess: async () => {
      await reload({ silent: true })
    },
    defaultFilename: 'areas-template.xlsx',
  })
  const areaColumnDefs = useMemo(() => {
    const cols = [
      { id: 'name', label: 'Name' },
      { id: 'code', label: 'Code' },
      { id: 'location', label: 'Location' },
      { id: 'department', label: 'Department' },
    ]
    if (canManage) {
      cols.push({ id: 'active', label: 'Active' })
      cols.push({ id: 'actions', label: 'Actions', locked: true })
    }
    return cols
  }, [canManage])
  const {
    isVisible: isAreaColumnVisible,
    toggleColumn: toggleAreaColumn,
    resetColumns: resetAreaColumns,
    columnDefs: areaPickerColumns,
    visibleColumnIds: areaVisibleColumnIds,
  } = useTableColumnPrefs('company-areas', areaColumnDefs)

  const openCreate = () => {
    setEditing(null)
    setModalOpen(true)
  }

  const openView = (area) => setViewing(area)

  const openEdit = (area) => {
    setEditing(area)
    setModalOpen(true)
  }

  const handleSave = async (payload) => {
    if (editing) await update(editing.id, payload)
    else await create(payload)
    setModalOpen(false)
  }

  const handleDelete = async (area) => {
    if (!window.confirm(`Delete area "${area.name}"? This cannot be undone.`)) return
    setDeleteError(null)
    try {
      await remove(area.id)
      setSelected((prev) => {
        const next = new Set(prev)
        next.delete(area.id)
        return next
      })
    } catch (err) {
      setDeleteError(err.message || 'Could not delete this area')
    }
  }

  const toggleSelected = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected) {
        visibleIds.forEach((id) => next.delete(id))
      } else {
        visibleIds.forEach((id) => next.add(id))
      }
      return next
    })
  }

  const handleBulkDelete = async () => {
    const ids = [...selected]
    if (!ids.length) return
    const label = ids.length === 1 ? 'this area' : `${ids.length} areas`
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return
    setBulkDeleting(true)
    setDeleteError(null)
    try {
      for (const id of ids) {
        await deleteArea(id)
      }
      await reload({ silent: true })
      setSelected(new Set())
      if (viewing && ids.includes(viewing.id)) setViewing(null)
    } catch (err) {
      setDeleteError(err.message || 'Could not delete the selected areas')
      await reload({ silent: true })
    } finally {
      setBulkDeleting(false)
    }
  }

  const handleToggle = async (area, isActive) => {
    setTogglingId(area.id)
    try {
      await toggleActive(area.id, isActive)
    } finally {
      setTogglingId(null)
    }
  }

  return (
    <div className="company-panel">
      <div className="company-panel__toolbar company-panel__toolbar--filters">
        <TableFilterToolbar
          search={{
            value: search,
            onChange: setSearch,
            placeholder: 'Search areas...',
            ariaLabel: 'Search areas',
          }}
          filter={{
            fields: AREA_FILTER_FIELDS,
            field: filterField,
            onFieldChange: setFilterField,
            value: filterValue,
            onValueChange: setFilterValue,
          }}
          sort={{ value: sortBy, onChange: setSortBy, options: TABLE_SORT_OPTIONS }}
          actions={canManage && (
            <>
              {selected.size > 0 && (
              <button
                type="button"
                className="company-btn company-btn--danger"
                disabled={bulkDeleting || saving}
                onClick={handleBulkDelete}
              >
                <TrashIcon />
                {bulkDeleting ? 'Deleting...' : `Delete (${selected.size})`}
              </button>
              )}
              <MasterBulkActions
                onDownload={handleDownloadTemplate}
                bulkBusy={bulkBusy}
                bulkInputRef={bulkInputRef}
                onFileChange={handleBulkFile}
                addLabel="+ Add Area"
                onAdd={openCreate}
                title="Bulk upload areas"
                bulkError={bulkError}
                bulkResult={bulkResult}
                noun="area"
              />
            </>
          )}
          columnPicker={(
            <TableColumnPicker
              columnDefs={areaPickerColumns}
              visibleColumnIds={areaVisibleColumnIds}
              onToggle={toggleAreaColumn}
              onReset={resetAreaColumns}
            />
          )}
        />
      </div>

      {error && <div className="company-alert">{error}</div>}
      {deleteError && <div className="company-alert">{deleteError}</div>}
      {bulkError && <div className="company-error">{bulkError}</div>}
      <MasterBulkResult result={bulkResult} noun="area" />

      {loading ? (
        <div className="company-loading">Loading areas…</div>
      ) : areas.length === 0 ? (
        <div className="company-empty">No areas yet. Add an area under a location and department.</div>
      ) : filteredAreas.length === 0 ? (
        <div className="company-empty">No areas match your filters.</div>
      ) : (
        <>
        <div className="company-table-wrap">
          <div className="company-table-scroll">
          <table className="company-table master-table">
            <thead>
              <tr>
                {canManage && (
                  <th className="company-table__cell--check">
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAllVisible}
                      aria-label="Select all areas"
                    />
                  </th>
                )}
                {isAreaColumnVisible('name') && <th>Name</th>}
                {isAreaColumnVisible('code') && <th>Code</th>}
                {isAreaColumnVisible('location') && <th>Location</th>}
                {isAreaColumnVisible('department') && <th>Department</th>}
                {canManage && isAreaColumnVisible('active') && <th>Active</th>}
                {canManage && isAreaColumnVisible('actions') && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {pagedAreas.map((area) => {
                const isActive = area.is_active !== false
                return (
                <tr
                  key={area.id}
                  {...tableRowClickProps({
                    onOpen: () => openView(area),
                    label: `View ${area.name}`,
                    className: !isActive ? 'company-table__row--inactive' : undefined,
                  })}
                >
                  {canManage && (
                    <td
                      className="company-table__cell--check"
                      onClick={stopTableRowClick}
                      onKeyDown={stopTableRowClick}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(area.id)}
                        onChange={() => toggleSelected(area.id)}
                        aria-label={`Select ${area.name}`}
                      />
                    </td>
                  )}
                  {isAreaColumnVisible('name') && (
                    <td><span className="company-table__name">{area.name}</span></td>
                  )}
                  {isAreaColumnVisible('code') && (
                    <td><code className="company-code">{area.code || '—'}</code></td>
                  )}
                  {isAreaColumnVisible('location') && <td>{area.org_locations?.name || '—'}</td>}
                  {isAreaColumnVisible('department') && <td>{area.departments?.name || '—'}</td>}
                  {canManage && isAreaColumnVisible('active') && (
                    <td onClick={stopTableRowClick}>
                      <GooToggle
                        checked={isActive}
                        disabled={togglingId === area.id}
                        onChange={(checked) => handleToggle(area, checked)}
                        ariaLabel={`${isActive ? 'Disable' : 'Enable'} ${area.name}`}
                      />
                    </td>
                  )}
                  {canManage && isAreaColumnVisible('actions') && (
                    <td onClick={stopTableRowClick}>
                      <div className="company-table__actions">
                        <button
                          type="button"
                          className="company-btn company-btn--secondary company-btn--compact company-btn--icon"
                          onClick={() => openEdit(area)}
                          aria-label={`Edit ${area.name}`}
                          title="Edit"
                        >
                          <EditIcon />
                        </button>
                        <button
                          type="button"
                          className="company-btn company-btn--danger company-btn--compact company-btn--icon"
                          onClick={() => handleDelete(area)}
                          aria-label={`Delete ${area.name}`}
                          title="Delete"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </div>
        <TablePagination {...pagination} />
        </>
      )}

      {viewing && (
        <RecordDetailModal
          title={viewing.name}
          subtitle={viewing.code ? `Code ${viewing.code}` : undefined}
          onClose={() => setViewing(null)}
          onEdit={canManage ? () => {
            const record = viewing
            setViewing(null)
            openEdit(record)
          } : undefined}
        >
          <AreaDetailContent area={viewing} />
        </RecordDetailModal>
      )}

      {modalOpen && (
        <AreaModal
          area={editing}
          saving={saving}
          defaultLocationId={scopedLocationId || ''}
          lockLocation={Boolean(scopedLocationId)}
          onClose={() => setModalOpen(false)}
          onSave={handleSave}
        />
      )}
    </div>
  )
}
