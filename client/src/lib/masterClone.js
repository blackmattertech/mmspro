import {
  assertMasterCloneChanged,
  buildMasterCloneDraft,
} from '../../../shared/masterClone.js'

export {
  MASTER_CLONE_KINDS,
  masterCloneCompareKeys,
  toMasterCloneComparable,
  resolveMasterCloneUniqueKeys,
  assertMasterCloneChanged,
  buildMasterCloneDraft,
  EQUIPMENT_CLONE_UNIQUE_KEYS,
  EQUIPMENT_CLONE_COMPARE_KEYS,
  EQUIPMENT_CLONE_OMIT,
  equipmentValueText,
  toEquipmentCloneComparable,
  assertEquipmentCloneChanged,
} from '../../../shared/masterClone.js'

/**
 * Clone state for a master tab: `source` is the original row, `draft` is the id-less
 * prefill passed to the create modal (carries `clone_of_id`).
 */
export function createMasterClone(kind, row, options) {
  if (!row?.id) return null
  return { source: row, draft: buildMasterCloneDraft(kind, row, options) }
}

/**
 * Run the 2C duplicate check (client side) and attach `clone_of_id` before create.
 * Throws an Error with a user-facing message when nothing meaningful changed.
 * Without clone state the payload is returned untouched (normal create).
 */
export function prepareMasterCloneCreate(kind, clone, payload) {
  if (!clone?.source?.id) return payload
  const result = assertMasterCloneChanged(kind, clone.source, payload)
  if (!result.ok) throw new Error(result.message)
  return { ...payload, clone_of_id: clone.source.id }
}
