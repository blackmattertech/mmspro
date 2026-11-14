import { sendEmail } from '../services/email.js'
import { getReportData, getReportFilterOptions, loadOrgLetterhead } from './reportService.js'
import { buildActivityFilterValues, buildReportPdfBuffer, reportPdfFilename } from './reportPdf.js'
import { buildReportCsv, reportCsvFilename } from './reportCsv.js'
import { columnsForReport, filterReportColumns, getReportCatalog, resolveDateWindow, UNIFIED_REPORT_KEY } from './reportConstants.js'
import { getCustomReport } from './reportCustomService.js'
import { buildReportEmailContent } from './reportEmail.js'
import { formatDisplayDate, formatDisplayDateTime } from './displayDate.js'

function periodLabel(from, to) {
  const start = formatDisplayDate(from) || from
  const end = formatDisplayDate(to) || to
  if (start && end && start === end) return start
  if (start && end) return `${start} to ${end}`
  return 'Selected period'
}

function formatGeneratedAt(iso) {
  const label = formatDisplayDateTime(iso, { utc: true })
  if (!label) return String(iso || '')
  return `${label} UTC`
}

export async function buildReportExport({
  orgId,
  session,
  reportKey,
  customReportId,
  dateFrom,
  dateTo,
  search,
  locationId,
  filters = {},
  columns: requestedColumns = [],
  now = new Date(),
}) {
  const catalog = getReportCatalog(reportKey)
  if (!catalog) throw new Error(`Unknown report ${reportKey}`)

  let columns = []
  let resolvedLocation = locationId
  let title = catalog.key === UNIFIED_REPORT_KEY ? 'ACTIVITY REPORT' : catalog.title
  if (customReportId) {
    const custom = await getCustomReport(orgId, customReportId)
    if (custom.report_key !== catalog.key) throw new Error('Custom report does not match this report type')
    columns = filterReportColumns(catalog.kind, custom.columns)
    resolvedLocation = custom.location_id || resolvedLocation || undefined
    if (catalog.key !== UNIFIED_REPORT_KEY) title = custom.name || title
  }
  const fromRequest = filterReportColumns(catalog.kind, requestedColumns)
  if (fromRequest.length) columns = fromRequest
  if (!columns.length) {
    columns = columnsForReport(catalog.kind).map((col) => col.id)
  }

  const [report, letterhead, filterOptions] = await Promise.all([
    getReportData(orgId, session, reportKey, {
      date_from: dateFrom,
      date_to: dateTo,
      search,
      location_id: resolvedLocation,
      ...filters,
      facility_id: filters.facility_id || resolvedLocation,
      for_export: true,
      max_rows: 10000,
    }, now),
    loadOrgLetterhead(orgId),
    catalog.kind === 'unified' ? getReportFilterOptions(orgId, session) : Promise.resolve({}),
  ])

  const period = periodLabel(report.filters.date_from, report.filters.date_to)
  const activityFilters = buildActivityFilterValues({
    date_from: report.filters.date_from,
    date_to: report.filters.date_to,
    ...filters,
    facility_id: filters.facility_id || resolvedLocation,
    location_id: resolvedLocation,
  }, filterOptions)
  const pdf = await buildReportPdfBuffer({
    orgName: letterhead.name || report.org_name,
    address: letterhead.address,
    department: activityFilters.orderTo !== 'All' ? activityFilters.orderTo : 'MAINTENANCE',
    logo: letterhead.logo,
    activityFilters,
    title,
    periodLabel: period,
    generatedAt: formatGeneratedAt(report.generated_at),
    locationLabel: report.filters.location_name,
    kpis: report.kpis,
    columns,
    rows: report.rows,
    kind: report.kind,
  })
  const csv = buildReportCsv({
    kind: report.kind,
    columns,
    rows: report.rows,
  })

  return {
    report,
    title,
    period,
    columns,
    pdf,
    csv,
    pdfFilename: reportPdfFilename(title, report.filters.date_from, report.filters.date_to),
    csvFilename: reportCsvFilename(title, report.filters.date_from, report.filters.date_to),
  }
}

export function buildEmailFromExport(exportBundle, { customBodyText = null } = {}) {
  const { report, title, period, pdfFilename, csvFilename } = exportBundle
  const subject = `${report.org_name}: ${title} (${period})`
  const { htmlContent, textContent } = buildReportEmailContent({
    report,
    title,
    period,
    columns: exportBundle.columns,
    pdfFilename,
    csvFilename,
    customBodyText,
  })
  return { subject, htmlContent, textContent }
}

