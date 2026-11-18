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
} from '../../../shared/recordClone.js'

/** Build a create-modal draft from an existing PM plan (no id / plan_number). */
export function buildPmPlanCloneDraft(plan) {
  if (!plan) return { __clone: true }
  const technicianIds = Array.isArray(plan.technician_ids)
    ? plan.technician_ids
    : (plan.technicians || []).map((row) => row.id).filter(Boolean)
  return buildCloneDraft(plan, {
    omit: [
      'plan_number',
      'next_due_at',
      'last_generated_at',
      'last_generated_due_at',
      'last_due_notice_on',
      'technicians',
      'department',
      'location',
      'area',
      'equipment',
      'activity_type',
      'audit',
      'open_work_order_count',
    ],
    map: (base) => ({
      ...base,
      name: String(base.name || '').trim(),
      technician_ids: technicianIds.map(String),
      status: base.status === 'inactive' ? 'inactive' : 'inactive',
    }),
    defaults: {
      clone_of_id: plan.id,
      __clone: true,
    },
  })
}
