import { assertCloneChanged } from './recordClone'

export {
  cloneUniqueKeysFor,
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
  CHECKLIST_CLONE_COMPARE_KEYS,
  toChecklistCloneComparable,
} from '../../../shared/workRecordClone.js'

import { cloneUniqueKeysFor } from '../../../shared/workRecordClone.js'

/** `navigate(path, { state: cloneNavState(id) })` */
export function cloneNavState(cloneFromId) {
  return { cloneFromId }
}

/** Read the source id passed through router location.state by a Duplicate action. */
export function readCloneFromId(location) {
  const id = location?.state?.cloneFromId
  return id ? String(id) : ''
}

/**
 * Run the client-side clone check. `toComparable` maps both records to the flat
 * comparable shape; unique keys are only enforced when the source has a value.
 */
export function checkCloneChanged({
  source,
  next,
  toComparable,
  uniqueKeys = [],
  compareKeys = [],
}) {
  const sourceComparable = toComparable(source)
  const nextComparable = toComparable(next)
  return assertCloneChanged({
    source: sourceComparable,
    next: nextComparable,
    uniqueKeys: cloneUniqueKeysFor(sourceComparable, uniqueKeys),
    compareKeys,
  })
}
