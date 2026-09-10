import { useEffect, useMemo, useState } from 'react'
import {
  createReportSchedule,
  deleteReportSchedule,
  listReportSchedules,
  updateReportSchedule,
} from '../../lib/api-reports'
import { asListArray } from '../../lib/listResponse'
import '../company/CompanyShared.css'
import './ReportsLayout.css'

const WEEKDAYS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
]

const WINDOWS = [
  { value: 'previous_day', label: 'Previous day' },
  { value: 'last_7_days', label: 'Last 7 days' },
  { value: 'last_30_days', label: 'Last 30 days' },
  { value: 'month_to_date', label: 'Month to date' },
]

function emptyForm(columnIds, locationId) {
  return {
    emails: '',
    frequency: 'weekly',
    send_hour: 6,
    weekday: 1,
    month_day: 1,
    date_window: 'last_7_days',
    location_id: locationId && locationId !== 'all' ? locationId : '',
    columns: columnIds,
    is_active: true,
  }
}

function formFromSchedule(row) {
  return {
    emails: Array.isArray(row.emails) ? row.emails.join('\n') : '',
    frequency: row.frequency || 'weekly',
    send_hour: Number(row.send_hour) || 6,
    weekday: row.weekday ?? 1,
    month_day: row.month_day ?? 1,
    date_window: row.date_window || 'last_7_days',
    location_id: row.location_id || '',
    columns: Array.isArray(row.columns) ? row.columns : [],
    is_active: row.is_active !== false,
  }
}

function frequencyLabel(row) {
  if (row.frequency === 'daily') return `Daily at ${String(row.send_hour).padStart(2, '0')}:00 UTC`
  if (row.frequency === 'monthly') return `Monthly on day ${row.month_day} at ${String(row.send_hour).padStart(2, '0')}:00 UTC`
  const day = WEEKDAYS.find((item) => item.value === row.weekday)?.label || 'weekday'
  return `Weekly on ${day} at ${String(row.send_hour).padStart(2, '0')}:00 UTC`
}

