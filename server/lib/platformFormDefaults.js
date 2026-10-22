import { randomUUID } from 'node:crypto'
import { supabaseAdmin } from '../services/supabase.js'
import { getFormDef } from './formRegistry.js'
import {
  catalogId,
  cloneLayout,
  parseLayoutId,
} from './formLayoutIds.js'
import {
  getSavedFormLayout,
  loadOrgCatalogFields,
  upsertFormLayout,
} from './orgFormLayouts.js'

const ORG_ASSETS_BUCKET = 'org-assets'

function httpError(message, status = 400) {
  const err = new Error(message)
  err.status = status
  return err
}

export function isMissingPlatformDefaultsTable(error) {
  const msg = String(error?.message || '')
  return /platform_form_defaults/i.test(msg) && /does not exist|schema cache/i.test(msg)
}

function addCatalogRef(ids, id) {
  const parsed = parseLayoutId(id)
  if (parsed.kind === 'catalog' && parsed.value) ids.add(parsed.value)
}

function collectCatalogIds(layout) {
  const ids = new Set()
  for (const section of layout?.sections || []) addCatalogRef(ids, section.id)
  for (const field of layout?.fields || []) {
    addCatalogRef(ids, field.id)
    addCatalogRef(ids, field.dependsOnFieldId)
    addCatalogRef(ids, field.filterByFieldId)
    for (const option of field.options || []) {
      for (const rule of option.rules || []) {
        addCatalogRef(ids, rule.targetFieldId)
        addCatalogRef(ids, rule.sourceFieldId)
      }
    }
  }
  for (const group of layout?.groups || []) addCatalogRef(ids, group.sectionId)
  addCatalogRef(ids, layout?.qrFieldId)
  return ids
}

function compactCatalogRow(row) {
  return {
    source: row.field_source === 'equipment' ? 'equipment' : 'asset',
    id: row.id,
    name: row.name,
    kind: row.kind,
    section_id: row.section_id || null,
    parent_id: row.parent_id || null,
    field_type: row.field_type || null,
    sort_order: Number(row.sort_order) || 0,
    is_active: row.is_active !== false,
    is_required: Boolean(row.is_required),
    depends_on_parent_id: row.depends_on_parent_id || null,
    depends_on_option: row.depends_on_option || null,
    icon_path: row.icon_path || null,
  }
}

export function snapshotCatalog(layout, catalogFields) {
  const byId = new Map((catalogFields || []).map((row) => [String(row.id), row]))
  const needed = new Set([...collectCatalogIds(layout)].map(String))
  const included = new Set()
  const pending = [...needed]

  while (pending.length) {
    const id = String(pending.pop() || '')
    if (!id || included.has(id)) continue
    const row = byId.get(id)
    if (!row) {
      throw httpError('Save the form again. A question it uses no longer exists.')
    }
    included.add(id)
    if (row.section_id) pending.push(String(row.section_id))
    if (row.parent_id) pending.push(String(row.parent_id))
    if (row.depends_on_parent_id) pending.push(String(row.depends_on_parent_id))
    for (const child of catalogFields) {
      if (child.kind === 'child' && String(child.parent_id) === id) {
        pending.push(String(child.id))
      }
    }
  }

  return [...included].map((id) => compactCatalogRow(byId.get(id)))
}

function remapRef(id, idMap) {
  if (!id) return id
  const parsed = parseLayoutId(id)
  if (parsed.kind === 'catalog' && idMap.has(parsed.value)) {
    return catalogId(idMap.get(parsed.value))
  }
  return id
}

