import { useEffect, useMemo, useRef, useState } from 'react'
import { usePermissions } from '../../hooks/usePermissions'
import { useWorkCenters } from '../../hooks/useWorkCenters'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { deleteWorkCenter } from '../../lib/api'
import { invalidateReferenceCache } from '../../lib/referenceDataCache'
import GooToggle from '../ui/GooToggle'
import TrashIcon from '../ui/TrashIcon'
import EditIcon from '../ui/EditIcon'
import WorkCenterModal from './WorkCenterModal'
import TablePagination from '../shared/TablePagination'
import TableColumnPicker from '../shared/TableColumnPicker'
import TableFilterToolbar from '../shared/TableFilterToolbar'
import { useTablePagination } from '../../hooks/useTablePagination'
import { useTableColumnPrefs } from '../../hooks/useTableColumnPrefs'
import { TABLE_SORT_OPTIONS, applyTableFilters } from '../../lib/tableFilters'
import { stopTableRowClick, tableRowClickProps } from '../../lib/clickableTableRow'
import RecordDetailModal from '../shared/RecordDetailModal'
import { WorkCenterDetailContent } from './CompanyRecordDetails'
import '../shared/TableColumnPicker.css'
import '../shared/TableFilterToolbar.css'
import '../workorders/WorkOrdersPage.css'
import './CompanyShared.css'

function canPickAnyLocation({ isOrgAdmin, accessRole }) {
  if (isOrgAdmin) return true
  const roleName = accessRole?.name?.trim().toLowerCase() || ''
  return roleName === 'admin'
}

const WORK_CENTER_FILTER_FIELDS = [
  { value: 'name', label: 'Name' },
  { value: 'code', label: 'Code' },
  { value: 'location', label: 'Location' },
  { value: 'status', label: 'Status', placeholder: 'active or inactive' },
]

