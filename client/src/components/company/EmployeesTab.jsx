import { useState } from 'react'
import { useOrg } from '../../hooks/useOrg'
import { useEmployees } from '../../hooks/useEmployees'
import { useLocations } from '../../hooks/useLocations'
import { useDepartments } from '../../hooks/useDepartments'
import { useDesignations } from '../../hooks/useDesignations'
import { uploadEmployeePhoto } from '../../lib/orgAssets'
import GooToggle from '../ui/GooToggle'
import EmployeeModal from './EmployeeModal'
import './CompanyShared.css'

function EmployeeAvatar({ employee }) {
  if (employee.photo_signed_url) {
    return (
      <img
        src={employee.photo_signed_url}
        alt=""
        className="company-employee-avatar"
      />
    )
  }

  const letter = (employee.name?.[0] || employee.emp_id?.[0] || '?').toUpperCase()
  return <span className="company-employee-avatar company-employee-avatar--placeholder">{letter}</span>
}

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

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [togglingId, setTogglingId] = useState(null)

  const activeLocations = locations.filter((l) => l.is_active !== false)
  const activeDepartments = departments.filter((d) => d.is_active !== false)
  const activeCount = employees.filter((e) => e.is_active !== false).length
  const nestedSaving = savingLocation || savingDepartment || savingDesignation

  const refreshMasters = async () => {
    await Promise.all([reloadLocations(), reloadDepartments(), reloadDesignations()])
  }

  const openCreate = () => {
    setEditing(null)
    setModalOpen(true)
  }

  const openEdit = (employee) => {
    setEditing(employee)
    setModalOpen(true)
  }

  const handleSave = async (payload, photoFile) => {
    let saved
    if (editing) saved = await update(editing.id, payload)
    else saved = await create(payload)

    if (photoFile && org?.id) {
      const path = await uploadEmployeePhoto(org.id, saved.id, photoFile)
      await update(saved.id, { photo_url: path })
    }

    setModalOpen(false)
  }

  const handleCreateLocation = async (payload) => {
    const created = await createLocation(payload)
    await refreshMasters()
    return created
  }

  const handleCreateDepartment = async (payload) => {
    const created = await createDepartment(payload)
    await refreshMasters()
    return created
  }

  const handleCreateDesignation = async (payload) => {
    const created = await createDesignation(payload)
    await refreshMasters()
    return created
  }

  const handleDelete = async (employee) => {
    if (!window.confirm(`Delete employee "${employee.name}"?`)) return
    await remove(employee.id)
  }

  const handleToggle = async (employee, isActive) => {
    setTogglingId(employee.id)
    try {
      await toggleActive(employee.id, isActive)
    } catch {
      // error shown in tab
    } finally {
      setTogglingId(null)
    }
  }

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

      {error && <div className="company-alert">{error}</div>}

      {loading ? (
        <div className="company-loading">Loading employees...</div>
      ) : employees.length === 0 ? (
        <div className="company-empty">No employees yet. Add your first team member.</div>
      ) : (
        <div className="company-table-wrap">
          <table className="company-table master-table">
            <thead>
              <tr>
                <th>Photo</th>
                <th>Emp ID</th>
                <th>Employee Name</th>
                <th>Mobile</th>
                <th>Email</th>
                <th>Designation</th>
                <th>Department</th>
                <th>Location</th>
                {canManage && <th>Active</th>}
                {canManage && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => {
                const isActive = employee.is_active !== false
                return (
                  <tr key={employee.id} className={!isActive ? 'company-table__row--inactive' : undefined}>
                    <td><EmployeeAvatar employee={employee} /></td>
                    <td><code className="company-code">{employee.emp_id}</code></td>
                    <td><span className="company-table__name">{employee.name}</span></td>
                    <td>{employee.mobile || '—'}</td>
                    <td>{employee.email || '—'}</td>
                    <td>{employee.designations?.name || '—'}</td>
                    <td>{employee.departments?.name || '—'}</td>
                    <td>{employee.org_locations?.name || '—'}</td>
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
        />
      )}
    </div>
  )
}
