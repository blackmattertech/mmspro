import { useEffect, useMemo, useState } from 'react'
import {
  startWorkOrderDay,
  updateWorkOrderDailyLog,
  endWorkOrderDay,
} from '../../lib/api-work-orders'
import WorkOrderMaterialRowsTable, { normalizeMaterialRows } from './WorkOrderMaterialRowsTable'
import './ManualWorkOrder.css'

function formatDayLabel(logDate) {
  if (!logDate) return '—'
  try {
    return new Date(`${logDate}T12:00:00`).toLocaleDateString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return logDate
  }
}

function formatStamp(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function materialCount(materials) {
  return normalizeMaterialRows(materials).filter((row) => (
    row.code || row.description || row.uom || row.qty
  )).length
}

function draftFromLog(log) {
  if (!log) {
    return {
      work_done: '',
      remarks: '',
      labour_count: '',
      materials: [{ code: '', description: '', uom: '', qty: '' }],
    }
  }
  return {
    work_done: log.work_done || '',
    remarks: log.remarks || '',
    labour_count: log.labour_count ?? '',
    materials: normalizeMaterialRows(log.materials),
  }
}

export default function WorkOrderDailyLogSection({ detail, onUpdated }) {
  const canEdit = Boolean(detail?.daily_log_can_edit)
  const logs = detail?.daily_logs || []
  const openLog = detail?.daily_log_open || logs.find((row) => row.day_status === 'open') || null
  const [activeLogId, setActiveLogId] = useState(openLog?.id || null)
  const [draft, setDraft] = useState(() => draftFromLog(openLog))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const activeLog = useMemo(
    () => logs.find((row) => row.id === activeLogId) || openLog || logs[0] || null,
    [logs, activeLogId, openLog],
  )

  useEffect(() => {
    const next = openLog || logs[0] || null
    setActiveLogId(next?.id || null)
    setDraft(draftFromLog(next))
    setError(null)
  }, [detail?.id, detail?.updated_at, openLog?.id, logs.length])

  useEffect(() => {
    if (!activeLog) return
    setDraft(draftFromLog(activeLog))
  }, [activeLog?.id, activeLog?.updated_at])

  if (!detail?.daily_log_visible && !logs.length && !canEdit) return null

  const editingOpen = canEdit && activeLog?.day_status === 'open'
  const editingClosed = canEdit && activeLog?.day_status === 'closed'

  const setDraftField = (key, value) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  const payloadFromDraft = () => ({
    work_done: draft.work_done,
    remarks: draft.remarks,
    labour_count: draft.labour_count === '' ? null : draft.labour_count,
    materials: draft.materials,
  })

  const run = async (action) => {
    setSaving(true)
    setError(null)
    try {
      let updated
      if (action === 'start') {
        updated = await startWorkOrderDay(detail.id, {
          time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        })
      } else if (action === 'save') {
        if (!activeLog) throw new Error('No daily log selected.')
        updated = await updateWorkOrderDailyLog(detail.id, activeLog.id, payloadFromDraft())
      } else if (action === 'end') {
        if (!activeLog) throw new Error('No daily log selected.')
        updated = await endWorkOrderDay(detail.id, activeLog.id, payloadFromDraft())
      }
      onUpdated?.(updated)
    } catch (err) {
      setError(err.message || 'Could not update daily log.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="wo-received-detail__section wo-daily-log">
      <div className="wo-daily-log__header">
        <h3>Daily work log</h3>
        {canEdit && !openLog && (
          <button
            type="button"
            className="company-btn company-btn--primary company-btn--compact"
            disabled={saving}
            onClick={() => run('start')}
          >
            {saving ? 'Starting…' : 'Start day'}
          </button>
        )}
      </div>
      <p className="wo-permit__hint">
        Record work done and consumables each day. End the day when finished; start again the next day.
      </p>

      {error && <div className="wo-alert wo-alert--error" role="alert">{error}</div>}

      {!logs.length && canEdit && (
        <p className="wo-permit__hint">No daily logs yet. Click Start day to begin today’s entry.</p>
      )}

      {logs.length > 0 && (
        <div className="wo-daily-log__layout">
          <div className="wo-daily-log__history" role="list" aria-label="Daily log history">
            {logs.map((log) => {
              const selected = activeLog?.id === log.id
              return (
                <button
                  key={log.id}
                  type="button"
                  role="listitem"
                  className={`wo-daily-log__history-item${selected ? ' is-selected' : ''}`}
                  onClick={() => setActiveLogId(log.id)}
                >
                  <span className="wo-daily-log__history-date">{formatDayLabel(log.log_date)}</span>
                  <span className={`wo-daily-log__badge wo-daily-log__badge--${log.day_status}`}>
                    {log.day_status}
                  </span>
                  <span className="wo-daily-log__history-meta">
                    {materialCount(log.materials)} material{materialCount(log.materials) === 1 ? '' : 's'}
                  </span>
                </button>
              )
            })}
          </div>

          {activeLog && (
            <div className="wo-daily-log__editor">
              <div className="wo-daily-log__editor-meta">
                <strong>{formatDayLabel(activeLog.log_date)}</strong>
                <span>
                  Started {formatStamp(activeLog.started_at)}
                  {activeLog.ended_at ? ` · Ended ${formatStamp(activeLog.ended_at)}` : ''}
                </span>
              </div>

              <label className="company-form__field">
                <span className="company-form__label">Work done today</span>
                <textarea
                  className="company-form__input company-form__textarea"
                  rows={3}
                  value={draft.work_done}
                  disabled={saving || !(editingOpen || editingClosed)}
                  onChange={(e) => setDraftField('work_done', e.target.value)}
                  placeholder="Describe the work performed this day"
                />
              </label>

              <div className="company-form__grid">
                <label className="company-form__field">
                  <span className="company-form__label">Labour count</span>
                  <input
                    type="number"
                    min="0"
                    className="company-form__input"
                    value={draft.labour_count}
                    disabled={saving || !(editingOpen || editingClosed)}
                    onChange={(e) => setDraftField('labour_count', e.target.value)}
                  />
                </label>
                <label className="company-form__field">
                  <span className="company-form__label">Remarks</span>
                  <input
                    className="company-form__input"
                    value={draft.remarks}
                    disabled={saving || !(editingOpen || editingClosed)}
                    onChange={(e) => setDraftField('remarks', e.target.value)}
                  />
                </label>
              </div>

              <div className="company-form__field">
                <span className="company-form__label">Materials used today</span>
                <WorkOrderMaterialRowsTable
                  rows={draft.materials}
                  onChange={(next) => setDraftField('materials', next)}
                  readOnly={!(editingOpen || editingClosed)}
                  disabled={saving}
                />
              </div>

              {(editingOpen || editingClosed) && (
                <div className="wo-daily-log__actions">
                  <button
                    type="button"
                    className="company-btn company-btn--secondary"
                    disabled={saving}
                    onClick={() => run('save')}
                  >
                    {saving ? 'Saving…' : 'Save day'}
                  </button>
                  {editingOpen && (
                    <button
                      type="button"
                      className="company-btn company-btn--primary"
                      disabled={saving}
                      onClick={() => run('end')}
                    >
                      {saving ? 'Ending…' : 'End day'}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
