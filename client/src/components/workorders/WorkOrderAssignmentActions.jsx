import { useEffect, useMemo, useState } from 'react'
import { useDepartments } from '../../hooks/useDepartments'
import { useEmployees } from '../../hooks/useEmployees'
import { updateWorkOrderAssignment } from '../../lib/api-work-orders'
import EmployeeAvatar from '../company/EmployeeAvatar'
import '../company/CompanyShared.css'

export default function WorkOrderAssignmentActions({ detail, onUpdated }) {
  const actions = detail?.assignment_actions || {}
  const canLH = Boolean(actions.can_reassign_as_location_head)
  const canDH = Boolean(actions.can_reassign_as_department_head)
  const canClaim = Boolean(actions.can_claim_self)
  const locationId = detail?.assigned_location_id || detail?.assigned_location?.id || null

  const [departmentId, setDepartmentId] = useState(detail?.assigned_department_id || '')
  const [employeeIds, setEmployeeIds] = useState(
    () => (detail?.assignees || []).map((a) => a.id),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  const { departments, loading: departmentsLoading } = useDepartments(canLH ? locationId : '')
  const { employees, loading: employeesLoading } = useEmployees({
    locationId: locationId || undefined,
    departmentId: departmentId || detail?.assigned_department_id || undefined,
    forAssignment: true,
  })

  useEffect(() => {
    setDepartmentId(detail?.assigned_department_id || '')
    setEmployeeIds((detail?.assignees || []).map((a) => a.id))
    setError(null)
    setSuccess(null)
  }, [detail?.id, detail?.assigned_department_id, detail?.assignees])

  const activeDepartments = useMemo(
    () => (departments || []).filter((d) => d.is_active !== false),
    [departments],
  )
  const activeEmployees = useMemo(
    () => (employees || []).filter((e) => e.is_active !== false),
    [employees],
  )

  if (!canLH && !canDH && !canClaim) return null

  const toggleEmployee = (id) => {
    setEmployeeIds((prev) => (
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    ))
  }

  const handleClaim = async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const updated = await updateWorkOrderAssignment(detail.id, { claim_self: true })
      setSuccess('Work order claimed.')
      onUpdated?.(updated)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const payload = {
        assigned_employee_ids: employeeIds,
      }
      if (canLH) {
        payload.assigned_location_id = locationId
        payload.assigned_department_id = departmentId || null
      }
      const updated = await updateWorkOrderAssignment(detail.id, payload)
      setSuccess('Assignment updated.')
      onUpdated?.(updated)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="wo-received-detail__section wo-assignment-actions">
      <h3>Reassign / Claim</h3>

      {canClaim && (
        <div className="wo-assignment-actions__claim">
          <p className="wo-assignment-actions__hint">
            This work order is in your department pool. Claim it to assign it to yourself.
          </p>
          <button
            type="button"
            className="company-btn company-btn--primary"
            onClick={handleClaim}
            disabled={saving}
          >
            {saving ? 'Claiming…' : 'Claim for me'}
          </button>
        </div>
      )}

      {(canLH || canDH) && (
        <div className="wo-assignment-actions__form">
          {canLH && (
            <label className="company-form__field">
              <span className="company-form__label">Department</span>
              <select
                className="company-form__input company-form__input--select"
                value={departmentId}
                onChange={(e) => {
                  setDepartmentId(e.target.value)
                  setEmployeeIds([])
                }}
                disabled={saving || departmentsLoading}
              >
                <option value="">Keep for location head / pick later…</option>
                {activeDepartments.map((dept) => (
                  <option key={dept.id} value={dept.id}>{dept.name}</option>
                ))}
              </select>
            </label>
          )}

          <div className="company-form__field">
            <span className="company-form__label">Employees</span>
            {employeesLoading ? (
              <p className="wo-assignment-actions__hint">Loading employees…</p>
            ) : !activeEmployees.length ? (
              <p className="wo-assignment-actions__hint">No employees available for this selection.</p>
            ) : (
              <div className="wo-assignment-actions__employees" role="group" aria-label="Employees">
                {activeEmployees.map((emp) => {
                  const checked = employeeIds.includes(emp.id)
                  return (
                    <label key={emp.id} className={`wo-assignment-actions__emp${checked ? ' is-selected' : ''}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleEmployee(emp.id)}
                        disabled={saving}
                      />
                      <EmployeeAvatar employee={emp} />
                      <span>{emp.name}</span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>

          <button
            type="button"
            className="company-btn company-btn--primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save assignment'}
          </button>
        </div>
      )}

      {error && <p className="wo-alert wo-alert--error">{error}</p>}
      {success && <p className="wo-alert wo-alert--success">{success}</p>}
    </section>
  )
}
