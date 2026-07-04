import { useEffect, useMemo, useState } from 'react'
import { useLocations } from '../../hooks/useLocations'
import { useDepartments } from '../../hooks/useDepartments'
import { useEmployees } from '../../hooks/useEmployees'
import EmployeeAvatar from '../company/EmployeeAvatar'
import { formatPhoneDisplay } from '../shared/PhoneInput'
import '../../components/company/CompanyShared.css'
import './ManualWorkOrder.css'

function DetailRow({ icon, label, value }) {
  return (
    <span className="wo-assignment__detail-row">
      <span className={`wo-assignment__detail-icon wo-assignment__detail-icon--${icon}`} aria-hidden="true">
        {icon === 'department' && (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 12V4.5L7 2L12 4.5V12H2Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
            <path d="M5.5 12V8.5H8.5V12" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
          </svg>
        )}
        {icon === 'designation' && (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="4.5" r="2.25" stroke="currentColor" strokeWidth="1.2" />
            <path d="M3 12C3 9.5 4.8 8 7 8C9.2 8 11 9.5 11 12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        )}
        {icon === 'location' && (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 7.25C7.9665 7.25 8.75 6.4665 8.75 5.5C8.75 4.5335 7.9665 3.75 7 3.75C6.0335 3.75 5.25 4.5335 5.25 5.5C5.25 6.4665 6.0335 7.25 7 7.25Z" stroke="currentColor" strokeWidth="1.2" />
            <path d="M7 12.25C9.33333 9.58333 11.5 7.41667 11.5 5.5C11.5 3.01472 9.48528 1 7 1C4.51472 1 2.5 3.01472 2.5 5.5C2.5 7.41667 4.66667 9.58333 7 12.25Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span className="wo-assignment__detail-text">
        <span className="wo-assignment__detail-label">{label}</span>
        <span className="wo-assignment__detail-value">{value || '—'}</span>
      </span>
    </span>
  )
}

function ContactBox({ icon, label, value }) {
  return (
    <span className="wo-assignment__contact-box">
      <span className={`wo-assignment__contact-icon wo-assignment__contact-icon--${icon}`} aria-hidden="true">
        {icon === 'mobile' && (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M4 1.75H10C10.6904 1.75 11.25 2.30964 11.25 3V11C11.25 11.6904 10.6904 12.25 10 12.25H4C3.30964 12.25 2.75 11.6904 2.75 11V3C2.75 2.30964 3.30964 1.75 4 1.75Z" stroke="currentColor" strokeWidth="1.2" />
            <path d="M6.25 10.5H7.75" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        )}
        {icon === 'email' && (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="1.75" y="3.25" width="10.5" height="7.5" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
            <path d="M1.75 4.5L7 8.25L12.25 4.5" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span className="wo-assignment__contact-text">
        <span className="wo-assignment__contact-label">{label}</span>
        <span className="wo-assignment__contact-value">{value || '—'}</span>
      </span>
    </span>
  )
}

function isDepartmentHead(employee, department, locationId) {
  if (!employee || !department) return false

  if (department.head_employee_id === employee.id) return true
  if ((employee.headed_departments || []).some((dept) => dept.id === department.id)) return true

  if (locationId && department.location_heads?.length) {
    return department.location_heads.some(
      (entry) => entry.location_id === locationId && entry.head_employee_id === employee.id,
    )
  }

  return false
}

function FilterStep({ step, label, active, complete }) {
  return (
    <div
      className={`wo-assignment__step${active ? ' wo-assignment__step--active' : ''}${complete ? ' wo-assignment__step--complete' : ''}`}
    >
      <span className="wo-assignment__step-num">{step}</span>
      <span className="wo-assignment__step-label">{label}</span>
    </div>
  )
}

function EmployeePicker({
  locationId,
  department,
  locationName,
  value,
  onChange,
  disabled,
}) {
  const [search, setSearch] = useState('')
  const { employees, loading } = useEmployees({ locationId, departmentId: department.id })
  const selectedIds = Array.isArray(value) ? value : []

  useEffect(() => {
    setSearch('')
  }, [department.id, locationId])

  const filteredEmployees = useMemo(() => {
    const active = (employees || []).filter((emp) => emp.is_active !== false)
    const query = search.trim().toLowerCase()
    if (!query) return active
    return active.filter((emp) => {
      const haystack = [
        emp.name,
        emp.emp_id,
        emp.email,
        emp.designations?.name,
        emp.departments?.name,
        emp.org_locations?.name,
      ].filter(Boolean).join(' ').toLowerCase()
      return haystack.includes(query)
    })
  }, [employees, search])

  const toggleEmployee = (employeeId) => {
    if (disabled) return
    if (selectedIds.includes(employeeId)) {
      onChange(selectedIds.filter((id) => id !== employeeId))
      return
    }
    onChange([...selectedIds, employeeId])
  }

  const clearAll = () => {
    if (!disabled) onChange([])
  }

  return (
    <>
      <div className="wo-assignment__toolbar">
        <input
          type="search"
          className="company-form__input wo-assignment__search"
          placeholder="Search employees..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          disabled={disabled || loading}
        />
        {selectedIds.length > 0 && (
          <button
            type="button"
            className="company-btn company-btn--compact company-btn--secondary"
            onClick={clearAll}
            disabled={disabled || loading}
          >
            Clear all
          </button>
        )}
      </div>

      <p className="wo-assignment__context">
        Showing employees in <strong>{department.name}</strong> at <strong>{locationName}</strong>
      </p>

      {loading ? (
        <p className="wo-assignment__empty">Loading employees...</p>
      ) : !filteredEmployees.length ? (
        <p className="wo-assignment__empty">No employees found for this location and department.</p>
      ) : (
        <div className="wo-assignment__grid" role="group" aria-label="Assigned employees">
          {filteredEmployees.map((emp) => {
            const checked = selectedIds.includes(emp.id)
            const showHeadBadge = isDepartmentHead(emp, department, locationId)

            return (
              <button
                key={emp.id}
                type="button"
                className={`wo-assignment__card${checked ? ' wo-assignment__card--selected' : ''}`}
                onClick={() => toggleEmployee(emp.id)}
                disabled={disabled}
                aria-pressed={checked}
              >
                <span className="wo-assignment__card-check" aria-hidden="true">
                  {checked ? (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M3 7L6 10L11 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : null}
                </span>

                <span className="wo-assignment__card-top">
                  <span className="wo-assignment__card-avatar">
                    <EmployeeAvatar employee={emp} />
                  </span>

                  <span className="wo-assignment__card-header">
                    <span className="wo-assignment__card-name">{emp.name}</span>
                    {showHeadBadge && (
                      <span className="wo-assignment__card-badge">Dept. Head</span>
                    )}
                  </span>
                </span>

                <span className="wo-assignment__card-divider" aria-hidden="true" />

                <span className="wo-assignment__card-details">
                  <span className="wo-assignment__card-info">
                    <DetailRow
                      icon="department"
                      label="Department"
                      value={emp.departments?.name}
                    />
                    <DetailRow
                      icon="designation"
                      label="Designation"
                      value={emp.designations?.name}
                    />
                    <DetailRow
                      icon="location"
                      label="Location"
                      value={emp.org_locations?.name}
                    />
                  </span>

                  <span className="wo-assignment__card-contact">
                    <ContactBox
                      icon="mobile"
                      label="Mobile"
                      value={emp.mobile ? formatPhoneDisplay(emp.mobile) : null}
                    />
                    <ContactBox
                      icon="email"
                      label="Email"
                      value={emp.email}
                    />
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}

export default function WorkOrderAssignmentCard({
  value = [],
  onChange,
  disabled,
}) {
  const [locationId, setLocationId] = useState('')
  const [departmentId, setDepartmentId] = useState('')

  const { locations, loading: locationsLoading } = useLocations()
  const { departments, loading: departmentsLoading } = useDepartments(locationId)

  const selectedIds = Array.isArray(value) ? value : []
  const activeLocations = (locations || []).filter((loc) => loc.is_active !== false)
  const activeDepartments = (departments || []).filter((dept) => dept.is_active !== false)
  const selectedDepartment = activeDepartments.find((dept) => dept.id === departmentId)
  const selectedLocation = activeLocations.find((loc) => loc.id === locationId)
  const canSelectEmployees = Boolean(locationId && departmentId && selectedDepartment)

  useEffect(() => {
    setDepartmentId('')
  }, [locationId])

  return (
    <section className="wo-section wo-assignment">
      <div className="wo-section__header wo-assignment__header">
        <div className="wo-section__header-left">
          <span className="wo-section__icon wo-assignment__icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <circle cx="9" cy="6" r="3" stroke="white" strokeWidth="1.5" />
              <path d="M3 15.5C3 12.5 5.5 10.5 9 10.5C12.5 10.5 15 12.5 15 15.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </span>
          <div>
            <h2 className="wo-section__title">Assignment</h2>
            <p className="wo-section__desc">
              Choose a location and department, then assign employees to this work order
            </p>
          </div>
        </div>
        {selectedIds.length > 0 && (
          <span className="wo-assignment__count">
            {selectedIds.length} selected
          </span>
        )}
      </div>

      <div className="wo-section__body">
        <div className="wo-assignment__steps" aria-hidden="true">
          <FilterStep step="1" label="Location" active={!locationId} complete={Boolean(locationId)} />
          <span className="wo-assignment__step-divider" />
          <FilterStep step="2" label="Department" active={Boolean(locationId && !departmentId)} complete={Boolean(departmentId)} />
          <span className="wo-assignment__step-divider" />
          <FilterStep step="3" label="Employees" active={canSelectEmployees} complete={selectedIds.length > 0} />
        </div>

        <div className="wo-assignment__filters">
          <label className="company-form__field">
            <span className="company-form__label">Location</span>
            <select
              className="company-form__input company-form__input--select"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              disabled={disabled || locationsLoading}
            >
              <option value="">Select location...</option>
              {activeLocations.map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
          </label>

          <label className="company-form__field">
            <span className="company-form__label">Department</span>
            <select
              className="company-form__input company-form__input--select"
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              disabled={disabled || !locationId || departmentsLoading}
            >
              <option value="">
                {!locationId ? 'Select location first' : 'Select department...'}
              </option>
              {activeDepartments.map((dept) => (
                <option key={dept.id} value={dept.id}>{dept.name}</option>
              ))}
            </select>
          </label>
        </div>

        {!canSelectEmployees ? (
          <p className="wo-assignment__empty">
            Select a location and department to browse employees.
          </p>
        ) : (
          <EmployeePicker
            key={`${locationId}-${departmentId}`}
            locationId={locationId}
            department={selectedDepartment}
            locationName={selectedLocation?.name}
            value={value}
            onChange={onChange}
            disabled={disabled}
          />
        )}
      </div>
    </section>
  )
}
