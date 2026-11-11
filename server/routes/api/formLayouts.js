import { Router } from 'express'
import { verifyAuth } from '../../middleware/auth.js'
import { requireOrgAccess } from '../../middleware/orgAccess.js'
import { loadOrgPermissions } from '../../middleware/modulePermission.js'
import { canViewAssociatedWorkRecord, hasModulePermission } from '../../lib/orgPermissions.js'
import { getFormDef } from '../../lib/formRegistry.js'
import { isWorkOrderProcessForm } from '../../lib/workOrderForms.js'
import {
  loadRuntimeFormLayout,
  loadRuntimeFormBundle,
  listFormFieldValues,
  upsertFormFieldValues,
  loadOrgCatalogFields,
} from '../../lib/orgFormLayouts.js'
import { parseLayoutId } from '../../lib/formLayoutIds.js'
import {
  applyCompanyOptionsToCatalog,
  applyCompanyOptionsToLayout,
  loadFormFieldOptionOverlays,
} from '../../lib/formFieldMasters.js'
import { applyLoadedCompanySkips } from '../../lib/formSkips.js'

function attachCatalogDropdownOptions(parents, allRows) {
  const byParent = new Map()
  for (const row of allRows || []) {
    if (row.kind !== 'child' || !row.parent_id) continue
    const list = byParent.get(String(row.parent_id)) || []
    if (row.name) list.push(row.name)
    byParent.set(String(row.parent_id), list)
  }
  return (parents || []).map((row) => ({
    ...row,
    dropdown_options: Array.isArray(row.dropdown_options) && row.dropdown_options.length
      ? row.dropdown_options
      : (byParent.get(String(row.id)) || []),
  }))
}
import {
  loadFillershipRecord,
  actorsFromRequest,
  mergeFormFieldValuesWithFillership,
} from '../../lib/formFillershipRecord.js'

const router = Router()

router.use(verifyAuth, requireOrgAccess, loadOrgPermissions)

