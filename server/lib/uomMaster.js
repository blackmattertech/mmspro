import { supabaseAdmin } from '../services/supabase.js'

export const UOM_CODE_MAX = 40
export const UOM_NAME_MAX = 100

const CODE_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} .\/+-]*$/u

export function lookupUomKey(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toUpperCase()
}

export function isUomCodeKey(key) {
  return Boolean(key)
    && key.length <= UOM_CODE_MAX
    && !key.includes(',')
    && CODE_PATTERN.test(key)
}

export function normalizeUomCode(value) {
  const code = lookupUomKey(value)
  if (!code) {
    const err = new Error('UOM code is required')
    err.status = 400
    throw err
  }
  if (!isUomCodeKey(code)) {
    const err = new Error('UOM code can only use letters, numbers, spaces, and . / + -')
    err.status = 400
    throw err
  }
  return code
}

export function normalizeUomName(value) {
  const name = String(value || '').trim().replace(/\s+/g, ' ')
  if (!name) {
    const err = new Error('UOM name is required')
    err.status = 400
    throw err
  }
  if (name.length > UOM_NAME_MAX) {
    const err = new Error(`UOM name must be ${UOM_NAME_MAX} characters or fewer`)
    err.status = 400
    throw err
  }
  return name
}

/**
 * Map material-row units onto the org master.
 * Active master codes are stored in canonical form.
 * A value already saved on the previous rows is kept when it is not in the master,
 * so older free-text units can still be re-saved.
 */
export function applyUomMaster(rows, activeCodes, previousRows = []) {
  const active = new Map()
  for (const code of activeCodes || []) {
    const key = lookupUomKey(code)
    if (key) active.set(key, lookupUomKey(code))
  }

  const previous = new Map()
  for (const row of previousRows || []) {
    const raw = String(row?.uom || '').trim()
    const key = lookupUomKey(raw)
    if (key && !previous.has(key)) previous.set(key, raw)
  }

  return (rows || []).map((row) => {
    const raw = String(row?.uom || '').trim()
    if (!raw) return { ...row, uom: '' }
    const key = lookupUomKey(raw)
    if (active.has(key)) return { ...row, uom: active.get(key) }
    if (previous.has(key)) return { ...row, uom: previous.get(key) }
    const err = new Error(`Unknown unit of measure "${raw}". Add it in Masters → UOM, then select it here.`)
    err.status = 400
    throw err
  })
}

export async function canonicalizeStoredMaterials(orgId, rows, previousRows = []) {
  const list = Array.isArray(rows) ? rows : []
  const keys = [...new Set(
    list
      .map((row) => lookupUomKey(row?.uom))
      .filter((key) => isUomCodeKey(key)),
  )]
  if (!list.some((row) => String(row?.uom || '').trim())) return list
  if (!keys.length) return applyUomMaster(list, [], previousRows)

  const { data, error } = await supabaseAdmin
    .from('org_uoms')
    .select('code')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .in('code', keys)

  if (error) {
    const err = new Error(
      error.code === '42P01'
        ? 'UOM master is not set up yet. Apply the UOM master database patch.'
        : error.message,
    )
    err.status = 500
    throw err
  }

  return applyUomMaster(list, (data || []).map((row) => row.code), previousRows)
}
