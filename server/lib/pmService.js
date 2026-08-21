import { supabaseAdmin } from '../services/supabase.js'
import { notifyEmployees, notifyUser } from '../services/notifications.js'
import {
  generateWorkOrderNumber,
  addWorkOrderTimelineEvent,
  addWorkOrderAuditEntry,
} from './workOrderService.js'
import { snapshotChecklistTemplate } from './checklistService.js'
import { isMaintenanceDepartment } from './bulkMasterMatch.js'
import {
  DEFAULT_ACTIVITY_TYPES,
  PM_PRIORITIES,
  PM_PLAN_STATUSES,
  PM_SCHEDULE_TYPES,
  WO_OPEN_FOR_PLAN,
} from './pmConstants.js'
import {
  computeNextDueDate,
  formatDateOnly,
  generateOnOrBefore,
  initialDueDate,
  isCalendarSchedule,
  isOverdue,
} from './pmSchedule.js'

const PLAN_SELECT = `
  id, org_id, plan_number, name, department_id, location_id, area_id, equipment_id,
  activity_type_id, work_center, priority, status, schedule_type, every_n,
  start_date, end_date, grace_days, generate_before_days, working_shift,
  next_due_at, last_generated_at, last_generated_due_at, last_due_notice_on,
  checklist_template_id, contractor_vendor_id, estimated_labour_hours,
  estimated_duration_hours, required_tools, required_skills, allow_multiple_open,
  created_by, updated_by, created_at, updated_at,
  departments(id, name, code),
  org_locations(id, name),
  areas(id, name),
  equipment(id, name, code),
  pm_activity_types(id, name),
  checklist_templates(id, name, version),
  contractor:vendors!contractor_vendor_id(id, name)
`

function httpError(message, status = 400) {
  const err = new Error(message)
  err.status = status
  return err
}

function sanitizeDeptCode(code) {
  return String(code || 'GEN')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6) || 'GEN'
}

function formatSeqDate(date = new Date()) {
  const yy = String(date.getUTCFullYear()).slice(-2)
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(date.getUTCDate()).padStart(2, '0')
  return { label: `${yy}${mm}${dd}`, iso: date.toISOString().slice(0, 10) }
}

async function generatePmPlanNumber(orgId, departmentId) {
  const { data: dept, error: deptError } = await supabaseAdmin
    .from('departments')
    .select('code')
    .eq('org_id', orgId)
    .eq('id', departmentId)
    .maybeSingle()

  if (deptError) throw deptError
  const code = sanitizeDeptCode(dept?.code)
  const { label, iso } = formatSeqDate()

  const { data: existing, error: readError } = await supabaseAdmin
    .from('pm_plan_daily_sequences')
    .select('last_number')
    .eq('org_id', orgId)
    .eq('department_id', departmentId)
    .eq('seq_date', iso)
    .maybeSingle()

  if (readError) throw readError

  const next = (existing?.last_number || 0) + 1
  const { error: upsertError } = await supabaseAdmin
    .from('pm_plan_daily_sequences')
    .upsert(
      {
        org_id: orgId,
        department_id: departmentId,
        seq_date: iso,
        last_number: next,
      },
      { onConflict: 'org_id,department_id,seq_date' },
    )

  if (upsertError) throw upsertError
  return `PM-${code}-${label}-${String(next).padStart(4, '0')}`
}

async function addPlanAudit(orgId, planId, actorId, action, previousValue, newValue, remarks = null) {
  const { error } = await supabaseAdmin.from('pm_plan_audit').insert({
    org_id: orgId,
    plan_id: planId,
    actor_id: actorId || null,
    action,
    previous_value: previousValue || null,
    new_value: newValue || null,
    remarks,
  })
  if (error) throw error
}

export async function ensureActivityTypesForOrg(orgId) {
  const { count, error } = await supabaseAdmin
    .from('pm_activity_types')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)

  if (error) throw error
  if (count) return

  const { error: insertError } = await supabaseAdmin.from('pm_activity_types').insert(
    DEFAULT_ACTIVITY_TYPES.map((row) => ({ ...row, org_id: orgId, is_system: true })),
  )
  if (insertError) throw insertError
}

