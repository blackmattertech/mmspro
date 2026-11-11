import { apiFetch, apiFetchBlob } from './api'
import { asListArray, listQueryParams } from './listResponse'

export function workOrdersFetch(path, options = {}) {
  return apiFetch(`/api/work-orders${path}`, options)
}

export function getManualWorkOrderForm() {
  return workOrdersFetch('/manual/form')
}

export function getManualWorkOrderFormSettings() {
  return workOrdersFetch('/manual/form-settings')
}

export function updateManualWorkOrderFormSettings(settings, { sectionIds } = {}) {
  const body = {}
  if (settings !== undefined) body.settings = settings
  if (sectionIds !== undefined) body.section_ids = sectionIds
  return workOrdersFetch('/manual/form-settings', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

function manualWorkOrderBody(payload = {}) {
  const body = {
    status: payload.status,
    values: payload.values,
    assigned_employee_ids: payload.assignedEmployeeIds || [],
    assigned_department_id: payload.assignedDepartmentId || null,
    assigned_location_id: payload.assignedLocationId || null,
    short_description: payload.shortDescription || null,
    problem_description: payload.problemDescription || null,
    priority: payload.priority || undefined,
    equipment_id: payload.equipmentId || null,
    work_center: payload.workCenter || null,
    special_instructions: payload.specialInstructions || null,
    planned_start_at: payload.plannedStartAt || null,
    planned_end_at: payload.plannedEndAt || null,
    attachments: payload.attachments || [],
    is_breakdown: Boolean(payload.isBreakdown),
    form_field_values: payload.formFieldValues || {},
    checklist_template_id: payload.checklist_template_id || null,
    vendor_id: payload.vendorId || null,
    vendor_expense: payload.vendorExpense ?? null,
    labour_count: payload.labourCount ?? null,
    work_start_at: payload.workStartAt || null,
    work_end_at: payload.workEndAt || null,
    job_description: payload.jobDescription || null,
    root_cause: payload.rootCause || null,
    action_taken: payload.actionTaken || null,
    special_tools_used: payload.specialToolsUsed || null,
    safety_precautions: payload.safetyPrecautions || null,
    lessons_learned: payload.lessonsLearned || null,
    execution_remarks: payload.executionRemarks || null,
    material_consumed: payload.materialConsumed || null,
    permit_required: Boolean(payload.permitRequired),
    permit_types: payload.permitTypes || [],
    permit_number: payload.permitNumber || null,
    permit_issue_at: payload.permitIssueAt || null,
    permit_expiry_at: payload.permitExpiryAt || null,
    client_request_id: payload.clientRequestId || null,
  }
  return body
}

export function createManualWorkOrder(payload = {}) {
  return workOrdersFetch('/manual', {
    method: 'POST',
    body: JSON.stringify(manualWorkOrderBody(payload)),
  })
}

export function getWorkOrdersTemplate() {
  return workOrdersFetch('/manual/template')
}

export function bulkUploadWorkOrders(base64Data) {
  return workOrdersFetch('/manual/import', {
    method: 'POST',
    body: JSON.stringify({ data: base64Data }),
  })
}

export function updateManualWorkOrderValues(workOrderId, values) {
  return workOrdersFetch(`/manual/${workOrderId}/values`, {
    method: 'PATCH',
    body: JSON.stringify({ values }),
  })
}

export function updateManualWorkOrder(workOrderId, payload = {}) {
  const mapped = {}
  if (payload.status !== undefined) mapped.status = payload.status
  if (payload.values !== undefined) mapped.values = payload.values
  if (payload.assignedEmployeeIds !== undefined) mapped.assigned_employee_ids = payload.assignedEmployeeIds
  if (payload.assignedDepartmentId !== undefined) mapped.assigned_department_id = payload.assignedDepartmentId
  if (payload.assignedLocationId !== undefined) mapped.assigned_location_id = payload.assignedLocationId
  if (payload.shortDescription !== undefined) mapped.short_description = payload.shortDescription || null
  if (payload.problemDescription !== undefined) mapped.problem_description = payload.problemDescription || null
  if (payload.priority !== undefined) mapped.priority = payload.priority || null
  if (payload.equipmentId !== undefined) mapped.equipment_id = payload.equipmentId || null
  if (payload.workCenter !== undefined) mapped.work_center = payload.workCenter || null
  if (payload.specialInstructions !== undefined) mapped.special_instructions = payload.specialInstructions || null
  if (payload.plannedStartAt !== undefined) mapped.planned_start_at = payload.plannedStartAt || null
  if (payload.plannedEndAt !== undefined) mapped.planned_end_at = payload.plannedEndAt || null
  if (payload.attachments !== undefined) mapped.attachments = payload.attachments || []
  if (payload.isBreakdown !== undefined) mapped.is_breakdown = Boolean(payload.isBreakdown)
  if (payload.formFieldValues !== undefined) mapped.form_field_values = payload.formFieldValues || {}
  if (payload.checklist_template_id !== undefined) mapped.checklist_template_id = payload.checklist_template_id || null
  if (payload.vendorId !== undefined) mapped.vendor_id = payload.vendorId || null
  if (payload.vendorExpense !== undefined) mapped.vendor_expense = payload.vendorExpense
  if (payload.labourCount !== undefined) mapped.labour_count = payload.labourCount
  if (payload.workStartAt !== undefined) mapped.work_start_at = payload.workStartAt || null
  if (payload.workEndAt !== undefined) mapped.work_end_at = payload.workEndAt || null
  if (payload.jobDescription !== undefined) mapped.job_description = payload.jobDescription || null
  if (payload.rootCause !== undefined) mapped.root_cause = payload.rootCause || null
  if (payload.actionTaken !== undefined) mapped.action_taken = payload.actionTaken || null
  if (payload.specialToolsUsed !== undefined) mapped.special_tools_used = payload.specialToolsUsed || null
  if (payload.safetyPrecautions !== undefined) mapped.safety_precautions = payload.safetyPrecautions || null
  if (payload.lessonsLearned !== undefined) mapped.lessons_learned = payload.lessonsLearned || null
  if (payload.executionRemarks !== undefined) mapped.execution_remarks = payload.executionRemarks || null
  if (payload.materialConsumed !== undefined) mapped.material_consumed = payload.materialConsumed || null
  if (payload.permitRequired !== undefined) mapped.permit_required = Boolean(payload.permitRequired)
  if (payload.permitTypes !== undefined) mapped.permit_types = payload.permitTypes || []
  if (payload.permitNumber !== undefined) mapped.permit_number = payload.permitNumber || null
  if (payload.permitIssueAt !== undefined) mapped.permit_issue_at = payload.permitIssueAt || null
  if (payload.permitExpiryAt !== undefined) mapped.permit_expiry_at = payload.permitExpiryAt || null

  return workOrdersFetch(`/manual/${workOrderId}`, {
    method: 'PATCH',
    body: JSON.stringify(mapped),
  })
}

export function deleteManualWorkOrder(workOrderId) {
  return workOrdersFetch(`/manual/${workOrderId}`, { method: 'DELETE' })
}

export async function getReceivedWorkOrders({ search, limit = 50, offset = 0, ...rest } = {}) {
  const data = await workOrdersFetch(`/received${listQueryParams({ search, limit, offset, ...rest })}`)
  return asListArray(data)
}

export function getReceivedWorkOrder(id) {
  return workOrdersFetch(`/received/${id}`)
}

export async function getAssignedWorkOrders({ search, limit = 50, offset = 0, ...rest } = {}) {
  const data = await workOrdersFetch(`/assigned${listQueryParams({ search, limit, offset, ...rest })}`)
  return asListArray(data)
}

export function getAssignedWorkOrder(id) {
  return workOrdersFetch(`/assigned/${id}`)
}

export async function getScheduledWorkOrders({ search, limit = 50, offset = 0, ...rest } = {}) {
  const data = await workOrdersFetch(`/scheduled${listQueryParams({ search, limit, offset, ...rest })}`)
  return asListArray(data)
}

export function getScheduledWorkOrder(id) {
  return workOrdersFetch(`/scheduled/${id}`)
}

export async function getManualWorkOrders({ search, limit = 50, offset = 0, ...rest } = {}) {
  const data = await workOrdersFetch(`/manual/orders${listQueryParams({ search, limit, offset, ...rest })}`)
  return asListArray(data)
}

export function exportWorkOrderList(path, params = {}) {
  return apiFetchBlob(`/api/work-orders${path}${listQueryParams({ ...params, exportCsv: true })}`)
}

export function getManualWorkOrder(id) {
  return workOrdersFetch(`/manual/orders/${id}`)
}

/** Load a work order the viewer can read, even when a list-specific endpoint hides it. */
export async function getWorkOrderDetail(id, { prefer } = {}) {
  const loaders = []
  const pushUnique = (fn) => {
    if (typeof fn === 'function' && !loaders.includes(fn)) loaders.push(fn)
  }
  pushUnique(prefer)
  pushUnique(getReceivedWorkOrder)
  pushUnique(getAssignedWorkOrder)
  pushUnique(getManualWorkOrder)
  let lastError = null
  for (const load of loaders) {
    try {
      return await load(id)
    } catch (err) {
      lastError = err
      if (err?.status && err.status !== 404) throw err
    }
  }
  throw lastError || new Error('Not found')
}

export function updateWorkOrderAssignment(workOrderId, payload) {
  return workOrdersFetch(`/manual/${workOrderId}/assignment`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function updateWorkOrderLifecycle(workOrderId, payload) {
  return workOrdersFetch(`/manual/${workOrderId}/lifecycle`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function getWorkOrderDailyLogs(workOrderId) {
  return workOrdersFetch(`/manual/${workOrderId}/daily-logs`)
}

export function startWorkOrderDay(workOrderId, payload = {}) {
  return workOrdersFetch(`/manual/${workOrderId}/daily-logs/start-day`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateWorkOrderDailyLog(workOrderId, logId, payload) {
  return workOrdersFetch(`/manual/${workOrderId}/daily-logs/${logId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function endWorkOrderDay(workOrderId, logId, payload = {}) {
  return workOrdersFetch(`/manual/${workOrderId}/daily-logs/${logId}/end-day`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getWorkOrderCounts() {
  return workOrdersFetch('/counts')
}

const dashboardInflight = new Map()

export function getDashboardWorkOrders({ locationId, dateFrom, dateTo } = {}) {
  const params = new URLSearchParams()
  if (locationId && locationId !== 'all') params.set('location_id', locationId)
  if (dateFrom) params.set('date_from', dateFrom)
  if (dateTo) params.set('date_to', dateTo)
  const qs = params.toString()
  const key = qs || 'all'
  const existing = dashboardInflight.get(key)
  if (existing) return existing
  const request = workOrdersFetch(`/dashboard${qs ? `?${qs}` : ''}`).finally(() => {
    dashboardInflight.delete(key)
  })
  dashboardInflight.set(key, request)
  return request
}
