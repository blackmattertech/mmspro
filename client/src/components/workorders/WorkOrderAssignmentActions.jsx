import { useEffect, useMemo, useState } from 'react'
import { useDepartments } from '../../hooks/useDepartments'
import { useEmployees } from '../../hooks/useEmployees'
import { usePermissions } from '../../hooks/usePermissions'
import { useAuth } from '../../hooks/useAuth'
import { updateWorkOrderAssignment } from '../../lib/api-work-orders'
import { useFormFieldValues } from '../../hooks/useFormFieldValues'
import { resolveFormActors } from '../../lib/formFillership'
import { formFieldClassName } from '../../lib/formLayoutIds'
import { requiredSystemKeys, workOrderFormIdForSource } from '../../lib/workOrderForms'
import WorkOrderProcessLayout, { useWorkOrderProcessLayout } from './WorkOrderProcessLayout'
import DateField from '../ui/DateField'
import SpellcheckInput from '../shared/SpellcheckInput'
import FormLabel from '../shared/FormLabel'
import EmployeeAvatar from '../company/EmployeeAvatar'
import FilterableSelect from '../ui/FilterableSelect'
import '../company/CompanyShared.css'

export default function WorkOrderAssignmentActions({ detail, onUpdated }) {
  const actions = detail?.assignment_actions || {}
  const canLH = Boolean(actions.can_reassign_as_location_head)
  const canDept = Boolean(actions.can_assign_department_technicians)
  const canClaim = Boolean(actions.can_claim_self)
  const canAssign = canLH || canDept
  const locationId = detail?.assigned_location_id || detail?.assigned_location?.id || null
  const lockedDepartmentId = detail?.assigned_department_id || ''

  const { isOrgAdmin, session, canUpdate } = usePermissions()
  const { user } = useAuth()
  const assignFormId = workOrderFormIdForSource(detail?.source_type)
  const { layout: assignLayout } = useWorkOrderProcessLayout(assignFormId, ['assignment'])
  const assignExtras = useFormFieldValues(assignFormId, detail?.id || null)
  const hasLayoutAssignment = Boolean(assignLayout?.sections?.length)

  const [departmentId, setDepartmentId] = useState(lockedDepartmentId)
  const [employeeIds, setEmployeeIds] = useState(
    () => (detail?.assignees || []).map((a) => a.id),
  )
  const [workCenter, setWorkCenter] = useState(detail?.work_center || '')
  const [priority, setPriority] = useState(detail?.priority || 'medium')
  const [plannedStartAt, setPlannedStartAt] = useState(detail?.planned_start_at || '')
  const [plannedEndAt, setPlannedEndAt] = useState(detail?.planned_end_at || '')
  const [assignmentRemarks, setAssignmentRemarks] = useState(detail?.special_instructions || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  const assignActors = useMemo(() => resolveFormActors({
    formId: assignFormId,
    isOrgAdmin,
    profileId: user?.id,
    employeeId: session?.employee_id,
    isDepartmentHead: session?.is_department_head,
    employeeDepartmentId: session?.department_id,
    canApproveIncoming: canUpdate('work_request_approve') || canUpdate('work_request_incoming'),
    record: {
      assigned_department_id: detail?.assigned_department_id,
      order_to_department_id: detail?.assigned_department_id,
      created_by: detail?.created_by,
      assignees: detail?.assignees,
    },
  }), [
    assignFormId,
    isOrgAdmin,
    user?.id,
    session?.employee_id,
    session?.is_department_head,
    session?.department_id,
    canUpdate,
    detail,
  ])

  const effectiveDepartmentId = canLH ? departmentId : (lockedDepartmentId || departmentId)

  const { departments, loading: departmentsLoading } = useDepartments(canLH ? locationId : '')
  const { employees, loading: employeesLoading } = useEmployees({
    locationId: locationId || undefined,
    departmentId: effectiveDepartmentId || undefined,
    forAssignment: true,
  })

  useEffect(() => {
    setDepartmentId(detail?.assigned_department_id || '')
    setEmployeeIds((detail?.assignees || []).map((a) => a.id))
    setWorkCenter(detail?.work_center || '')
    setPriority(detail?.priority || 'medium')
    setPlannedStartAt(detail?.planned_start_at || '')
    setPlannedEndAt(detail?.planned_end_at || '')
    setAssignmentRemarks(detail?.special_instructions || '')
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

  if (!canAssign && !canClaim) return null

  const toggleEmployee = (id) => {
    setEmployeeIds((prev) => (
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    ))
  }

  const unclaimedRequest = Boolean(detail?.work_request_id)
    && !(detail?.assignees || []).length
    && ['assigned', 'accepted'].includes(detail?.status)
  const selfStart = canClaim && unclaimedRequest && !canAssign
  const assignRequired = requiredSystemKeys(assignLayout)
  const startMissing = unclaimedRequest && (
    (assignRequired.has('work_center') && !String(workCenter || '').trim())
    || (assignRequired.has('priority') && !priority)
    || (assignRequired.has('planned_start_at') && !plannedStartAt)
    || (assignRequired.has('planned_end_at') && !plannedEndAt)
    || (assignRequired.has('assignment_remarks') && !String(assignmentRemarks || '').trim())
  )

  const handleStart = async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const updated = await updateWorkOrderAssignment(detail.id, {
        claim_self: true,
        start: true,
        work_center: workCenter || null,
        priority: priority || null,
        planned_start_at: plannedStartAt ? new Date(plannedStartAt).toISOString() : null,
        planned_end_at: plannedEndAt ? new Date(plannedEndAt).toISOString() : null,
        special_instructions: assignmentRemarks || null,
      })
      if (Object.keys(assignExtras.values || {}).length) {
        await assignExtras.save(detail.id)
      }
      setSuccess('Work order started and assigned to you.')
      onUpdated?.(updated)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
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
        work_center: workCenter || null,
        priority: priority || null,
        planned_start_at: plannedStartAt ? new Date(plannedStartAt).toISOString() : null,
        planned_end_at: plannedEndAt ? new Date(plannedEndAt).toISOString() : null,
        special_instructions: assignmentRemarks || null,
      }
      if (canLH) {
        payload.assigned_location_id = locationId
        payload.assigned_department_id = departmentId || null
      }
      const updated = await updateWorkOrderAssignment(detail.id, payload)
      if (Object.keys(assignExtras.values || {}).length) {
        await assignExtras.save(detail.id)
      }
      setSuccess('Assignment updated.')
      onUpdated?.(updated)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const poolHint = detail?.assigned_department_id
    ? 'This work order is in your department pool.'
    : 'This work order is in your location pool.'

  const renderTechnicianPicker = (props = {}) => {
    const className = props.className || 'company-form__field'
    const requiredMark = props.required ? ' *' : ''
    const label = canLH ? 'Employees' : 'Technicians'
    return (
      <div key="assignee_ids" className={className}>
        <span className="company-form__label">
          {label}
          {employeeIds.length > 0 ? ` (${employeeIds.length} selected)` : ''}
          {requiredMark}
        </span>
        {employeesLoading ? (
          <p className="wo-assignment-actions__hint">Loading {canLH ? 'employees' : 'technicians'}…</p>
        ) : !activeEmployees.length ? (
          <p className="wo-assignment-actions__hint">No {canLH ? 'employees' : 'technicians'} available for this selection.</p>
        ) : (
          <div className="wo-assignment-actions__employees" role="group" aria-label={label}>
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
                  <span className="wo-assignment-actions__emp-meta">
                    <span className="wo-assignment-actions__emp-name">{emp.name}</span>
                    {emp.departments?.name && (
                      <span className="wo-assignment-actions__emp-sub">
                        {emp.departments.name}
                      </span>
                    )}
                  </span>
                </label>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  const renderAssignmentField = (key, props = {}) => {
    const className = props.className || formFieldClassName(props.field)
    const requiredMark = props.required ? ' *' : ''
    const locked = saving || Boolean(props.disabled)
    if (key === 'assignee_ids') {
      if (!canAssign) return null
      return renderTechnicianPicker({ ...props, className })
    }
    if (key === 'work_center') {
          return (
            <label key={key} className={className}>
              <span className="company-form__label">Work center{requiredMark}</span>
              <SpellcheckInput
                className="company-form__input"
                value={workCenter}
                onChange={(e) => setWorkCenter(e.target.value)}
                disabled={locked}
              />
            </label>
          )
        }
        if (key === 'priority') {
          return (
            <label key={key} className={className}>
              <span className="company-form__label">Priority{requiredMark}</span>
              <select
                className="company-form__input"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                disabled={locked}
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </label>
          )
        }
        if (key === 'planned_start_at') {
          return (
            <label key={key} className={className}>
              <span className="company-form__label">Planned start{requiredMark}</span>
              <DateField value={plannedStartAt} onChange={setPlannedStartAt} withTime disabled={locked} />
            </label>
          )
        }
        if (key === 'planned_end_at') {
          return (
            <label key={key} className={className}>
              <span className="company-form__label">Planned end{requiredMark}</span>
              <DateField value={plannedEndAt} onChange={setPlannedEndAt} withTime disabled={locked} />
            </label>
          )
        }
        if (key === 'assignment_remarks') {
          return (
            <label key={key} className={className}>
              <FormLabel>Assignment remarks{requiredMark}</FormLabel>
              <SpellcheckInput
                multiline
                className="company-form__input company-form__textarea"
                rows={2}
                value={assignmentRemarks}
                onChange={(e) => setAssignmentRemarks(e.target.value)}
                disabled={locked}
              />
            </label>
          )
        }
        return null
  }

  const assignmentFields = (
    <WorkOrderProcessLayout
      formId={assignFormId}
      stages={['assignment']}
      extrasValues={assignExtras.values}
      onExtraChange={assignExtras.setFieldValue}
      actors={assignActors}
      currentEmployeeId={session?.employee_id || null}
      disabled={saving}
      renderField={renderAssignmentField}
    />
  )

  if (selfStart) {
    return (
      <section className="wo-received-detail__section wo-assignment-actions">
        <h3>Assignment</h3>
        <div className="wo-assignment-actions__form">
          <p className="wo-assignment-actions__hint">
            This work order is unassigned. Fill in the assignment details and start. It will be assigned to you, and you can continue the job.
          </p>
          {hasLayoutAssignment ? assignmentFields : (
            <>
              <label className="company-form__field">
                <span className="company-form__label">Work center</span>
                <SpellcheckInput
                  className="company-form__input"
                  value={workCenter}
                  onChange={(e) => setWorkCenter(e.target.value)}
                  disabled={saving}
                />
              </label>
              <label className="company-form__field">
                <span className="company-form__label">Priority</span>
                <select
                  className="company-form__input"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  disabled={saving}
                >
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </label>
              <label className="company-form__field">
                <span className="company-form__label">Planned start</span>
                <DateField value={plannedStartAt} onChange={setPlannedStartAt} withTime disabled={saving} />
              </label>
              <label className="company-form__field">
                <span className="company-form__label">Planned end</span>
                <DateField value={plannedEndAt} onChange={setPlannedEndAt} withTime disabled={saving} />
              </label>
              <label className="company-form__field">
                <FormLabel>Assignment remarks</FormLabel>
                <SpellcheckInput
                  multiline
                  className="company-form__input company-form__textarea"
                  rows={2}
                  value={assignmentRemarks}
                  onChange={(e) => setAssignmentRemarks(e.target.value)}
                  disabled={saving}
                />
              </label>
            </>
          )}
          <button
            type="button"
            className="company-btn company-btn--primary"
            onClick={handleStart}
            disabled={saving || startMissing}
          >
            {saving ? 'Starting…' : 'Start'}
          </button>
        </div>
        {error && <p className="wo-alert wo-alert--error">{error}</p>}
        {success && <p className="wo-alert wo-alert--success">{success}</p>}
      </section>
    )
  }

  return (
    <section className="wo-received-detail__section wo-assignment-actions">
      <h3>{canLH ? 'Assign employees' : canDept ? 'Assign technicians' : 'Claim'}</h3>

      {canAssign && (
        <div className="wo-assignment-actions__form">
          <p className="wo-assignment-actions__hint">
            {unclaimedRequest
              ? 'This work order is unassigned. Assign technicians, or start it yourself.'
              : canLH
                ? 'As Location Head, assign employees at this location, or route to a department.'
                : 'Assign a technician in your department.'}
          </p>

          {canLH && (
            <label className="company-form__field">
              <span className="company-form__label">Department</span>
              <FilterableSelect
                className="company-form__input--select"
                value={departmentId}
                onChange={(next) => {
                  setDepartmentId(next)
                  setEmployeeIds([])
                }}
                options={activeDepartments}
                getOptionValue={(dept) => dept.id}
                getOptionLabel={(dept) => dept.name}
                emptyLabel="All employees at location…"
                placeholder="All employees at location…"
                disabled={saving || departmentsLoading}
              />
            </label>
          )}

          {hasLayoutAssignment ? assignmentFields : (
            <>
              {renderTechnicianPicker()}
              {renderAssignmentField('work_center')}
              {renderAssignmentField('priority')}
              {renderAssignmentField('planned_start_at')}
              {renderAssignmentField('planned_end_at')}
              {renderAssignmentField('assignment_remarks')}
            </>
          )}

          <button
            type="button"
            className="company-btn company-btn--primary"
            onClick={handleSave}
            disabled={saving || (!canLH && employeeIds.length === 0) || startMissing}
          >
            {saving ? 'Saving…' : 'Save assignment'}
          </button>
        </div>
      )}

      {canClaim && (
        <div className="wo-assignment-actions__claim">
          <p className="wo-assignment-actions__hint">
            {unclaimedRequest
              ? canAssign
                ? 'Or pick this work order and start it yourself.'
                : 'Pick this work order to assign it to yourself and start.'
              : canAssign
                ? `${poolHint} You can also claim it for yourself.`
                : `${poolHint} Claim it to assign it to yourself.`}
          </p>
          <button
            type="button"
            className={`company-btn ${canAssign ? 'company-btn--secondary' : 'company-btn--primary'}`}
            onClick={unclaimedRequest ? handleStart : handleClaim}
            disabled={saving || (unclaimedRequest && startMissing)}
          >
            {saving
              ? (unclaimedRequest ? 'Starting…' : 'Claiming…')
              : (unclaimedRequest ? 'Start for me' : 'Claim for me')}
          </button>
        </div>
      )}

      {error && <p className="wo-alert wo-alert--error">{error}</p>}
      {success && <p className="wo-alert wo-alert--success">{success}</p>}
    </section>
  )
}
