import { supabaseAdmin } from '../services/supabase.js'
import { ilikePattern } from './listQuery.js'

export const NO_MATCH_ID = '00000000-0000-0000-0000-000000000000'

export async function idsByIlike(table, orgId, column, value) {
  const pattern = ilikePattern(value)
  if (!pattern) return []
  const { data, error } = await supabaseAdmin
    .from(table)
    .select('id')
    .eq('org_id', orgId)
    .ilike(column, pattern)
  if (error) throw error
  return (data || []).map((row) => row.id).filter(Boolean)
}

export function restrictToIds(query, column, ids) {
  const list = (ids || []).filter(Boolean)
  return query.in(column, list.length ? list : [NO_MATCH_ID])
}

/** Match the words "active" / "inactive" the same way a contains-filter does. */
export function applyActiveStatusTextFilter(query, value) {
  const term = String(value || '').trim().toLowerCase()
  if (!term) return query
  const matchActive = 'active'.includes(term)
  const matchInactive = 'inactive'.includes(term)
  if (matchActive && matchInactive) return query
  if (matchActive) return query.eq('is_active', true)
  if (matchInactive) return query.eq('is_active', false)
  return query.eq('id', NO_MATCH_ID)
}

export function labelMatches(query, label) {
  const term = String(query || '').trim().toLowerCase()
  if (!term) return false
  return String(label || '').toLowerCase().includes(term)
}
