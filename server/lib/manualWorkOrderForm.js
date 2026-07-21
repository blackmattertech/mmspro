import { supabaseAdmin } from '../services/supabase.js'
import { getSignedUrl } from '../lib/signedUrlCache.js'

const OPTION_FIELD_TYPES = new Set(['dropdown', 'radio', 'checkbox'])

async function loadOrgWorkOrderFields(orgId) {
  const [assetResult, equipmentResult] = await Promise.all([
    supabaseAdmin
      .from('asset_fields')
      .select('*')
      .eq('org_id', orgId)
      .order('sort_order')
      .order('name'),
    supabaseAdmin
      .from('equipment_fields')
      .select('*')
      .eq('org_id', orgId)
      .order('sort_order')
      .order('name'),
  ])

  if (assetResult.error) throw assetResult.error
  if (equipmentResult.error) throw equipmentResult.error

  const byId = new Map()
  for (const row of assetResult.data || []) byId.set(row.id, { ...row, field_source: 'asset' })
  for (const row of equipmentResult.data || []) {
    if (row.kind === 'section' && byId.has(row.id)) continue
    byId.set(row.id, { ...row, field_source: 'equipment' })
  }

  return [...byId.values()]
}

function enrichWorkOrderFields(rows) {
  const byId = new Map(rows.map((row) => [row.id, row]))
  const childrenByParent = new Map()
  for (const row of rows) {
    if (row.kind === 'child' && row.parent_id && row.is_active !== false) {
      if (!childrenByParent.has(row.parent_id)) childrenByParent.set(row.parent_id, [])
      childrenByParent.get(row.parent_id).push(row)
    }
  }

  return rows.map((row) => {
    const section = row.section_id ? byId.get(row.section_id) : null
    const parent = row.parent_id ? byId.get(row.parent_id) : null
    const sectionFromParent = parent?.section_id ? byId.get(parent.section_id) : null
    const children = row.kind === 'parent' ? (childrenByParent.get(row.id) || []) : []

    return {
      ...row,
      section_name: section?.name || sectionFromParent?.name || null,
      parent_name: parent?.name || null,
      dropdown_options: OPTION_FIELD_TYPES.has(row.field_type)
        ? children.map((c) => c.name)
        : undefined,
    }
  })
}

async function loadFieldSettings(orgId) {
  const { data, error } = await supabaseAdmin
    .from('work_order_field_settings')
    .select('field_id, is_visible')
    .eq('org_id', orgId)

  if (error) throw error
  return new Map((data || []).map((row) => [row.field_id, row.is_visible]))
}

function isFieldVisible(field, settingsMap) {
  if (field.is_active === false) return false
  if (settingsMap.has(field.id)) return settingsMap.get(field.id)
  return true
}

function buildFormSchema(fields, settingsMap) {
  const enriched = enrichWorkOrderFields(fields)
  const byId = new Map(enriched.map((row) => [row.id, row]))
  const sections = enriched
    .filter((f) => f.kind === 'section')
    .filter((f) => isFieldVisible(f, settingsMap))
    .map((section) => {
      const parents = enriched
        .filter((f) => f.kind === 'parent' && f.section_id === section.id)
        .filter((f) => isFieldVisible(f, settingsMap))
        .map((parent) => ({
          id: parent.id,
          name: parent.name,
          field_type: parent.field_type,
          field_source: parent.field_source || 'asset',
          sort_order: parent.sort_order,
          is_visible: true,
          is_required: Boolean(parent.is_required),
          dropdown_options: parent.dropdown_options || [],
          depends_on_parent_id: parent.depends_on_parent_id || null,
          depends_on_option: parent.depends_on_option || null,
          depends_on_parent_name: parent.depends_on_parent_id
            ? (byId.get(parent.depends_on_parent_id)?.name || null)
            : null,
          depends_on_section_name: parent.section_name || null,
        }))
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))

      return {
        id: section.id,
        name: section.name,
        sort_order: section.sort_order,
        is_visible: true,
        icon_path: section.icon_path || null,
        fields: parents,
      }
    })
    .filter((section) => section.fields.length > 0)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))

  return { sections }
}

async function attachSectionIconUrls(schema) {
  const sections = await Promise.all((schema.sections || []).map(async (section) => {
    if (!section.icon_path) return section
    const signedUrl = await getSignedUrl('org-assets', section.icon_path)
    if (!signedUrl) return section
    return { ...section, icon_signed_url: signedUrl }
  }))
  return { sections }
}

export async function buildManualWorkOrderFormSchema(orgId) {
  const [fields, settingsMap] = await Promise.all([
    loadOrgWorkOrderFields(orgId),
    loadFieldSettings(orgId),
  ])
  return attachSectionIconUrls(buildFormSchema(fields, settingsMap))
}