router.get('/catalog-fields', async (req, res) => {
  try {
    const fields = await loadOrgCatalogFields(req.userProfile.org_id)
    const parents = (fields || [])
      .filter((row) => row.kind === 'parent' && row.is_active !== false)
      .map((row) => ({
        id: row.id,
        name: row.name,
        field_type: row.field_type,
        field_source: row.field_source || 'asset',
      }))
    res.json({ fields: parents })
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.get('/:formId', async (req, res) => {
  try {
    const formDef = getFormDef(req.params.formId)
    if (!formDef) return res.status(404).json({ error: 'Unknown form' })
    const formId = req.params.formId
    const orgId = req.userProfile.org_id
    const { layout: rawLayout, catalogSource, platformCatalog } = await loadRuntimeFormBundle(
      orgId,
      formId,
    )
    const overlays = await loadFormFieldOptionOverlays(orgId, formId)
    const withOptions = rawLayout
      ? await applyCompanyOptionsToLayout(orgId, formId, rawLayout, { overlays })
      : null
    const layout = withOptions
      ? await applyLoadedCompanySkips(orgId, formId, withOptions)
      : null
    let catalogFields = []
    if (layout) {
      const fieldIds = new Set()
      const sectionIds = new Set()
      for (const section of layout.sections || []) {
        const parsed = parseLayoutId(section.id)
        if (parsed.kind === 'catalog') sectionIds.add(String(parsed.value))
      }
      for (const field of layout.fields || []) {
        const parsed = parseLayoutId(field.id)
        if (parsed.kind === 'catalog') fieldIds.add(String(parsed.value))
      }
      if (fieldIds.size || sectionIds.size) {
        const all = catalogSource === 'platform'
          ? (platformCatalog || []).map((row) => ({
            ...row,
            field_source: row.source === 'equipment' ? 'equipment' : 'asset',
          }))
          : await loadOrgCatalogFields(orgId)
        catalogFields = attachCatalogDropdownOptions(
          all.filter((row) => (
            row.kind === 'parent'
            && row.is_active !== false
            && (
              fieldIds.has(String(row.id))
              || (row.section_id && sectionIds.has(String(row.section_id)))
            )
          )),
          all,
        )
        catalogFields = applyCompanyOptionsToCatalog(formId, catalogFields, overlays)
      }
    }
    res.json({ formId, layout, catalogFields })
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

function canReadWorkOrderFormValues(req) {
  return hasModulePermission(req.orgPermissions, 'work_orders', 'read')
    || hasModulePermission(req.orgPermissions, 'work_orders_manual', 'read')
    || hasModulePermission(req.orgPermissions, 'work_orders_assigned', 'read')
    || hasModulePermission(req.orgPermissions, 'work_orders_received', 'read')
    || hasModulePermission(req.orgPermissions, 'work_orders_scheduled', 'read')
    || hasModulePermission(req.orgPermissions, 'work_request_approve', 'update')
    || hasModulePermission(req.orgPermissions, 'work_request_incoming', 'read')
}

function canWriteWorkOrderFormValues(req) {
  return hasModulePermission(req.orgPermissions, 'work_orders', 'update')
    || hasModulePermission(req.orgPermissions, 'work_orders', 'create')
    || hasModulePermission(req.orgPermissions, 'work_orders_manual', 'update')
    || hasModulePermission(req.orgPermissions, 'work_orders_manual', 'create')
    || hasModulePermission(req.orgPermissions, 'work_orders_assigned', 'update')
    || hasModulePermission(req.orgPermissions, 'work_orders_received', 'update')
    || hasModulePermission(req.orgPermissions, 'work_orders_scheduled', 'update')
    || hasModulePermission(req.orgPermissions, 'work_request_approve', 'update')
    || hasModulePermission(req.orgPermissions, 'work_request_incoming', 'update')
}

router.get('/:formId/values/:recordId', async (req, res) => {
  try {
    const formId = req.params.formId
    const formDef = getFormDef(formId)
    if (!formDef) return res.status(404).json({ error: 'Unknown form' })
    const isManualWorkOrderForm = formId === 'work_orders.manual'
    const workRecordForm = formId === 'work_request.create'
      || formId === 'pm.plan'
      || isWorkOrderProcessForm(formId)
      || isManualWorkOrderForm
    const canRead = !formDef.permissionKey || (
      (workRecordForm && canViewAssociatedWorkRecord(req.orgPermissions))
      || hasModulePermission(req.orgPermissions, formDef.permissionKey, 'read')
      || (formId === 'work_request.create' && (
        hasModulePermission(req.orgPermissions, 'work_request_approve', 'update')
        || hasModulePermission(req.orgPermissions, 'work_request_incoming', 'read')
        || hasModulePermission(req.orgPermissions, 'work_request_incoming', 'update')
        || hasModulePermission(req.orgPermissions, 'work_orders', 'read')
        || hasModulePermission(req.orgPermissions, 'work_orders_assigned', 'read')
      ))
      || ((isWorkOrderProcessForm(formId) || isManualWorkOrderForm) && canReadWorkOrderFormValues(req))
    )
    if (!canRead) {
      return res.status(403).json({
        error: `You do not have permission to read ${formDef.label.toLowerCase()}`,
      })
    }
    const values = await listFormFieldValues(
      req.userProfile.org_id,
      formId,
      req.params.recordId,
    )
    res.json({ values })
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.put('/:formId/values/:recordId', async (req, res) => {
  try {
    const formId = req.params.formId
    const formDef = getFormDef(formId)
    if (!formDef) return res.status(404).json({ error: 'Unknown form' })
    const isManualWorkOrderForm = formId === 'work_orders.manual'
    const canWrite = !formDef.permissionKey || (
      hasModulePermission(req.orgPermissions, formDef.permissionKey, 'update')
      || hasModulePermission(req.orgPermissions, formDef.permissionKey, 'create')
      // Fillership follow-up: Order To / technicians may fill reserved sections without create rights
      || (formId === 'work_request.create' && (
        hasModulePermission(req.orgPermissions, 'work_request_approve', 'update')
        || hasModulePermission(req.orgPermissions, 'work_request_incoming', 'update')
        || hasModulePermission(req.orgPermissions, 'work_orders', 'update')
        || hasModulePermission(req.orgPermissions, 'work_orders_assigned', 'update')
      ))
      || ((isWorkOrderProcessForm(formId) || isManualWorkOrderForm) && canWriteWorkOrderFormValues(req))
    )
    if (!canWrite) {
      return res.status(403).json({
        error: `You do not have permission to update ${formDef.label.toLowerCase()}`,
      })
    }
    const values = req.body?.values && typeof req.body.values === 'object' ? req.body.values : null
    if (!values) return res.status(400).json({ error: 'values object is required' })

    const orgId = req.userProfile.org_id
    const recordId = req.params.recordId
    // Manual WO is a single post-work form (no stage fillership). Match the client
    // which unlocks every section, and persist extras without role gating.
    if (isManualWorkOrderForm) {
      const saved = await upsertFormFieldValues(orgId, formId, recordId, values)
      return res.json({ values: saved })
    }

    const layout = await loadRuntimeFormLayout(orgId, formId)
    const record = await loadFillershipRecord(orgId, formId, recordId)
    const actors = actorsFromRequest(req, record, {
      formId,
      isCreate: !record,
    })

    const saved = await mergeFormFieldValuesWithFillership({
      orgId,
      formId,
      recordId,
      values,
      layout,
      actors,
      listFormFieldValues,
      upsertFormFieldValues,
    })
    res.json({ values: saved })
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

export default router
