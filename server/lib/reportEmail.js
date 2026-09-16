import { columnsForReport, getReportCatalog } from './reportConstants.js'

const ACCENT = '#E63946'
const NAVY = '#111111'
const MUTED = '#6B7280'
const BODY = '#374151'
const BORDER = '#e8edf3'
const SURFACE = '#f8fafc'

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function chunk(list, size) {
  const out = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

function columnLabels(kind, columnIds = []) {
  const byId = new Map(columnsForReport(kind).map((col) => [col.id, col.label]))
  return (Array.isArray(columnIds) ? columnIds : [])
    .map((id) => byId.get(id))
    .filter(Boolean)
}

function formatKpiValue(value) {
  if (value == null || value === '') return '—'
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Number.isInteger(value) ? String(value) : String(value)
  }
  return String(value)
}

function kpiDeltaLabel(kpi) {
  if (kpi?.delta == null || !Number.isFinite(Number(kpi.delta))) return ''
  const delta = Number(kpi.delta)
  if (delta === 0) return 'Unchanged vs prior period'
  const sign = delta > 0 ? '+' : ''
  return `${sign}${delta} vs prior period`
}

function metaCell(label, value) {
  return `
    <td valign="top" style="width:33%;padding:0 10px 0 0;">
      <div style="font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:${MUTED};">${escapeHtml(label)}</div>
      <div style="margin-top:4px;font-size:14px;font-weight:650;line-height:20px;color:${NAVY};">${escapeHtml(value)}</div>
    </td>
  `
}

function kpiCard(kpi) {
  const delta = kpiDeltaLabel(kpi)
  return `
    <td valign="top" style="width:50%;padding:0 8px 8px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SURFACE};border:1px solid ${BORDER};border-radius:10px;">
        <tr>
          <td style="padding:12px 14px;">
            <div style="font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:${MUTED};">${escapeHtml(kpi.label)}</div>
            <div style="margin-top:4px;font-size:22px;font-weight:700;line-height:26px;color:${NAVY};">${escapeHtml(formatKpiValue(kpi.value))}</div>
            ${delta ? `<div style="margin-top:4px;font-size:12px;color:${MUTED};">${escapeHtml(delta)}</div>` : ''}
          </td>
        </tr>
      </table>
    </td>
  `
}

function kpiGrid(kpis = []) {
  if (!kpis.length) return ''
  const rows = chunk(kpis, 2).map((pair) => {
    const cells = pair.map(kpiCard).join('')
    const pad = pair.length === 1 ? '<td style="width:50%;padding:0;"></td>' : ''
    return `<tr>${cells}${pad}</tr>`
  }).join('')
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">
      ${rows}
    </table>
  `
}

function columnChips(labels) {
  if (!labels.length) return ''
  const chips = labels.map((label) => (
    `<span style="display:inline-block;margin:0 6px 6px 0;padding:5px 10px;background:${SURFACE};border:1px solid ${BORDER};border-radius:999px;font-size:12px;font-weight:600;color:${NAVY};">${escapeHtml(label)}</span>`
  )).join('')
  return `<div style="margin:0;">${chips}</div>`
}

function sectionTitle(text) {
  return `<div style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${ACCENT};">${escapeHtml(text)}</div>`
}

