import { Router } from 'express'
import { verifyAuth } from '../../middleware/auth.js'
import { requireOrgAccess } from '../../middleware/orgAccess.js'
import {
  loadOrgPermissions,
  requireModulePermission,
  requireAnyModulePermission,
} from '../../middleware/modulePermission.js'
import { getReportCatalog, isInteractiveReportKey } from '../../lib/reportConstants.js'
import { getReportData, getReportFilterOptions } from '../../lib/reportService.js'
import { REPORT_MODULE_KEYS } from '../../lib/accessModules.js'
import {
  buildReportExport,
  deliverScheduleReport,
  emailReportExport,
  previewReportEmail,
} from '../../lib/reportDelivery.js'
import {
  createCustomReport,
  deleteCustomReport,
  getCustomReport,
  listAllCustomReports,
  listCustomReports,
  updateCustomReport,
} from '../../lib/reportCustomService.js'
import {
  createReportSchedule,
  deleteReportSchedule,
  getReportSchedule,
  listAllReportSchedules,
  listReportSchedules,
  markScheduleSentNow,
  parseEmails,
  updateReportSchedule,
} from '../../lib/reportScheduleService.js'
import {
  createReadyReport,
  deleteReadyReport,
  downloadReadyReport,
  listReadyReports,
} from '../../lib/reportReadyService.js'
import { normalizeEmailBodyText } from '../../lib/reportEmail.js'
import { sendBase64Export, sendBlobExport, wantsBlobExport } from '../../lib/exportResponse.js'

const router = Router()

router.use(verifyAuth, requireOrgAccess, loadOrgPermissions)

function sendError(res, err) {
  const status = err.status || 500
  res.status(status).json({ error: err.message })
}

function requireReportRead(req, res, next) {
  const catalog = getReportCatalog(req.params.key)
  if (!catalog) {
    return res.status(404).json({ error: 'Unknown report' })
  }
  req.reportCatalog = catalog
  if (isInteractiveReportKey(catalog.key)) {
    return requireAnyModulePermission(REPORT_MODULE_KEYS.map((key) => [key, 'read']))(req, res, next)
  }
  return requireModulePermission(catalog.moduleKey, 'read')(req, res, next)
}

function requireOrgAdmin(req, res, next) {
  if (!req.orgPermissions?.is_org_admin) {
    return res.status(403).json({ error: 'Only organization admins can manage custom reports and schedules' })
  }
  next()
}

async function requireCustomReportAdmin(req, res, next) {
  if (!req.orgPermissions?.is_org_admin) {
    return res.status(403).json({ error: 'Only organization admins can manage custom reports' })
  }
  try {
    const row = await getCustomReport(req.userProfile.org_id, req.params.id)
    const catalog = getReportCatalog(row.report_key)
    if (!catalog) {
      return res.status(404).json({ error: 'Unknown report' })
    }
    req.customReport = row
    req.reportCatalog = catalog
    return requireModulePermission(catalog.moduleKey, 'read')(req, res, next)
  } catch (err) {
    return sendError(res, err)
  }
}

function reportQueryFrom(source = {}) {
  return {
    date_from: source.date_from,
    date_to: source.date_to,
    location_id: source.location_id || source.facility_id,
    facility_id: source.facility_id || source.location_id,
    search: source.search,
    order_type: source.order_type,
    order_from: source.order_from,
    order_to: source.order_to,
    area_id: source.area_id,
    equipment_id: source.equipment_id,
    equipment_type: source.equipment_type,
    equipment_capacity: source.equipment_capacity,
    equipment_tag: source.equipment_tag,
    priority: source.priority,
    status: source.status || source.job_status,
    job_nature: source.job_nature,
    created_by: source.created_by,
    reported_by: source.reported_by,
    assigned_to: source.assigned_to,
  }
}

async function exportFromRequest(req, body = {}, formats = ['pdf', 'csv']) {
  return buildReportExport({
    orgId: req.userProfile.org_id,
    session: req.orgPermissions,
    reportKey: req.reportCatalog.key,
    customReportId: body.custom_report_id || undefined,
    dateFrom: body.date_from,
    dateTo: body.date_to,
    search: body.search,
    locationId: body.location_id || body.facility_id,
    filters: reportQueryFrom(body),
    columns: body.columns,
    formats,
  })
}

