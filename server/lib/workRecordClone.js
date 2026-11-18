import { enforceCloneOfId } from './recordClone.js'
import { cloneUniqueKeysFor } from '../../shared/workRecordClone.js'

export {
  MANUAL_WO_CLONE_UNIQUE_KEYS,
  MANUAL_WO_CLONE_COMPARE_KEYS,
  toManualWorkOrderCloneComparable,
  WORK_REQUEST_CLONE_UNIQUE_KEYS,
  WORK_REQUEST_CLONE_COMPARE_KEYS,
  toWorkRequestCloneComparable,
  TASK_CLONE_UNIQUE_KEYS,
  TASK_CLONE_COMPARE_KEYS,
  toTaskCloneComparable,
  WARRANTY_CLONE_UNIQUE_KEYS,
  WARRANTY_CLONE_COMPARE_KEYS,
  toWarrantyCloneComparable,
  CHECKLIST_CLONE_UNIQUE_KEYS,
  CHECKLIST_CLONE_SERVER_COMPARE_KEYS,
  toChecklistCloneComparable,
} from '../../shared/workRecordClone.js'

/**
 * Wrapper around enforceCloneOfId that only requires unique keys the source
 * record actually has a value for. No-op when body.clone_of_id is absent.
 * `loadSource` must be org-scoped and return null when the record is missing
 * (enforceCloneOfId then responds with a 404).
 */
export async function enforceWorkRecordClone({
  body,
  loadSource,
  toComparable,
  uniqueKeys = [],
  compareKeys = [],
}) {
  const cloneOfId = body?.clone_of_id || body?.cloneOfId || null
  if (!cloneOfId) return null

  const sourceRow = await loadSource(cloneOfId)
  const resolvedUniqueKeys = sourceRow
    ? cloneUniqueKeysFor(toComparable(sourceRow), uniqueKeys)
    : []

  return enforceCloneOfId({
    body,
    loadSource: async () => sourceRow,
    toComparable,
    uniqueKeys: resolvedUniqueKeys,
    compareKeys,
  })
}
