import { supabaseAdmin } from '../services/supabase.js'
import { MODULE_FORM_GROUPS, getFormDef } from './formRegistry.js'
import { parseLayoutId } from './formLayoutIds.js'
import {
  getPlatformHierarchyDefault,
  markFormAsDefault,
  markHierarchyAsDefault,
} from './platformFormDefaults.js'

function httpError(message, status = 400) {
  const err = new Error(message)
  err.status = status
  return err
}

function catalogKey(row) {
  if (!row) return ''
  return `${String(row.name || '').trim().toLowerCase()}|${row.kind || ''}|${row.field_type || ''}`
}

function layoutRefKey(id, byId) {
  const parsed = parseLayoutId(id)
  if (parsed.kind !== 'catalog') return `${parsed.kind}:${parsed.value || id || ''}`
  const row = byId.get(parsed.value)
  return row ? `catalog:${catalogKey(row)}` : `catalog:${parsed.value}`
}

export function fingerprintFormLayout(formId, layout, catalogById) {
  const sections = (layout?.sections || []).map((section) => ({
    order: Number(section.order) || 0,
    label: String(section.label || '').trim().toLowerCase(),
    id: layoutRefKey(section.id, catalogById),
  }))
  const fields = (layout?.fields || []).map((field) => ({
    order: Number(field.order) || 0,
    id: layoutRefKey(field.id, catalogById),
    sectionId: layoutRefKey(field.sectionId, catalogById),
    colSpan: Number(field.colSpan) || 0,
    required: Boolean(field.required),
  }))
  const groups = (layout?.groups || []).map((group) => ({
    order: Number(group.order) || 0,
    sectionId: layoutRefKey(group.sectionId, catalogById),
    label: String(group.label || '').trim().toLowerCase(),
  }))
  return `${formId}::${JSON.stringify({ sections, fields, groups, qr: layoutRefKey(layout?.qrFieldId, catalogById) })}`
}

function orderHierarchyParents(parents) {
  const byId = new Map(parents.map((row) => [row.id, row]))
  const childrenOf = new Map()
  const roots = []
  for (const field of parents) {
    const parentId = field.depends_on_parent_id
    if (parentId && byId.has(parentId)) {
      const list = childrenOf.get(parentId) || []
      list.push(field)
      childrenOf.set(parentId, list)
    } else {
      roots.push(field)
    }
  }
  const ordered = []
  const walk = (field) => {
    ordered.push(field)
    for (const child of childrenOf.get(field.id) || []) walk(child)
  }
  for (const root of roots) walk(root)
  return ordered
}

export function fingerprintHierarchy(rows) {
  const parents = (rows || []).filter((row) => row.kind === 'parent')
  if (!parents.length) return ''
  const byId = new Map((rows || []).map((row) => [String(row.id), row]))
  const optionsByParent = new Map()
  for (const row of rows || []) {
    if (row.kind !== 'child' || !row.parent_id) continue
    const list = optionsByParent.get(row.parent_id) || []
    list.push(String(row.name || '').trim().toLowerCase())
    optionsByParent.set(row.parent_id, list)
  }
  const chain = orderHierarchyParents(parents).map((field) => ({
    name: String(field.name || '').trim().toLowerCase(),
    type: field.field_type || '',
    required: Boolean(field.is_required),
    depends: String(byId.get(field.depends_on_parent_id)?.name || '').trim().toLowerCase(),
    dependsOption: String(field.depends_on_option || '').trim().toLowerCase(),
    options: (optionsByParent.get(field.id) || []).sort(),
  }))
  return JSON.stringify(chain)
}

function hierarchyLabel(rows) {
  const parents = orderHierarchyParents((rows || []).filter((row) => row.kind === 'parent'))
  const names = parents.map((row) => row.name).filter(Boolean)
  return names.length ? names.join(' → ') : 'Untitled hierarchy'
}

function formSummary(layout, catalogById) {
  const fields = layout?.fields || []
  const catalogNames = []
  for (const field of fields) {
    const parsed = parseLayoutId(field.id)
    if (parsed.kind !== 'catalog') continue
    const name = catalogById.get(parsed.value)?.name
    if (name) catalogNames.push(name)
  }
  return {
    field_count: fields.length,
    section_count: (layout?.sections || []).length,
    catalog_names: catalogNames.slice(0, 8),
  }
}

async function loadOrgNames() {
  const { data, error } = await supabaseAdmin
    .from('organizations')
    .select('id, name')
    .order('name')
  if (error) throw error
  return new Map((data || []).map((row) => [row.id, row.name || 'Untitled company']))
}

async function loadCatalogById() {
  const [assetResult, equipmentResult] = await Promise.all([
    supabaseAdmin.from('asset_fields').select('id, name, kind, field_type, org_id'),
    supabaseAdmin.from('equipment_fields').select('id, name, kind, field_type, org_id'),
  ])
  if (assetResult.error) throw assetResult.error
  if (equipmentResult.error) throw equipmentResult.error
  const byId = new Map()
  for (const row of [...(assetResult.data || []), ...(equipmentResult.data || [])]) {
    byId.set(row.id, row)
  }
  return byId
}

