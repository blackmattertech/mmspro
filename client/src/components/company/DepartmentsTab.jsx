import { useEffect, useMemo, useRef, useState } from 'react'
import { useDepartments } from '../../hooks/useDepartments'
import { useLocations } from '../../hooks/useLocations'
import { useOrgLimits } from '../../hooks/useOrgLimits'
import { useLimitExceeded } from '../../hooks/useLimitExceeded'
import { usePermissions } from '../../hooks/usePermissions'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { isLimitError } from '../../lib/limitErrors'
import { getDepartmentsTemplate, bulkUploadDepartments, deleteDepartment } from '../../lib/api'
import { invalidateReferenceCache } from '../../lib/referenceDataCache'
import GooToggle from '../ui/GooToggle'
import TrashIcon from '../ui/TrashIcon'
import EditIcon from '../ui/EditIcon'
import DepartmentModal, { formatDepartmentLocation } from './DepartmentModal'
import LimitExceededCard from '../shared/LimitExceededCard'
import TablePagination from '../shared/TablePagination'
import TableColumnPicker from '../shared/TableColumnPicker'
import TableFilterToolbar from '../shared/TableFilterToolbar'
import { useTablePagination } from '../../hooks/useTablePagination'
import { useTableColumnPrefs } from '../../hooks/useTableColumnPrefs'
import { TABLE_SORT_OPTIONS, applyTableFilters } from '../../lib/tableFilters'
import { stopTableRowClick, tableRowClickProps } from '../../lib/clickableTableRow'
import RecordDetailModal from '../shared/RecordDetailModal'
import { DepartmentDetailContent } from './CompanyRecordDetails'
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

const DEPARTMENT_FILTER_FIELDS = [
  { value: 'name', label: 'Name' },
  { value: 'code', label: 'Code' },
  { value: 'location', label: 'Location' },
  { value: 'status', label: 'Status', placeholder: 'active or inactive' },
]

