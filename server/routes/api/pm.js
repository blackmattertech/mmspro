import { Router } from 'express'
import { supabaseAdmin } from '../../services/supabase.js'
import { verifyAuth } from '../../middleware/auth.js'
import { requireOrgAccess } from '../../middleware/orgAccess.js'
import {
  requireAnyModulePermission,
  loadOrgPermissions,
} from '../../middleware/modulePermission.js'
import { listEnvelope, parseListControls, sendCsv } from '../../lib/listQuery.js'
import { withCatalogColumns } from '../../lib/csvExportColumns.js'
import {
  listActivityTypes,
  createActivityType,
  updateActivityType,
  deleteActivityType,
  listPmPlans,
  getPmPlan,
  createPmPlan,
  updatePmPlan,
  deletePmPlan,
  duplicatePmPlan,
  generateScheduledWorkOrder,
} from '../../lib/pmService.js'
import {
  buildPmPlansTemplate,
  bulkImportPmPlans,
} from '../../lib/pmPlanBulkService.js'
import { attachFailedFileToResult } from '../../lib/importErrorWorkbook.js'
import { bufferFromBase64Upload, excelFilePayload } from '../../lib/excelTemplate.js'
import {
  listChecklistTemplates,
  getChecklistTemplate,
  createChecklistTemplate,
  updateChecklistTemplate,
  deleteChecklistTemplate,
  createChecklistField,
  updateChecklistField,
  deleteChecklistField,
  reorderChecklistFields,
  createChecklistSection,
  updateChecklistSection,
  deleteChecklistSection,
  reorderChecklistSections,
} from '../../lib/checklistService.js'

const router = Router()

function allowPm(action) {
  const moduleGuard = requireAnyModulePermission([
    ['work_orders_scheduled', action],
    ['work_orders', action],
  ])
  return (req, res, next) => {
    if (['admin', 'super_admin', 'owner'].includes(req.userProfile?.role)) return next()
    return moduleGuard(req, res, next)
  }
}

const canRead = allowPm('read')
const canCreate = allowPm('create')
const canUpdate = allowPm('update')
const canDelete = allowPm('delete')

router.use(verifyAuth, requireOrgAccess, loadOrgPermissions)

function parsePagination(query) {
  const rawLimit = Number(query.limit)
  const rawOffset = Number(query.offset)
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(500, rawLimit)) : 50
  const offset = Number.isFinite(rawOffset) ? Math.max(0, rawOffset) : 0
  return { limit, offset }
}

function sendError(res, err) {
  const status = err.status || 500
  res.status(status).json({ error: err.message })
}

const PM_PLAN_CSV_COLUMNS = [
  { label: 'Plan #', value: (row) => row.plan_number || '' },
  { label: 'Name', value: (row) => row.name || '' },
  { label: 'Department', value: (row) => row.department?.name || '' },
  { label: 'Activity', value: (row) => row.activity_type?.name || '' },
  { label: 'Work center', value: (row) => row.work_center || '' },
  { label: 'Priority', value: (row) => row.priority || '' },
  { label: 'Plant / Facility', value: (row) => row.location?.name || '' },
  { label: 'Area', value: (row) => row.area?.name || '' },
  { label: 'Equipment', value: (row) => {
    const name = row.equipment?.name
    const code = row.equipment?.code
    if (code && name) return `${code} — ${name}`
    return name || code || ''
  } },
  { label: 'Schedule type', value: (row) => row.schedule_type || '' },
  { label: 'Start date', value: (row) => (row.start_date ? String(row.start_date).slice(0, 10) : '') },
  { label: 'End date', value: (row) => (row.end_date ? String(row.end_date).slice(0, 10) : '') },
  { label: 'Next due', value: (row) => (row.next_due_at ? String(row.next_due_at).slice(0, 10) : '') },
  { label: 'Technicians', value: (row) => (row.technicians || []).map((person) => person.name).filter(Boolean).join(', ') },
  { label: 'Checklist', value: (row) => row.checklist_template?.name || '' },
  { label: 'Status', value: (row) => row.status || '' },
  { label: 'Created', value: (row) => (row.created_at ? String(row.created_at).slice(0, 10) : '') },
]

router.get('/activity-types', canRead, async (req, res) => {
  try {
    const rows = await listActivityTypes(req.userProfile.org_id, {
      includeInactive: req.query.include_inactive === '1',
    })
    res.json(rows)
  } catch (err) {
    sendError(res, err)
  }
})

