import { supabaseAdmin } from '../services/supabase.js'

function normalizePrefs(prefs) {
  if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) {
    return { order: [], hidden: [], known: [] }
  }
  return {
    order: Array.isArray(prefs.order) ? prefs.order.map(String) : [],
    hidden: Array.isArray(prefs.hidden) ? prefs.hidden.map(String) : [],
    known: Array.isArray(prefs.known) ? prefs.known.map(String) : [],
  }
}

export async function getTableColumnDefault(orgId, tableId) {
  if (!orgId || !tableId) return null
  const { data, error } = await supabaseAdmin
    .from('org_table_column_defaults')
    .select('table_id, prefs, version, updated_at')
    .eq('org_id', orgId)
    .eq('table_id', tableId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    table_id: data.table_id,
    prefs: normalizePrefs(data.prefs),
    version: Number(data.version) || 1,
    updated_at: data.updated_at,
  }
}

export async function upsertTableColumnDefault(orgId, tableId, prefs, profileId) {
  if (!orgId || !tableId) {
    const err = new Error('table_id is required')
    err.status = 400
    throw err
  }
  const existing = await getTableColumnDefault(orgId, tableId)
  const nextVersion = (existing?.version || 0) + 1
  const payload = {
    org_id: orgId,
    table_id: tableId,
    prefs: normalizePrefs(prefs),
    version: nextVersion,
    updated_by: profileId || null,
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await supabaseAdmin
    .from('org_table_column_defaults')
    .upsert(payload, { onConflict: 'org_id,table_id' })
    .select('table_id, prefs, version, updated_at')
    .single()
  if (error) throw error
  return {
    table_id: data.table_id,
    prefs: normalizePrefs(data.prefs),
    version: Number(data.version) || nextVersion,
    updated_at: data.updated_at,
  }
}
