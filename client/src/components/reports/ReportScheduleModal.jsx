import { useEffect, useMemo, useState } from 'react'
import {
  createReportSchedule,
  deleteReportSchedule,
  listReportSchedules,
  sendReportScheduleNow,
  updateReportSchedule,
} from '../../lib/api-reports'
import { asListArray } from '../../lib/listResponse'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import SpellcheckInput from '../shared/SpellcheckInput'
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

const FREQUENCIES = [
  { value: 'daily', label: 'Once a day' },
  { value: 'twice_daily', label: 'Twice a day' },
  { value: 'every_2_days', label: 'Once in 2 days' },
  { value: 'every_3_days', label: 'Once in 3 days' },
  { value: 'weekly', label: 'Once a week' },
  { value: 'twice_weekly', label: 'Twice a week' },
  { value: 'biweekly', label: 'Bi-weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'half_yearly', label: 'Half-yearly' },
  { value: 'yearly', label: 'Yearly' },
]

const WEEKDAY_FREQUENCIES = new Set(['weekly', 'biweekly'])
const MONTH_DAY_FREQUENCIES = new Set(['monthly', 'quarterly', 'half_yearly', 'yearly'])

function emptyForm(customReportId) {
  return {
    custom_report_id: customReportId || '',
    emails: '',
    frequency: 'weekly',
    send_hour: 6,
    send_hour_2: 18,
    weekday: 1,
    weekday_2: 4,
    month_day: 1,
    date_window: 'last_7_days',
    is_active: true,
  }
}

function formFromSchedule(row) {
  return {
    custom_report_id: row.custom_report_id || row.custom_report?.id || '',
    emails: Array.isArray(row.emails) ? row.emails.join('\n') : '',
    frequency: row.frequency || 'weekly',
    send_hour: Number(row.send_hour) || 6,
    send_hour_2: Number(row.send_hour_2) || 18,
    weekday: row.weekday ?? 1,
    weekday_2: row.weekday_2 ?? 4,
    month_day: row.month_day ?? 1,
    date_window: row.date_window || 'last_7_days',
    is_active: row.is_active !== false,
  }
}

function hourLabel(hour) {
  return `${String(Number(hour) || 0).padStart(2, '0')}:00 UTC`
}

function weekdayName(value) {
  return WEEKDAYS.find((item) => item.value === Number(value))?.label || 'weekday'
}

function frequencyLabel(row) {
  const hour = hourLabel(row.send_hour)
  switch (row.frequency) {
    case 'daily':
      return `Once a day at ${hour}`
    case 'twice_daily':
      return `Twice a day at ${hour} and ${hourLabel(row.send_hour_2)}`
    case 'every_2_days':
      return `Once in 2 days at ${hour}`
    case 'every_3_days':
      return `Once in 3 days at ${hour}`
    case 'weekly':
      return `Every ${weekdayName(row.weekday)} at ${hour}`
    case 'twice_weekly':
      return `${weekdayName(row.weekday)} and ${weekdayName(row.weekday_2)} at ${hour}`
    case 'biweekly':
      return `Every 2 weeks on ${weekdayName(row.weekday)} at ${hour}`
    case 'monthly':
      return `Monthly on day ${row.month_day} at ${hour}`
    case 'quarterly':
      return `Quarterly on day ${row.month_day} at ${hour}`
    case 'half_yearly':
      return `Half-yearly on day ${row.month_day} at ${hour}`
    case 'yearly':
      return `Yearly on day ${row.month_day} at ${hour}`
    default:
      return FREQUENCIES.find((item) => item.value === row.frequency)?.label || row.frequency
  }
}

function customReportName(row, customReports) {
  return row.custom_report?.name
    || customReports.find((item) => item.id === row.custom_report_id)?.name
    || 'Custom report'
}

export default function ReportScheduleModal({
  reportKey,
  title,
  customReports = [],
  defaultCustomId = '',
  onClose,
}) {
  const [schedules, setSchedules] = useState([])
  const [form, setForm] = useState(() => emptyForm(defaultCustomId))
  const [editingId, setEditingId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sendingId, setSendingId] = useState(null)
  const [error, setError] = useState(null)

  const hours = useMemo(() => Array.from({ length: 24 }, (_, hour) => hour), [])
  const handleBackdropClick = useBackdropClose(onClose)

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

  const resetForm = () => {
    setEditingId(null)
    setForm(emptyForm(defaultCustomId))
  }

  const save = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    const body = {
      custom_report_id: form.custom_report_id,
      emails: form.emails,
      frequency: form.frequency,
      send_hour: Number(form.send_hour),
      send_hour_2: form.frequency === 'twice_daily' ? Number(form.send_hour_2) : null,
      weekday: WEEKDAY_FREQUENCIES.has(form.frequency) || form.frequency === 'twice_weekly'
        ? Number(form.weekday)
        : null,
      weekday_2: form.frequency === 'twice_weekly' ? Number(form.weekday_2) : null,
      month_day: MONTH_DAY_FREQUENCIES.has(form.frequency) ? Number(form.month_day) : null,
      date_window: form.date_window,
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
    <div className="company-modal-overlay company-modal-overlay--popup" onClick={handleBackdropClick} role="presentation">
      <div
        className="company-modal company-modal--popup company-modal--popup-wide"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
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
            Emails go out in UTC with PDF and CSV of the selected custom report.
          </p>
          {error && <div className="company-alert" role="alert">{error}</div>}

          <div className="company-form__field company-form__field--full">
            <label className="company-form__label" htmlFor="report-custom">Custom report</label>
            <select
              id="report-custom"
              className="company-form__input"
              value={form.custom_report_id}
              onChange={(event) => setField('custom_report_id', event.target.value)}
              required
            >
              <option value="">Select a custom report</option>
              {customReports.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
            {customReports.length === 0 ? (
              <p className="company-modal__hint">Save a custom report on this page first.</p>
            ) : null}
          </div>

          <div className="company-form__field company-form__field--full">
            <label className="company-form__label" htmlFor="report-emails">Recipients</label>
            <SpellcheckInput
              multiline
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
                {FREQUENCIES.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
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
                  <option key={hour} value={hour}>{hourLabel(hour)}</option>
                ))}
              </select>
            </div>
            {form.frequency === 'twice_daily' && (
              <div className="company-form__field">
                <label className="company-form__label" htmlFor="report-hour-2">Second hour (UTC)</label>
                <select
                  id="report-hour-2"
                  className="company-form__input"
                  value={form.send_hour_2}
                  onChange={(event) => setField('send_hour_2', Number(event.target.value))}
                >
                  {hours.map((hour) => (
                    <option key={hour} value={hour}>{hourLabel(hour)}</option>
                  ))}
                </select>
              </div>
            )}
            {(WEEKDAY_FREQUENCIES.has(form.frequency) || form.frequency === 'twice_weekly') && (
              <div className="company-form__field">
                <label className="company-form__label" htmlFor="report-weekday">
                  {form.frequency === 'twice_weekly' ? 'First weekday' : 'Day of week'}
                </label>
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
            {form.frequency === 'twice_weekly' && (
              <div className="company-form__field">
                <label className="company-form__label" htmlFor="report-weekday-2">Second weekday</label>
                <select
                  id="report-weekday-2"
                  className="company-form__input"
                  value={form.weekday_2}
                  onChange={(event) => setField('weekday_2', Number(event.target.value))}
                >
                  {WEEKDAYS.map((day) => (
                    <option key={day.value} value={day.value}>{day.label}</option>
                  ))}
                </select>
              </div>
            )}
            {MONTH_DAY_FREQUENCIES.has(form.frequency) && (
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
            <button
              type="submit"
              className="company-btn company-btn--primary"
              disabled={saving || !form.custom_report_id}
            >
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
                    <strong>{customReportName(row, customReports)}</strong>
                    <p className="reports-schedule-card__meta">
                      {(row.emails || []).join(', ')}
                    </p>
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
                      disabled={sendingId === row.id}
                      onClick={async () => {
                        setSendingId(row.id)
                        setError(null)
                        try {
                          await sendReportScheduleNow(row.id)
                          await reload()
                        } catch (err) {
                          setError(err.message)
                        } finally {
                          setSendingId(null)
                        }
                      }}
                    >
                      {sendingId === row.id ? 'Sending…' : 'Send now'}
                    </button>
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
