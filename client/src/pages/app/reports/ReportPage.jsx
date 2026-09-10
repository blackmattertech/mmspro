import { useEffect, useMemo, useState } from 'react'
import ReportsLayout from '../../../components/reports/ReportsLayout'
import ReportScheduleModal from '../../../components/reports/ReportScheduleModal'
import { usePermissions } from '../../../hooks/usePermissions'
import { useTableColumnPrefs } from '../../../hooks/useTableColumnPrefs'
import { downloadReportPdf, getReport } from '../../../lib/api-reports'
import { downloadBase64File } from '../../../lib/fileDownload'
import {
  columnsForReportKey,
  defaultReportDateRange,
  formatKpiDelta,
  formatReportCell,
  REPORT_TITLES,
} from '../../../lib/reportColumns'
import '../../../components/company/CompanyShared.css'
import '../../../components/reports/ReportsLayout.css'

const WRAP_COLUMNS = new Set(['short_description', 'work_done', 'materials', 'remarks', 'assignees', 'equipment'])

export default function ReportPage({ reportKey }) {
  const title = REPORT_TITLES[reportKey] || 'Report'
  const columnDefs = useMemo(() => columnsForReportKey(reportKey), [reportKey])
  const { isOrgAdmin } = usePermissions()
  const defaults = useMemo(() => defaultReportDateRange(), [])

  const [dateFrom, setDateFrom] = useState(defaults.from)
  const [dateTo, setDateTo] = useState(defaults.to)
  const [locationId, setLocationId] = useState('all')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [downloading, setDownloading] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)

  const {
    visibleColumnIds,
    toggleColumn,
    resetColumns,
  } = useTableColumnPrefs(`report:${reportKey}`, columnDefs)

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(handle)
  }, [search])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const data = await getReport(reportKey, {
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          locationId,
          search: debouncedSearch || undefined,
        })
        if (cancelled) return
        setReport(data)
        if (!data?.filters?.can_select_location && data?.filters?.location_id) {
          setLocationId(data.filters.location_id)
        }
      } catch (err) {
        if (!cancelled) {
          setReport(null)
          setError(err.message)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    if (dateFrom && dateTo) {
      load()
    } else {
      setLoading(false)
    }
    return () => { cancelled = true }
  }, [reportKey, dateFrom, dateTo, locationId, debouncedSearch])

  const visibleCols = columnDefs.filter((col) => visibleColumnIds.includes(col.id))
  const locations = report?.locations || []
  const canSelectLocation = Boolean(report?.filters?.can_select_location)
  const rows = report?.rows || []
  const kpis = report?.kpis || []

  const downloadPdf = async () => {
    setDownloading(true)
    setError(null)
    try {
      const file = await downloadReportPdf(reportKey, {
        columns: visibleColumnIds,
        date_from: dateFrom,
        date_to: dateTo,
        location_id: locationId !== 'all' ? locationId : undefined,
        search: debouncedSearch || undefined,
      })
      downloadBase64File(file)
    } catch (err) {
      setError(err.message)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <>
      <ReportsLayout
        title={title}
        subtitle={report ? `${report.total} row${report.total === 1 ? '' : 's'} · ${report.org_name}` : 'KPI-backed owner report'}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateChange={({ from, to }) => {
          setDateFrom(from)
          setDateTo(to)
        }}
        locations={locations}
        locationId={locationId}
        onLocationChange={setLocationId}
        canSelectLocation={canSelectLocation}
        search={search}
        onSearchChange={setSearch}
        columnDefs={columnDefs}
        visibleColumnIds={visibleColumnIds}
        onToggleColumn={toggleColumn}
        onResetColumns={resetColumns}
        onDownloadPdf={downloadPdf}
        downloading={downloading}
        canSchedule={isOrgAdmin}
        onSchedule={() => setScheduleOpen(true)}
      >
        {error && <div className="company-alert" role="alert">{error}</div>}

        {loading ? (
          <p className="reports-empty">Loading report…</p>
        ) : (
          <>
            <div className="reports-kpi-grid">
              {kpis.map((kpi) => {
                const deltaText = formatKpiDelta(kpi)
                const deltaClass = Number(kpi.delta) > 0
                  ? 'reports-kpi__sub--up'
                  : Number(kpi.delta) < 0
                    ? 'reports-kpi__sub--down'
                    : ''
                return (
                  <div key={kpi.key} className="reports-kpi">
                    <span className="reports-kpi__label">{kpi.label}</span>
                    <span className="reports-kpi__value">
                      {typeof kpi.value === 'number' ? kpi.value.toLocaleString() : kpi.value}
                    </span>
                    {deltaText ? (
                      <div className={`reports-kpi__sub ${deltaClass}`.trim()}>{deltaText}</div>
                    ) : null}
                  </div>
                )
              })}
            </div>

            <div className="reports-table-wrap company-table-wrap">
              <table className="company-table reports-table">
                <thead>
                  <tr>
                    {visibleCols.map((col) => (
                      <th key={col.id}>{col.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={Math.max(visibleCols.length, 1)}>
                        <p className="reports-empty">No rows for this period.</p>
                      </td>
                    </tr>
                  ) : rows.map((row) => (
                    <tr key={row.id}>
                      {visibleCols.map((col) => (
                        <td
                          key={col.id}
                          className={WRAP_COLUMNS.has(col.id) ? 'reports-table__cell--wrap' : undefined}
                        >
                          {formatReportCell(col.id, row[col.id])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </ReportsLayout>

      {scheduleOpen && (
        <ReportScheduleModal
          reportKey={reportKey}
          title={title}
          columnDefs={columnDefs}
          defaultColumnIds={visibleColumnIds}
          locations={locations}
          canSelectLocation={canSelectLocation}
          currentLocationId={locationId}
          onClose={() => setScheduleOpen(false)}
        />
      )}
    </>
  )
}