export async function listActivityTypes(orgId, { includeInactive = false } = {}) {
  await ensureActivityTypesForOrg(orgId)
  let query = supabaseAdmin
    .from('pm_activity_types')
    .select('*')
    .eq('org_id', orgId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (!includeInactive) query = query.eq('is_active', true)
  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function createActivityType(orgId, body = {}) {
  const name = String(body.name || '').trim()
  if (!name) throw httpError('Activity type name is required.')

  const { data, error } = await supabaseAdmin
    .from('pm_activity_types')
    .insert({
      org_id: orgId,
      name,
      description: String(body.description || '').trim() || null,
      is_active: body.is_active !== false,
      is_system: false,
      sort_order: Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 200,
    })
    .select('*')
    .single()

  if (error) {
    if (error.code === '23505') throw httpError('An activity type with this name already exists.')
    throw error
  }
  return data
}

export async function updateActivityType(orgId, id, body = {}) {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from('pm_activity_types')
    .select('*')
    .eq('org_id', orgId)
    .eq('id', id)
    .maybeSingle()

  if (existingError) throw existingError
  if (!existing) throw httpError('Activity type not found.', 404)

  const patch = { updated_at: new Date().toISOString() }
  if (body.name !== undefined) {
    const name = String(body.name || '').trim()
    if (!name) throw httpError('Activity type name is required.')
    patch.name = name
  }
  if (body.description !== undefined) patch.description = String(body.description || '').trim() || null
  if (body.is_active !== undefined) patch.is_active = Boolean(body.is_active)
  if (body.sort_order !== undefined) patch.sort_order = Number(body.sort_order) || 0

  const { data, error } = await supabaseAdmin
    .from('pm_activity_types')
    .update(patch)
    .eq('id', id)
    .eq('org_id', orgId)
    .select('*')
    .single()

  if (error) {
    if (error.code === '23505') throw httpError('An activity type with this name already exists.')
    throw error
  }
  return data
}

export async function deleteActivityType(orgId, id) {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from('pm_activity_types')
    .select('id, is_system')
    .eq('org_id', orgId)
    .eq('id', id)
    .maybeSingle()

  if (existingError) throw existingError
  if (!existing) throw httpError('Activity type not found.', 404)
  if (existing.is_system) {
    throw httpError('System activity types cannot be deleted. Deactivate them instead.', 409)
  }

  const { count, error: countError } = await supabaseAdmin
    .from('pm_plans')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('activity_type_id', id)

  if (countError) throw countError
  if (count) throw httpError('This activity type is used by one or more PM plans.', 409)

  const { error } = await supabaseAdmin
    .from('pm_activity_types')
    .delete()
    .eq('org_id', orgId)
    .eq('id', id)

  if (error) throw error
}

async function loadTechnicians(orgId, planIds) {
  if (!planIds.length) return new Map()
  const { data, error } = await supabaseAdmin
    .from('pm_plan_technicians')
    .select(`
      plan_id,
      employee_id,
      org_employees(id, name, emp_id, photo_url, department_id, location_id)
    `)
    .eq('org_id', orgId)
    .in('plan_id', planIds)

  if (error) throw error
  const map = new Map()
  for (const row of data || []) {
    const employee = row.org_employees
    if (!employee) continue
    if (!map.has(row.plan_id)) map.set(row.plan_id, [])
    map.get(row.plan_id).push({
      id: employee.id,
      name: employee.name,
      emp_id: employee.emp_id,
      photo_url: employee.photo_url || null,
      department_id: employee.department_id || null,
      location_id: employee.location_id || null,
    })
  }
  return map
}

function mapPlanRow(row, technicians = []) {
  return {
    ...row,
    department: row.departments || null,
    location: row.org_locations || null,
    area: row.areas || null,
    equipment: row.equipment || null,
    activity_type: row.pm_activity_types || null,
    checklist_template: row.checklist_templates || null,
    contractor: row.contractor || null,
    technicians,
    departments: undefined,
    org_locations: undefined,
    areas: undefined,
    pm_activity_types: undefined,
    checklist_templates: undefined,
  }
}

async function syncPlanTechnicians(orgId, planId, employeeIds, { locationId } = {}) {
  const { error: deleteError } = await supabaseAdmin
    .from('pm_plan_technicians')
    .delete()
    .eq('org_id', orgId)
    .eq('plan_id', planId)

  if (deleteError) throw deleteError
  const unique = [...new Set((employeeIds || []).filter(Boolean))]
  if (!unique.length) return []

  const { data: employees, error: empError } = await supabaseAdmin
    .from('org_employees')
    .select('id, location_id, departments!department_id(id, name, code)')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .in('id', unique)

  if (empError) throw empError
  if ((employees || []).length !== unique.length) {
    throw httpError('One or more technicians are invalid or inactive.')
  }
  const invalid = (employees || []).find((employee) => (
    !isMaintenanceDepartment(employee.departments)
    || (locationId && employee.location_id && employee.location_id !== locationId)
  ))
  if (invalid) {
    throw httpError('Default technicians must be maintenance team members at the selected location.')
  }

  const { error } = await supabaseAdmin.from('pm_plan_technicians').insert(
    unique.map((employeeId) => ({
      org_id: orgId,
      plan_id: planId,
      employee_id: employeeId,
    })),
  )
  if (error) throw error
  return unique
}

function normalizePlanPayload(body, existing = null) {
  const name = String(body.name ?? existing?.name ?? '').trim()
  if (!name) throw httpError('PM plan name is required.')

  const departmentId = body.department_id ?? existing?.department_id
  if (!departmentId) throw httpError('Department is required.')

  const activityTypeId = body.activity_type_id ?? existing?.activity_type_id
  if (!activityTypeId) throw httpError('Maintenance activity type is required.')

  const scheduleType = String(body.schedule_type ?? existing?.schedule_type ?? 'monthly')
  if (!PM_SCHEDULE_TYPES.includes(scheduleType)) {
    throw httpError('Invalid schedule type.')
  }

  const startDate = formatDateOnly(body.start_date ?? existing?.start_date)
  if (!startDate) throw httpError('Start date is required.')

  const priority = String(body.priority ?? existing?.priority ?? 'medium')
  if (!PM_PRIORITIES.includes(priority)) throw httpError('Invalid priority.')

  const status = String(body.status ?? existing?.status ?? 'inactive')
  if (!PM_PLAN_STATUSES.includes(status)) throw httpError('Invalid status.')

  const generateBefore = Number(body.generate_before_days ?? existing?.generate_before_days ?? 1)
  if (!Number.isFinite(generateBefore) || generateBefore < 0) {
    throw httpError('Generate before due must be a number of days.')
  }

  return {
    name,
    department_id: departmentId,
    location_id: body.location_id !== undefined ? (body.location_id || null) : (existing?.location_id || null),
    area_id: body.area_id !== undefined ? (body.area_id || null) : (existing?.area_id || null),
    equipment_id: body.equipment_id !== undefined ? (body.equipment_id || null) : (existing?.equipment_id || null),
    activity_type_id: activityTypeId,
    work_center: String(body.work_center ?? existing?.work_center ?? '').trim() || 'General',
    priority,
    status,
    schedule_type: scheduleType,
    every_n: Math.max(1, Number(body.every_n ?? existing?.every_n ?? 1) || 1),
    start_date: startDate,
    end_date: formatDateOnly(body.end_date !== undefined ? body.end_date : existing?.end_date),
    grace_days: body.grace_days === '' || body.grace_days == null
      ? (existing?.grace_days ?? null)
      : Number(body.grace_days),
    generate_before_days: generateBefore,
    working_shift: String(body.working_shift ?? existing?.working_shift ?? '').trim() || null,
    checklist_template_id: body.checklist_template_id !== undefined
      ? (body.checklist_template_id || null)
      : (existing?.checklist_template_id || null),
    contractor_vendor_id: body.contractor_vendor_id !== undefined
      ? (body.contractor_vendor_id || null)
      : (existing?.contractor_vendor_id || null),
    estimated_labour_hours: body.estimated_labour_hours === '' || body.estimated_labour_hours == null
      ? (existing?.estimated_labour_hours ?? null)
      : Number(body.estimated_labour_hours),
    estimated_duration_hours: body.estimated_duration_hours === '' || body.estimated_duration_hours == null
      ? (existing?.estimated_duration_hours ?? null)
      : Number(body.estimated_duration_hours),
    required_tools: body.required_tools !== undefined
      ? (String(body.required_tools || '').trim() || null)
      : (existing?.required_tools || null),
    required_skills: body.required_skills !== undefined
      ? (String(body.required_skills || '').trim() || null)
      : (existing?.required_skills || null),
    allow_multiple_open: body.allow_multiple_open !== undefined
      ? Boolean(body.allow_multiple_open)
      : Boolean(existing?.allow_multiple_open),
  }
}

async function resolveLocationId(orgId, payload) {
  if (payload.location_id) return payload.location_id
  if (payload.equipment_id) {
    const { data } = await supabaseAdmin
      .from('equipment')
      .select('location_id')
      .eq('org_id', orgId)
      .eq('id', payload.equipment_id)
      .maybeSingle()
    if (data?.location_id) return data.location_id
  }
  const { data: dept } = await supabaseAdmin
    .from('departments')
    .select('location_id')
    .eq('org_id', orgId)
    .eq('id', payload.department_id)
    .maybeSingle()
  return dept?.location_id || null
}

async function buildAssetHierarchy(orgId, payload) {
  const steps = []
  if (payload.location_id) {
    const { data } = await supabaseAdmin
      .from('org_locations')
      .select('name')
      .eq('id', payload.location_id)
      .maybeSingle()
    if (data?.name) steps.push({ field_name: 'Plant / Facility', value: data.name })
  }
  if (payload.area_id) {
    const { data } = await supabaseAdmin
      .from('areas')
      .select('name')
      .eq('id', payload.area_id)
      .maybeSingle()
    if (data?.name) steps.push({ field_name: 'Area', value: data.name })
  }
  if (payload.equipment_id) {
    const { data } = await supabaseAdmin
      .from('equipment')
      .select('name, code')
      .eq('org_id', orgId)
      .eq('id', payload.equipment_id)
      .maybeSingle()
    if (data?.name) {
      steps.push({
        field_name: 'Equipment',
        value: data.code ? `${data.code} — ${data.name}` : data.name,
      })
    }
  }
  return steps
}

export async function listPmPlans(orgId, { status, search, limit = 100, offset = 0 } = {}) {
  let query = supabaseAdmin
    .from('pm_plans')
    .select(PLAN_SELECT, { count: 'exact' })
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status === 'active' || status === 'inactive') query = query.eq('status', status)
  if (search) {
    const q = String(search).replace(/%/g, '').trim()
    if (q) query = query.or(`name.ilike.%${q}%,plan_number.ilike.%${q}%`)
  }

  const { data, error, count } = await query
  if (error) throw error

  const rows = data || []
  const techniciansByPlan = await loadTechnicians(orgId, rows.map((row) => row.id))
  return {
    items: rows.map((row) => mapPlanRow(row, techniciansByPlan.get(row.id) || [])),
    total: count || 0,
    limit,
    offset,
  }
}

export async function getPmPlan(orgId, planId) {
  const { data, error } = await supabaseAdmin
    .from('pm_plans')
    .select(PLAN_SELECT)
    .eq('org_id', orgId)
    .eq('id', planId)
    .maybeSingle()

  if (error) throw error
  if (!data) throw httpError('PM plan not found.', 404)

  const techniciansByPlan = await loadTechnicians(orgId, [planId])
  const { data: audit } = await supabaseAdmin
    .from('pm_plan_audit')
    .select('id, action, previous_value, new_value, remarks, created_at, actor_id')
    .eq('org_id', orgId)
    .eq('plan_id', planId)
    .order('created_at', { ascending: false })
    .limit(50)

  return {
    ...mapPlanRow(data, techniciansByPlan.get(planId) || []),
    audit: audit || [],
  }
}

export async function createPmPlan(orgId, profileId, body = {}) {
  const payload = normalizePlanPayload(body)
  payload.location_id = await resolveLocationId(orgId, payload)
  if (!payload.equipment_id) throw httpError('Asset / equipment is required.')

  const nextDue = initialDueDate(payload)
  const planNumber = await generatePmPlanNumber(orgId, payload.department_id)

  const { data, error } = await supabaseAdmin
    .from('pm_plans')
    .insert({
      org_id: orgId,
      plan_number: planNumber,
      ...payload,
      next_due_at: nextDue,
      created_by: profileId || null,
      updated_by: profileId || null,
    })
    .select(PLAN_SELECT)
    .single()

  if (error) throw error

  await syncPlanTechnicians(orgId, data.id, body.technician_ids || [], {
    locationId: payload.location_id,
  })
  await addPlanAudit(orgId, data.id, profileId, 'created', null, { plan_number: planNumber, status: payload.status })

  if (payload.status === 'active') {
    try {
      await notifyUser(profileId, {
        title: 'PM plan activated',
        body: `${planNumber} — ${payload.name}`,
        data: { type: 'pm_plan_activated', pm_plan_id: data.id },
        url: '/',
      })
    } catch {
      // non-blocking
    }
  }

  return getPmPlan(orgId, data.id)
}

export async function updatePmPlan(orgId, profileId, planId, body = {}) {
  const existing = await getPmPlan(orgId, planId)
  const payload = normalizePlanPayload(body, existing)
  payload.location_id = await resolveLocationId(orgId, payload)
  if (!payload.equipment_id) throw httpError('Asset / equipment is required.')

  const wasActive = existing.status === 'active'
  const becomingActive = payload.status === 'active' && !wasActive
  let nextDue = existing.next_due_at
  if (!nextDue || becomingActive) {
    nextDue = existing.next_due_at || initialDueDate(payload)
  }

  const { data, error } = await supabaseAdmin
    .from('pm_plans')
    .update({
      ...payload,
      next_due_at: nextDue,
      updated_by: profileId || null,
      updated_at: new Date().toISOString(),
    })
    .eq('org_id', orgId)
    .eq('id', planId)
    .select('id')
    .single()

  if (error) throw error
  if (body.technician_ids !== undefined) {
    await syncPlanTechnicians(orgId, planId, body.technician_ids, {
      locationId: payload.location_id,
    })
  }

  await addPlanAudit(
    orgId,
    planId,
    profileId,
    becomingActive ? 'activated' : 'updated',
    { status: existing.status, next_due_at: existing.next_due_at },
    { status: payload.status, next_due_at: nextDue },
  )

  if (becomingActive) {
    try {
      await notifyUser(profileId, {
        title: 'PM plan activated',
        body: `${existing.plan_number || ''} — ${payload.name}`.trim(),
        data: { type: 'pm_plan_activated', pm_plan_id: data.id },
        url: '/',
      })
    } catch {
      // non-blocking
    }
  }

  return getPmPlan(orgId, planId)
}

export async function deletePmPlan(orgId, planId) {
  const { count, error: countError } = await supabaseAdmin
    .from('manual_work_orders')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('pm_plan_id', planId)
    .in('status', WO_OPEN_FOR_PLAN)

  if (countError) throw countError
  if (count) {
    throw httpError('Cannot delete a PM plan with an open scheduled work order. Deactivate it instead.', 409)
  }

  const { error } = await supabaseAdmin
    .from('pm_plans')
    .delete()
    .eq('org_id', orgId)
    .eq('id', planId)

  if (error) throw error
}

async function countOpenScheduledWorkOrders(orgId, planId) {
  const { count, error } = await supabaseAdmin
    .from('manual_work_orders')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('pm_plan_id', planId)
    .in('status', WO_OPEN_FOR_PLAN)

  if (error) throw error
  return count || 0
}

async function syncWorkOrderAssignees(orgId, workOrderId, employeeIds) {
  await supabaseAdmin
    .from('manual_work_order_assignees')
    .delete()
    .eq('org_id', orgId)
    .eq('work_order_id', workOrderId)

  if (!employeeIds?.length) return
  const { error } = await supabaseAdmin.from('manual_work_order_assignees').insert(
    employeeIds.map((employeeId) => ({
      org_id: orgId,
      work_order_id: workOrderId,
      employee_id: employeeId,
    })),
  )
  if (error) throw error
}

export async function generateScheduledWorkOrder(orgId, planId, {
  actorId = null,
  force = false,
} = {}) {
  const plan = await getPmPlan(orgId, planId)
  if (plan.status !== 'active') {
    throw httpError('Only active PM plans generate scheduled work orders.')
  }
  if (!plan.next_due_at) {
    throw httpError('This PM plan does not have a next due date. Set a start date or due date first.')
  }
  if (!force && !generateOnOrBefore(plan)) {
    return { skipped: true, reason: 'not_due' }
  }

  const openCount = await countOpenScheduledWorkOrders(orgId, planId)
  if (openCount > 0 && !plan.allow_multiple_open) {
    return { skipped: true, reason: 'open_work_order' }
  }

  const snapshot = await snapshotChecklistTemplate(orgId, plan.checklist_template_id)
  const hierarchy = await buildAssetHierarchy(orgId, plan)
  const activityName = plan.activity_type?.name || 'Planned maintenance'
  const woNumber = await generateWorkOrderNumber(orgId, plan.department_id)
  const dueIso = `${plan.next_due_at}T08:00:00`
  const technicianIds = (plan.technicians || []).map((row) => row.id)
  const assignedDepartmentId = plan.location_id ? plan.department_id : null

  const { data: workOrder, error } = await supabaseAdmin
    .from('manual_work_orders')
    .insert({
      org_id: orgId,
      status: 'assigned',
      wo_number: woNumber,
      source_type: 'preventive_maintenance',
      created_by: actorId || plan.created_by || null,
      supervisor_id: actorId || plan.created_by || null,
      assigned_department_id: assignedDepartmentId,
      assigned_location_id: plan.location_id || null,
      equipment_id: plan.equipment_id || null,
      asset_hierarchy: hierarchy,
      short_description: `${plan.name} — ${activityName}`.slice(0, 200),
      problem_description: `${plan.name} — ${activityName}`,
      priority: plan.priority,
      work_center: plan.work_center || 'General',
      planned_start_at: dueIso,
      planned_end_at: dueIso,
      planned_duration_hours: plan.estimated_duration_hours ?? null,
      special_tools_used: plan.required_tools || null,
      vendor_id: plan.contractor_vendor_id || null,
      pm_plan_id: plan.id,
      scheduled_at: dueIso,
      checklist_snapshot: snapshot || {},
      checklist_values: {},
    })
    .select('*')
    .single()

  if (error) throw error

  if (technicianIds.length) {
    await syncWorkOrderAssignees(orgId, workOrder.id, technicianIds)
  }

  await addWorkOrderTimelineEvent(
    orgId,
    workOrder.id,
    'work_order_generated',
    `Scheduled work order ${woNumber} generated from ${plan.plan_number}.`,
    actorId,
    { newStatus: 'assigned', metadata: { pm_plan_id: plan.id } },
  )

  if (technicianIds.length) {
    await addWorkOrderTimelineEvent(
      orgId,
      workOrder.id,
      'technician_assigned',
      'Default technician(s) assigned from the PM plan.',
      actorId,
      { newStatus: 'assigned', metadata: { assignee_ids: technicianIds } },
    )
  }

  await addWorkOrderAuditEntry(
    orgId,
    workOrder.id,
    actorId,
    'created_from_pm_plan',
    {
      newStatus: 'assigned',
      departmentId: plan.department_id,
      metadata: { pm_plan_id: plan.id, wo_number: woNumber },
    },
  )

  const planPatch = {
    last_generated_at: new Date().toISOString(),
    last_generated_due_at: plan.next_due_at,
    updated_at: new Date().toISOString(),
  }
  if (plan.allow_multiple_open && isCalendarSchedule(plan.schedule_type)) {
    planPatch.next_due_at = computeNextDueDate(plan, plan.next_due_at)
  }

  await supabaseAdmin
    .from('pm_plans')
    .update(planPatch)
    .eq('id', plan.id)
    .eq('org_id', orgId)

  await addPlanAudit(
    orgId,
    plan.id,
    actorId,
    'work_order_generated',
    { next_due_at: plan.next_due_at },
    { wo_number: woNumber, work_order_id: workOrder.id },
  )

  try {
    await notifyEmployees(orgId, technicianIds, {
      title: 'Scheduled work order assigned',
      body: `${woNumber} — ${plan.name}`,
      data: {
        type: 'work_order_assigned',
        work_order_id: workOrder.id,
        pm_plan_id: plan.id,
        sound: 'assignment',
      },
      url: '/',
    })
  } catch {
    // non-blocking
  }

  return { skipped: false, work_order: workOrder, wo_number: woNumber }
}

export async function advancePlanAfterWorkOrderClose(orgId, workOrder) {
  if (!workOrder?.pm_plan_id) return
  if (workOrder.source_type !== 'preventive_maintenance') return

  const { data: plan, error } = await supabaseAdmin
    .from('pm_plans')
    .select('*')
    .eq('org_id', orgId)
    .eq('id', workOrder.pm_plan_id)
    .maybeSingle()

  if (error) throw error
  if (!plan) return
  if (plan.allow_multiple_open) return

  const fromDate = plan.last_generated_due_at || plan.next_due_at || formatDateOnly(workOrder.scheduled_at)
  const nextDue = isCalendarSchedule(plan.schedule_type)
    ? computeNextDueDate(plan, fromDate)
    : null

  await supabaseAdmin
    .from('pm_plans')
    .update({
      next_due_at: nextDue,
      last_due_notice_on: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', plan.id)
    .eq('org_id', orgId)

  await addPlanAudit(
    orgId,
    plan.id,
    workOrder.closed_by || null,
    'next_due_calculated',
    { next_due_at: plan.next_due_at },
    { next_due_at: nextDue, work_order_id: workOrder.id },
  )
}

export async function runPmSchedulerJob() {
  const { data: plans, error } = await supabaseAdmin
    .from('pm_plans')
    .select('id, org_id, next_due_at, generate_before_days, status, last_due_notice_on, grace_days, name, plan_number')
    .eq('status', 'active')
    .not('next_due_at', 'is', null)

  if (error) {
    if (error.code === '42P01' || /does not exist/i.test(error.message || '')) {
      return { generated: 0, overdueNotices: 0, scanned: 0, skipped: 'not_migrated' }
    }
    throw error
  }

  let generated = 0
  let overdueNotices = 0

  for (const plan of plans || []) {
    try {
      const result = await generateScheduledWorkOrder(plan.org_id, plan.id)
      if (result?.work_order) generated += 1
    } catch (err) {
      console.error(`[pmScheduler] generate failed for ${plan.plan_number || plan.id}:`, err.message)
    }

    try {
      if (isOverdue(plan)) {
        const today = formatDateOnly(new Date())
        if (plan.last_due_notice_on !== today) {
          const techMap = await loadTechnicians(plan.org_id, [plan.id])
          const ids = (techMap.get(plan.id) || []).map((row) => row.id)
          if (ids.length) {
            await notifyEmployees(plan.org_id, ids, {
              title: 'Overdue planned maintenance',
              body: `${plan.plan_number || ''} — ${plan.name} is overdue`.trim(),
              data: { type: 'pm_overdue', pm_plan_id: plan.id },
              url: '/',
            })
          }
          await supabaseAdmin
            .from('pm_plans')
            .update({ last_due_notice_on: today })
            .eq('id', plan.id)
          overdueNotices += 1
        }
      }
    } catch (err) {
      console.error(`[pmScheduler] overdue notice failed for ${plan.plan_number || plan.id}:`, err.message)
    }
  }

  return { generated, overdueNotices, scanned: (plans || []).length }
}
