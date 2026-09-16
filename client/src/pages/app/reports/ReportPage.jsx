import { useCallback, useEffect, useMemo, useState } from 'react'
import ReportsLayout from '../../../components/reports/ReportsLayout'
import ReportsFilters, { countActiveReportFilters } from '../../../components/reports/ReportsFilters'
import ReportScheduleModal from '../../../components/reports/ReportScheduleModal'
import ReportSendNowModal from '../../../components/reports/ReportSendNowModal'
import { usePermissions } from '../../../hooks/usePermissions'
import {
  createCustomReport,
  deleteCustomReport,
  downloadReportCsv,
  downloadReportPdf,
  getReport,
  getReportFilters,
  listCustomReports,
  sendReportNow,
  updateCustomReport,
} from '../../../lib/api-reports'
import { downloadBase64File } from '../../../lib/fileDownload'
import { asListArray } from '../../../lib/listResponse'
import {
  columnsForReportKey,
  defaultReportDateRange,
  defaultReportFilters,
  formatKpiDelta,
  formatReportCell,
  UNIFIED_REPORT_KEY,
} from '../../../lib/reportColumns'
import TableColumnPicker from '../../../components/shared/TableColumnPicker'
import StatusCountBar from '../../../components/shared/StatusCountBar'
import { useOrgStatusOptions } from '../../../hooks/useOrgStatusOptions'
import { colorByStatus } from '../../../lib/statusCounts'
import '../../../components/company/CompanyShared.css'
import '../../../components/shared/TableColumnPicker.css'
import '../../../components/shared/StatusCountBar.css'
import '../../../components/reports/ReportsLayout.css'

const REPORT_KEY = UNIFIED_REPORT_KEY
const WRAP_COLUMNS = new Set([
  'short_description',
  'equipment',
  'assignees',
  'order_from',
  'order_to',
  'job_nature',
  'problem_description',
  'remarks',
  'job_description',
  'root_cause',
  'action_taken',
  'material_consumed',
  'work_done',
  'special_tools_used',
  'safety_precautions',
  'dos_and_donts',
  'lessons_learned',
  'execution_remarks',
])

function sameIds(a = [], b = []) {
  return a.length === b.length && a.every((id, index) => id === b[index])
}

function storedLocation(locationId) {
  return locationId && locationId !== 'all' ? locationId : null
}

