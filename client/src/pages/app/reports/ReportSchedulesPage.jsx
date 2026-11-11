import { useCallback, useEffect, useState } from 'react'
import {
  deleteReportSchedule,
  listAllCustomReports,
  listAllReportSchedules,
  previewReportEmail,
  sendReportScheduleNow,
  updateReportSchedule,
} from '../../../lib/api-reports'
import { asListArray } from '../../../lib/listResponse'
import { REPORT_TITLES } from '../../../lib/reportColumns'
import {
  formatScheduleTimestamp,
  scheduleFrequencyLabel,
  scheduleWindowLabel,
} from '../../../lib/reportScheduleLabels'
import { usePermissions } from '../../../hooks/usePermissions'
import { useConfirmDelete } from '../../../hooks/useConfirmDelete'
import PageBreadcrumbs from '../../../components/shared/PageBreadcrumbs'
import ReportScheduleModal from '../../../components/reports/ReportScheduleModal'
import '../../../components/company/CompanyShared.css'
import '../../../components/workorders/WorkOrdersPage.css'
import '../../../components/reports/ReportsLayout.css'
import './ReportSchedulesPage.css'

function reportTypeLabel(key) {
  return REPORT_TITLES[key] || key || 'Report'
}

function customName(row) {
  return row.custom_report?.name || 'Custom report'
}

