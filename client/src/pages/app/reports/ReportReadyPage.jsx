import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PageBreadcrumbs from '../../../components/shared/PageBreadcrumbs'
import { useOrg } from '../../../hooks/useOrg'
import { usePermissions } from '../../../hooks/usePermissions'
import { orgPath } from '../../../config/navigation'
import {
  deleteReadyReport,
  downloadReadyReportFile,
  listReadyReports,
} from '../../../lib/api-reports'
import { formatDisplayDate, formatDisplayDateTime } from '../../../lib/displayDate'
import { REPORT_TITLES } from '../../../lib/reportColumns'
import '../../../components/company/CompanyShared.css'
import '../../../components/workorders/WorkOrdersPage.css'
import '../../../components/reports/ReportsLayout.css'
import './ReportReadyPage.css'

function reportTypeLabel(key) {
  return REPORT_TITLES[key] || key || 'Report'
}

function periodLabel(row) {
  if (!row?.date_from && !row?.date_to) return '—'
  if (row.date_from && row.date_to) {
    return `${formatDisplayDate(row.date_from)} – ${formatDisplayDate(row.date_to)}`
  }
  return formatDisplayDate(row.date_from || row.date_to)
}

export default function ReportReadyPage() {
  const { org } = useOrg()
  const { canDelete } = usePermissions()
  const canDeleteAnyReady = canDelete('reports_ready')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await listReadyReports()
      setRows(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message || 'Failed to load ready reports')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const onDownload = async (row, format) => {
    setBusyId(`${row.id}:${format}`)
    setError('')
    try {
      await downloadReadyReportFile(row.id, format)
    } catch (err) {
      setError(err.message || `Failed to download ${format.toUpperCase()}`)
    } finally {
      setBusyId(null)
    }
  }

  const onDelete = async (row) => {
    if (!window.confirm(`Delete ready report “${row.name}”?`)) return
    setBusyId(`${row.id}:delete`)
    setError('')
    try {
      await deleteReadyReport(row.id)
      setRows((prev) => prev.filter((item) => item.id !== row.id))
    } catch (err) {
      setError(err.message || 'Failed to delete ready report')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="company-page wo-page report-ready-page">
      <header className="wo-page__top">
        <div className="wo-page__intro">
          <PageBreadcrumbs />
          <h1 className="wo-page__title">Ready Reports</h1>
          <p className="wo-page__subtitle">
            Reports explicitly generated from Report Builder. Downloads and scheduled emails are not listed here.
          </p>
        </div>
        {org?.slug && (
          <div className="wo-page__actions">
            <Link className="company-btn company-btn--primary" to={orgPath(org.slug, 'reports')}>
              Open Report Builder
            </Link>
          </div>
        )}
      </header>

      <div className="wo-page__content report-ready-page__content">
        {error && (
          <div className="wo-alert wo-alert--error" role="alert">{error}</div>
        )}

        {loading ? (
          <div className="company-loading">Loading ready reports…</div>
        ) : !rows.length ? (
          <div className="company-panel report-ready-page__empty">
            <h2>No ready reports yet</h2>
            <p>Generate a report from Report Builder to see it here.</p>
            {org?.slug && (
              <Link className="company-btn company-btn--secondary" to={orgPath(org.slug, 'reports')}>
                Go to Report Builder
              </Link>
            )}
          </div>
        ) : (
          <div className="company-panel report-ready-page__table-wrap">
            <table className="company-table report-ready-page__table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Period</th>
                  <th>Generated</th>
                  <th>By</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const canDeleteRow = canDeleteAnyReady || row.can_delete
                  return (
                    <tr key={row.id}>
                      <td>
                        <div className="report-ready-page__name">
                          <span title={row.name}>{row.name}</span>
                          {row.truncated ? (
                            <span className="report-ready-page__badge">Truncated</span>
                          ) : null}
                        </div>
                      </td>
                      <td>{reportTypeLabel(row.report_key)}</td>
                      <td>{periodLabel(row)}</td>
                      <td>{formatDisplayDateTime(row.created_at)}</td>
                      <td>{row.created_by_name || '—'}</td>
                      <td>
                        <div className="report-ready-page__actions">
                          <button
                            type="button"
                            className="company-btn company-btn--secondary company-btn--compact"
                            disabled={busyId === `${row.id}:pdf`}
                            onClick={() => onDownload(row, 'pdf')}
                          >
                            PDF
                          </button>
                          <button
                            type="button"
                            className="company-btn company-btn--secondary company-btn--compact"
                            disabled={busyId === `${row.id}:csv`}
                            onClick={() => onDownload(row, 'csv')}
                          >
                            CSV
                          </button>
                          {canDeleteRow ? (
                            <button
                              type="button"
                              className="company-btn company-btn--danger company-btn--compact"
                              disabled={busyId === `${row.id}:delete`}
                              onClick={() => onDelete(row)}
                            >
                              Delete
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
