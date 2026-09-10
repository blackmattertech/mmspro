import { sendEmail } from '../services/email.js'
import { getReportData } from './reportService.js'
import { buildReportPdfBuffer, reportPdfFilename } from './reportPdf.js'
import { resolveDateWindow, getReportCatalog } from './reportConstants.js'
import { listDueReportSchedules, markScheduleResult } from './reportScheduleService.js'

function periodLabel(from, to) {
  if (from && to && from === to) return from
  if (from && to) return `${from} to ${to}`
  return 'Selected period'
}

function kpiHtml(kpis) {
  const cells = (kpis || []).map((kpi) => `
    <td style="padding:10px 12px;background:#f8fafc;border:1px solid #e8edf3;border-radius:8px;">
      <div style="font-size:11px;color:#6B7280;text-transform:uppercase;letter-spacing:.04em;">${escapeHtml(kpi.label)}</div>
      <div style="font-size:20px;font-weight:700;color:#111111;margin-top:4px;">${escapeHtml(kpi.value)}</div>
    </td>
  `).join('')
  return `<table role="presentation" cellpadding="0" cellspacing="8" style="margin:0 0 16px;"><tr>${cells}</tr></table>`
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatGeneratedAt(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return String(iso || '')
  return date.toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
}

export async function runReportSchedulerJob(now = new Date()) {
  const due = await listDueReportSchedules(now)
  let sent = 0
  let failed = 0

  for (const schedule of due) {
    try {
      const catalog = getReportCatalog(schedule.report_key)
      if (!catalog) throw new Error(`Unknown report ${schedule.report_key}`)
      const window = resolveDateWindow(schedule.date_window, now)
      const session = { is_org_admin: true, location_id: null }
      const report = await getReportData(schedule.org_id, session, schedule.report_key, {
        date_from: window.date_from,
        date_to: window.date_to,
        location_id: schedule.location_id || undefined,
      }, now)

      const pdf = await buildReportPdfBuffer({
        orgName: report.org_name,
        title: report.title,
        periodLabel: periodLabel(report.filters.date_from, report.filters.date_to),
        generatedAt: formatGeneratedAt(report.generated_at),
        locationLabel: report.filters.location_name,
        kpis: report.kpis,
        columns: schedule.columns,
        rows: report.rows,
        kind: report.kind,
      })
      const filename = reportPdfFilename(report.title, report.filters.date_from, report.filters.date_to)
      const recipients = Array.isArray(schedule.emails) ? schedule.emails : []
      if (!recipients.length) throw new Error('Schedule has no recipients')

      const subject = `${report.org_name}: ${report.title} (${periodLabel(window.date_from, window.date_to)})`
      const htmlContent = `
        <div style="font-family:Inter,Arial,Helvetica,sans-serif;color:#111;">
          <h2 style="margin:0 0 8px;">${escapeHtml(report.title)}</h2>
          <p style="margin:0 0 16px;color:#6B7280;font-size:14px;">
            ${escapeHtml(report.org_name)} · ${escapeHtml(periodLabel(window.date_from, window.date_to))}
            ${report.filters.location_name ? ` · ${escapeHtml(report.filters.location_name)}` : ''}
          </p>
          ${kpiHtml(report.kpis)}
          <p style="margin:0;font-size:14px;color:#374151;">The full report is attached as a PDF (${report.total} row${report.total === 1 ? '' : 's'}).</p>
        </div>
      `
      const textContent = [
        report.title,
        `${report.org_name} · ${periodLabel(window.date_from, window.date_to)}`,
        ...(report.kpis || []).map((kpi) => `${kpi.label}: ${kpi.value}`),
        `${report.total} rows attached as PDF.`,
      ].join('\n')

      const attachments = [{
        Filename: filename,
        ContentType: 'application/pdf',
        Base64Content: pdf.toString('base64'),
      }]

      let delivered = 0
      for (const to of recipients) {
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

      await markScheduleResult(schedule.id, { now })
      sent += 1
    } catch (err) {
      failed += 1
      try {
        await markScheduleResult(schedule.id, { errorMessage: err.message, now })
      } catch (markErr) {
        console.error('[reportScheduler] failed to record error:', markErr)
      }
      console.error(`[reportScheduler] schedule ${schedule.id} failed:`, err.message)
    }
  }

  return { due: due.length, sent, failed }
}
