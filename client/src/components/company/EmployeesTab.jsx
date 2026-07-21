import { useMemo, useState, useEffect } from 'react'
import { useOrg } from '../../hooks/useOrg'
import { usePermissions } from '../../hooks/usePermissions'
import { useEmployees } from '../../hooks/useEmployees'
import { useLocations } from '../../hooks/useLocations'
import { useDepartments } from '../../hooks/useDepartments'
import { useRoles } from '../../hooks/useRoles'
import { useOrgLimits } from '../../hooks/useOrgLimits'
import { useLimitExceeded } from '../../hooks/useLimitExceeded'
import { isLimitError } from '../../lib/limitErrors'
import { uploadEmployeePhoto } from '../../lib/orgAssets'
import GooToggle from '../ui/GooToggle'
import TrashIcon from '../ui/TrashIcon'
import EditIcon from '../ui/EditIcon'
import EmployeeAvatar from './EmployeeAvatar'
import EmployeeModal from './EmployeeModal'
import FilterableSelect from '../ui/FilterableSelect'
import LimitExceededCard from '../shared/LimitExceededCard'
import TablePagination from '../shared/TablePagination'
import { useTablePagination } from '../../hooks/useTablePagination'
import { formatPhoneDisplay } from '../shared/PhoneInput'
import { isLocationHeadEmployee } from '../../lib/employeeRoles'
import './CompanyShared.css'

function employeeSearchHaystack(employee) {
  const emails = [
    employee.email,
    ...(employee.org_employee_emails || []).map((row) => row.email),
  ]
  const parts = [
    employee.emp_id,
    employee.name,
    employee.mobile,
    employee.mobile ? formatPhoneDisplay(employee.mobile) : '',
    ...emails,
    employee.departments?.name,
    employee.org_locations?.name,
    employee.manager?.name,
    employee.manager?.emp_id,
    employee.access_role?.name,
    isLocationHeadEmployee(employee) ? 'Location Head' : '',
    employee.is_active === false ? 'inactive' : 'active',
  ]
  return parts.filter(Boolean).join(' ').toLowerCase()
}

function canPickAnyLocation({ isOrgAdmin, accessRole }) {
  if (isOrgAdmin) return true
  const roleName = accessRole?.name?.trim().toLowerCase() || ''
  return roleName === 'admin'
}

