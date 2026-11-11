import { useEffect, useMemo, useState } from 'react'
import {
  createReportSchedule,
  deleteReportSchedule,
  listReportSchedules,
  previewReportEmail,
  sendReportScheduleNow,
  updateReportSchedule,
} from '../../lib/api-reports'
import { asListArray } from '../../lib/listResponse'
import {
  SCHEDULE_FREQUENCIES,
  SCHEDULE_WEEKDAYS,
  SCHEDULE_WINDOWS,
  scheduleFrequencyLabel,
  scheduleHourLabel,
  scheduleWindowLabel,
} from '../../lib/reportScheduleLabels'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import { useConfirmDelete } from '../../hooks/useConfirmDelete'
import SpellcheckInput from '../shared/SpellcheckInput'
import EditIcon from '../ui/EditIcon'
import TrashIcon from '../ui/TrashIcon'
import '../company/CompanyShared.css'
import './ReportsLayout.css'

const WEEKDAY_FREQUENCIES = new Set(['weekly', 'biweekly'])
const MONTH_DAY_FREQUENCIES = new Set(['monthly', 'quarterly', 'half_yearly', 'yearly'])
const EMAIL_BODY_MAX = 8000

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
    email_body_text: '',
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
    email_body_text: row.email_body_text || '',
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
  initialSchedule = null,
  onClose,
}) {
  const { requestDelete, deleteModal } = useConfirmDelete()
  const [schedules, setSchedules] = useState([])
  const [form, setForm] = useState(() => (
    initialSchedule ? formFromSchedule(initialSchedule) : emptyForm(defaultCustomId || initialSchedule?.custom_report_id)
  ))
  const [editingId, setEditingId] = useState(initialSchedule?.id || null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sendingId, setSendingId] = useState(null)
  const [error, setError] = useState(null)
  const [previewHtml, setPreviewHtml] = useState('')
  const [previewSubject, setPreviewSubject] = useState('')
  const [previewing, setPreviewing] = useState(false)

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
    setPreviewHtml('')
    setPreviewSubject('')
  }

  const schedulePayload = () => ({
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
    email_body_text: form.email_body_text,
  })

  const runPreview = async () => {
    setPreviewing(true)
    setError(null)
    try {
      const data = await previewReportEmail(reportKey, {
        custom_report_id: form.custom_report_id || undefined,
        date_window: form.date_window,
        email_body_text: form.email_body_text,
      })
      setPreviewHtml(data.html || '')
      setPreviewSubject(data.subject || '')
    } catch (err) {
      setError(err.message)
    } finally {
      setPreviewing(false)
    }
  }

  const save = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    const body = schedulePayload()
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
                {SCHEDULE_FREQUENCIES.map((item) => (
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
                  <option key={hour} value={hour}>{scheduleHourLabel(hour)}</option>
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
                    <option key={hour} value={hour}>{scheduleHourLabel(hour)}</option>
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
                  {SCHEDULE_WEEKDAYS.map((day) => (
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
                  {SCHEDULE_WEEKDAYS.map((day) => (
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
                {SCHEDULE_WINDOWS.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="company-form__field company-form__field--full">
            <label className="company-form__label" htmlFor="report-email-body">Email body</label>
            <SpellcheckInput
              multiline
              id="report-email-body"
              className="company-form__input company-form__textarea reports-email-body-input"
              rows={10}
              value={form.email_body_text}
              onChange={(event) => setField('email_body_text', event.target.value.slice(0, EMAIL_BODY_MAX))}
              placeholder={'Write the full email body.\n\n# Title\nYour intro paragraph.\n\n- Bullet one\n- Bullet two\n\n**Bold** and *italic* are supported.'}
              maxLength={EMAIL_BODY_MAX}
            />
            <p className="company-modal__hint">
              Your text becomes the full email body and is auto-formatted (headings with #, lists with - or 1., quotes with {'>'}, **bold**).
              Leave blank for the default report summary. Attachments and delivery meta stay automatic.
              {' '}
              {form.email_body_text.length}/{EMAIL_BODY_MAX}
            </p>
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
              type="button"
              className="company-btn company-btn--secondary"
              onClick={runPreview}
              disabled={previewing || !form.custom_report_id}
            >
              {previewing ? 'Building preview…' : 'Preview email'}
            </button>
            <button
              type="submit"
              className="company-btn company-btn--primary"
              disabled={saving || !form.custom_report_id}
            >
              {saving ? 'Saving…' : editingId ? 'Update schedule' : 'Create schedule'}
            </button>
          </div>

          {previewHtml ? (
            <div className="reports-email-preview">
              {previewSubject ? (
                <p className="reports-email-preview__subject">
                  <strong>Subject:</strong> {previewSubject}
                </p>
              ) : null}
              <iframe
                title="Email preview"
                className="reports-email-preview__frame"
                sandbox=""
                srcDoc={previewHtml}
              />
            </div>
          ) : null}

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
                      {scheduleFrequencyLabel(row)} · {scheduleWindowLabel(row.date_window)}
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
                      className="company-btn company-btn--secondary company-btn--compact company-btn--icon"
                      onClick={() => {
                        setEditingId(row.id)
                        setForm(formFromSchedule(row))
                      }}
                      aria-label="Edit schedule"
                      title="Edit"
                    >
                      <EditIcon />
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
                      className="company-btn company-btn--danger company-btn--compact company-btn--icon"
                      onClick={async () => {
                        if (!(await requestDelete({
                          title: 'Delete schedule',
                          message: `Delete schedule "${row.name || row.title || 'this schedule'}"?`,
                        }))) return
                        try {
                          await deleteReportSchedule(row.id)
                          if (editingId === row.id) resetForm()
                          await reload()
                        } catch (err) {
                          setError(err.message)
                        }
                      }}
                      aria-label="Delete schedule"
                      title="Delete"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </form>
      </div>
      {deleteModal}
    </div>
  )
}
