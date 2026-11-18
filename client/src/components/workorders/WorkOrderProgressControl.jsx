import { useEffect, useMemo, useState } from 'react'
import { updateWorkOrderLifecycle } from '../../lib/api-work-orders'
import { useProfile } from '../../hooks/useProfile'
import { usePermissions } from '../../hooks/usePermissions'
import { useOrgStatusOptions } from '../../hooks/useOrgStatusOptions'
import { resolveProgressPercent } from '../../lib/statusProgress'
import {
  canEditWorkOrderStatusProgressRemarks,
  resolveFormActors,
} from '../../lib/formFillership'
import '../shared/StatusCountBar.css'

const PROGRESS_PRESETS = [0, 25, 50, 75, 100]

function ProgressReadout({ percent }) {
  return (
    <div className="wo-progress" title={`${percent}%`}>
      <div className="wo-progress__track">
        <span className="wo-progress__fill" style={{ width: `${percent}%` }} />
      </div>
      <span className="wo-progress__value">{percent}%</span>
    </div>
  )
}

export default function WorkOrderProgressControl({
  detail,
  onUpdated,
  layout = 'inline',
  showLabel = false,
  /** When set, overrides the default assignee / Order-To head check. */
  editable,
}) {
  const { employee, profile } = useProfile()
  const { isOrgAdmin, canUpdate, session } = usePermissions()
  const { statuses } = useOrgStatusOptions('work_order', { includeInactive: true })
  const saved = resolveProgressPercent(detail, statuses)
  const actors = useMemo(() => resolveFormActors({
    formId: 'work_orders.manual',
    isOrgAdmin,
    profileId: profile?.id,
    employeeId: session?.employee_id || employee?.id,
    isDepartmentHead: Boolean(session?.is_department_head || employee?.is_department_head),
    employeeDepartmentId: session?.department_id || employee?.department_id,
    canApproveIncoming: canUpdate('work_request_approve') || canUpdate('work_request_incoming'),
    record: {
      created_by: detail?.created_by,
      requested_by: detail?.requester_id,
      assigned_department_id: detail?.assigned_department_id,
      order_to_department_id: detail?.assigned_department_id,
      assignees: detail?.assignees || detail?.work_request?.assigned_technicians,
    },
  }), [
    isOrgAdmin,
    profile?.id,
    session?.employee_id,
    session?.is_department_head,
    session?.department_id,
    employee?.id,
    employee?.is_department_head,
    employee?.department_id,
    canUpdate,
    detail,
  ])
  const canAdjust = editable !== undefined
    ? Boolean(editable)
    : canEditWorkOrderStatusProgressRemarks(actors)
  const [value, setValue] = useState(saved)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const isPanel = layout === 'panel'

  useEffect(() => {
    setValue(saved)
    setError(null)
  }, [detail?.id, detail?.progress_percent, detail?.status, saved])

  if (!detail) return null

  if (!canAdjust) {
    if (!isPanel && !showLabel) return <ProgressReadout percent={saved} />
    return (
      <div className={`wo-progress-editor${isPanel ? ' wo-progress-editor--panel' : ''}`}>
        {(showLabel || isPanel) && (
          <span className="wo-progress-editor__label">Progress %</span>
        )}
        <ProgressReadout percent={saved} />
      </div>
    )
  }

  const dirty = value !== saved

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const updated = await updateWorkOrderLifecycle(detail.id, { progress_percent: value })
      onUpdated?.(updated)
    } catch (err) {
      setError(err.message || 'Could not save progress.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={`wo-progress-editor${isPanel ? ' wo-progress-editor--panel' : ''}`}>
      {(showLabel || isPanel) && (
        <span className="wo-progress-editor__label">Progress %</span>
      )}
      <div className="wo-progress-editor__row">
        <input
          className="wo-progress-editor__slider"
          type="range"
          min={0}
          max={100}
          step={1}
          value={value}
          style={{ '--pct': `${value}%` }}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={value}
          aria-label="Work progress"
          disabled={saving}
          onChange={(event) => setValue(Number(event.target.value))}
        />
        <span className="wo-progress__value">{value}%</span>
        <button
          type="button"
          className="company-btn company-btn--primary company-btn--compact"
          disabled={saving || !dirty}
          onClick={save}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      <div className="wo-progress-editor__presets" role="group" aria-label="Progress presets">
        {PROGRESS_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            className={`wo-progress-editor__preset${value === preset ? ' wo-progress-editor__preset--active' : ''}`}
            disabled={saving}
            aria-pressed={value === preset}
            onClick={() => setValue(preset)}
          >
            {preset}%
          </button>
        ))}
      </div>
      {error ? <p className="wo-progress-editor__error" role="alert">{error}</p> : null}
    </div>
  )
}