export default function EmployeesTab({ canManage }) {
  const { org } = useOrg()
  const { isOrgAdmin, locationId: myLocationId, accessRole } = usePermissions()
  const canSelectAnyLocation = canPickAnyLocation({ isOrgAdmin, accessRole })
  const [departmentFilter, setDepartmentFilter] = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (canSelectAnyLocation || !myLocationId) return
    setLocationFilter((prev) => prev || myLocationId)
  }, [canSelectAnyLocation, myLocationId])

  const { locations, create: createLocation, reload: reloadLocations, saving: savingLocation } = useLocations()
  const { departments, create: createDepartment, reload: reloadDepartments, saving: savingDepartment } = useDepartments()
  const { roles: accessRoles } = useRoles()
  const {
    employees,
    loading,
    saving,
    error,
    create,
    update,
    remove,
    toggleActive,
  } = useEmployees({
    departmentId: departmentFilter,
    locationId: locationFilter,
  })

  const { isResourceAtLimit, reload: reloadLimits } = useOrgLimits()
  const { visible: limitVisible, resource: limitResource, trigger: triggerLimit, tryHandleLimitError, dismiss: dismissLimit } = useLimitExceeded()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [togglingId, setTogglingId] = useState(null)

  const activeLocations = locations.filter((l) => l.is_active !== false)
  const activeDepartments = departments.filter((d) => d.is_active !== false)
  const nestedSaving = savingLocation || savingDepartment
  const defaultCreateLocationId = canSelectAnyLocation ? '' : (myLocationId || '')
  const lockCreateLocation = Boolean(defaultCreateLocationId)

  const filteredEmployees = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return employees
    const terms = query.split(/\s+/).filter(Boolean)
    return employees.filter((employee) => {
      const haystack = employeeSearchHaystack(employee)
      return terms.every((term) => haystack.includes(term))
    })
  }, [employees, search])

  const activeCount = employees.filter((e) => e.is_active !== false).length
  const filteredActiveCount = filteredEmployees.filter((e) => e.is_active !== false).length
  const atEmployeeLimit = isResourceAtLimit('employees', 'employee_limit', activeCount)
  const searchActive = Boolean(search.trim())

  const paginationResetKey = `${search}|${departmentFilter}|${locationFilter}`
  const pagination = useTablePagination(filteredEmployees.length, { resetKey: paginationResetKey })
  const pagedEmployees = pagination.paginate(filteredEmployees)

  const refreshMasters = async () => {
    await Promise.all([reloadLocations(), reloadDepartments(), reloadLimits()])
  }

  const openCreate = () => {
    if (atEmployeeLimit) {
      triggerLimit('Employee')
      return
    }
    setEditing(null)
    setModalOpen(true)
  }

  const openEdit = (employee) => {
    setEditing(employee)
    setModalOpen(true)
  }

  const handleSave = async (payload, photoFile) => {
    try {
      let saved
      if (editing) saved = await update(editing.id, payload)
      else saved = await create(payload)

      if (photoFile && org?.id) {
        const path = await uploadEmployeePhoto(org.id, saved.id, photoFile)
        await update(saved.id, { photo_url: path })
      }

      await Promise.all([reloadLimits(), reloadDepartments()])
      setModalOpen(false)
    } catch (err) {
      if (tryHandleLimitError(err, 'Employee')) {
        setModalOpen(false)
        return
      }
      throw err
    }
  }

  const handleCreateLocation = async (payload) => {
    try {
      const created = await createLocation(payload)
      await refreshMasters()
      return created
    } catch (err) {
      tryHandleLimitError(err, 'Location')
      throw err
    }
  }

  const handleCreateDepartment = async (payload) => {
    try {
      const created = await createDepartment(payload)
      await refreshMasters()
      return created
    } catch (err) {
      tryHandleLimitError(err, 'Department')
      throw err
    }
  }

  const handleDelete = async (employee) => {
    if (!window.confirm(`Delete employee "${employee.name}"?`)) return
    await remove(employee.id)
    await reloadLimits()
  }

  const handleToggle = async (employee, isActive) => {
    setTogglingId(employee.id)
    try {
      await toggleActive(employee.id, isActive)
      await reloadLimits()
    } catch (err) {
      tryHandleLimitError(err, 'Employee')
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
            <span>Search</span>
            <input
              type="search"
              className="company-form__input company-form__input--search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search all columns…"
              aria-label="Search employees"
            />
          </label>
          <label className="company-filter">
            <span>Department</span>
            <FilterableSelect
              className="company-form__input--select"
              value={departmentFilter}
              onChange={setDepartmentFilter}
              options={activeDepartments}
              getOptionValue={(dept) => dept.id}
              getOptionLabel={(dept) => dept.name}
              emptyLabel="All departments"
              placeholder="All departments"
            />
          </label>
          <label className="company-filter">
            <span>Location</span>
            <FilterableSelect
              className="company-form__input--select"
              value={locationFilter}
              onChange={setLocationFilter}
              options={activeLocations}
              getOptionValue={(loc) => loc.id}
              getOptionLabel={(loc) => loc.name}
              disabled={!canSelectAnyLocation && Boolean(myLocationId)}
              allowEmpty={canSelectAnyLocation}
              emptyLabel="All locations"
              placeholder="All locations"
            />
          </label>
          <p className="company-panel__count">
            {searchActive
              ? `${filteredActiveCount} active · ${filteredEmployees.length} of ${employees.length} employee(s)`
              : `${activeCount} active · ${employees.length} total employee(s)`}
          </p>
        </div>
        {canManage && (
          <button type="button" className="company-btn company-btn--primary" onClick={openCreate}>
            + Add Employee
          </button>
        )}
      </div>

      {showPlainError && <div className="company-alert">{error}</div>}

      {loading ? (
        <div className="company-loading">Loading employees...</div>
      ) : employees.length === 0 ? (
        <div className="company-empty">No employees yet. Add your first team member.</div>
      ) : filteredEmployees.length === 0 ? (
        <div className="company-empty">No employees match your search.</div>
      ) : (
        <div className="company-table-wrap">
          <table className="company-table master-table">
            <thead>
              <tr>
                <th className="company-table__cell--photo">Photo</th>
                <th>Emp ID</th>
                <th>Employee Name</th>
                <th>Mobile</th>
                <th>Email(s)</th>
                <th>Department</th>
                <th>Location</th>
                <th className="company-table__cell--manager">Manager</th>
                {canManage && <th>Active</th>}
                {canManage && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {pagedEmployees.map((employee) => {
                const isActive = employee.is_active !== false
                const showLocationHead = isLocationHeadEmployee(employee)
                return (
                  <tr key={employee.id} className={!isActive ? 'company-table__row--inactive' : undefined}>
                    <td className="company-table__cell--photo">
                      <div className="company-employee-photo-cell">
                        <EmployeeAvatar employee={employee} />
                        {showLocationHead && (
                          <div className="company-employee-photo__pills" aria-label="Employee roles">
                            <span className="company-badge company-badge--location-head">
                              Location Head
                            </span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td><code className="company-code">{employee.emp_id}</code></td>
                    <td><span className="company-table__name">{employee.name}</span></td>
                    <td>{employee.mobile ? formatPhoneDisplay(employee.mobile) : '—'}</td>
                    <td>
                      <div className="company-employee-emails-cell">
                        {employee.email ? (
                          <span className="company-employee-emails-cell__primary">{employee.email}</span>
                        ) : (
                          '—'
                        )}
                        {(employee.org_employee_emails || []).map((row) => (
                          <span key={row.id} className="company-employee-emails-cell__extra">
                            {row.email}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>{employee.departments?.name || '—'}</td>
                    <td>{employee.org_locations?.name || '—'}</td>
                    <td className="company-table__cell--manager">
                      {employee.manager ? (
                        <span className="company-employee-ref">
                          <EmployeeAvatar
                            size="sm"
                            employee={
                              employees.find((e) => e.id === employee.manager.id) || employee.manager
                            }
                          />
                          <span className="company-employee-ref__name">{employee.manager.name}</span>
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    {canManage && (
                      <td>
                        <GooToggle
                          checked={isActive}
                          disabled={togglingId === employee.id || saving}
                          onChange={(checked) => handleToggle(employee, checked)}
                          ariaLabel={`${isActive ? 'Disable' : 'Enable'} ${employee.name}`}
                        />
                      </td>
                    )}
                    {canManage && (
                      <td>
                        <div className="company-table__actions">
                          <button
                            type="button"
                            className="company-btn company-btn--secondary company-btn--compact company-btn--icon"
                            onClick={() => openEdit(employee)}
                            aria-label={`Edit ${employee.name}`}
                            title="Edit"
                          >
                            <EditIcon />
                          </button>
                          <button
                            type="button"
                            className="company-btn company-btn--danger company-btn--compact company-btn--icon"
                            onClick={() => handleDelete(employee)}
                            aria-label={`Delete ${employee.name}`}
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
            totalCount={filteredEmployees.length}
            rangeStart={pagination.rangeStart}
            rangeEnd={pagination.rangeEnd}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
          />
        </div>
      )}

      {modalOpen && (
        <EmployeeModal
          key={editing?.id ?? 'new'}
          employee={editing}
          employees={employees}
          locations={locations}
          departments={departments}
          accessRoles={accessRoles}
          saving={saving}
          nestedSaving={nestedSaving}
          defaultLocationId={defaultCreateLocationId}
          lockLocation={lockCreateLocation}
          onClose={() => setModalOpen(false)}
          onSave={handleSave}
          onCreateLocation={canSelectAnyLocation ? handleCreateLocation : undefined}
          onCreateDepartment={handleCreateDepartment}
          onLimitExceeded={tryHandleLimitError}
        />
      )}

      {limitVisible && (
        <LimitExceededCard resource={limitResource} onClose={dismissLimit} />
      )}
    </div>
  )
}