router.get('/custom/:id', requireAnyModulePermission(
  REPORT_MODULE_KEYS.map((key) => [key, 'read']),
), async (req, res) => {
  try {
    const row = await getCustomReport(req.userProfile.org_id, req.params.id)
    res.json(row)
  } catch (err) {
    sendError(res, err)
  }
})

router.patch('/custom/:id', requireCustomReportAdmin, async (req, res) => {
  try {
    const row = await updateCustomReport(req.userProfile.org_id, req.params.id, req.body || {})
    res.json(row)
  } catch (err) {
    sendError(res, err)
  }
})

router.delete('/custom/:id', requireCustomReportAdmin, async (req, res) => {
  try {
    const result = await deleteCustomReport(req.userProfile.org_id, req.params.id)
    res.json(result)
  } catch (err) {
    sendError(res, err)
  }
})

router.patch('/schedules/:id', requireOrgAdmin, async (req, res) => {
  try {
    const row = await updateReportSchedule(req.userProfile.org_id, req.params.id, req.body || {})
    res.json(row)
  } catch (err) {
    sendError(res, err)
  }
})

router.delete('/schedules/:id', requireOrgAdmin, async (req, res) => {
  try {
    const result = await deleteReportSchedule(req.userProfile.org_id, req.params.id)
    res.json(result)
  } catch (err) {
    sendError(res, err)
  }
})

router.post('/schedules/:id/send', requireOrgAdmin, async (req, res) => {
  try {
    const schedule = await getReportSchedule(req.userProfile.org_id, req.params.id)
    await deliverScheduleReport(schedule)
    await markScheduleSentNow(schedule.id)
    res.json({ ok: true })
  } catch (err) {
    sendError(res, err)
  }
})

router.get('/filters', requireAnyModulePermission(
  REPORT_MODULE_KEYS.map((key) => [key, 'read']),
), async (req, res) => {
  try {
    const data = await getReportFilterOptions(
      req.userProfile.org_id,
      req.orgPermissions,
      { reportKey: req.query.report_key || req.query.key },
    )
    res.json(data)
  } catch (err) {
    sendError(res, err)
  }
})

router.get('/customs', requireAnyModulePermission(
  REPORT_MODULE_KEYS.map((key) => [key, 'read']),
), async (req, res) => {
  try {
    const items = await listAllCustomReports(req.userProfile.org_id)
    res.json({ items })
  } catch (err) {
    sendError(res, err)
  }
})

router.get('/schedules', requireAnyModulePermission(
  REPORT_MODULE_KEYS.map((key) => [key, 'read']),
), async (req, res) => {
  try {
    const items = await listAllReportSchedules(req.userProfile.org_id)
    res.json({ items })
  } catch (err) {
    sendError(res, err)
  }
})

router.get('/ready', requireAnyModulePermission(
  REPORT_MODULE_KEYS.map((key) => [key, 'read']),
), async (req, res) => {
  try {
    const items = await listReadyReports(req.userProfile.org_id, {
      profileId: req.userProfile.id,
      isOrgAdmin: Boolean(req.orgPermissions?.is_org_admin),
      reportKey: req.query.report_key || null,
    })
    res.json({ items })
  } catch (err) {
    sendError(res, err)
  }
})

router.get('/ready/:id/download', requireAnyModulePermission(
  REPORT_MODULE_KEYS.map((key) => [key, 'read']),
), async (req, res) => {
  try {
    const file = await downloadReadyReport(
      req.userProfile.org_id,
      req.params.id,
      req.query.format || 'pdf',
    )
    res.json(file)
  } catch (err) {
    sendError(res, err)
  }
})

router.delete('/ready/:id', requireAnyModulePermission(
  REPORT_MODULE_KEYS.map((key) => [key, 'read']),
), async (req, res) => {
  try {
    const result = await deleteReadyReport(req.userProfile.org_id, req.params.id, {
      profileId: req.userProfile.id,
      isOrgAdmin: Boolean(req.orgPermissions?.is_org_admin),
    })
    res.json(result)
  } catch (err) {
    sendError(res, err)
  }
})