const KPI_META = {
  total: {
    iconClass: 'reports-kpi__icon--red',
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
        <path d="M6 3H14L18 7V18C18 18.55 17.55 19 17 19H5C4.45 19 4 18.55 4 18V4C4 3.45 4.45 3 5 3H6Z" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 11H14M8 14H12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  open: {
    iconClass: 'reports-kpi__icon--yellow',
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
        <rect x="5" y="3" width="12" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 8H14M8 11H14M8 14H11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  in_progress: {
    iconClass: 'reports-kpi__icon--blue',
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
        <circle cx="11" cy="11" r="7.25" stroke="currentColor" strokeWidth="1.5" />
        <path d="M11 7.5V11L13.5 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  completed: {
    iconClass: 'reports-kpi__icon--green',
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
        <circle cx="11" cy="11" r="7.25" stroke="currentColor" strokeWidth="1.5" />
        <path d="M7.5 11.2L10 13.7L14.5 8.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  overdue: {
    iconClass: 'reports-kpi__icon--red',
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
        <path d="M11 4.5L19 18.5H3L11 4.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M11 9.5V12.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="11" cy="15.25" r="0.8" fill="currentColor" />
      </svg>
    ),
  },
}

function ReportCell({ columnId, value, row, statusLabels }) {
  if (columnId === 'wo_number') {
    return <span className="company-table__name">{value || '—'}</span>
  }
  if (columnId === 'status') {
    const label = statusLabels?.[row.status] || formatReportCell(columnId, value)
    return <span className={`wo-status wo-status--${row.status || 'draft'}`}>{label}</span>
  }
  if (columnId === 'priority' || columnId === 'order_type') {
    const key = String(value || '').toLowerCase()
    return <span className={`reports-pill reports-pill--${key}`}>{formatReportCell(columnId, value)}</span>
  }
  if (columnId === 'progress_percent') {
    const pct = Number.isFinite(Number(value)) ? Number(value) : 0
    return (
      <div className="wo-progress" title={`${pct}%`}>
        <div className="wo-progress__track">
          <span className="wo-progress__fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="wo-progress__value">{pct}%</span>
      </div>
    )
  }
  return formatReportCell(columnId, value)
}

function validColumnIds(columnDefs, ids) {
  const allowed = new Set(columnDefs.map((col) => col.id))
  return (Array.isArray(ids) ? ids : []).filter((id) => allowed.has(id))
}

function toQuery(filters, search) {
  return {
    dateFrom: filters.from_date || undefined,
    dateTo: filters.to_date || undefined,
    locationId: filters.facility_id || undefined,
    facilityId: filters.facility_id || undefined,
    search: search || undefined,
    orderType: filters.order_type || undefined,
    orderFrom: filters.order_from || undefined,
    orderTo: filters.order_to || undefined,
    areaId: filters.area_id || undefined,
    equipmentId: filters.equipment_id || undefined,
    equipmentType: filters.equipment_type || undefined,
    equipmentCapacity: filters.equipment_capacity || undefined,
    equipmentTag: filters.equipment_tag || undefined,
    priority: filters.priority || undefined,
    status: filters.status || undefined,
    jobNature: filters.job_nature || undefined,
    createdBy: filters.created_by || undefined,
    reportedBy: filters.reported_by || undefined,
    assignedTo: filters.assigned_to || undefined,
  }
}

export default function ReportPage() {
  const title = 'Reports'
  const columnDefs = useMemo(() => columnsForReportKey(REPORT_KEY), [])
  const { isOrgAdmin } = usePermissions()
  const { statuses, labelByKey: statusLabels } = useOrgStatusOptions('work_order', { includeInactive: true })
  const statusColors = useMemo(() => colorByStatus(statuses), [statuses])
  const defaults = useMemo(() => defaultReportDateRange(), [])
  const defaultColumnIds = useMemo(() => columnDefs.map((col) => col.id), [columnDefs])
  const initialFilters = useMemo(() => defaultReportFilters(defaults), [defaults])

  const [draftFilters, setDraftFilters] = useState(initialFilters)
  const [appliedFilters, setAppliedFilters] = useState(initialFilters)
  const [filterOptions, setFilterOptions] = useState(null)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [downloading, setDownloading] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [sendNowOpen, setSendNowOpen] = useState(false)
  const [sendingNow, setSendingNow] = useState(false)

  const [customReports, setCustomReports] = useState([])
  const [selectedCustomId, setSelectedCustomId] = useState('')
  const [customName, setCustomName] = useState('')
  const [selectedColumnIds, setSelectedColumnIds] = useState(defaultColumnIds)
  const [savingCustom, setSavingCustom] = useState(false)

  const selectedCustom = customReports.find((item) => item.id === selectedCustomId) || null
  const canSelectLocation = filterOptions?.can_select_location !== false
    && Boolean(report?.filters?.can_select_location !== false)
  const locationDirty = isOrgAdmin
    && canSelectLocation
    && storedLocation(appliedFilters.facility_id) !== (selectedCustom?.location_id || null)
  const customDirty = !selectedCustom
    || selectedCustom.name !== customName.trim()
    || locationDirty
    || !sameIds(validColumnIds(columnDefs, selectedCustom.columns), selectedColumnIds)

  const applyCustom = useCallback((custom, defs, { keepLocation = false } = {}) => {
    if (!custom) {
      setSelectedCustomId('')
      setCustomName('')
      setSelectedColumnIds(defs.map((col) => col.id))
      if (!keepLocation) {
        setDraftFilters((prev) => ({ ...prev, facility_id: prev.facility_id }))
        setAppliedFilters((prev) => ({ ...prev, facility_id: prev.facility_id }))
      }
      return
    }
    setSelectedCustomId(custom.id)
    setCustomName(custom.name)
    const cols = validColumnIds(defs, custom.columns)
    setSelectedColumnIds(cols.length ? cols : defs.map((col) => col.id))
    if (!keepLocation) {
      const facilityId = custom.location_id || ''
      setDraftFilters((prev) => ({ ...prev, facility_id: facilityId }))
      setAppliedFilters((prev) => ({ ...prev, facility_id: facilityId }))
    }
  }, [])

  const reloadCustomReports = useCallback(async (preferredId) => {
    const data = await listCustomReports(REPORT_KEY)
    const items = asListArray(data)
    setCustomReports(items)
    return items.find((item) => item.id === preferredId) || items[0] || null
  }, [])

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(handle)
  }, [search])

  useEffect(() => {
    let cancelled = false
    async function loadOptions() {
      try {
        const data = await getReportFilters()
        if (cancelled) return
        setFilterOptions(data)
        if (!data?.can_select_location && data?.location_id) {
          setDraftFilters((prev) => (
            prev.facility_id === data.location_id ? prev : { ...prev, facility_id: data.location_id }
          ))
          setAppliedFilters((prev) => (
            prev.facility_id === data.location_id ? prev : { ...prev, facility_id: data.location_id }
          ))
        }
      } catch (err) {
        if (!cancelled) setError(err.message)
      }
    }
    loadOptions()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    setSelectedCustomId('')
    setCustomName('')
    setSelectedColumnIds(columnDefs.map((col) => col.id))
    async function loadCustoms() {
      try {
        const data = await listCustomReports(REPORT_KEY)
        if (cancelled) return
        const items = asListArray(data)
        setCustomReports(items)
        applyCustom(items[0] || null, columnDefs)
      } catch (err) {
        if (!cancelled) {
          setCustomReports([])
          setError(err.message)
        }
      }
    }
    loadCustoms()
    return () => { cancelled = true }
  }, [columnDefs, applyCustom])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const data = await getReport(REPORT_KEY, toQuery(appliedFilters, debouncedSearch))
        if (cancelled) return
        setReport(data)
        if (!data?.filters?.can_select_location && data?.filters?.location_id) {
          const lockedId = data.filters.location_id
          setDraftFilters((prev) => (
            prev.facility_id === lockedId ? prev : { ...prev, facility_id: lockedId }
          ))
          setAppliedFilters((prev) => (
            prev.facility_id === lockedId ? prev : { ...prev, facility_id: lockedId }
          ))
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
    if (appliedFilters.from_date && appliedFilters.to_date) {
      load()
    } else {
      setLoading(false)
    }
    return () => { cancelled = true }
  }, [appliedFilters, debouncedSearch])

  const visibleCols = selectedColumnIds
    .map((id) => columnDefs.find((col) => col.id === id))
    .filter(Boolean)
  const rows = report?.rows || []
  const kpis = report?.kpis || []

  const customPayload = () => ({
    name: customName,
    columns: selectedColumnIds,
    location_id: storedLocation(appliedFilters.facility_id),
  })

  const saveCustom = async ({ asNew = false } = {}) => {
    setSavingCustom(true)
    setError(null)
    try {
      const saved = asNew || !selectedCustomId
        ? await createCustomReport(REPORT_KEY, customPayload())
        : await updateCustomReport(selectedCustomId, customPayload())
      const matched = await reloadCustomReports(saved.id)
      applyCustom(matched || saved, columnDefs, { keepLocation: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingCustom(false)
    }
  }

  const removeCustom = async () => {
    if (!selectedCustomId) return
    if (!window.confirm('Delete this custom report? Schedules that use it must be removed first.')) return
    setSavingCustom(true)
    setError(null)
    try {
      await deleteCustomReport(selectedCustomId)
      const next = await reloadCustomReports()
      applyCustom(next, columnDefs)
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingCustom(false)
    }
  }

  const downloadPayload = () => ({
    ...(selectedCustomId && !customDirty ? { custom_report_id: selectedCustomId } : {}),
    ...Object.fromEntries(
      Object.entries({
        date_from: appliedFilters.from_date,
        date_to: appliedFilters.to_date,
        search: debouncedSearch || undefined,
        location_id: appliedFilters.facility_id || undefined,
        facility_id: appliedFilters.facility_id || undefined,
        order_type: appliedFilters.order_type || undefined,
        order_from: appliedFilters.order_from || undefined,
        order_to: appliedFilters.order_to || undefined,
        area_id: appliedFilters.area_id || undefined,
        equipment_id: appliedFilters.equipment_id || undefined,
        equipment_type: appliedFilters.equipment_type || undefined,
        equipment_capacity: appliedFilters.equipment_capacity || undefined,
        equipment_tag: appliedFilters.equipment_tag || undefined,
        priority: appliedFilters.priority || undefined,
        status: appliedFilters.status || undefined,
        job_nature: appliedFilters.job_nature || undefined,
        created_by: appliedFilters.created_by || undefined,
        reported_by: appliedFilters.reported_by || undefined,
        assigned_to: appliedFilters.assigned_to || undefined,
        columns: selectedColumnIds,
      }).filter(([, value]) => value != null && value !== ''),
    ),
  })

  const downloadFile = async (kind) => {
    setDownloading(true)
    setError(null)
    try {
      const file = kind === 'csv'
        ? await downloadReportCsv(REPORT_KEY, downloadPayload())
        : await downloadReportPdf(REPORT_KEY, downloadPayload())
      downloadBase64File(file)
    } catch (err) {
      setError(err.message)
    } finally {
      setDownloading(false)
    }
  }

  const onSelectCustom = (id) => {
    const custom = customReports.find((item) => item.id === id)
    applyCustom(custom || null, columnDefs)
  }

  const handleSearch = () => {
    setAppliedFilters({ ...draftFilters })
  }

  const handleClear = () => {
    const next = defaultReportFilters(defaults)
    if (!canSelectLocation && (filterOptions?.location_id || appliedFilters.facility_id)) {
      next.facility_id = filterOptions?.location_id || appliedFilters.facility_id
    }
    setDraftFilters(next)
    setAppliedFilters(next)
    setSearch('')
  }

  return (
    <>
      <ReportsLayout
        title={title}
        subtitle={report ? `${report.total} row${report.total === 1 ? '' : 's'} · ${report.org_name}` : 'Work order report'}
        search={search}
        onSearchChange={setSearch}
        customReports={customReports}
        selectedCustomId={selectedCustomId}
        onSelectCustom={onSelectCustom}
        customName={customName}
        onCustomNameChange={setCustomName}
        canManageCustom={isOrgAdmin}
        onSaveCustom={() => saveCustom()}
        onSaveAsCustom={() => saveCustom({ asNew: true })}
        onDeleteCustom={removeCustom}
        savingCustom={savingCustom}
        customDirty={Boolean(selectedCustomId && customDirty)}
        hasColumns={selectedColumnIds.length > 0}
        onDownloadPdf={() => downloadFile('pdf')}
        onDownloadCsv={() => downloadFile('csv')}
        downloading={downloading}
        downloadDisabled={false}
        canDownload={Boolean(appliedFilters.from_date && appliedFilters.to_date)}
        canSchedule={isOrgAdmin}
        onSchedule={() => setScheduleOpen(true)}
        canSendNow={isOrgAdmin}
        onSendNow={() => {
          setSendNowOpen(true)
        }}
        filters={(
          <ReportsFilters
            filters={draftFilters}
            onChange={setDraftFilters}
            options={filterOptions || {}}
            canSelectLocation={canSelectLocation}
            activeCount={countActiveReportFilters(
              appliedFilters,
              canSelectLocation ? '' : (filterOptions?.location_id || appliedFilters.facility_id),
            )}
            onSearch={handleSearch}
            onClear={handleClear}
          />
        )}
      >
        {error && <div className="wo-alert wo-alert--error" role="alert">{error}</div>}

        {loading ? (
          <div className="company-loading">Loading report…</div>
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
                const meta = KPI_META[kpi.key] || KPI_META.total
                return (
                  <div key={kpi.key} className="reports-kpi">
                    <div>
                      <span className="reports-kpi__label">{kpi.label}</span>
                      <span className="reports-kpi__value">
                        {typeof kpi.value === 'number' ? kpi.value.toLocaleString() : kpi.value}
                      </span>
                      {deltaText ? (
                        <div className={`reports-kpi__sub ${deltaClass}`.trim()}>{deltaText}</div>
                      ) : null}
                    </div>
                    <div className={`reports-kpi__icon ${meta.iconClass}`}>{meta.icon}</div>
                  </div>
                )
              })}
            </div>

            <div className="company-panel reports-results">
            <StatusCountBar
              counts={report?.status_counts || []}
              statuses={statuses}
              labelByKey={statusLabels}
              colorByKey={statusColors}
              ariaLabel="Work order status counts"
            />

            {rows.length === 0 ? (
              <div className="company-empty">
                <p>No rows for this period.</p>
                <p className="wo-page__empty-hint">Try adjusting the filters and click Search.</p>
              </div>
            ) : (
            <div className="reports-table-wrap company-table-wrap">
              <div className="company-table-scroll">
              <table className="company-table master-table reports-table">
                <thead>
                  <tr>
                    {visibleCols.map((col) => (
                      <th key={col.id}>{col.label}</th>
                    ))}
                    <th className="reports-table__gear">
                      <TableColumnPicker
                        columnDefs={columnDefs}
                        visibleColumnIds={selectedColumnIds}
                        onToggle={(id) => {
                          if (selectedColumnIds.includes(id)) {
                            if (selectedColumnIds.length <= 1) return
                            setSelectedColumnIds(selectedColumnIds.filter((item) => item !== id))
                            return
                          }
                          setSelectedColumnIds([...selectedColumnIds, id])
                        }}
                        onReorder={(orderedIds) => {
                          const next = orderedIds.filter((id) => selectedColumnIds.includes(id))
                          if (next.length) setSelectedColumnIds(next)
                        }}
                        onReset={() => setSelectedColumnIds(defaultColumnIds)}
                      />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      {visibleCols.map((col) => (
                        <td
                          key={col.id}
                          className={WRAP_COLUMNS.has(col.id) ? 'reports-table__cell--wrap' : undefined}
                        >
                          <ReportCell
                            columnId={col.id}
                            value={row[col.id]}
                            row={row}
                            statusLabels={statusLabels}
                          />
                        </td>
                      ))}
                      <td className="reports-table__gear" />
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
            )}
            </div>
          </>
        )}
      </ReportsLayout>

      {sendNowOpen && (
        <ReportSendNowModal
          title={title}
          sending={sendingNow}
          onClose={() => setSendNowOpen(false)}
          onSend={async (emails) => {
            setSendingNow(true)
            try {
              await sendReportNow(REPORT_KEY, {
                ...downloadPayload(),
                emails,
              })
              setSendNowOpen(false)
            } finally {
              setSendingNow(false)
            }
          }}
        />
      )}

      {scheduleOpen && (
        <ReportScheduleModal
          reportKey={REPORT_KEY}
          title={title}
          customReports={customReports}
          defaultCustomId={selectedCustomId}
          onClose={() => setScheduleOpen(false)}
        />
      )}
    </>
  )
}
