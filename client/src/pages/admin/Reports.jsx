import { useEffect, useState } from 'react'
import { getAdminReport } from '../../lib/api'
import { downloadClientCsv } from '../../lib/clientCsv'
import { ExportCsvButton } from '../../components/shared/ListTableChrome'
import './AdminPage.css'
import './Reports.css'

const FALLBACK_TYPES = [
  {
    key: 'companies',
    title: 'Companies',
    about: 'Companies on the platform, with plan, status, and how much of their account they use.',
    statuses: [
      { value: 'all', label: 'All statuses' },
      { value: 'active', label: 'Active' },
      { value: 'inactive', label: 'Inactive' },
    ],
  },
  { key: 'subscriptions', title: 'Subscriptions', statuses: [{ value: 'all', label: 'All statuses' }] },
  { key: 'users', title: 'Users', statuses: [{ value: 'all', label: 'All roles' }] },
]

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatMoney(amount, currency = 'INR') {
  const value = Number(amount)
  if (!Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currency || 'INR',
    maximumFractionDigits: 2,
  }).format(value)
}

function formatCell(column, row) {
  const value = row[column.id]
  if (column.format === 'date') return formatDate(value)
  if (column.format === 'money') return formatMoney(value, row.currency)
  if (value == null || value === '') return '—'
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100)
  return String(value)
}

export default function AdminReports() {
  const [key, setKey] = useState('companies')
  const [status, setStatus] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [types, setTypes] = useState(FALLBACK_TYPES)
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setAppliedSearch(search.trim()), 350)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    getAdminReport({
      key,
      status,
      date_from: dateFrom,
      date_to: dateTo,
      search: appliedSearch,
    })
      .then((data) => {
        if (cancelled) return
        setTypes(data.types?.length ? data.types : FALLBACK_TYPES)
        setReport(data.report || null)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not load the report')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [key, status, dateFrom, dateTo, appliedSearch])

  const activeType = types.find((item) => item.key === key) || types[0]
  const statuses = activeType?.statuses || [{ value: 'all', label: 'All' }]

  function selectReport(nextKey) {
    setKey(nextKey)
    setStatus('all')
    setSearch('')
    setAppliedSearch('')
  }

  return (
    <div className="admin-page">
      <header className="admin-page__header">
        <div>
          <h1 className="admin-page__title">Reports</h1>
          <p className="admin-page__subtitle">
            {report?.about || 'Companies, subscriptions, and the people who use them.'}
          </p>
        </div>
      </header>

      <div className="admin-page__content admin-reports">
        <div className="admin-reports__types" role="tablist" aria-label="Report types">
          {types.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={item.key === key}
              className={item.key === key ? 'is-active' : ''}
              onClick={() => selectReport(item.key)}
            >
              {item.title}
            </button>
          ))}
        </div>

        <div className="admin-reports__filters">
          <label>{key === 'users' ? 'Role' : 'Status'}
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              {statuses.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
          <label>From
            <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          </label>
          <label>To
            <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          </label>
          <label>Search
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search this report" />
          </label>
        </div>

        {error && <p className="admin-alert">{error}</p>}
        {report?.truncated && <p className="admin-alert">Showing the first {report.total} rows.</p>}
        {(report?.warnings || []).map((warning) => (
          <p key={warning} className="admin-alert">{warning}</p>
        ))}

        <section className="admin-card admin-reports__card">
          <div className="admin-card__header">
            <h2 className="admin-card__title">{report?.title || 'Report'}</h2>
            <span className="admin-reports__count">{loading ? 'Loading…' : `${report?.total || 0} rows`}</span>
            <ExportCsvButton
              onClick={() => downloadClientCsv(`${report?.title || 'report'}.csv`, report?.rows || [], (report?.columns || []).map((column) => ({
                label: column.label,
                value: (row) => row[column.id],
              })))}
            />
          </div>
          <div className="admin-reports__table-wrap">
            <table className="admin-reports__table">
              <thead>
                <tr>
                  {(report?.columns || []).map((column) => (
                    <th key={column.id}>{column.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!loading && (report?.rows || []).length === 0 && (
                  <tr>
                    <td colSpan={Math.max(1, report?.columns?.length || 1)} className="admin-reports__empty">
                      Nothing in this report for the current filters.
                    </td>
                  </tr>
                )}
                {(report?.rows || []).map((row, index) => (
                  <tr key={row.id || index}>
                    {(report.columns || []).map((column) => (
                      <td key={column.id}>
                        {column.id === 'status' ? (
                          <span className={`admin-reports__status admin-reports__status--${row.status_tone || 'inactive'}`}>
                            {row.status}
                          </span>
                        ) : formatCell(column, row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}
