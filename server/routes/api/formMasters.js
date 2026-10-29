import { Router } from 'express'
import { verifyAuth } from '../../middleware/auth.js'
import { requireOrgAccess } from '../../middleware/orgAccess.js'
import {
  loadOrgPermissions,
  requireModulePermission,
} from '../../middleware/modulePermission.js'
import { canManageOrg } from '../../lib/accountRoles.js'
import { hasModulePermission } from '../../lib/orgPermissions.js'
import { isProductModuleEnabled, normalizeDisabledModules } from '../../lib/orgModules.js'
import { getFormDef } from '../../lib/formRegistry.js'
import { parseLayoutId } from '../../lib/formLayoutIds.js'
import {
  loadRuntimeFormBundle,
  loadOrgAssetCatalogFields,
  loadOrgAssetCatalogMeta,
  listSavedFormLayouts,
  listPlatformFormDefaults,
} from '../../lib/orgFormLayouts.js'
import { resolveJobNatureField } from '../../lib/jobNatureField.js'
import { supabaseAdmin } from '../../services/supabase.js'
import { createTtlCache } from '../../lib/ttlCache.js'
import {
  countConfigurableFields,
  ensureFormLayout,
  listConfigurableFieldsFromLayout,
  loadFormFieldOptionOverlays,
  publicFormGroups,
  formUsesWorkCenterList,
  layoutHasPermitDetails,
  resolvePermitTypeChoiceList,
  resolveWorkCenterChoiceList,
  saveFormMasterOptions,
} from '../../lib/formFieldMasters.js'
import {
  describeSkipBoard,
  loadFormSkips,
  normalizeSkipPayload,
  saveFormSkips,
} from '../../lib/formSkips.js'

const router = Router()
const formMasterListCache = createTtlCache({ ttlMs: 15_000, maxEntries: 200 })

router.use(verifyAuth, requireOrgAccess, loadOrgPermissions)

const canReadAssets = requireModulePermission('assets', 'read')

function canManageFormMasters(req) {
  if (canManageOrg(req.userProfile?.role)) return true
  return hasModulePermission(req.orgPermissions, 'assets', 'update')
}

function requireManage(req, res, next) {
  if (!canManageFormMasters(req)) {
    return res.status(403).json({ error: 'You do not have permission to update form masters' })
  }
  next()
}

async function loadOrgDisabledModules(orgId) {
  const { data, error } = await supabaseAdmin
    .from('organizations')
    .select('disabled_modules')
    .eq('id', orgId)
    .maybeSingle()
  if (error) return []
  return normalizeDisabledModules(data?.disabled_modules)
}

function catalogFromPlatform(row) {
  return (row?.catalog || []).map((item) => ({
    ...item,
    field_source: item.source === 'equipment' ? 'equipment' : 'asset',
  }))
}

function layoutHasCatalogFields(layout) {
  return (layout?.fields || []).some((field) => parseLayoutId(field.id).kind === 'catalog')
}

async function loadFormPack(orgId, formId) {
  const formDef = getFormDef(formId)
  if (!formDef) {
    const err = new Error('Unknown form')
    err.status = 404
    throw err
  }
  const bundle = await loadRuntimeFormBundle(orgId, formId)
  const catalogFields = bundle.catalogSource === 'platform'
    ? catalogFromPlatform({ catalog: bundle.platformCatalog })
    : await loadOrgAssetCatalogFields(orgId)
  const layout = ensureFormLayout(formDef, bundle.layout, catalogFields)
  const [overlays, jobNatureField] = await Promise.all([
    loadFormFieldOptionOverlays(orgId, formId),
    formId === 'work_request.create' ? resolveJobNatureField(orgId) : Promise.resolve(null),
  ])
  const [workCenterChoice, permitTypeChoice] = await Promise.all([
    formUsesWorkCenterList(formDef)
      ? resolveWorkCenterChoiceList(orgId, overlays, formId)
      : Promise.resolve(null),
    layoutHasPermitDetails(layout)
      ? resolvePermitTypeChoiceList(orgId, formId, overlays)
      : Promise.resolve(null),
  ])
  const fields = listConfigurableFieldsFromLayout(formId, layout, catalogFields, {
    overlays,
    jobNatureField,
    workCenterChoice,
    permitTypeChoice,
  })
  return { formDef, layout, catalogFields, overlays, fields }
}