router.post('/activity-types', canCreate, async (req, res) => {
  try {
    const row = await createActivityType(req.userProfile.org_id, req.body || {})
    res.status(201).json(row)
  } catch (err) {
    sendError(res, err)
  }
})

router.patch('/activity-types/:id', canUpdate, async (req, res) => {
  try {
    const row = await updateActivityType(req.userProfile.org_id, req.params.id, req.body || {})
    res.json(row)
  } catch (err) {
    sendError(res, err)
  }
})

router.delete('/activity-types/:id', canDelete, async (req, res) => {
  try {
    await deleteActivityType(req.userProfile.org_id, req.params.id)
    res.status(204).end()
  } catch (err) {
    sendError(res, err)
  }
})

router.get('/checklists', canRead, async (req, res) => {
  try {
    const rows = await listChecklistTemplates(req.userProfile.org_id, {
      includeInactive: req.query.include_inactive === '1',
      moduleKey: req.query.module_key || null,
      formId: req.query.form_id || null,
    })
    res.json(rows)
  } catch (err) {
    sendError(res, err)
  }
})

router.get('/checklists/:id', canRead, async (req, res) => {
  try {
    const row = await getChecklistTemplate(req.userProfile.org_id, req.params.id)
    res.json(row)
  } catch (err) {
    sendError(res, err)
  }
})

router.post('/checklists', canCreate, async (req, res) => {
  try {
    const row = await createChecklistTemplate(
      req.userProfile.org_id,
      req.userProfile.id,
      req.body || {},
    )
    res.status(201).json(row)
  } catch (err) {
    sendError(res, err)
  }
})

router.patch('/checklists/:id', canUpdate, async (req, res) => {
  try {
    const row = await updateChecklistTemplate(
      req.userProfile.org_id,
      req.userProfile.id,
      req.params.id,
      req.body || {},
    )
    res.json(row)
  } catch (err) {
    sendError(res, err)
  }
})

router.delete('/checklists/:id', canDelete, async (req, res) => {
  try {
    await deleteChecklistTemplate(req.userProfile.org_id, req.params.id)
    res.status(204).end()
  } catch (err) {
    sendError(res, err)
  }
})

router.post('/checklists/:id/fields', canUpdate, async (req, res) => {
  try {
    const row = await createChecklistField(
      req.userProfile.org_id,
      req.userProfile.id,
      req.params.id,
      req.body || {},
    )
    res.status(201).json(row)
  } catch (err) {
    sendError(res, err)
  }
})

router.patch('/checklists/:id/fields/:fieldId', canUpdate, async (req, res) => {
  try {
    const row = await updateChecklistField(
      req.userProfile.org_id,
      req.userProfile.id,
      req.params.id,
      req.params.fieldId,
      req.body || {},
    )
    res.json(row)
  } catch (err) {
    sendError(res, err)
  }
})

router.delete('/checklists/:id/fields/:fieldId', canDelete, async (req, res) => {
  try {
    await deleteChecklistField(
      req.userProfile.org_id,
      req.userProfile.id,
      req.params.id,
      req.params.fieldId,
    )
    res.status(204).end()
  } catch (err) {
    sendError(res, err)
  }
})

router.put('/checklists/:id/fields/reorder', canUpdate, async (req, res) => {
  try {
    const row = await reorderChecklistFields(
      req.userProfile.org_id,
      req.userProfile.id,
      req.params.id,
      req.body?.field_ids || [],
    )
    res.json(row)
  } catch (err) {
    sendError(res, err)
  }
})

router.post('/checklists/:id/sections', canUpdate, async (req, res) => {
  try {
    const row = await createChecklistSection(
      req.userProfile.org_id,
      req.userProfile.id,
      req.params.id,
      req.body || {},
    )
    res.status(201).json(row)
  } catch (err) {
    sendError(res, err)
  }
})

router.patch('/checklists/:id/sections/:sectionId', canUpdate, async (req, res) => {
  try {
    const row = await updateChecklistSection(
      req.userProfile.org_id,
      req.userProfile.id,
      req.params.id,
      req.params.sectionId,
      req.body || {},
    )
    res.json(row)
  } catch (err) {
    sendError(res, err)
  }
})

router.delete('/checklists/:id/sections/:sectionId', canDelete, async (req, res) => {
  try {
    await deleteChecklistSection(
      req.userProfile.org_id,
      req.userProfile.id,
      req.params.id,
      req.params.sectionId,
    )
    res.status(204).end()
  } catch (err) {
    sendError(res, err)
  }
})

