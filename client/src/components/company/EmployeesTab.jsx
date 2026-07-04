import { useState } from 'react'
import { useOrg } from '../../hooks/useOrg'
import { useEmployees } from '../../hooks/useEmployees'
import { useLocations } from '../../hooks/useLocations'
import { useDepartments } from '../../hooks/useDepartments'
import { useDesignations } from '../../hooks/useDesignations'
import { useOrgLimits } from '../../hooks/useOrgLimits'
import { useLimitExceeded } from '../../hooks/useLimitExceeded'
import { isLimitError } from '../../lib/limitErrors'
import { uploadEmployeePhoto } from '../../lib/orgAssets'
import GooToggle from '../ui/GooToggle'
import EmployeeAvatar from './EmployeeAvatar'
import EmployeeModal from './EmployeeModal'
import LimitExceededCard from '../shared/LimitExceededCard'
import { formatPhoneDisplay } from '../shared/PhoneInput'
import './CompanyShared.css'

export default function EmployeesTab({ canManage }) {
  const { org } = useOrg()
  const [departmentFilter, setDepartmentFilter] = useState('')
  const [locationFilter, setLocationFilter] = useState('')

  const { locations, create: createLocation, reload: reloadLocations, saving: savingLocation } = useLocations()
  const { departments, create: createDepartment, reload: reloadDepartments, saving: savingDepartment } = useDepartments()
  const { designations, create: createDesignation, reload: reloadDesignations, saving: savingDesignation } = useDesignations()
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
  const activeCount = employees.filter((e) => e.is_active !== false).length
  const nestedSaving = savingLocation || savingDepartment || savingDesignation
  const atEmployeeLimit = isResourceAtLimit('employees', 'employee_limit', activeCount)

  const refreshMasters = async () => {
    await Promise.all([reloadLocations(), reloadDepartments(), reloadDesignations(), reloadLimits()])
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

      await reloadLimits()
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

  const handleCreateDesignation = async (payload) => {
    const created = await createDesignation(payload)
    await refreshMasters()
    return created
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
            <span>Department</span>
            <select
              className="company-form__input company-form__input--select"
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
            >
              <option value="">All departments</option>
              {activeDepartments.map((dept) => (
                <option key={dept.id} value={dept.id}>{dept.name}</option>
              ))}
            </select>
          </label>
          <label className="company-filter">
            <span>Location</span>
            <select
              className="company-form__input company-form__input--select"
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
            >
              <option value="">All locations</option>
              {activeLocations.map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
          </label>
          <p className="company-panel__count">
            {activeCount} active · {employees.length} total employee(s)
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
                <th>Designation</th>
                <th>Department</th>
                <th>Location</th>
                <th className="company-table__cell--manager">Manager</th>
                <th className="company-table__cell--dept-head">Dept Head</th>
                {canManage && <th>Active</th>}
                {canManage && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => {
                const isActive = employee.is_active !== false
                return (
                  <tr key={employee.id} className={!isActive ? 'company-table__row--inactive' : undefined}>
                    <td className="company-table__cell--photo">
                      <EmployeeAvatar employee={employee} />
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
                    <td>{employee.designations?.name || '—'}</td>
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
                    <td className="company-table__cell--dept-head">
                      {(employee.headed_departments || []).length ? (
                        <div className="company-tag-list">
                          {employee.headed_departments.map((dept) => (
                            <span key={dept.id} className="company-badge company-badge--primary">
                              {dept.name}
                            </span>
                          ))}
                        </div>
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
                          <button type="button" className="company-link" onClick={() => openEdit(employee)}>
                            Edit
                          </button>
                          <button
                            type="button"
                            className="company-link company-link--danger"
                            onClick={() => handleDelete(employee)}
                          >
                            Delete
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
      )}

      {modalOpen && (
        <EmployeeModal
          key={editing?.id ?? 'new'}
          employee={editing}
          employees={employees}
          locations={locations}
          departments={departments}
          designations={designations}
          saving={saving}
          nestedSaving={nestedSaving}
          onClose={() => setModalOpen(false)}
          onSave={handleSave}
          onCreateLocation={handleCreateLocation}
          onCreateDepartment={handleCreateDepartment}
          onCreateDesignation={handleCreateDesignation}
          onLimitExceeded={tryHandleLimitError}
        />
      )}

      {limitVisible && (
        <LimitExceededCard resource={limitResource} onClose={dismissLimit} />
      )}
    </div>
  )
}