async function buildFormMasterList(orgId) {
  const cached = formMasterListCache.get(orgId)
  if (cached) return cached

  const [disabled, orgLayouts, platformDefaults] = await Promise.all([
    loadOrgDisabledModules(orgId),
    listSavedFormLayouts(orgId),
    listPlatformFormDefaults(),
  ])
  const orgById = new Map((orgLayouts || []).map((row) => [row.form_id, row]))
  const groups = publicFormGroups().filter((group) => (
    isProductModuleEnabled(disabled, group.moduleId)
  ))

  let needsOrgCatalog = false
  for (const group of groups) {
    for (const form of group.forms) {
      const saved = orgById.get(form.formId)
      if (saved?.layout) {
        if (layoutHasCatalogFields(saved.layout)) needsOrgCatalog = true
      } else if (!platformDefaults.get(form.formId)?.layout) {
        needsOrgCatalog = true
      }
    }
  }

  const orgCatalog = needsOrgCatalog ? await loadOrgAssetCatalogMeta(orgId) : []
  const modules = []
  for (const group of groups) {
    const forms = group.forms.map((form) => {
      const formDef = getFormDef(form.formId)
      const saved = orgById.get(form.formId)
      const platform = platformDefaults.get(form.formId)
      const catalog = saved?.layout
        ? orgCatalog
        : (platform?.layout ? catalogFromPlatform(platform) : orgCatalog)
      const layout = ensureFormLayout(formDef, saved?.layout || platform?.layout || null, catalog)
      return {
        formId: form.formId,
        label: form.label,
        fieldCount: countConfigurableFields(form.formId, layout, catalog),
      }
    })
    if (forms.length) {
      modules.push({
        moduleId: group.moduleId,
        label: group.label,
        forms,
      })
    }
  }
  const payload = { modules }
  formMasterListCache.set(orgId, payload)
  return payload
}

router.get('/', canReadAssets, async (req, res) => {
  try {
    const payload = await buildFormMasterList(req.userProfile.org_id)
    res.json(payload)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.get('/:formId', canReadAssets, async (req, res) => {
  try {
    const formId = decodeURIComponent(req.params.formId)
    const pack = await loadFormPack(req.userProfile.org_id, formId)
    const skips = await loadFormSkips(req.userProfile.org_id, formId, { required: true })
    const optionFieldIds = new Set((pack.fields || []).map((field) => field.id))
    const board = describeSkipBoard(formId, pack.layout, skips, {
      formDef: pack.formDef,
      optionFieldIds,
    })
    res.json({
      formId,
      label: pack.formDef.label,
      moduleId: pack.formDef.moduleId,
      moduleLabel: pack.formDef.moduleLabel,
      fields: pack.fields.map((field) => ({
        id: field.id,
        label: field.label,
        fieldType: field.fieldType,
        optionCount: field.optionCount,
        source: field.source,
      })),
      ...board,
    })
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.put('/:formId/skips', canReadAssets, requireManage, async (req, res) => {
  try {
    const formId = decodeURIComponent(req.params.formId)
    const pack = await loadFormPack(req.userProfile.org_id, formId)
    const rows = normalizeSkipPayload(formId, pack.layout, req.body || {}, pack.formDef)
    await saveFormSkips(req.userProfile.org_id, formId, rows)
    formMasterListCache.delete(req.userProfile.org_id)
    const skips = await loadFormSkips(req.userProfile.org_id, formId)
    const optionFieldIds = new Set((pack.fields || []).map((field) => field.id))
    const board = describeSkipBoard(formId, pack.layout, skips, {
      formDef: pack.formDef,
      optionFieldIds,
    })
    res.json({
      formId,
      label: pack.formDef.label,
      moduleId: pack.formDef.moduleId,
      moduleLabel: pack.formDef.moduleLabel,
      fields: pack.fields.map((field) => ({
        id: field.id,
        label: field.label,
        fieldType: field.fieldType,
        optionCount: field.optionCount,
        source: field.source,
      })),
      ...board,
    })
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.get('/:formId/:fieldId', canReadAssets, async (req, res) => {
  try {
    const formId = decodeURIComponent(req.params.formId)
    const fieldId = decodeURIComponent(req.params.fieldId)
    const pack = await loadFormPack(req.userProfile.org_id, formId)
    const field = pack.fields.find((item) => item.id === fieldId)
    if (!field) return res.status(404).json({ error: 'That field is not a configurable form master' })
    res.json({
      formId,
      formLabel: pack.formDef.label,
      field,
    })
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.put('/:formId/:fieldId', canReadAssets, requireManage, async (req, res) => {
  try {
    const formId = decodeURIComponent(req.params.formId)
    const fieldId = decodeURIComponent(req.params.fieldId)
    const pack = await loadFormPack(req.userProfile.org_id, formId)
    const field = pack.fields.find((item) => item.id === fieldId)
    if (!field) return res.status(404).json({ error: 'That field is not a configurable form master' })
    const saved = await saveFormMasterOptions(
      req.userProfile.org_id,
      formId,
      fieldId,
      req.body?.options,
    )
    formMasterListCache.delete(req.userProfile.org_id)
    const next = await loadFormPack(req.userProfile.org_id, formId)
    const updated = next.fields.find((item) => item.id === fieldId)
    res.json({
      formId,
      field: updated,
      source: saved.source,
    })
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

export default router