export default function ReportSchedulesPage() {
  const { isOrgAdmin } = usePermissions()
  const { requestDelete, deleteModal } = useConfirmDelete()
  const [schedules, setSchedules] = useState([])
  const [customReports, setCustomReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [previewById, setPreviewById] = useState({})
  const [previewLoadingId, setPreviewLoadingId] = useState(null)
  const [sendingId, setSendingId] = useState(null)
  const [editSchedule, setEditSchedule] = useState(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [scheduleData, customData] = await Promise.all([
        listAllReportSchedules(),
        listAllCustomReports().catch(() => ({ items: [] })),
      ])
      setSchedules(asListArray(scheduleData))
      setCustomReports(asListArray(customData))
    } catch (err) {
      setError(err.message || 'Could not load schedules')
      setSchedules([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const loadPreview = async (row) => {
    if (previewById[row.id]?.html) return
    setPreviewLoadingId(row.id)
    setError(null)
    try {
      const data = await previewReportEmail(row.report_key, {
        custom_report_id: row.custom_report_id || undefined,
        date_window: row.date_window,
        email_body_text: row.email_body_text || '',
      })
      setPreviewById((prev) => ({
        ...prev,
        [row.id]: {
          html: data.html || '',
          subject: data.subject || '',
          text: data.text || '',
        },
      }))
    } catch (err) {
      setError(err.message || 'Could not build email preview')
    } finally {
      setPreviewLoadingId(null)
    }
  }

  const toggleExpand = async (row) => {
    if (expandedId === row.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(row.id)
    await loadPreview(row)
  }

  const customsForKey = (reportKey) => (
    customReports.filter((item) => item.report_key === reportKey)
  )

  return (
    <div className="company-page wo-page report-schedules-page">
      <header className="wo-page__top">
        <div className="wo-page__intro">
          <PageBreadcrumbs />
          <h1 className="wo-page__title">Scheduled reports</h1>
          <p className="wo-page__subtitle">
            All report email schedules for this organization, including each custom email body (auto-formatted for sending).
          </p>
        </div>
      </header>

      <div className="wo-page__content report-schedules-page__content">
        {error ? <div className="wo-alert wo-alert--error" role="alert">{error}</div> : null}

        {loading ? (
          <div className="company-loading">Loading schedules…</div>
        ) : schedules.length === 0 ? (
          <div className="company-panel report-schedules-page__empty">
            <h2>No schedules yet</h2>
            <p>Open a report, save a custom view, then use Schedule to create one.</p>
          </div>
        ) : (
          <div className="report-schedules-page__list">
            {schedules.map((row) => {
              const open = expandedId === row.id
              const preview = previewById[row.id]
              return (
                <article
                  key={row.id}
                  className={`report-schedules-card${open ? ' report-schedules-card--open' : ''}${row.is_active === false ? ' report-schedules-card--paused' : ''}`}
                >
                  <div className="report-schedules-card__main">
                    <div className="report-schedules-card__copy">
                      <div className="report-schedules-card__eyebrow">
                        <span>{reportTypeLabel(row.report_key)}</span>
                        <span className={`report-schedules-card__status${row.is_active === false ? ' report-schedules-card__status--paused' : ''}`}>
                          {row.is_active === false ? 'Paused' : 'Active'}
                        </span>
                      </div>
                      <h2 className="report-schedules-card__title">{customName(row)}</h2>
                      <p className="report-schedules-card__meta">
                        {scheduleFrequencyLabel(row)} · {scheduleWindowLabel(row.date_window)}
                      </p>
                      <p className="report-schedules-card__meta">
                        {(row.emails || []).join(', ') || 'No recipients'}
                      </p>
                      <p className="report-schedules-card__meta">
                        Next: {formatScheduleTimestamp(row.next_run_at)}
                        {' · '}
                        Last sent: {formatScheduleTimestamp(row.last_sent_at)}
                      </p>
                      {row.last_error ? (
                        <p className="report-schedules-card__error">{row.last_error}</p>
                      ) : null}
                      {row.email_body_text ? (
                        <p className="report-schedules-card__snippet">
                          {row.email_body_text.length > 160
                            ? `${row.email_body_text.slice(0, 160)}…`
                            : row.email_body_text}
                        </p>
                      ) : (
                        <p className="report-schedules-card__snippet report-schedules-card__snippet--muted">
                          Default report summary body (no custom email body)
                        </p>
                      )}
                    </div>

                    <div className="report-schedules-card__actions">
                      <button
                        type="button"
                        className="company-btn company-btn--secondary company-btn--compact"
                        onClick={() => toggleExpand(row)}
                      >
                        {open ? 'Hide email' : 'View email'}
                      </button>
                      {isOrgAdmin ? (
                        <>
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
                            onClick={() => setEditSchedule(row)}
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
                            {row.is_active === false ? 'Resume' : 'Pause'}
                          </button>
                          <button
                            type="button"
                            className="company-btn company-btn--danger company-btn--compact"
                            onClick={async () => {
                              if (!(await requestDelete({
                                title: 'Delete schedule',
                                message: `Delete schedule for “${customName(row)}”?`,
                              }))) return
                              try {
                                await deleteReportSchedule(row.id)
                                if (expandedId === row.id) setExpandedId(null)
                                await reload()
                              } catch (err) {
                                setError(err.message)
                              }
                            }}
                          >
                            Delete
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>

                  {open ? (
                    <div className="report-schedules-card__preview">
                      {previewLoadingId === row.id ? (
                        <p className="company-modal__hint">Building branded preview…</p>
                      ) : preview?.html ? (
                        <>
                          {preview.subject ? (
                            <p className="reports-email-preview__subject">
                              <strong>Subject:</strong> {preview.subject}
                            </p>
                          ) : null}
                          <iframe
                            title={`Email preview ${customName(row)}`}
                            className="reports-email-preview__frame"
                            sandbox=""
                            srcDoc={preview.html}
                          />
                        </>
                      ) : (
                        <p className="company-modal__hint">Preview unavailable.</p>
                      )}
                    </div>
                  ) : null}
                </article>
              )
            })}
          </div>
        )}
      </div>

      {editSchedule ? (
        <ReportScheduleModal
          reportKey={editSchedule.report_key}
          title={reportTypeLabel(editSchedule.report_key)}
          customReports={customsForKey(editSchedule.report_key)}
          defaultCustomId={editSchedule.custom_report_id || ''}
          initialSchedule={editSchedule}
          onClose={async () => {
            setEditSchedule(null)
            await reload()
            setPreviewById({})
          }}
        />
      ) : null}
      {deleteModal}
    </div>
  )
}
