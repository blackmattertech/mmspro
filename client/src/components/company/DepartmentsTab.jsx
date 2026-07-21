import { useState } from 'react'
import { useDepartments } from '../../hooks/useDepartments'
import { useLocations } from '../../hooks/useLocations'
import { useOrgLimits } from '../../hooks/useOrgLimits'
import { useLimitExceeded } from '../../hooks/useLimitExceeded'
import { usePermissions } from '../../hooks/usePermissions'
import { isLimitError } from '../../lib/limitErrors'
import GooToggle from '../ui/GooToggle'
import TrashIcon from '../ui/TrashIcon'
import EditIcon from '../ui/EditIcon'
import DepartmentModal, { formatDepartmentLocation } from './DepartmentModal'
import FilterableSelect from '../ui/FilterableSelect'
import LimitExceededCard from '../shared/LimitExceededCard'
import TablePagination from '../shared/TablePagination'
import { useTablePagination } from '../../hooks/useTablePagination'
import './CompanyShared.css'

function canPickAnyLocation({ isOrgAdmin, accessRole }) {
  if (isOrgAdmin) return true
  const roleName = accessRole?.name?.trim().toLowerCase() || ''
  return roleName === 'admin'
}

export default function DepartmentsTab({ canManage }) {
  const { isOrgAdmin, locationId: myLocationId, accessRole } = usePermissions()
  const canSelectAnyLocation = canPickAnyLocation({ isOrgAdmin, accessRole })
  const [locationFilter, setLocationFilter] = useState('')
  const { locations, create: createLocation, saving: savingLocation } = useLocations()
  const { departments, loading, saving, error, create, update, remove, toggleActive } = useDepartments(locationFilter)
  const { isResourceAtLimit, reload: reloadLimits } = useOrgLimits()
  const { visible: limitVisible, resource: limitResource, trigger: triggerLimit, tryHandleLimitError, dismiss: dismissLimit } = useLimitExceeded()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [togglingId, setTogglingId] = useState(null)

  const activeLocations = locations.filter((l) => l.is_active !== false)
  const activeDepartments = departments.filter((d) => d.is_active !== false)
  const activeCount = activeDepartments.length
  const atDepartmentLimit = isResourceAtLimit('departments', 'department_limit', activeCount)
  const defaultCreateLocationId = canSelectAnyLocation ? '' : (myLocationId || '')
  const lockCreateLocation = Boolean(defaultCreateLocationId)
  const pagination = useTablePagination(departments.length, { resetKey: locationFilter })
  const pagedDepartments = pagination.paginate(departments)

  const openCreate = () => {
    if (atDepartmentLimit) {
      triggerLimit('Department')
      return
    }
    setEditing(null)
    setModalOpen(true)
  }

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
    if (!window.confirm(`Delete department "${dept.name}"?`)) return
    await remove(dept.id)
    await reloadLimits()
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
      <div className="company-panel__toolbar">
        <div className="company-panel__filters">
          <label className="company-filter">
            <span>Location</span>
            <FilterableSelect
              className="company-form__input--select"
              value={locationFilter}
              onChange={setLocationFilter}
              options={activeLocations}
              getOptionValue={(loc) => loc.id}
              getOptionLabel={(loc) => loc.name}
              emptyLabel="All locations"
              placeholder="All locations"
            />
          </label>
          <p className="company-panel__count">
            {activeCount} active · {departments.length} total department(s)
          </p>
        </div>
        {canManage && (
          <button type="button" className="company-btn company-btn--primary" onClick={openCreate}>
            + Add Department
          </button>
        )}
      </div>

      {showPlainError && <div className="company-alert">{error}</div>}

      {loading ? (
        <div className="company-loading">Loading departments...</div>
      ) : departments.length === 0 ? (
        <div className="company-empty">No departments yet. Create teams like Maintenance, Operations, etc.</div>
      ) : (
        <div className="company-table-wrap">
          <table className="company-table master-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Location</th>
                <th>Description</th>
                {canManage && <th>Active</th>}
                {canManage && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {pagedDepartments.map((dept) => {
                const isActive = dept.is_active !== false
                return (
                  <tr key={dept.id} className={!isActive ? 'company-table__row--inactive' : undefined}>
                    <td><code className="company-code">{dept.code || '—'}</code></td>
                    <td><span className="company-table__name">{dept.name}</span></td>
                    <td>{formatDepartmentLocation(dept)}</td>
                    <td>{dept.description || '—'}</td>
                    {canManage && (
                      <td>
                        <GooToggle
                          checked={isActive}
                          disabled={togglingId === dept.id || saving}
                          onChange={(checked) => handleToggle(dept, checked)}
                          ariaLabel={`${isActive ? 'Disable' : 'Enable'} ${dept.name}`}
                        />
                      </td>
                    )}
                    {canManage && (
                      <td>
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
          <TablePagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            pageSize={pagination.pageSize}
            pageSizeOptions={pagination.pageSizeOptions}
            totalCount={departments.length}
            rangeStart={pagination.rangeStart}
            rangeEnd={pagination.rangeEnd}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
          />
        </div>
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