export default function ReportScheduleModal({
  reportKey,
  title,
  columnDefs = [],
  defaultColumnIds = [],
  locations = [],
  canSelectLocation = false,
  currentLocationId,
  onClose,
}) {
  const [schedules, setSchedules] = useState([])
  const [form, setForm] = useState(() => emptyForm(defaultColumnIds, currentLocationId))
  const [editingId, setEditingId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const hours = useMemo(() => Array.from({ length: 24 }, (_, hour) => hour), [])

  async function reload() {
    setLoading(true)
    setError(null)
    try {
      const data = await listReportSchedules(reportKey)
      setSchedules(asListArray(data))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload()
  }, [reportKey])

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  const toggleColumn = (id) => {
    setForm((prev) => ({
      ...prev,
      columns: prev.columns.includes(id)
        ? prev.columns.filter((col) => col !== id)
        : [...prev.columns, id],
    }))
  }

  const resetForm = () => {
    setEditingId(null)
    setForm(emptyForm(defaultColumnIds, currentLocationId))
  }

  const save = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    const body = {
      emails: form.emails,
      frequency: form.frequency,
      send_hour: Number(form.send_hour),
      weekday: form.frequency === 'weekly' ? Number(form.weekday) : null,
      month_day: form.frequency === 'monthly' ? Number(form.month_day) : null,
      date_window: form.date_window,
      location_id: form.location_id || null,
      columns: form.columns,
      is_active: form.is_active,
    }
    try {
      if (editingId) {
        await updateReportSchedule(editingId, body)
      } else {
        await createReportSchedule(reportKey, body)
      }
      resetForm()
      await reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="company-modal-overlay" onClick={onClose} role="presentation">
      <div
        className="company-modal"
        style={{ maxWidth: 720 }}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-labelledby="report-schedule-title"
      >
        <div className="company-modal__header">
          <h2 id="report-schedule-title">Schedule {title}</h2>
          <button type="button" className="company-modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <form className="company-modal__form" onSubmit={save}>
          <p className="company-modal__hint">
            Emails go out in UTC with a PDF of the columns you pick. Recipients see the same location-scoped data as this report.
          </p>
          {error && <div className="company-alert" role="alert">{error}</div>}

          <div className="company-form__field company-form__field--full">
            <label className="company-form__label" htmlFor="report-emails">Recipients</label>
            <textarea
              id="report-emails"
              className="company-form__input company-form__textarea"
              rows={3}
              value={form.emails}
              onChange={(event) => setField('emails', event.target.value)}
              placeholder="one@company.com, two@company.com"
              required
            />
          </div>

          <div className="company-form__grid company-form__grid--2">
            <div className="company-form__field">
              <label className="company-form__label" htmlFor="report-frequency">Frequency</label>
              <select
                id="report-frequency"
                className="company-form__input"
                value={form.frequency}
                onChange={(event) => setField('frequency', event.target.value)}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div className="company-form__field">
              <label className="company-form__label" htmlFor="report-hour">Send hour (UTC)</label>
              <select
                id="report-hour"
                className="company-form__input"
                value={form.send_hour}
                onChange={(event) => setField('send_hour', Number(event.target.value))}
              >
                {hours.map((hour) => (
                  <option key={hour} value={hour}>{`${String(hour).padStart(2, '0')}:00`}</option>
                ))}
              </select>
            </div>
            {form.frequency === 'weekly' && (
              <div className="company-form__field">
                <label className="company-form__label" htmlFor="report-weekday">Weekday</label>
                <select
                  id="report-weekday"
                  className="company-form__input"
                  value={form.weekday}
                  onChange={(event) => setField('weekday', Number(event.target.value))}
                >
                  {WEEKDAYS.map((day) => (
                    <option key={day.value} value={day.value}>{day.label}</option>
                  ))}
                </select>
              </div>
            )}
            {form.frequency === 'monthly' && (
              <div className="company-form__field">
                <label className="company-form__label" htmlFor="report-month-day">Day of month</label>
                <input
                  id="report-month-day"
                  className="company-form__input"
                  type="number"
                  min={1}
                  max={31}
                  value={form.month_day}
                  onChange={(event) => setField('month_day', Number(event.target.value))}
                />
              </div>
            )}
            <div className="company-form__field">
              <label className="company-form__label" htmlFor="report-window">Date window</label>
              <select
                id="report-window"
                className="company-form__input"
                value={form.date_window}
                onChange={(event) => setField('date_window', event.target.value)}
              >
                {WINDOWS.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </div>
            <div className="company-form__field">
              <label className="company-form__label" htmlFor="report-location">Plant</label>
              <select
                id="report-location"
                className="company-form__input"
                value={form.location_id}
                onChange={(event) => setField('location_id', event.target.value)}
                disabled={!canSelectLocation}
              >
                <option value="">All plants</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="company-form__field">
            <span className="company-form__label">PDF columns</span>
            <div className="reports-columns-grid">
              {columnDefs.map((col) => (
                <label key={col.id}>
                  <input
                    type="checkbox"
                    checked={form.columns.includes(col.id)}
                    onChange={() => toggleColumn(col.id)}
                  />
                  {col.label}
                </label>
              ))}
            </div>
          </div>

          <label className="reports-columns-grid" style={{ gridTemplateColumns: '1fr' }}>
            <span>
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(event) => setField('is_active', event.target.checked)}
              />
              Active
            </span>
          </label>

          <div className="company-modal__actions">
            {editingId && (
              <button type="button" className="company-btn company-btn--secondary" onClick={resetForm}>
                Cancel edit
              </button>
            )}
            <button type="submit" className="company-btn company-btn--primary" disabled={saving}>
              {saving ? 'Saving…' : editingId ? 'Update schedule' : 'Create schedule'}
            </button>
          </div>

          <h3 className="company-form__label" style={{ marginTop: 8 }}>Existing schedules</h3>
          {loading ? (
            <p className="company-modal__hint">Loading schedules…</p>
          ) : schedules.length === 0 ? (
            <p className="company-modal__hint">No schedules yet for this report.</p>
          ) : (
            <div className="reports-schedule-list">
              {schedules.map((row) => (
                <div key={row.id} className="reports-schedule-card">
                  <div>
                    <strong>{(row.emails || []).join(', ')}</strong>
                    <p className="reports-schedule-card__meta">
                      {frequencyLabel(row)} · {WINDOWS.find((item) => item.value === row.date_window)?.label || row.date_window}
                      {row.is_active ? '' : ' · Paused'}
                    </p>
                    {row.last_error ? (
                      <p className="reports-schedule-card__error">{row.last_error}</p>
                    ) : null}
                  </div>
                  <div className="reports-schedule-card__actions">
                    <button
                      type="button"
                      className="company-btn company-btn--secondary company-btn--compact"
                      onClick={() => {
                        setEditingId(row.id)
                        setForm(formFromSchedule(row))
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="company-btn company-btn--secondary company-btn--compact"
                      onClick={async () => {
                        try {
                          await updateReportSchedule(row.id, { is_active: !row.is_active })
                          await reload()
                        } catch (err) {
                          setError(err.message)
                        }
                      }}
                    >
                      {row.is_active ? 'Pause' : 'Resume'}
                    </button>
                    <button
                      type="button"
                      className="company-btn company-btn--danger company-btn--compact"
                      onClick={async () => {
                        try {
                          await deleteReportSchedule(row.id)
                          if (editingId === row.id) resetForm()
                          await reload()
                        } catch (err) {
                          setError(err.message)
                        }
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