export function remapLayoutIds(layout, idMap) {
  const next = cloneLayout(layout)
  next.sections = (next.sections || []).map((section) => ({
    ...section,
    id: remapRef(section.id, idMap),
  }))
  next.fields = (next.fields || []).map((field) => ({
    ...field,
    id: remapRef(field.id, idMap),
    ...(field.sectionId ? { sectionId: remapRef(field.sectionId, idMap) } : {}),
    ...(field.dependsOnFieldId ? { dependsOnFieldId: remapRef(field.dependsOnFieldId, idMap) } : {}),
    ...(field.filterByFieldId ? { filterByFieldId: remapRef(field.filterByFieldId, idMap) } : {}),
    ...(Array.isArray(field.options) ? {
      options: field.options.map((option) => ({
        ...option,
        ...(Array.isArray(option.rules) ? {
          rules: option.rules.map((rule) => ({
            ...rule,
            targetFieldId: remapRef(rule.targetFieldId, idMap),
            ...(rule.sourceFieldId ? { sourceFieldId: remapRef(rule.sourceFieldId, idMap) } : {}),
          })),
        } : {}),
      })),
    } : {}),
  }))
  next.groups = (next.groups || []).map((group) => ({
    ...group,
    sectionId: remapRef(group.sectionId, idMap),
  }))
  if (next.qrFieldId) next.qrFieldId = remapRef(next.qrFieldId, idMap)
  return next
}

function orderByDependency(rows) {
  const ids = new Set(rows.map((row) => row.id))
  const pending = [...rows]
  const ordered = []
  let guard = pending.length + 2
  while (pending.length && guard > 0) {
    guard -= 1
    const next = []
    for (const row of pending) {
      const dep = row.depends_on_parent_id
      const ready = !dep || !ids.has(dep) || ordered.some((item) => item.id === dep)
      if (ready) ordered.push(row)
      else next.push(row)
    }
    if (next.length === pending.length) {
      ordered.push(...next)
      break
    }
    pending.splice(0, pending.length, ...next)
  }
  return ordered
}

function targetTable(row) {
  if (row.kind === 'section' || row.source !== 'equipment') return 'asset_fields'
  return 'equipment_fields'
}

function insertPayload(row, idMap, orgId) {
  const kind = row.kind
  return {
    id: idMap.get(row.id),
    org_id: orgId,
    name: row.name,
    kind,
    section_id: kind === 'section' ? null : (idMap.get(row.section_id) || null),
    parent_id: kind === 'child' ? (idMap.get(row.parent_id) || null) : null,
    field_type: kind === 'section' ? null : (row.field_type || 'text'),
    sort_order: row.sort_order || 0,
    is_active: row.is_active !== false,
    is_required: kind === 'parent' ? Boolean(row.is_required) : false,
    depends_on_parent_id: kind === 'parent' ? (idMap.get(row.depends_on_parent_id) || null) : null,
    depends_on_option: kind === 'parent' ? (row.depends_on_option || null) : null,
    icon_path: null,
  }
}

async function insertCatalogRows(rows, idMap, orgId) {
  const groups = [
    ['asset_fields', rows.filter((row) => targetTable(row) === 'asset_fields' && row.kind === 'section')],
    ['asset_fields', orderByDependency(rows.filter((row) => targetTable(row) === 'asset_fields' && row.kind === 'parent'))],
    ['asset_fields', rows.filter((row) => targetTable(row) === 'asset_fields' && row.kind === 'child')],
    ['equipment_fields', orderByDependency(rows.filter((row) => targetTable(row) === 'equipment_fields' && row.kind === 'parent'))],
    ['equipment_fields', rows.filter((row) => targetTable(row) === 'equipment_fields' && row.kind === 'child')],
  ]
  for (const [table, group] of groups) {
    if (!group.length) continue
    const payload = group.map((row) => insertPayload(row, idMap, orgId))
    const { error } = await supabaseAdmin.from(table).insert(payload)
    if (error) throw error
  }
}

function iconContentType(path) {
  return String(path || '').toLowerCase().endsWith('.svg') ? 'image/svg+xml' : 'image/png'
}

