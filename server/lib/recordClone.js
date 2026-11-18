import {
  CLONE_UNCHANGED_MESSAGE,
  CLONE_UNIQUE_KEY_MESSAGE,
  PM_PLAN_CLONE_UNIQUE_KEYS,
  PM_PLAN_CLONE_COMPARE_KEYS,
  normalizeCloneValue,
  pickCloneFields,
  normalizeClonePayload,
  clonePayloadsEqual,
  uniqueKeysUnchanged,
  assertCloneChanged,
  stripIdentity,
  buildCloneDraft,
  CloneUnchangedError,
  throwIfCloneUnchanged,
} from '../../shared/recordClone.js'

export {
  CLONE_UNCHANGED_MESSAGE,
  CLONE_UNIQUE_KEY_MESSAGE,
  PM_PLAN_CLONE_UNIQUE_KEYS,
  PM_PLAN_CLONE_COMPARE_KEYS,
  normalizeCloneValue,
  pickCloneFields,
  normalizeClonePayload,
  clonePayloadsEqual,
  uniqueKeysUnchanged,
  assertCloneChanged,
  stripIdentity,
  buildCloneDraft,
  CloneUnchangedError,
  throwIfCloneUnchanged,
}

/**
 * Run 2C clone checks when body.clone_of_id is present.
 * `loadSource(id)` must return the source record (same org) or throw/return null.
 * `toComparable(record)` maps DB/API row or request body → fields for uniqueKeys/compareKeys.
 */
export async function enforceCloneOfId({
  body,
  loadSource,
  toComparable = (row) => row,
  uniqueKeys = [],
  compareKeys = [],
}) {
  const cloneOfId = body?.clone_of_id || body?.cloneOfId || null
  if (!cloneOfId) return null

  const sourceRow = await loadSource(cloneOfId)
  if (!sourceRow) {
    const err = new Error('Source record for duplicate was not found.')
    err.status = 404
    throw err
  }

  const source = toComparable(sourceRow)
  const next = toComparable(body)
  throwIfCloneUnchanged({ source, next, uniqueKeys, compareKeys })
  return sourceRow
}