export async function emailReportExport(exportBundle, recipients, { customBodyText = null } = {}) {
  const list = Array.isArray(recipients) ? recipients.filter(Boolean) : []
  if (!list.length) throw new Error('Add at least one recipient email')
  const { report, pdf, csv, pdfFilename, csvFilename } = exportBundle
  const { subject, htmlContent, textContent } = buildEmailFromExport(exportBundle, { customBodyText })
  const attachments = [
    {
      Filename: pdfFilename,
      ContentType: 'application/pdf',
      Base64Content: pdf.toString('base64'),
    },
    {
      Filename: csvFilename,
      ContentType: 'text/csv',
      Base64Content: Buffer.from(csv, 'utf8').toString('base64'),
    },
  ]

  let delivered = 0
  for (const to of list) {
    const result = await sendEmail({
      to,
      subject,
      htmlContent,
      textContent,
      attachments,
    })
    if (result) delivered += 1
  }
  if (!delivered) throw new Error('Email was not sent (Mailjet not configured or send failed)')
  return { delivered, total: report.total }
}

/**
 * Build a branded email preview without sending.
 * Uses a lightweight report fetch for real KPIs/period when dates are provided;
 * otherwise uses catalog placeholders so the schedule modal stays fast.
 */
export async function previewReportEmail({
  orgId,
  session,
  reportKey,
  customReportId,
  dateFrom,
  dateTo,
  dateWindow,
  locationId,
  search,
  filters = {},
  columns = [],
  customBodyText = null,
  now = new Date(),
}) {
  const catalog = getReportCatalog(reportKey)
  if (!catalog) {
    const err = new Error('Unknown report')
    err.status = 404
    throw err
  }

  let from = dateFrom
  let to = dateTo
  if ((!from || !to) && dateWindow) {
    const window = resolveDateWindow(dateWindow, now)
    from = window.date_from
    to = window.date_to
  }

  let bundle
  try {
    if (from && to) {
      bundle = await buildReportExport({
        orgId,
        session,
        reportKey,
        customReportId,
        dateFrom: from,
        dateTo: to,
        search,
        locationId,
        filters,
        columns,
        now,
      })
    }
  } catch {
    bundle = null
  }

  if (!bundle) {
    let title = catalog.title
    let resolvedColumns = filterReportColumns(catalog.kind, columns)
    let resolvedLocation = locationId || null
    if (customReportId) {
      try {
        const custom = await getCustomReport(orgId, customReportId)
        if (custom.report_key === catalog.key) {
          title = custom.name || title
          resolvedColumns = filterReportColumns(catalog.kind, custom.columns)
          resolvedLocation = custom.location_id || resolvedLocation
        }
      } catch {
        /* keep catalog defaults */
      }
    }
    if (!resolvedColumns.length) {
      resolvedColumns = columnsForReport(catalog.kind).map((col) => col.id)
    }
    const period = from && to ? periodLabel(from, to) : 'Selected period'
    const pdfFilename = reportPdfFilename(title, from || 'preview', to || 'preview')
    const csvFilename = reportCsvFilename(title, from || 'preview', to || 'preview')
    const report = {
      key: catalog.key,
      kind: catalog.kind,
      title,
      org_name: 'Your organization',
      total: 0,
      generated_at: now.toISOString(),
      kpis: [],
      filters: {
        date_from: from || null,
        date_to: to || null,
        location_name: resolvedLocation ? 'Selected plant' : 'All plants',
        search: search || '',
      },
    }
    return buildEmailFromExport({
      report,
      title,
      period,
      columns: resolvedColumns,
      pdfFilename,
      csvFilename,
    }, { customBodyText })
  }

  return buildEmailFromExport(bundle, { customBodyText })
}

export async function deliverScheduleReport(schedule, now = new Date()) {
  const catalog = getReportCatalog(schedule.report_key)
  if (!catalog) throw new Error(`Unknown report ${schedule.report_key}`)
  const window = resolveDateWindow(schedule.date_window, now)
  const session = { is_org_admin: true, location_id: null }
  const bundle = await buildReportExport({
    orgId: schedule.org_id,
    session,
    reportKey: schedule.report_key,
    customReportId: schedule.custom_report_id,
    dateFrom: window.date_from,
    dateTo: window.date_to,
    locationId: schedule.location_id,
    now,
  })
  const recipients = Array.isArray(schedule.emails) ? schedule.emails : []
  return emailReportExport(bundle, recipients, {
    customBodyText: schedule.email_body_text || null,
  })
}