router.put('/checklists/:id/sections/reorder', canUpdate, async (req, res) => {
  try {
    const row = await reorderChecklistSections(
      req.userProfile.org_id,
      req.userProfile.id,
      req.params.id,
      req.body?.section_ids || [],
    )
    res.json(row)
  } catch (err) {
    sendError(res, err)
  }
})

router.get('/tab-counts', canRead, async (req, res) => {
  const orgId = req.userProfile.org_id
  try {
    const [plans, orders] = await Promise.all([
      supabaseAdmin.from('pm_plans').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
      supabaseAdmin.from('manual_work_orders').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('source_type', 'preventive_maintenance').neq('status', 'draft'),
    ])
    if (plans.error) throw plans.error
    if (orders.error) throw orders.error
    res.json({ plans: plans.count || 0, orders: orders.count || 0 })
  } catch (err) {
    sendError(res, err)
  }
})

router.get('/plans', canRead, async (req, res) => {
  const controls = parseListControls(req.query)
  const page = controls.exportCsv ? { limit: 5000, offset: 0 } : parsePagination(req.query)
  try {
    const orgId = req.userProfile.org_id
    const result = await listPmPlans(orgId, {
      status: req.query.status,
      search: req.query.search,
      filters: controls.filters,
      limit: page.limit,
      offset: page.offset,
    })
    if (controls.exportCsv) {
      sendCsv(
        res,
        'pm-plans.csv',
        result.items,
        await withCatalogColumns(orgId, PM_PLAN_CSV_COLUMNS, { source: 'pm.plan' }),
      )
      return
    }
    res.json(listEnvelope(result.items, result))
  } catch (err) {
    sendError(res, err)
  }
})

router.get('/plans/template', canCreate, async (req, res) => {
  try {
    const buffer = await buildPmPlansTemplate(req.userProfile.org_id)
    res.json(excelFilePayload('pm-plans-template.xlsx', buffer))
  } catch (err) {
    sendError(res, err)
  }
})

router.post('/plans/import', canCreate, async (req, res) => {
  try {
    const buffer = bufferFromBase64Upload(req.body?.data)
    const result = await bulkImportPmPlans(
      req.userProfile.org_id,
      req.userProfile.id,
      buffer,
    )
    res.json(await attachFailedFileToResult(result, buffer, 'pm-plans-import-failed-rows.xlsx'))
  } catch (err) {
    sendError(res, err)
  }
})

router.get('/plans/:id', canRead, async (req, res) => {
  try {
    const row = await getPmPlan(req.userProfile.org_id, req.params.id)
    res.json(row)
  } catch (err) {
    sendError(res, err)
  }
})

router.post('/plans', canCreate, async (req, res) => {
  try {
    const row = await createPmPlan(req.userProfile.org_id, req.userProfile.id, req.body || {})
    res.status(201).json(row)
  } catch (err) {
    sendError(res, err)
  }
})

router.patch('/plans/:id', canUpdate, async (req, res) => {
  try {
    const row = await updatePmPlan(
      req.userProfile.org_id,
      req.userProfile.id,
      req.params.id,
      req.body || {},
    )
    res.json(row)
  } catch (err) {
    sendError(res, err)
  }
})

router.delete('/plans/:id', canDelete, async (req, res) => {
  try {
    await deletePmPlan(req.userProfile.org_id, req.params.id)
    res.status(204).end()
  } catch (err) {
    sendError(res, err)
  }
})

router.post('/plans/:id/duplicate', canCreate, async (req, res) => {
  try {
    const row = await duplicatePmPlan(
      req.userProfile.org_id,
      req.userProfile.id,
      req.params.id,
    )
    res.status(201).json(row)
  } catch (err) {
    sendError(res, err)
  }
})

router.post('/plans/:id/generate', canCreate, async (req, res) => {
  try {
    const result = await generateScheduledWorkOrder(
      req.userProfile.org_id,
      req.params.id,
      { actorId: req.userProfile.id, force: true },
    )
    if (result.skipped) {
      return res.status(409).json({
        error: result.reason === 'open_work_order'
          ? 'This plan already has an open scheduled work order.'
          : 'This plan is not due yet.',
        reason: result.reason,
      })
    }
    res.status(201).json(result)
  } catch (err) {
    sendError(res, err)
  }
})

export default router