export default function WorkCentersTab({ canManage }) {
  const { isOrgAdmin, locationId: myLocationId, accessRole } = usePermissions()
  const canSelectAnyLocation = canPickAnyLocation({ isOrgAdmin, accessRole })
  const [search, setSearch] = useState('')
  const [filterField, setFilterField] = useState('')
  const [filterValue, setFilterValue] = useState('')
  const [sortBy, setSortBy] = useState('name_asc')
  const debouncedSearch = useDebouncedValue(search.trim())
  const scopedLocationId = canSelectAnyLocation ? undefined : (myLocationId || undefined)
  const [listTotal, setListTotal] = useState(0)
  const paginationResetKey = `${debouncedSearch}|${filterField}|${filterValue}|${sortBy}|${scopedLocationId || ''}`
  const pagination = useTablePagination(listTotal, { resetKey: paginationResetKey })
  const {
    workCenters,
    total,
    loading,
    saving,
    error,
    create,
    update,
    remove,
    toggleActive,
    reload,
  } = useWorkCenters({
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
  const [selected, setSelected] = useState(() => new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)
  const selectAllRef = useRef(null)

  const filteredWorkCenters = useMemo(() => applyTableFilters(workCenters, {
    fieldFilter: { field: filterField, value: filterValue },
    fieldFilterGetters: {
      name: (row) => row.name,
      code: (row) => row.code,
      location: (row) => row.org_locations?.name || 'All locations',
      status: (row) => (row.is_active === false ? 'inactive' : 'active'),
    },
    sortBy,
    getName: (row) => row.name,
    getCreatedAt: (row) => row.created_at,
  }), [workCenters, filterField, filterValue, sortBy])

  const pagedRows = filteredWorkCenters
  const visibleIds = useMemo(() => pagedRows.map((row) => row.id), [pagedRows])
  const selectedVisibleCount = visibleIds.filter((id) => selected.has(id)).length
  const allVisibleSelected = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someVisibleSelected
    }
  }, [someVisibleSelected])

  const columnDefs = useMemo(() => {
    const cols = [
      { id: 'name', label: 'Name' },
      { id: 'code', label: 'Code' },
      { id: 'location', label: 'Location' },
      { id: 'description', label: 'Description' },
    ]
    if (canManage) {
      cols.push({ id: 'active', label: 'Active' })
      cols.push({ id: 'actions', label: 'Actions', locked: true })
    }
    return cols
  }, [canManage])
  const {
    isVisible,
    toggleColumn,
    resetColumns,
    columnDefs: pickerColumns,
    visibleColumnIds,
  } = useTableColumnPrefs('company-work-centers', columnDefs)

  const openCreate = () => {
    setEditing(null)
    setModalOpen(true)
  }

  const openView = (row) => setViewing(row)

  const openEdit = (row) => {
    setEditing(row)
    setModalOpen(true)
  }

  const handleSave = async (payload) => {
    if (editing) await update(editing.id, payload)
    else await create(payload)
    setModalOpen(false)
  }

  const handleDelete = async (row) => {
    if (!window.confirm(`Delete work center "${row.name}"? This cannot be undone.`)) return
    setDeleteError(null)
    try {
      await remove(row.id)
      setSelected((prev) => {
        const next = new Set(prev)
        next.delete(row.id)
        return next
      })
    } catch (err) {
      setDeleteError(err.message || 'Could not delete this work center')
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
    const label = ids.length === 1 ? 'this work center' : `${ids.length} work centers`
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return
    setBulkDeleting(true)
    setDeleteError(null)
    try {
      for (const id of ids) {
        await deleteWorkCenter(id)
      }
      invalidateReferenceCache('work-centers')
      await reload({ silent: true, force: true })
      setSelected(new Set())
      if (viewing && ids.includes(viewing.id)) setViewing(null)
    } catch (err) {
      setDeleteError(err.message || 'Could not delete the selected work centers')
      invalidateReferenceCache('work-centers')
      await reload({ silent: true, force: true })
    } finally {
      setBulkDeleting(false)
    }
  }

  const handleToggle = async (row, isActive) => {
    setTogglingId(row.id)
    try {
      await toggleActive(row.id, isActive)
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
            placeholder: 'Search work centers...',
            ariaLabel: 'Search work centers',
          }}
          filter={{
            fields: WORK_CENTER_FILTER_FIELDS,
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
              <button
                type="button"
                className="company-btn company-btn--primary"
                onClick={openCreate}
              >
                + Add Work Center
              </button>
            </>
          )}
          columnPicker={(
            <TableColumnPicker
              columnDefs={pickerColumns}
              visibleColumnIds={visibleColumnIds}
              onToggle={toggleColumn}
              onReset={resetColumns}
            />
          )}
        />
      </div>

      {error && <div className="company-alert">{error}</div>}
      {deleteError && <div className="company-alert">{deleteError}</div>}

      {loading ? (
        <div className="company-loading">Loading work centers…</div>
      ) : workCenters.length === 0 ? (
        <div className="company-empty">No work centers yet. Add a workshop, plant, or crew.</div>
      ) : filteredWorkCenters.length === 0 ? (
        <div className="company-empty">No work centers match your filters.</div>
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
                      aria-label="Select all work centers"
                    />
                  </th>
                )}
                {isVisible('name') && <th>Name</th>}
                {isVisible('code') && <th>Code</th>}
                {isVisible('location') && <th>Location</th>}
                {isVisible('description') && <th>Description</th>}
                {canManage && isVisible('active') && <th>Active</th>}
                {canManage && isVisible('actions') && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((row) => {
                const isActive = row.is_active !== false
                return (
                  <tr
                    key={row.id}
                    {...tableRowClickProps({
                      onOpen: () => openView(row),
                      label: `View ${row.name}`,
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
                          checked={selected.has(row.id)}
                          onChange={() => toggleSelected(row.id)}
                          aria-label={`Select ${row.name}`}
                        />
                      </td>
                    )}
                    {isVisible('name') && (
                      <td><span className="company-table__name">{row.name}</span></td>
                    )}
                    {isVisible('code') && (
                      <td><code className="company-code">{row.code || '—'}</code></td>
                    )}
                    {isVisible('location') && (
                      <td>{row.org_locations?.name || 'All locations'}</td>
                    )}
                    {isVisible('description') && (
                      <td>{row.description || '—'}</td>
                    )}
                    {canManage && isVisible('active') && (
                      <td onClick={stopTableRowClick}>
                        <GooToggle
                          checked={isActive}
                          disabled={togglingId === row.id}
                          onChange={(checked) => handleToggle(row, checked)}
                          ariaLabel={`${isActive ? 'Disable' : 'Enable'} ${row.name}`}
                        />
                      </td>
                    )}
                    {canManage && isVisible('actions') && (
                      <td onClick={stopTableRowClick}>
                        <div className="company-table__actions">
                          <button
                            type="button"
                            className="company-btn company-btn--secondary company-btn--compact company-btn--icon"
                            onClick={() => openEdit(row)}
                            aria-label={`Edit ${row.name}`}
                            title="Edit"
                          >
                            <EditIcon />
                          </button>
                          <button
                            type="button"
                            className="company-btn company-btn--danger company-btn--compact company-btn--icon"
                            onClick={() => handleDelete(row)}
                            aria-label={`Delete ${row.name}`}
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
          <WorkCenterDetailContent workCenter={viewing} />
        </RecordDetailModal>
      )}

      {modalOpen && (
        <WorkCenterModal
          workCenter={editing}
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
