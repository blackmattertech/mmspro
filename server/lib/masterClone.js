import { supabaseAdmin } from '../services/supabase.js'
import { enforceCloneOfId } from './recordClone.js'
import {
  masterCloneCompareKeys,
  resolveMasterCloneUniqueKeys,
  toMasterCloneComparable,
} from '../../shared/masterClone.js'

import {
  EQUIPMENT_CLONE_COMPARE_KEYS,
  EQUIPMENT_CLONE_UNIQUE_KEYS,
  toEquipmentCloneComparable,
} from '../../shared/masterClone.js'

/**
 * 2C duplicate guard for POST /equipment. Asset `code` is derived from the submitted
 * hierarchy values (or an explicit body.code), so the caller supplies the derivation.
 *
 * @param {object} options
 * @param {(id: string) => Promise<object|null>} options.loadSource equipment detail (with values)
 * @param {(body: object) => string} options.deriveCode asset code the create would produce
 * @param {(source: object) => void} [options.authorizeSource]
 * @returns {Promise<boolean>}
 */
export async function enforceEquipmentCloneOnCreate({
  res,
  body,
  loadSource,
  deriveCode,
  authorizeSource,
}) {
  const cloneOfId = body?.clone_of_id || body?.cloneOfId || null
  if (!cloneOfId) return true

  try {
    let source
    try {
      source = await loadSource(cloneOfId)
    } catch (err) {
      throw err?.status ? err : sourceNotFound()
    }
    if (!source) throw sourceNotFound()
    authorizeSource?.(source)

    const fieldIds = (body.values || []).map((item) => item?.field_id).filter(Boolean)
    const sourceComparable = toEquipmentCloneComparable(source, { code: source.code, fieldIds })
    const nextComparable = toEquipmentCloneComparable(body, { code: deriveCode(body), fieldIds })

    await enforceCloneOfId({
      body,
      loadSource: async () => source,
      toComparable: (record) => (record === source ? sourceComparable : nextComparable),
      uniqueKeys: sourceComparable.code ? EQUIPMENT_CLONE_UNIQUE_KEYS : [],
      compareKeys: EQUIPMENT_CLONE_COMPARE_KEYS,
    })
    return true
  } catch (err) {
    res.status(err.status || 400).json({
      error: err.message,
      ...(err.code === 'CLONE_UNCHANGED' ? { code: err.code } : {}),
    })
    return false
  }
}

function sourceNotFound() {
  const err = new Error('Source record for duplicate was not found.')
  err.status = 404
  return err
}

async function defaultLoadSource({ table, select, orgId, id }) {
  const { data, error } = await supabaseAdmin
    .from(table)
    .select(select)
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle()
  if (error) throw sourceNotFound()
  return data
}

/**
 * 2C duplicate guard for master create routes. No-op unless body.clone_of_id is present.
 * Sends the error response and returns false when the request must stop.
 *
 * @param {object} options
 * @param {import('express').Response} options.res
 * @param {string} options.orgId
 * @param {object} options.body
 * @param {string} options.kind one of MASTER_CLONE_KINDS
 * @param {string} options.table source table (ignored when loadSource is given)
 * @param {string} [options.select]
 * @param {(id: string) => Promise<object|null>} [options.loadSource]
 * @param {(source: object) => void} [options.authorizeSource] may throw (e.g. location scope)
 * @returns {Promise<boolean>}
 */
export async function enforceMasterCloneOnCreate({
  res,
  orgId,
  body,
  kind,
  table,
  select = '*',
  loadSource,
  authorizeSource,
}) {
  const cloneOfId = body?.clone_of_id || body?.cloneOfId || null
  if (!cloneOfId) return true

  try {
    const loader = loadSource
      || ((id) => defaultLoadSource({ table, select, orgId, id }))
    let source
    try {
      source = await loader(cloneOfId)
    } catch (err) {
      throw err?.status ? err : sourceNotFound()
    }
    if (!source) throw sourceNotFound()
    authorizeSource?.(source)

    await enforceCloneOfId({
      body,
      loadSource: async () => source,
      toComparable: (record) => toMasterCloneComparable(kind, record),
      uniqueKeys: resolveMasterCloneUniqueKeys(kind, source),
      compareKeys: masterCloneCompareKeys(kind),
    })
    return true
  } catch (err) {
    res.status(err.status || 400).json({
      error: err.message,
      ...(err.code === 'CLONE_UNCHANGED' ? { code: err.code } : {}),
    })
    return false
  }
}
