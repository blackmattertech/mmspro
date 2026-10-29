import { supabaseAdmin } from '../services/supabase.js'
import {
  resolveFormActors,
  partitionValuesByFillership,
  canEditFilledBy,
  buildFieldFillershipMap,
} from './formFillership.js'
import { hasModulePermission } from './orgPermissions.js'
import { isWorkOrderProcessForm } from './workOrderForms.js'

function httpError(message, status = 400) {
  const err = new Error(message)
  err.status = status
  return err
}

async function loadAssigneesForWorkOrder(workOrderId) {
  if (!workOrderId) return []
  const { data, error } = await supabaseAdmin
    .from('manual_work_order_assignees')
    .select('employee_id')
    .eq('work_order_id', workOrderId)
  if (error) return []
  return (data || []).map((row) => ({ id: row.employee_id }))
}

/**
 * Load minimal record fields needed to resolve fillership actors.
 */
export async function loadFillershipRecord(orgId, formId, recordId) {
  if (!orgId || !formId || !recordId) return null

  if (formId === 'work_request.create') {
    const { data, error } = await supabaseAdmin
      .from('work_requests')
      .select('id, requested_by, order_to_department_id, manual_work_order_id')
      .eq('org_id', orgId)
      .eq('id', recordId)
      .maybeSingle()
    if (error) throw error
    if (!data) return null
    const assignees = await loadAssigneesForWorkOrder(data.manual_work_order_id)
    return {
      requested_by: data.requested_by,
      order_to_department_id: data.order_to_department_id,
      assignees,
    }
  }

  if (formId === 'work_orders.manual' || isWorkOrderProcessForm(formId)) {
    const { data, error } = await supabaseAdmin
      .from('manual_work_orders')
      .select('id, created_by, assigned_department_id, supervisor_id, requester_id')
      .eq('org_id', orgId)
      .eq('id', recordId)
      .maybeSingle()
    if (error) throw error
    if (!data) return null
    const assignees = await loadAssigneesForWorkOrder(data.id)
    return {
      created_by: data.created_by,
      requested_by: data.requester_id,
      assigned_department_id: data.assigned_department_id,
      order_to_department_id: data.assigned_department_id,
      supervisor_id: data.supervisor_id,
      assignees,
    }
  }

  if (formId === 'pm.plan') {
    const { data, error } = await supabaseAdmin
      .from('pm_plans')
      .select('id, created_by')
      .eq('org_id', orgId)
      .eq('id', recordId)
      .maybeSingle()
    if (error) throw error
    if (!data) return null
    const { data: techRows } = await supabaseAdmin
      .from('pm_plan_technicians')
      .select('employee_id')
      .eq('org_id', orgId)
      .eq('plan_id', recordId)
    return {
      created_by: data.created_by,
      technician_ids: (techRows || []).map((row) => row.employee_id).filter(Boolean),
    }
  }

  if (formId === 'warranty.warranty') {
    const { data, error } = await supabaseAdmin
      .from('warranties')
      .select('id')
      .eq('org_id', orgId)
      .eq('id', recordId)
      .maybeSingle()
    if (error) throw error
    if (!data) return null
    // Warranty rows are typically single-actor; treat updater as creator when unknown
    return { created_by: null }
  }

  return null
}

export function actorsFromRequest(req, record, { isCreate = false, formId = null } = {}) {
  const perms = req.orgPermissions || {}
  return resolveFormActors({
    formId,
    isOrgAdmin: Boolean(perms.is_org_admin),
    profileId: req.userProfile?.id || null,
    employeeId: perms.employee_id || null,
    isDepartmentHead: Boolean(perms.is_department_head),
    employeeDepartmentId: perms.department_id || null,
    canApproveIncoming: hasModulePermission(perms, 'work_request_approve', 'update')
      || hasModulePermission(perms, 'work_request_incoming', 'update'),
    isSupervisor: Boolean(perms.is_org_admin)
      || hasModulePermission(perms, 'work_orders_approve', 'update')
      || Boolean(record?.supervisor_id && req.userProfile?.id && String(record.supervisor_id) === String(req.userProfile.id)),
    record,
    isCreate,
  })
}

/**
 * Merge incoming values with existing under fillership rules.
 * Rejects (throws 403) when the caller changes a field they cannot fill.
 */
export async function mergeFormFieldValuesWithFillership({
  orgId,
  formId,
  recordId,
  values,
  layout,
  actors,
  listFormFieldValues,
  upsertFormFieldValues,
}) {
  if (!layout || !actors) {
    return upsertFormFieldValues(orgId, formId, recordId, values)
  }

  const existing = await listFormFieldValues(orgId, formId, recordId)
  const map = buildFieldFillershipMap(layout)
  const forbiddenChanges = []

  for (const [fieldId, nextValue] of Object.entries(values || {})) {
    const filledBy = map.get(fieldId) || 'any'
    if (canEditFilledBy(filledBy, actors)) continue
    const prev = existing[fieldId]
    const same = JSON.stringify(prev ?? null) === JSON.stringify(nextValue ?? null)
    if (!same) forbiddenChanges.push(fieldId)
  }

  if (forbiddenChanges.length) {
    throw httpError(
      `You cannot edit fields reserved for another role (${forbiddenChanges.slice(0, 3).join(', ')})`,
      403,
    )
  }

  const { allowed } = partitionValuesByFillership(layout, values, actors)
  const merged = { ...existing, ...allowed }
  return upsertFormFieldValues(orgId, formId, recordId, merged)
}
