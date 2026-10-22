import { Router } from 'express'
import { verifyAuth } from '../../middleware/auth.js'
import { requireOrgAccess } from '../../middleware/orgAccess.js'
import { loadOrgPermissions } from '../../middleware/modulePermission.js'
import { hasModulePermission } from '../../lib/orgPermissions.js'
import { getFormDef } from '../../lib/formRegistry.js'
import {
  loadRuntimeFormLayout,
  listFormFieldValues,
  upsertFormFieldValues,
  loadOrgCatalogFields,
} from '../../lib/orgFormLayouts.js'
import { parseLayoutId } from '../../lib/formLayoutIds.js'
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
    const layout = await loadRuntimeFormLayout(req.userProfile.org_id, req.params.formId)
    let catalogFields = []
    if (layout) {
      const ids = new Set(
        (layout.fields || [])
          .map((field) => parseLayoutId(field.id))
          .filter((parsed) => parsed.kind === 'catalog')
          .map((parsed) => parsed.value),
      )
      if (ids.size) {
        const all = await loadOrgCatalogFields(req.userProfile.org_id)
        catalogFields = all.filter((row) => ids.has(row.id) && row.kind === 'parent')
      }
    }
    res.json({ formId: req.params.formId, layout, catalogFields })
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.get('/:formId/values/:recordId', async (req, res) => {
  try {
    const formId = req.params.formId
    const formDef = getFormDef(formId)
    if (!formDef) return res.status(404).json({ error: 'Unknown form' })
    const canRead = !formDef.permissionKey || (
      hasModulePermission(req.orgPermissions, formDef.permissionKey, 'read')
      || (formId === 'work_request.create' && (
        hasModulePermission(req.orgPermissions, 'work_request_approve', 'update')
        || hasModulePermission(req.orgPermissions, 'work_request_incoming', 'read')
        || hasModulePermission(req.orgPermissions, 'work_request_incoming', 'update')
        || hasModulePermission(req.orgPermissions, 'work_orders', 'read')
        || hasModulePermission(req.orgPermissions, 'work_orders_assigned', 'read')
      ))
      || (formId === 'work_orders.manual' && (
        hasModulePermission(req.orgPermissions, 'work_orders', 'read')
        || hasModulePermission(req.orgPermissions, 'work_orders_assigned', 'read')
      ))
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
      || (formId === 'work_orders.manual' && (
        hasModulePermission(req.orgPermissions, 'work_orders', 'update')
        || hasModulePermission(req.orgPermissions, 'work_orders_assigned', 'update')
      ))
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
