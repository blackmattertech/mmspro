import { supabaseAdmin } from '../services/supabase.js'

function normalizeFieldName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Match Assets field "Job Nature" / "Job Natures" (user-configured dropdown). */
export function findJobNatureField(fields) {
  const candidates = (fields || []).filter((field) => {
    if (field?.kind === 'section') return false
    if (field?.kind === 'child') return false
    if (field?.is_active === false) return false
    const name = normalizeFieldName(field?.name)
    return name === 'job nature' || name === 'job natures'
  })
  const withOptions = candidates.find((field) => Array.isArray(field.dropdown_options) && field.dropdown_options.length)
  return withOptions || candidates[0] || null
}

export function jobNatureOptionsFromField(field) {
  if (!field) return []
  return (field.dropdown_options || [])
    .map((option) => String(option || '').trim())
    .filter(Boolean)
    .map((value) => ({ value, label: value }))
}

export function isBreakdownJobNature(value) {
  return String(value || '').trim().toLowerCase() === 'breakdown'
}

async function findNamedOptionParent(orgId, table, fieldSource) {
  const { data: parents, error } = await supabaseAdmin
    .from(table)
    .select('id, name, kind, is_active, field_type')
    .eq('org_id', orgId)
    .eq('kind', 'parent')
    .ilike('name', '%job nature%')
  if (error) throw error
  const parent = findJobNatureField(parents)
  if (!parent) return null

  const { data: children, error: childError } = await supabaseAdmin
    .from(table)
    .select('name, sort_order, is_active')
    .eq('org_id', orgId)
    .eq('parent_id', parent.id)
    .eq('kind', 'child')
  if (childError) throw childError

  const dropdown_options = (children || [])
    .filter((row) => row.is_active !== false)
    .sort((a, b) => (
      (a.sort_order ?? 0) - (b.sort_order ?? 0)
      || String(a.name || '').localeCompare(String(b.name || ''))
    ))
    .map((row) => String(row.name || '').trim())
    .filter(Boolean)
  return { ...parent, dropdown_options, field_source: fieldSource }
}

/** Prefer Assets Job Natures; fall back to Equipment fields with the same name. */
export async function resolveJobNatureField(orgId) {
  const fromAssets = await findNamedOptionParent(orgId, 'asset_fields', 'asset')
  if (fromAssets) return fromAssets
  return findNamedOptionParent(orgId, 'equipment_fields', 'equipment')
}