export function buildReportEmailContent({
  report,
  title,
  period,
  columns = [],
  pdfFilename,
  csvFilename,
}) {
  const catalog = getReportCatalog(report.key) || {}
  const reportType = catalog.title || report.title || 'Report'
  const about = catalog.about || 'This email includes a maintenance report from MMS PRO.'
  const rowMeaning = catalog.rowMeaning || 'Each row is one record in the attached files.'
  const customName = title && title !== reportType ? title : null
  const location = report.filters?.location_name || 'All plants'
  const rowCount = Number(report.total) || 0
  const rowLabel = `${rowCount} ${rowCount === 1 ? 'row' : 'rows'}`
  const fields = columnLabels(report.kind, columns)
  const generated = report.generated_at
    ? `${String(report.generated_at).replace('T', ' ').slice(0, 16)} UTC`
    : ''
  const search = String(report.filters?.search || '').trim()

  const aboutText = customName
    ? `${about} This email uses the saved view “${customName}”, so only the selected columns below are included.`
    : about

  const htmlContent = `
    <div style="margin:0;padding:0;background:#f5f6f8;font-family:Inter,Arial,Helvetica,sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8;padding:24px 12px;">
        <tr>
          <td align="center">
            <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid ${BORDER};">
              <tr>
                <td style="padding:20px 28px;background:#ffffff;border-bottom:3px solid ${ACCENT};">
                  <div style="font-size:16px;font-weight:700;color:${NAVY};">MMS PRO</div>
                  <div style="font-size:12px;color:${MUTED};">Maintenance report</div>
                </td>
              </tr>
              <tr>
                <td style="padding:28px;">
                  <div style="display:inline-block;margin:0 0 10px;padding:4px 10px;background:#fff1f2;color:${ACCENT};font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;border-radius:999px;">${escapeHtml(reportType)}</div>
                  <h1 style="margin:0 0 8px;font-size:22px;line-height:28px;color:${NAVY};">${escapeHtml(customName || reportType)}</h1>
                  <p style="margin:0 0 20px;font-size:14px;line-height:20px;color:${MUTED};">
                    ${escapeHtml(report.org_name || 'Organization')}
                    ${generated ? ` · Generated ${escapeHtml(generated)}` : ''}
                  </p>

                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;background:${SURFACE};border:1px solid ${BORDER};border-radius:10px;">
                    <tr>
                      <td style="padding:16px 18px;">
                        ${sectionTitle('About this report')}
                        <p style="margin:0;font-size:14px;line-height:22px;color:${BODY};">${escapeHtml(aboutText)}</p>
                      </td>
                    </tr>
                  </table>

                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">
                    <tr>
                      ${metaCell('Period', period)}
                      ${metaCell('Location', location)}
                      ${metaCell('Records', rowLabel)}
                    </tr>
                  </table>

                  ${sectionTitle('Highlights')}
                  ${kpiGrid(report.kpis)}
                  <p style="margin:0 0 22px;font-size:13px;line-height:20px;color:${MUTED};">${escapeHtml(rowMeaning)}</p>

                  ${sectionTitle('Columns in this report')}
                  <p style="margin:0 0 10px;font-size:13px;line-height:20px;color:${MUTED};">These fields appear in the attached PDF and CSV, in this order.</p>
                  ${columnChips(fields)}

                  ${search ? `
                    <p style="margin:16px 0 0;font-size:13px;line-height:20px;color:${MUTED};">
                      Filtered by search: <strong style="color:${NAVY};">${escapeHtml(search)}</strong>
                    </p>
                  ` : ''}

                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 0;border:1px solid ${BORDER};border-radius:10px;">
                    <tr>
                      <td style="padding:14px 16px;">
                        ${sectionTitle('Attachments')}
                        <p style="margin:0 0 6px;font-size:14px;line-height:21px;color:${BODY};">
                          <strong>PDF</strong> — ${escapeHtml(pdfFilename || 'report.pdf')} (easy to read and share)
                        </p>
                        <p style="margin:0;font-size:14px;line-height:21px;color:${BODY};">
                          <strong>CSV</strong> — ${escapeHtml(csvFilename || 'report.csv')} (open in Excel or Sheets)
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 28px 22px;font-size:12px;line-height:18px;color:#9CA3AF;">
                  You received this because a report was sent to you from MMS PRO. Open the attachments for the full data.
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `

  const textContent = [
    customName || reportType,
    report.org_name,
    customName ? `Report type: ${reportType}` : null,
    aboutText,
    `Period: ${period}`,
    `Location: ${location}`,
    `Records: ${rowLabel}`,
    rowMeaning,
    report.kpis?.length
      ? ['Highlights', ...report.kpis.map((kpi) => {
        const delta = kpiDeltaLabel(kpi)
        return `  ${kpi.label}: ${formatKpiValue(kpi.value)}${delta ? ` (${delta})` : ''}`
      })].join('\n')
      : null,
    fields.length ? `Columns: ${fields.join(', ')}` : null,
    search ? `Search: ${search}` : null,
    generated ? `Generated: ${generated}` : null,
    `Attachments: ${pdfFilename || 'PDF'}, ${csvFilename || 'CSV'}`,
  ].filter(Boolean).join('\n\n')

  return { htmlContent, textContent }
}
