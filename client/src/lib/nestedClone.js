import {
  assertNestedCloneChanged,
  buildNestedCloneDraft,
} from '../../../shared/nestedClone.js'

export {
  NESTED_CLONE_KINDS,
  nestedCloneCompareKeys,
  toNestedCloneComparable,
  resolveNestedCloneUniqueKeys,
  assertNestedCloneChanged,
  buildNestedCloneDraft,
  findDuplicateOptionLabel,
  permissionsSignature,
  slugifyCloneKey,
} from '../../../shared/nestedClone.js'

/**
 * Clone state for a nested list: `source` is the original row, `draft` is the id-less
 * prefill passed to the create form (carries `clone_of_id`).
 */
export function createNestedClone(kind, row, options) {
  if (!row?.id) return null
  return { source: row, draft: buildNestedCloneDraft(kind, row, options) }
}

/**
 * Run the duplicate check (client side) and attach `clone_of_id` before create.
 * Throws an Error with a user-facing message when nothing meaningful changed.
 * Without clone state the payload is returned untouched (normal create).
 */
export function prepareNestedCloneCreate(kind, clone, payload) {
  if (!clone?.source?.id) return payload
  const result = assertNestedCloneChanged(kind, clone.source, payload)
  if (!result.ok) throw new Error(result.message)
  return { ...payload, clone_of_id: clone.source.id }
}