async function copySectionIcons(rows, idMap, orgId) {
  for (const row of rows) {
    if (row.kind !== 'section' || !row.icon_path) continue
    const newId = idMap.get(row.id)
    if (!newId) continue
    try {
      const downloaded = await supabaseAdmin.storage.from(ORG_ASSETS_BUCKET).download(row.icon_path)
      if (downloaded.error || !downloaded.data) continue
      const bytes = Buffer.from(await downloaded.data.arrayBuffer())
      const ext = String(row.icon_path).split('.').pop() || 'png'
      const newPath = `${orgId}/section-icons/${newId}.${ext}`
      const uploaded = await supabaseAdmin.storage.from(ORG_ASSETS_BUCKET).upload(newPath, bytes, {
        upsert: true,
        contentType: iconContentType(row.icon_path),
      })
      if (uploaded.error) continue
      await supabaseAdmin.from('asset_fields').update({ icon_path: newPath }).eq('id', newId)
    } catch {
      // The form still works without the section icon.
    }
  }
}

export async function listPlatformFormDefaultMeta() {
  const { data, error } = await supabaseAdmin
    .from('platform_form_defaults')
    .select('form_id, module_id, source_org_id, updated_at')

  if (error) {
    if (isMissingPlatformDefaultsTable(error)) return []
    throw error
  }
  return data || []
}

export async function getPlatformFormDefaultMeta(formId) {
  const { data, error } = await supabaseAdmin
    .from('platform_form_defaults')
    .select('form_id, module_id, source_org_id, updated_at')
    .eq('form_id', formId)
    .maybeSingle()

  if (error) {
    if (isMissingPlatformDefaultsTable(error)) return null
    throw error
  }
  return data || null
}

export function publicDefaultMeta(row, orgId) {
  if (!row) return null
  return {
    updated_at: row.updated_at,
    isSource: Boolean(orgId) && row.source_org_id === orgId,
  }
}

export async function markFormAsDefault(orgId, formId) {
  const formDef = getFormDef(formId)
  if (!formDef) throw httpError('Unknown form', 404)

  const saved = await getSavedFormLayout(orgId, formId)
  if (!saved?.layout) {
    throw httpError('Save the form before marking it as the default')
  }

  const catalogFields = await loadOrgCatalogFields(orgId)
  const catalog = snapshotCatalog(saved.layout, catalogFields)
  const now = new Date().toISOString()
  const { data, error } = await supabaseAdmin
    .from('platform_form_defaults')
    .upsert({
      form_id: formId,
      module_id: formDef.moduleId,
      layout: saved.layout,
      catalog,
      source_org_id: orgId,
      updated_at: now,
    }, { onConflict: 'form_id' })
    .select('form_id, module_id, source_org_id, updated_at')
    .single()

  if (error) {
    if (isMissingPlatformDefaultsTable(error)) {
      throw httpError('Default forms are not available yet. Restart the server and try again.', 503)
    }
    throw error
  }
  return data
}

function dedupeCatalog(rows) {
  const byId = new Map()
  for (const row of rows || []) {
    if (!row?.id) continue
    byId.set(String(row.id), row)
  }
  return [...byId.values()]
}

export async function applyPlatformFormDefaults(orgId) {
  const { data, error } = await supabaseAdmin
    .from('platform_form_defaults')
    .select('form_id, module_id, layout, catalog')

  if (error) {
    if (isMissingPlatformDefaultsTable(error)) return { applied: 0 }
    throw error
  }

  const defaults = data || []
  if (!defaults.length) return { applied: 0 }

  const existing = await supabaseAdmin
    .from('org_form_layouts')
    .select('form_id')
    .eq('org_id', orgId)
  if (existing.error && !/does not exist/i.test(existing.error.message || '')) throw existing.error
  const already = new Set((existing.data || []).map((row) => row.form_id))
  const pending = defaults.filter((row) => row.layout && !already.has(row.form_id))
  if (!pending.length) return { applied: 0 }

  const catalog = dedupeCatalog(pending.flatMap((row) => row.catalog || []))
  const idMap = new Map(catalog.map((row) => [String(row.id), randomUUID()]))
  await insertCatalogRows(catalog, idMap, orgId)
  await copySectionIcons(catalog, idMap, orgId)

  for (const row of pending) {
    const layout = remapLayoutIds(row.layout, idMap)
    await upsertFormLayout(orgId, row.form_id, layout)
  }

  return { applied: pending.length }
}
