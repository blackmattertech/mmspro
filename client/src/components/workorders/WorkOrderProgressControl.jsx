import { useEffect, useState } from 'react'
import { updateWorkOrderLifecycle } from '../../lib/api-work-orders'
import { useProfile } from '../../hooks/useProfile'
import { usePermissions } from '../../hooks/usePermissions'
import { useOrgStatusOptions } from '../../hooks/useOrgStatusOptions'
import { resolveProgressPercent } from '../../lib/statusProgress'
import '../shared/StatusCountBar.css'

const PROGRESS_PRESETS = [0, 25, 50, 75, 100]

function isAssignedTechnician(detail, employeeId) {
  if (!employeeId || !detail) return false
  const id = String(employeeId)
  const lists = [detail.assignees, detail.work_request?.assigned_technicians]
  return lists.some((rows) => (
    (rows || []).some((row) => String(row?.id || row?.employee_id || '') === id)
  ))
}

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
  /** When set, overrides the default assignee/permission check. */
  editable,
}) {
  const { employee, profile } = useProfile()
  const { isOrgAdmin, canUpdate } = usePermissions()
  const { statuses } = useOrgStatusOptions('work_order', { includeInactive: true })
  const saved = resolveProgressPercent(detail, statuses)
  const canSupervise = Boolean(
    isOrgAdmin
    || canUpdate('work_orders_approve')
    || canUpdate('work_orders')
    || canUpdate('work_orders_manual')
    || canUpdate('work_orders_scheduled')
    || detail?.created_by === profile?.id
    || detail?.supervisor_id === profile?.id
  )
  const canAdjust = editable !== undefined
    ? Boolean(editable)
    : (isAssignedTechnician(detail, employee?.id) || canSupervise)
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