router.get('/:key', requireReportRead, async (req, res) => {
  try {
    const data = await getReportData(
      req.userProfile.org_id,
      req.orgPermissions,
      req.params.key,
      reportQueryFrom(req.query),
    )
    res.json(data)
  } catch (err) {
    sendError(res, err)
  }
})

router.get('/:key/custom', requireReportRead, async (req, res) => {
  try {
    const items = await listCustomReports(req.userProfile.org_id, req.params.key)
    res.json({ items })
  } catch (err) {
    sendError(res, err)
  }
})

router.post('/:key/custom', requireReportRead, requireOrgAdmin, async (req, res) => {
  try {
    const row = await createCustomReport(req.userProfile.org_id, req.params.key, req.body || {})
    res.status(201).json(row)
  } catch (err) {
    sendError(res, err)
  }
})

function attachmentFilename(name, fallback) {
  const safe = String(name || fallback || 'download')
    .replace(/["\r\n]/g, '')
    .trim() || fallback || 'download'
  return safe
}

router.post('/:key/pdf', requireReportRead, async (req, res) => {
  try {
    const bundle = await exportFromRequest(req, req.body || {}, ['pdf'])
    const filename = attachmentFilename(bundle.pdfFilename, 'report.pdf')
    const payload = {
      buffer: bundle.pdf,
      filename,
      contentType: 'application/pdf',
    }
    if (wantsBlobExport(req)) sendBlobExport(res, payload)
    else sendBase64Export(res, payload)
  } catch (err) {
    sendError(res, err)
  }
})

router.post('/:key/csv', requireReportRead, async (req, res) => {
  try {
    const bundle = await exportFromRequest(req, req.body || {}, ['csv'])
    const filename = attachmentFilename(bundle.csvFilename, 'report.csv')
    const payload = {
      buffer: Buffer.from(bundle.csv, 'utf8'),
      filename,
      contentType: 'text/csv; charset=utf-8',
    }
    if (wantsBlobExport(req)) sendBlobExport(res, payload)
    else sendBase64Export(res, payload)
  } catch (err) {
    sendError(res, err)
  }
})

router.post('/:key/ready', requireReportRead, async (req, res) => {
  try {
    const row = await createReadyReport({
      orgId: req.userProfile.org_id,
      profileId: req.userProfile.id,
      session: req.orgPermissions,
      reportKey: req.reportCatalog.key,
      body: req.body || {},
    })
    res.status(201).json(row)
  } catch (err) {
    sendError(res, err)
  }
})

router.post('/:key/send', requireReportRead, requireOrgAdmin, async (req, res) => {
  try {
    const body = req.body || {}
    const emails = parseEmails(body.emails)
    const bundle = await exportFromRequest(req, body)
    const result = await emailReportExport(bundle, emails, {
      customBodyText: normalizeEmailBodyText(body.email_body_text),
    })
    res.json({ ok: true, ...result })
  } catch (err) {
    sendError(res, err)
  }
})

router.post('/:key/email-preview', requireReportRead, async (req, res) => {
  try {
    const body = req.body || {}
    const preview = await previewReportEmail({
      orgId: req.userProfile.org_id,
      session: req.orgPermissions,
      reportKey: req.reportCatalog.key,
      customReportId: body.custom_report_id || undefined,
      dateFrom: body.date_from,
      dateTo: body.date_to,
      dateWindow: body.date_window,
      locationId: body.location_id || body.facility_id,
      search: body.search,
      filters: reportQueryFrom(body),
      columns: body.columns,
      customBodyText: normalizeEmailBodyText(body.email_body_text),
    })
    res.json({
      subject: preview.subject,
      html: preview.htmlContent,
      text: preview.textContent,
    })
  } catch (err) {
    sendError(res, err)
  }
})

router.get('/:key/schedules', requireReportRead, requireOrgAdmin, async (req, res) => {
  try {
    const items = await listReportSchedules(req.userProfile.org_id, req.params.key)
    res.json({ items })
  } catch (err) {
    sendError(res, err)
  }
})

router.post('/:key/schedules', requireReportRead, requireOrgAdmin, async (req, res) => {
  try {
    const row = await createReportSchedule(req.userProfile.org_id, req.params.key, req.body || {})
    res.status(201).json(row)
  } catch (err) {
    sendError(res, err)
  }
})

export default router