export async function listUniqueDefaultForms() {
  const [layoutsResult, orgNames, catalogById] = await Promise.all([
    supabaseAdmin
      .from('org_form_layouts')
      .select('org_id, form_id, layout, updated_at')
      .order('updated_at', { ascending: false }),
    loadOrgNames(),
    loadCatalogById(),
  ])
  if (layoutsResult.error) {
    if (/org_form_layouts/i.test(layoutsResult.error.message || '') && /does not exist/i.test(layoutsResult.error.message || '')) {
      return { modules: MODULE_FORM_GROUPS.map((group) => ({ ...group, forms: group.forms.map((form) => ({ formId: form.formId, label: form.label, variants: [] })) })) }
    }
    throw layoutsResult.error
  }

  const platformByForm = new Map()
  const { data: platformRows, error: platformError } = await supabaseAdmin
    .from('platform_form_defaults')
    .select('form_id, layout, catalog, source_org_id, updated_at')
  if (platformError && !/platform_form_defaults/i.test(platformError.message || '')) throw platformError
  for (const row of platformRows || []) {
    if (!row?.layout) continue
    const catalogMap = new Map((row.catalog || []).map((item) => [item.id, item]))
    platformByForm.set(row.form_id, {
      fingerprint: fingerprintFormLayout(row.form_id, row.layout, catalogMap),
      source_org_id: row.source_org_id,
      updated_at: row.updated_at,
    })
  }

  const groups = MODULE_FORM_GROUPS.map((group) => ({
    moduleId: group.moduleId,
    label: group.label,
    forms: group.forms.map((form) => {
      const variants = new Map()
      for (const row of layoutsResult.data || []) {
        if (row.form_id !== form.formId || !row.layout) continue
        const fingerprint = fingerprintFormLayout(form.formId, row.layout, catalogById)
        const current = variants.get(fingerprint) || {
          fingerprint,
          form_id: form.formId,
          source_org_id: row.org_id,
          updated_at: row.updated_at,
          summary: formSummary(row.layout, catalogById),
          orgs: [],
        }
        current.orgs.push({
          id: row.org_id,
          name: orgNames.get(row.org_id) || 'Untitled company',
          updated_at: row.updated_at,
        })
        if (String(row.updated_at || '') > String(current.updated_at || '')) {
          current.updated_at = row.updated_at
          current.source_org_id = row.org_id
        }
        variants.set(fingerprint, current)
      }
      const platform = platformByForm.get(form.formId)
      return {
        formId: form.formId,
        label: form.label,
        hasPlatformDefault: Boolean(platform),
        variants: [...variants.values()]
          .map((variant) => ({
            ...variant,
            isDefault: Boolean(platform && platform.fingerprint === variant.fingerprint),
            orgs: variant.orgs.sort((a, b) => String(a.name).localeCompare(String(b.name))),
          }))
          .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || String(b.updated_at || '').localeCompare(String(a.updated_at || ''))),
      }
    }),
  }))

  return { modules: groups }
}

export async function listUniqueDefaultHierarchies() {
  const [equipmentResult, orgNames, platform] = await Promise.all([
    supabaseAdmin
      .from('equipment_fields')
      .select('id, org_id, name, kind, parent_id, field_type, sort_order, is_active, is_required, depends_on_parent_id, depends_on_option, updated_at')
      .order('sort_order')
      .order('name'),
    loadOrgNames(),
    getPlatformHierarchyDefault(),
  ])
  if (equipmentResult.error) throw equipmentResult.error

  const byOrg = new Map()
  for (const row of equipmentResult.data || []) {
    const list = byOrg.get(row.org_id) || []
    list.push(row)
    byOrg.set(row.org_id, list)
  }

  const platformFingerprint = fingerprintHierarchy(platform?.catalog || [])
  const variants = new Map()
  for (const [orgId, rows] of byOrg) {
    const fingerprint = fingerprintHierarchy(rows)
    if (!fingerprint) continue
    const latest = rows.reduce((max, row) => (
      String(row.updated_at || '') > String(max || '') ? row.updated_at : max
    ), '')
    const current = variants.get(fingerprint) || {
      fingerprint,
      source_org_id: orgId,
      label: hierarchyLabel(rows),
      parent_count: rows.filter((row) => row.kind === 'parent').length,
      updated_at: latest,
      orgs: [],
    }
    current.orgs.push({
      id: orgId,
      name: orgNames.get(orgId) || 'Untitled company',
      updated_at: latest,
    })
    if (String(latest || '') > String(current.updated_at || '')) {
      current.updated_at = latest
      current.source_org_id = orgId
      current.label = hierarchyLabel(rows)
    }
    variants.set(fingerprint, current)
  }

  return {
    hasPlatformDefault: Boolean(platformFingerprint),
    variants: [...variants.values()]
      .map((variant) => ({
        ...variant,
        isDefault: Boolean(platformFingerprint && platformFingerprint === variant.fingerprint),
        orgs: variant.orgs.sort((a, b) => String(a.name).localeCompare(String(b.name))),
      }))
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || String(b.updated_at || '').localeCompare(String(a.updated_at || ''))),
  }
}

export async function setDefaultFormFromOrg(formId, sourceOrgId) {
  if (!getFormDef(formId)) throw httpError('Unknown form', 404)
  if (!sourceOrgId) throw httpError('Choose a company form to mark as the default.')
  return markFormAsDefault(sourceOrgId, formId)
}

export async function setDefaultHierarchyFromOrg(sourceOrgId) {
  if (!sourceOrgId) throw httpError('Choose a company hierarchy to mark as the default.')
  return markHierarchyAsDefault(sourceOrgId)
}
