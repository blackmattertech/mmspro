import { Router } from 'express'
import { verifyAuth } from '../../middleware/auth.js'
import { requireOrgAccess } from '../../middleware/orgAccess.js'
import {
  loadOrgPermissions,
  requireModulePermission,
} from '../../middleware/modulePermission.js'
import { columnsForReport, getReportCatalog } from '../../lib/reportConstants.js'
import { getReportData } from '../../lib/reportService.js'
import { buildReportPdfBuffer, reportPdfFilename } from '../../lib/reportPdf.js'
import {
  createReportSchedule,
  deleteReportSchedule,
  listReportSchedules,
  updateReportSchedule,
} from '../../lib/reportScheduleService.js'

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
  return requireModulePermission(catalog.moduleKey, 'read')(req, res, next)
}

function requireOrgAdmin(req, res, next) {
  if (!req.orgPermissions?.is_org_admin) {
    return res.status(403).json({ error: 'Only organization admins can manage report schedules' })
  }
  next()
}

function reportQueryFrom(source = {}) {
  return {
    date_from: source.date_from,
    date_to: source.date_to,
    location_id: source.location_id,
    search: source.search,
  }
}

function selectedColumns(kind, requested) {
  const allowed = new Set(columnsForReport(kind).map((col) => col.id))
  const list = Array.isArray(requested)
    ? requested.map((id) => String(id || '').trim()).filter((id) => allowed.has(id))
    : []
  return list.length ? list : columnsForReport(kind).map((col) => col.id)
}

function periodLabel(from, to) {
  if (from && to && from === to) return from
  if (from && to) return `${from} to ${to}`
  return 'Selected period'
}

function formatGeneratedAt(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return String(iso || '')
  return `${date.toISOString().replace('T', ' ').slice(0, 16)} UTC`
}

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

router.post('/:key/pdf', requireReportRead, async (req, res) => {
  try {
    const body = req.body || {}
    const report = await getReportData(
      req.userProfile.org_id,
      req.orgPermissions,
      req.params.key,
      reportQueryFrom(body),
    )
    const columns = selectedColumns(report.kind, body.columns)
    const pdf = await buildReportPdfBuffer({
      orgName: report.org_name,
      title: report.title,
      periodLabel: periodLabel(report.filters.date_from, report.filters.date_to),
      generatedAt: formatGeneratedAt(report.generated_at),
      locationLabel: report.filters.location_name,
      kpis: report.kpis,
      columns,
      rows: report.rows,
      kind: report.kind,
    })
    const filename = reportPdfFilename(report.title, report.filters.date_from, report.filters.date_to)
    res.json({
      filename,
      contentType: 'application/pdf',
      data: pdf.toString('base64'),
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
