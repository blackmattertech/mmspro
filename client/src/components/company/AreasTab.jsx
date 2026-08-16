import { useEffect, useMemo, useState, useRef } from 'react'
import { usePermissions } from '../../hooks/usePermissions'
import { useAreas } from '../../hooks/useAreas'
import { useLocations } from '../../hooks/useLocations'
import { useDepartments } from '../../hooks/useDepartments'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { getAreasTemplate, bulkUploadAreas } from '../../lib/api'
import NavIcon from '../layout/NavIcon'
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
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkError, setBulkError] = useState(null)
  const [bulkResult, setBulkResult] = useState(null)
  const bulkInputRef = useRef(null)

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
    if (!window.confirm(`Delete area "${area.name}"?`)) return
    await remove(area.id)
  }

  const handleToggle = async (area, isActive) => {
    setTogglingId(area.id)
    try {
      await toggleActive(area.id, isActive)
    } finally {
      setTogglingId(null)
    }
  }

  const handleDownloadTemplate = async () => {
    setBulkError(null)
    try {
      const { filename, contentType, data } = await getAreasTemplate()
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
      const blob = new Blob([bytes], { type: contentType })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename || 'areas-template.xlsx'
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setBulkError(err.message)
    }
  }

  const handleBulkFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBulkBusy(true)
    setBulkError(null)
    setBulkResult(null)
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(new Error('Could not read the file'))
        reader.readAsDataURL(file)
      })
      const base64 = String(dataUrl).split(',').pop()
      const result = await bulkUploadAreas(base64)
      setBulkResult(result)
      await reload({ silent: true })
    } catch (err) {
      setBulkError(err.message)
    } finally {
      setBulkBusy(false)
      if (bulkInputRef.current) bulkInputRef.current.value = ''
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
              <button
                type="button"
                className="company-btn company-btn--secondary equipment-bulk-btn"
                onClick={handleDownloadTemplate}
              >
                <span className="equipment-bulk-btn__icon" aria-hidden="true">
                  <NavIcon name="download" />
                </span>
                Download template
              </button>
              <button
                type="button"
                className="company-btn company-btn--secondary equipment-bulk-btn"
                onClick={() => bulkInputRef.current?.click()}
                disabled={bulkBusy}
              >
                <span className="equipment-bulk-btn__icon" aria-hidden="true">
                  <NavIcon name="upload" />
                </span>
                {bulkBusy ? 'Uploading…' : 'Bulk upload'}
              </button>
              <input
                ref={bulkInputRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                style={{ display: 'none' }}
                onChange={handleBulkFile}
              />
              <button type="button" className="company-btn company-btn--primary" onClick={openCreate}>
                + Add Area
              </button>
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
      {bulkError && <div className="company-error">{bulkError}</div>}
      {bulkResult && (
        <div className={`company-alert ${bulkResult.failed ? 'company-alert--warning' : 'company-alert--success'}`}>
          <strong>{bulkResult.created}</strong> area(s) created
          {bulkResult.failed ? `, ${bulkResult.failed} row(s) failed.` : '.'}
          {bulkResult.errors?.length > 0 && (
            <ul className="equipment-bulk-errors">
              {bulkResult.errors.slice(0, 10).map((err) => (
                <li key={err.row}>Row {err.row}: {err.message}</li>
              ))}
              {bulkResult.errors.length > 10 && (
                <li>…and {bulkResult.errors.length - 10} more</li>
              )}
            </ul>
          )}
        </div>
      )}

      {loading ? (
        <div className="company-loading">Loading areas…</div>
      ) : areas.length === 0 ? (
        <div className="company-empty">No areas yet. Add an area under a location and department.</div>
      ) : filteredAreas.length === 0 ? (
        <div className="company-empty">No areas match your filters.</div>
      ) : (
        <div className="company-table-wrap">
          <div className="company-table-scroll">
          <table className="company-table master-table">
            <thead>
              <tr>
                {isAreaColumnVisible('name') && <th>Name</th>}
                {isAreaColumnVisible('code') && <th>Code</th>}
                {isAreaColumnVisible('location') && <th>Location</th>}
                {isAreaColumnVisible('department') && <th>Department</th>}
                {canManage && isAreaColumnVisible('active') && <th>Active</th>}
                {canManage && isAreaColumnVisible('actions') && <th aria-label="Actions" />}
              </tr>
            </thead>
            <tbody>
              {pagedAreas.map((area) => (
                <tr
                  key={area.id}
                  {...tableRowClickProps({
                    onOpen: () => openView(area),
                    label: `View ${area.name}`,
                    className: area.is_active === false ? 'company-table__row--inactive' : undefined,
                  })}
                >
                  {isAreaColumnVisible('name') && <td>{area.name}</td>}
                  {isAreaColumnVisible('code') && <td>{area.code || '—'}</td>}
                  {isAreaColumnVisible('location') && <td>{area.org_locations?.name || '—'}</td>}
                  {isAreaColumnVisible('department') && <td>{area.departments?.name || '—'}</td>}
                  {canManage && isAreaColumnVisible('active') && (
                    <td onClick={stopTableRowClick}>
                      <GooToggle
                        checked={area.is_active !== false}
                        disabled={togglingId === area.id}
                        onChange={(checked) => handleToggle(area, checked)}
                        ariaLabel={`Toggle ${area.name}`}
                      />
                    </td>
                  )}
                  {canManage && isAreaColumnVisible('actions') && (
                    <td className="company-table__actions" onClick={stopTableRowClick}>
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
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <TablePagination {...pagination} />
          />
          </div>
        </div>
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
          onClose={() => setModalOpen(false)}
          onSave={handleSave}
        />
      )}
    </div>
  )
}
