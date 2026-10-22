import { supabaseAdmin } from '../services/supabase.js'

/** Keep in sync with client/src/lib/moduleApprovals.js */
export const APPROVAL_MODULES = [
  {
    id: 'work_request',
    label: 'Work Request',
    hint: 'When on, inter-department requests wait for the department head. When off, the request is created immediately and a work order is generated.',
  },
  {
    id: 'work_orders',
    label: 'Work Orders',
    hint: 'When on, work orders require department head approval.',
  },
  {
    id: 'work_orders_scheduled',
    label: 'PM Schedule',
    hint: 'When on, PM schedules require department head approval.',
  },
  {
    id: 'tasks_followups',
    label: 'Tasks & Follow-ups',
    hint: 'When on, tasks require department head approval.',
  },
  {
    id: 'warranty_manager',
    label: 'Warranty Manager',
    hint: 'When on, warranties require department head approval.',
  },
]

export const APPROVAL_MODULE_IDS = APPROVAL_MODULES.map((mod) => mod.id)

const DEFAULT_REQUIRED = {
  work_request: true,
  work_orders: false,
  work_orders_scheduled: false,
  tasks_followups: false,
  warranty_manager: false,
}

export function isMissingModuleApprovalsColumn(error) {
  const msg = String(error?.message || '')
  return msg.includes('module_approvals') && /does not exist/i.test(msg)
}

export function normalizeModuleApprovals(raw, { workRequestFallback = true } = {}) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const next = {}
  for (const id of APPROVAL_MODULE_IDS) {
    if (typeof source[id] === 'boolean') next[id] = source[id]
    else if (id === 'work_request') next[id] = workRequestFallback !== false
    else next[id] = DEFAULT_REQUIRED[id]
  }
  return next
}

export function mergeModuleApprovals(current, patch) {
  const next = { ...normalizeModuleApprovals(current) }
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return next
  for (const id of APPROVAL_MODULE_IDS) {
    if (typeof patch[id] === 'boolean') next[id] = patch[id]
  }
  return next
}

export async function loadModuleApprovals(orgId) {
  const { data, error } = await supabaseAdmin
    .from('organizations')
    .select('module_approvals, work_request_inter_approval_required')
    .eq('id', orgId)
    .maybeSingle()

  if (error && isMissingModuleApprovalsColumn(error)) {
    const retry = await supabaseAdmin
      .from('organizations')
      .select('work_request_inter_approval_required')
      .eq('id', orgId)
      .maybeSingle()
    if (retry.error) throw retry.error
    return normalizeModuleApprovals({}, {
      workRequestFallback: retry.data?.work_request_inter_approval_required !== false,
    })
  }
  if (error) throw error
  return normalizeModuleApprovals(data?.module_approvals, {
    workRequestFallback: data?.work_request_inter_approval_required !== false,
  })
}