export default function DepartmentsTab({ canManage }) {
  const { isOrgAdmin, locationId: myLocationId, accessRole } = usePermissions()
  const canSelectAnyLocation = canPickAnyLocation({ isOrgAdmin, accessRole })
  const [search, setSearch] = useState('')
  const [filterField, setFilterField] = useState('')
  const [filterValue, setFilterValue] = useState('')
  const [sortBy, setSortBy] = useState('name_asc')
  const debouncedSearch = useDebouncedValue(search.trim())
  const [listTotal, setListTotal] = useState(0)
  const locationFilter = canSelectAnyLocation ? '' : (myLocationId || '')
  const filterResetKey = `${debouncedSearch}|${filterField}|${filterValue}|${sortBy}|${locationFilter}`
  const pagination = useTablePagination(listTotal, { resetKey: filterResetKey })
  const { locations, create: createLocation, saving: savingLocation } = useLocations()
  const { departments, total, loading, saving, error, create, update, remove, toggleActive, reload } = useDepartments(
    locationFilter,
    { search: debouncedSearch, limit: pagination.pageSize, offset: pagination.offset },
  )
  useEffect(() => { setListTotal(total) }, [total])
  const { isResourceAtLimit, reload: reloadLimits } = useOrgLimits()
  const { visible: limitVisible, resource: limitResource, trigger: triggerLimit, tryHandleLimitError, dismiss: dismissLimit } = useLimitExceeded()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [togglingId, setTogglingId] = useState(null)

  const {
    bulkInputRef,
    bulkBusy,
    bulkError,
    bulkResult,
    handleDownloadTemplate,
    handleBulkFile,
  } = useMasterBulkUpload({
    downloadTemplate: getDepartmentsTemplate,
    upload: bulkUploadDepartments,
    onSuccess: async () => {
      await reload?.({ silent: true })
      await reloadLimits()
    },
    defaultFilename: 'departments-template.xlsx',
  })

  const activeLocations = locations.filter((l) => l.is_active !== false)
  const activeDepartments = departments.filter((d) => d.is_active !== false)
  const atDepartmentLimit = isResourceAtLimit('departments', 'department_limit')
  const defaultCreateLocationId = canSelectAnyLocation ? '' : (myLocationId || '')
  const lockCreateLocation = Boolean(defaultCreateLocationId)

  const filteredDepartments = useMemo(() => applyTableFilters(departments, {
    fieldFilter: { field: filterField, value: filterValue },
    fieldFilterGetters: {
      name: (dept) => dept.name,
      code: (dept) => dept.code,
      location: (dept) => formatDepartmentLocation(dept),
      status: (dept) => (dept.is_active === false ? 'inactive' : 'active'),
    },
    sortBy,
    getName: (dept) => dept.name,
    getCreatedAt: (dept) => dept.created_at,
  }), [departments, filterField, filterValue, sortBy])

  const pagedDepartments = filteredDepartments
  const [selected, setSelected] = useState(() => new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)
  const selectAllRef = useRef(null)
  const visibleIds = useMemo(() => pagedDepartments.map((dept) => dept.id), [pagedDepartments])
  const selectedVisibleCount = visibleIds.filter((id) => selected.has(id)).length
  const allVisibleSelected = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someVisibleSelected
    }
  }, [someVisibleSelected])
  const departmentColumnDefs = useMemo(() => {
    const cols = [
      { id: 'code', label: 'Code' },
      { id: 'name', label: 'Name' },
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
    isVisible: isDepartmentColumnVisible,
    toggleColumn: toggleDepartmentColumn,
    resetColumns: resetDepartmentColumns,
    columnDefs: departmentPickerColumns,
    visibleColumnIds: departmentVisibleColumnIds,
  } = useTableColumnPrefs('company-departments', departmentColumnDefs)

  const openCreate = () => {
    if (atDepartmentLimit) {
      triggerLimit('Department')
      return
    }
    setEditing(null)
    setModalOpen(true)
  }

  const openView = (dept) => setViewing(dept)

  const openEdit = (dept) => {
    setEditing(dept)
    setModalOpen(true)
  }

  const handleSave = async (payload) => {
    try {
      if (editing) await update(editing.id, payload)
      else await create(payload)
      await reloadLimits()
      setModalOpen(false)
    } catch (err) {
      if (tryHandleLimitError(err, 'Department')) {
        setModalOpen(false)
      }
    }
  }

  const handleCreateLocation = async (payload) => {
    try {
      const created = await createLocation(payload)
      await reloadLimits()
      return created
    } catch (err) {
      if (tryHandleLimitError(err, 'Location')) {
        throw err
      }
      throw err
    }
  }

  const handleDelete = async (dept) => {
    if (!window.confirm(`Delete department "${dept.name}"? This cannot be undone.`)) return
    setDeleteError(null)
    try {
      await remove(dept.id)
      setSelected((prev) => {
        const next = new Set(prev)
        next.delete(dept.id)
        return next
      })
      await reloadLimits()
    } catch {
      // error shown by hook
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
    const label = ids.length === 1 ? 'this department' : `${ids.length} departments`
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return
    setBulkDeleting(true)
    setDeleteError(null)
    try {
      for (const id of ids) {
        await deleteDepartment(id)
      }
      invalidateReferenceCache('departments')
      await reload({ silent: true, force: true })
      await reloadLimits()
      setSelected(new Set())
      if (viewing && ids.includes(viewing.id)) setViewing(null)
    } catch (err) {
      if (!tryHandleLimitError(err, 'Department')) {
        setDeleteError(err.message || 'Could not delete the selected departments')
      }
      invalidateReferenceCache('departments')
      await reload({ silent: true, force: true })
    } finally {
      setBulkDeleting(false)
    }
  }

  const handleToggle = async (dept, isActive) => {
    setTogglingId(dept.id)
    try {
      await toggleActive(dept.id, isActive)
      await reloadLimits()
    } catch (err) {
      tryHandleLimitError(err, 'Department')
    } finally {
      setTogglingId(null)
    }
  }

  const showPlainError = error && !limitVisible && !isLimitError({ message: error })

  return (
    <div className="company-panel">
      <div className="company-panel__toolbar company-panel__toolbar--filters">
        <TableFilterToolbar
          search={{
            value: search,
            onChange: setSearch,
            placeholder: 'Search departments...',
            ariaLabel: 'Search departments',
          }}
          filter={{
            fields: DEPARTMENT_FILTER_FIELDS,
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
              addLabel="+ Add Department"
              onAdd={openCreate}
              title="Bulk upload departments"
              bulkError={bulkError}
              bulkResult={bulkResult}
              noun="department"
            />
            </>
          )}
          columnPicker={(
            <TableColumnPicker
              columnDefs={departmentPickerColumns}
              visibleColumnIds={departmentVisibleColumnIds}
              onToggle={toggleDepartmentColumn}
              onReset={resetDepartmentColumns}
            />
          )}
        />
      </div>

      {showPlainError && <div className="company-alert">{error}</div>}
      {deleteError && <div className="company-alert">{deleteError}</div>}
      {bulkError && <div className="company-error">{bulkError}</div>}
      <MasterBulkResult result={bulkResult} noun="department" />

      {loading ? (
        <div className="company-loading">Loading departments...</div>
      ) : departments.length === 0 ? (
        <div className="company-empty">No departments yet. Create teams like Maintenance, Operations, etc.</div>
      ) : filteredDepartments.length === 0 ? (
        <div className="company-empty">No departments match your filters.</div>
      ) : (
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
                      aria-label="Select all departments"
                    />
                  </th>
                )}
                {isDepartmentColumnVisible('code') && <th>Code</th>}
                {isDepartmentColumnVisible('name') && <th>Name</th>}
                {isDepartmentColumnVisible('location') && <th>Location</th>}
                {isDepartmentColumnVisible('description') && <th>Description</th>}
                {canManage && isDepartmentColumnVisible('active') && <th>Active</th>}
                {canManage && isDepartmentColumnVisible('actions') && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {pagedDepartments.map((dept) => {
                const isActive = dept.is_active !== false
                return (
                  <tr
                    key={dept.id}
                    {...tableRowClickProps({
                      onOpen: () => openView(dept),
                      label: `View ${dept.name}`,
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
                          checked={selected.has(dept.id)}
                          onChange={() => toggleSelected(dept.id)}
                          aria-label={`Select ${dept.name}`}
                        />
                      </td>
                    )}
                    {isDepartmentColumnVisible('code') && (
                      <td><code className="company-code">{dept.code || '—'}</code></td>
                    )}
                    {isDepartmentColumnVisible('name') && (
                      <td><span className="company-table__name">{dept.name}</span></td>
                    )}
                    {isDepartmentColumnVisible('location') && (
                      <td>{formatDepartmentLocation(dept)}</td>
                    )}
                    {isDepartmentColumnVisible('description') && (
                      <td>{dept.description || '—'}</td>
                    )}
                    {canManage && isDepartmentColumnVisible('active') && (
                      <td onClick={stopTableRowClick}>
                        <GooToggle
                          checked={isActive}
                          disabled={togglingId === dept.id || saving}
                          onChange={(checked) => handleToggle(dept, checked)}
                          ariaLabel={`${isActive ? 'Disable' : 'Enable'} ${dept.name}`}
                        />
                      </td>
                    )}
                    {canManage && isDepartmentColumnVisible('actions') && (
                      <td onClick={stopTableRowClick}>
                        <div className="company-table__actions">
                          <button
                            type="button"
                            className="company-btn company-btn--secondary company-btn--compact company-btn--icon"
                            onClick={() => openEdit(dept)}
                            aria-label={`Edit ${dept.name}`}
                            title="Edit"
                          >
                            <EditIcon />
                          </button>
                          <button
                            type="button"
                            className="company-btn company-btn--danger company-btn--compact company-btn--icon"
                            onClick={() => handleDelete(dept)}
                            aria-label={`Delete ${dept.name}`}
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
          <TablePagination {...pagination} />
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
          <DepartmentDetailContent department={viewing} />
        </RecordDetailModal>
      )}

      {modalOpen && (
        <DepartmentModal
          key={editing?.id ?? 'new'}
          department={editing}
          locations={activeLocations}
          departments={activeDepartments}
          saving={saving}
          nestedSaving={savingLocation}
          defaultLocationId={editing ? '' : defaultCreateLocationId}
          lockLocation={!editing && lockCreateLocation}
          onClose={() => setModalOpen(false)}
          onSave={handleSave}
          onCreateLocation={canSelectAnyLocation ? handleCreateLocation : undefined}
          onLimitExceeded={tryHandleLimitError}
        />
      )}

      {limitVisible && (
        <LimitExceededCard resource={limitResource} onClose={dismissLimit} />
      )}
    </div>
  )
}
