import { supabaseAdmin } from '../services/supabase.js'
import { loadOrgFields } from './equipmentFieldService.js'
import { listEquipment, getEquipmentDetail, deriveEquipmentIdentity, orderedParentFields } from './equipmentService.js'
import { notifyOrg } from '../services/notifications.js'
import { buildManualWorkOrderFormSchema } from './manualWorkOrderForm.js'

export async function getEmployeeByProfile(orgId, profileId, { email = null } = {}) {
  if (!profileId && !email) return null

  if (profileId) {
    const { data: byProfile, error: profileError } = await supabaseAdmin
      .from('org_employees')
      .select('id, name, emp_id, email, department_id, location_id, profile_id')
      .eq('org_id', orgId)
      .eq('profile_id', profileId)
      .eq('is_active', true)
      .maybeSingle()

    if (profileError) throw profileError
    if (byProfile) return byProfile
  }

  const normalizedEmail = email?.trim()
  if (!normalizedEmail) return null

  const { data: byEmail, error: emailError } = await supabaseAdmin
    .from('org_employees')
    .select('id, name, emp_id, email, department_id, location_id, profile_id')
    .eq('org_id', orgId)
    .ilike('email', normalizedEmail)
    .eq('is_active', true)
    .maybeSingle()

  if (emailError) throw emailError
  return byEmail || null
}

async function addTimelineEvent(orgId, workRequestId, eventType, message, actorId, metadata = {}) {
  const { error } = await supabaseAdmin.from('work_request_timeline').insert({
    org_id: orgId,
    work_request_id: workRequestId,
    event_type: eventType,
    message,
    actor_id: actorId,
    metadata,
  })
  if (error) throw error
}

function formatSeqDate(date = new Date()) {
  const yy = String(date.getUTCFullYear()).slice(-2)
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(date.getUTCDate()).padStart(2, '0')
  return { label: `${yy}${mm}${dd}`, iso: date.toISOString().slice(0, 10) }
}

export async function generateWorkRequestNumber(orgId, orderToDepartmentId) {
  const { data: dept, error: deptError } = await supabaseAdmin
    .from('departments')
    .select('code')
    .eq('org_id', orgId)
    .eq('id', orderToDepartmentId)
    .maybeSingle()

  if (deptError) throw deptError
  const code = String(dept?.code || 'GEN')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6) || 'GEN'

  const { label, iso } = formatSeqDate()

  const { data: existing, error: readError } = await supabaseAdmin
    .from('work_request_daily_sequences')
    .select('last_number')
    .eq('org_id', orgId)
    .eq('department_id', orderToDepartmentId)
    .eq('seq_date', iso)
    .maybeSingle()

  if (readError) throw readError

  const next = (existing?.last_number || 0) + 1

  const { error: upsertError } = await supabaseAdmin
    .from('work_request_daily_sequences')
    .upsert(
      {
        org_id: orgId,
        department_id: orderToDepartmentId,
        seq_date: iso,
        last_number: next,
      },
      { onConflict: 'org_id,department_id,seq_date' },
    )

  if (upsertError) throw upsertError

  return `WR-${code}-${label}-${String(next).padStart(4, '0')}`
}

export async function buildAssetHierarchy(orgId, equipmentId) {
  if (!equipmentId) return []
  const detail = await getEquipmentDetail(orgId, equipmentId)
  if (!detail) return []

  const fields = await loadOrgFields(orgId)
  const fieldById = new Map(fields.map((f) => [f.id, f]))
  const path = []

  for (const val of detail.values || []) {
    const field = fieldById.get(val.field_id)
    if (!field || field.kind === 'section') continue
    const text = val.value_text
      || (Array.isArray(val.value_json?.values) ? val.value_json.values.join(', ') : '')
    path.push({
      field_id: val.field_id,
      field_name: field.name,
      value: String(text || '').trim(),
    })
  }

  if (detail.name || detail.code) {
    path.push({
      field_id: null,
      field_name: 'Equipment',
      value: [detail.name, detail.code].filter(Boolean).join(' · '),
    })
  }

  return path
}

async function loadDepartments(orgId) {
  const { data, error } = await supabaseAdmin
    .from('departments')
    .select('id, name, code, location_id, all_locations, is_active')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .order('name')

  if (error) throw error
  return data || []
}

function buildAssetFieldSections(fields) {
  const active = (fields || []).filter((f) => f.is_active !== false)
  const sections = active
    .filter((f) => f.kind === 'section')
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))

  const parents = active.filter((f) => f.kind === 'parent')

  const mapField = (p) => ({
    id: p.id,
    name: p.name,
    field_type: p.field_type,
    is_required: Boolean(p.is_required),
    section_id: p.section_id,
    sort_order: p.sort_order ?? 0,
    dropdown_options: p.dropdown_options || [],
    depends_on_parent_id: p.depends_on_parent_id || null,
    depends_on_option: p.depends_on_option ?? null,
    depends_on_parent_name: p.depends_on_parent_name || null,
    depends_on_section_name: p.depends_on_section_name || null,
  })

  const built = sections.map((section) => ({
    id: section.id,
    name: section.name,
    fields: parents
      .filter((p) => p.section_id === section.id)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))
      .map(mapField),
  })).filter((s) => s.fields.length > 0)

  const inSection = new Set(built.flatMap((s) => s.fields.map((f) => f.id)))
  const orphans = parents
    .filter((p) => !inSection.has(p.id))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))
    .map(mapField)

  if (orphans.length) {
    built.push({ id: 'other', name: 'Asset details', fields: orphans })
  }

  return built
}

function readEquipmentValue(row) {
  if (!row) return ''
  if (Array.isArray(row.value_json?.values)) {
    return row.value_json.values.map((v) => String(v).trim()).filter(Boolean).join(', ')
  }
  return String(row.value_text ?? '').trim()
}

function isCodeFieldName(field) {
  return /(^|[^a-z])code([^a-z]|$)/i.test(String(field?.name || ''))
}

function isNameFieldName(field) {
  return /(^|[^a-z])name([^a-z]|$)/i.test(String(field?.name || ''))
}

/** Merge equipment.name / equipment.code into dynamic field values when missing. */
function enrichEquipmentCatalogValues(fields, equipmentRow, valuesByFieldId) {
  const values = { ...valuesByFieldId }
  const parents = orderedParentFields(fields)

  for (const field of parents) {
    if (values[field.id]) continue
    if (isNameFieldName(field) && equipmentRow.name) {
      values[field.id] = equipmentRow.name
    } else if (isCodeFieldName(field) && equipmentRow.code) {
      values[field.id] = equipmentRow.code
    }
  }

  const identity = deriveEquipmentIdentity(
    fields,
    Object.entries(values).map(([field_id, value_text]) => ({ field_id, value_text })),
  )
  if (identity.nameField && !values[identity.nameField.id] && equipmentRow.name) {
    values[identity.nameField.id] = equipmentRow.name
  }
  if (identity.codeField && !values[identity.codeField.id] && equipmentRow.code) {
    values[identity.codeField.id] = equipmentRow.code
  }

  return values
}

export async function listEquipmentCatalogForDepartment(orgId, departmentId) {
  const equipment = await listEquipment(orgId, {
    departmentId,
    limit: 500,
    offset: 0,
  })

  if (!equipment.length) {
    return { equipment: [], has_assets: false }
  }

  const fields = await loadOrgFields(orgId)
  const ids = equipment.map((row) => row.id)
  const { data: valueRows, error } = await supabaseAdmin
    .from('equipment_values')
    .select('equipment_id, field_id, value_text, value_json')
    .eq('org_id', orgId)
    .in('equipment_id', ids)

  if (error) throw error

  const valuesByEquipment = new Map()
  for (const row of valueRows || []) {
    if (!valuesByEquipment.has(row.equipment_id)) {
      valuesByEquipment.set(row.equipment_id, {})
    }
    valuesByEquipment.get(row.equipment_id)[row.field_id] = readEquipmentValue(row)
  }

  return {
    has_assets: true,
    equipment: equipment.map((row) => {
      const raw = valuesByEquipment.get(row.id) || {}
      const values = enrichEquipmentCatalogValues(fields, row, raw)
      return {
        id: row.id,
        name: row.name,
        code: row.code,
        location_id: row.location_id,
        department_id: row.department_id,
        area_id: row.area_id,
        area_name: row.areas?.name ?? null,
        values,
      }
    }),
  }
}

export async function getWorkRequestFormContext(orgId, profileId, email, { isOrgAdmin = false } = {}) {
  const employee = await getEmployeeByProfile(orgId, profileId, { email })
  const orderFromSelectable = Boolean(isOrgAdmin && !employee?.department_id)

  if (!employee?.department_id && !isOrgAdmin) {
    const err = new Error('Your account is not linked to a department. Contact your administrator.')
    err.status = 403
    throw err
  }

  const [departments, fromDeptResult, orgRowResult] = await Promise.all([
    loadDepartments(orgId),
    employee?.department_id
      ? supabaseAdmin
        .from('departments')
        .select('id, name, code')
        .eq('id', employee.department_id)
        .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabaseAdmin
      .from('organizations')
      .select('work_request_inter_approval_required')
      .eq('id', orgId)
      .maybeSingle(),
  ])

  if (fromDeptResult.error) throw fromDeptResult.error
  if (orgRowResult.error) throw orgRowResult.error

  const orgFields = await loadOrgFields(orgId)
  const assetSections = buildAssetFieldSections(orgFields)
  const maintenanceFormSchema = await buildManualWorkOrderFormSchema(orgId)

  return {
    employee: employee
      ? {
        id: employee.id,
        name: employee.name,
        department_id: employee.department_id,
        location_id: employee.location_id,
      }
      : null,
    order_from_department: fromDeptResult.data,
    order_from_selectable: orderFromSelectable,
    departments,
    inter_department_approval_required: orgRowResult.data?.work_request_inter_approval_required !== false,
    asset_sections: assetSections,
    maintenance_form_schema: maintenanceFormSchema,
    request_types: [
      { value: 'inter_department', label: 'Inter Department' },
      { value: 'intra_department', label: 'Intra Department' },
      { value: 'user_self', label: 'User Self Request' },
    ],
    priorities: [
      { value: 'high', label: 'High' },
      { value: 'medium', label: 'Medium' },
      { value: 'low', label: 'Low' },
    ],
  }
}

export async function listEquipmentForDepartment(orgId, departmentId, { search = null } = {}) {
  const rows = await listEquipment(orgId, {
    departmentId,
    search,
    limit: 200,
    offset: 0,
  })
  return rows
}

function resolveInitialStatus(requestType, interApprovalRequired) {
  if (requestType === 'inter_department' && interApprovalRequired) {
    return 'pending_approval'
  }
  return 'submitted'
}

async function assertEquipmentInDepartment(orgId, equipmentId, departmentId) {
  const { data, error } = await supabaseAdmin
    .from('equipment')
    .select('id, department_id, is_active')
    .eq('org_id', orgId)
    .eq('id', equipmentId)
    .maybeSingle()

  if (error) throw error
  if (!data || data.is_active === false) {
    const err = new Error('Selected equipment is not available.')
    err.status = 400
    throw err
  }
  if (data.department_id !== departmentId) {
    const err = new Error('Equipment does not belong to the selected executing department.')
    err.status = 400
    throw err
  }
}

async function assertDepartmentInOrg(orgId, departmentId, label = 'Department') {
  const { data, error } = await supabaseAdmin
    .from('departments')
    .select('id')
    .eq('org_id', orgId)
    .eq('id', departmentId)
    .maybeSingle()

  if (error) throw error
  if (!data) {
    const err = new Error(`${label} is not valid for this organization.`)
    err.status = 400
    throw err
  }
}

export async function createWorkRequest(orgId, profileId, email, body, { isOrgAdmin = false } = {}) {
  const employee = await getEmployeeByProfile(orgId, profileId, { email })

  if (!employee?.department_id && !isOrgAdmin) {
    const err = new Error('Your account is not linked to a department.')
    err.status = 403
    throw err
  }

  const requestType = body?.request_type
  const validTypes = new Set(['inter_department', 'intra_department', 'user_self', 'manual'])
  if (!validTypes.has(requestType)) {
    const err = new Error('Invalid request type.')
    err.status = 400
    throw err
  }

  let orderToId = body?.order_to_department_id || null
  let orderFromId = employee?.department_id || body?.order_from_department_id || null

  if (!orderFromId && isOrgAdmin) {
    const err = new Error('Order from department is required.')
    err.status = 400
    throw err
  }

  if (orderFromId) {
    await assertDepartmentInOrg(orgId, orderFromId, 'Order from department')
  }

  if (requestType === 'intra_department' || requestType === 'user_self') {
    orderToId = orderFromId
  }

  if (!orderToId) {
    const err = new Error('Order To department is required.')
    err.status = 400
    throw err
  }

  await assertDepartmentInOrg(orgId, orderToId, 'Order to department')

  const isDraft = body?.save_as === 'draft'

  let problem = String(body?.problem_description || '').trim()
  let priority = body?.priority
  const equipmentId = body?.equipment_id || null

  if (isDraft) {
    if (!['high', 'medium', 'low'].includes(priority)) {
      priority = 'medium'
    }
    if (equipmentId) {
      await assertEquipmentInDepartment(orgId, equipmentId, orderToId)
    }
  } else {
    if (!problem) {
      const err = new Error('Problem description is required.')
      err.status = 400
      throw err
    }

    if (!['high', 'medium', 'low'].includes(priority)) {
      const err = new Error('Priority is required.')
      err.status = 400
      throw err
    }

    if (!equipmentId) {
      const err = new Error('An asset / equipment selection is required.')
      err.status = 400
      throw err
    }

    await assertEquipmentInDepartment(orgId, equipmentId, orderToId)

    const equipmentList = await listEquipmentForDepartment(orgId, orderToId)
    if (!equipmentList.length) {
      const err = new Error('No assets are available for the selected department.')
      err.status = 400
      throw err
    }
  }

  const { data: orgRow } = await supabaseAdmin
    .from('organizations')
    .select('work_request_inter_approval_required')
    .eq('id', orgId)
    .maybeSingle()

  const interApproval = orgRow?.work_request_inter_approval_required !== false
  const status = isDraft ? 'draft' : resolveInitialStatus(requestType, interApproval)
  const requestNumber = isDraft ? null : await generateWorkRequestNumber(orgId, orderToId)
  const assetHierarchy = equipmentId ? await buildAssetHierarchy(orgId, equipmentId) : []
  const now = new Date().toISOString()
  const formFieldValues = body?.form_field_values && typeof body.form_field_values === 'object'
    ? body.form_field_values
    : {}

  const { data: row, error } = await supabaseAdmin
    .from('work_requests')
    .insert({
      org_id: orgId,
      request_number: requestNumber,
      request_type: requestType,
      status,
      request_date: now,
      order_from_department_id: orderFromId,
      order_to_department_id: orderToId,
      equipment_id: equipmentId,
      asset_hierarchy: assetHierarchy,
      problem_description: problem,
      is_breakdown: Boolean(body?.is_breakdown),
      priority,
      remarks: body?.remarks?.trim() || null,
      attachments: Array.isArray(body?.attachments) ? body.attachments : [],
      form_field_values: formFieldValues,
      requested_by: profileId,
      updated_at: now,
    })
    .select('*')
    .single()

  if (error) throw error

  await addTimelineEvent(
    orgId,
    row.id,
    isDraft ? 'draft_saved' : 'created',
    isDraft
      ? 'Work request saved as draft.'
      : `Work request ${requestNumber} submitted.`,
    profileId,
    { status },
  )

  if (!isDraft) {
    try {
      await notifyOrg(orgId, {
        title: 'New work request',
        body: `${requestNumber}: ${problem.slice(0, 120)}`,
        data: { work_request_id: row.id, type: 'work_request_created' },
        url: '/',
      })
    } catch {
      // non-blocking
    }
  }

  return enrichWorkRequest(row)
}

async function syncWorkOrderAssignees(orgId, workOrderId, employeeIds) {
  await supabaseAdmin
    .from('manual_work_order_assignees')
    .delete()
    .eq('org_id', orgId)
    .eq('work_order_id', workOrderId)

  if (!employeeIds?.length) return

  const rows = employeeIds.map((employeeId) => ({
    org_id: orgId,
    work_order_id: workOrderId,
    employee_id: employeeId,
  }))

  const { error } = await supabaseAdmin.from('manual_work_order_assignees').insert(rows)
  if (error) throw error
}

export async function approveWorkRequest(orgId, profileId, workRequestId, body) {
  const { data: wr, error } = await supabaseAdmin
    .from('work_requests')
    .select('*')
    .eq('org_id', orgId)
    .eq('id', workRequestId)
    .maybeSingle()

  if (error) throw error
  if (!wr) {
    const err = new Error('Work request not found.')
    err.status = 404
    throw err
  }

  if (!['submitted', 'pending_approval', 'need_info'].includes(wr.status)) {
    const err = new Error('This work request cannot be approved in its current status.')
    err.status = 400
    throw err
  }

  const assigneeIds = Array.isArray(body?.assigned_employee_ids)
    ? [...new Set(body.assigned_employee_ids.filter(Boolean))]
    : []

  if (!assigneeIds.length) {
    const err = new Error('Assign at least one technician.')
    err.status = 400
    throw err
  }

  const { data: equipment } = await supabaseAdmin
    .from('equipment')
    .select('location_id, department_id')
    .eq('id', wr.equipment_id)
    .maybeSingle()

  const { data: workOrder, error: woError } = await supabaseAdmin
    .from('manual_work_orders')
    .insert({
      org_id: orgId,
      status: 'created',
      created_by: profileId,
      assigned_department_id: equipment?.department_id || wr.order_to_department_id,
      assigned_location_id: equipment?.location_id || null,
      work_request_id: wr.id,
    })
    .select('*')
    .single()

  if (woError) throw woError

  await syncWorkOrderAssignees(orgId, workOrder.id, assigneeIds)

  const now = new Date().toISOString()
  const { data: updated, error: updateError } = await supabaseAdmin
    .from('work_requests')
    .update({
      status: 'approved',
      approved_by: profileId,
      approved_at: now,
      approval_remarks: body?.assignment_remarks?.trim() || null,
      manual_work_order_id: workOrder.id,
      updated_at: now,
    })
    .eq('id', wr.id)
    .select('*')
    .single()

  if (updateError) throw updateError

  await addTimelineEvent(
    orgId,
    wr.id,
    'approved',
    'Work request approved and work order created.',
    profileId,
    { manual_work_order_id: workOrder.id, assignee_ids: assigneeIds },
  )

  const enriched = await enrichWorkRequest(updated)
  return { ...enriched, work_order: { id: workOrder.id } }
}

export async function rejectWorkRequest(orgId, profileId, workRequestId, reason) {
  const text = String(reason || '').trim()
  if (!text) {
    const err = new Error('Rejection reason is required.')
    err.status = 400
    throw err
  }

  const { data: wr, error } = await supabaseAdmin
    .from('work_requests')
    .select('id, status')
    .eq('org_id', orgId)
    .eq('id', workRequestId)
    .maybeSingle()

  if (error) throw error
  if (!wr) {
    const err = new Error('Work request not found.')
    err.status = 404
    throw err
  }

  if (!['submitted', 'pending_approval', 'need_info'].includes(wr.status)) {
    const err = new Error('This work request cannot be rejected.')
    err.status = 400
    throw err
  }

  const now = new Date().toISOString()
  const { data: updated, error: updateError } = await supabaseAdmin
    .from('work_requests')
    .update({
      status: 'rejected',
      rejection_reason: text,
      updated_at: now,
    })
    .eq('id', workRequestId)
    .select('*')
    .single()

  if (updateError) throw updateError

  await addTimelineEvent(orgId, workRequestId, 'rejected', text, profileId)
  return enrichWorkRequest(updated)
}

export async function requestMoreInfo(orgId, profileId, workRequestId, message) {
  const text = String(message || '').trim()
  if (!text) {
    const err = new Error('Message is required.')
    err.status = 400
    throw err
  }

  const now = new Date().toISOString()
  const { data: updated, error } = await supabaseAdmin
    .from('work_requests')
    .update({ status: 'need_info', updated_at: now })
    .eq('org_id', orgId)
    .eq('id', workRequestId)
    .select('*')
    .maybeSingle()

  if (error) throw error
  if (!updated) {
    const err = new Error('Work request not found.')
    err.status = 404
    throw err
  }

  await addTimelineEvent(orgId, workRequestId, 'need_info', text, profileId)
  return enrichWorkRequest(updated)
}

const WR_SELECT = `
  *,
  order_from:departments!work_requests_order_from_department_id_fkey(id, name, code),
  order_to:departments!work_requests_order_to_department_id_fkey(id, name, code),
  equipment(id, name, code, location_id, department_id, area_id),
  requester:profiles!work_requests_requested_by_fkey(id, full_name, email),
  approver:profiles!work_requests_approved_by_fkey(id, full_name, email)
`

export async function enrichWorkRequest(row) {
  if (!row) return null

  let timeline = []
  const { data: events } = await supabaseAdmin
    .from('work_request_timeline')
    .select('id, event_type, message, actor_id, metadata, created_at')
    .eq('work_request_id', row.id)
    .order('created_at', { ascending: true })

  timeline = events || []

  let assignees = []
  if (row.manual_work_order_id) {
    const { data: links } = await supabaseAdmin
      .from('manual_work_order_assignees')
      .select('employee_id, org_employees(id, name, emp_id)')
      .eq('work_order_id', row.manual_work_order_id)

    assignees = (links || []).map((l) => l.org_employees).filter(Boolean)
  }

  return {
    ...row,
    timeline,
    assigned_technicians: assignees,
    is_breakdown_label: row.is_breakdown ? 'Yes' : 'No',
  }
}

export async function listWorkRequests(orgId, filter, { profileId, departmentId } = {}) {
  let query = supabaseAdmin
    .from('work_requests')
    .select(WR_SELECT)
    .eq('org_id', orgId)
    .order('request_date', { ascending: false })

  if (filter === 'my' && profileId) {
    query = query.eq('requested_by', profileId)
  } else if (filter === 'outgoing' && departmentId) {
    query = query.eq('order_from_department_id', departmentId)
  } else if (filter === 'incoming' && departmentId) {
    query = query.eq('order_to_department_id', departmentId)
  }

  const { data, error } = await query.limit(200)
  if (error) throw error

  const rows = await Promise.all((data || []).map((row) => enrichWorkRequest(row)))
  return rows
}

export async function getWorkRequestById(orgId, id) {
  const { data, error } = await supabaseAdmin
    .from('work_requests')
    .select(WR_SELECT)
    .eq('org_id', orgId)
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  if (!data) return null
  return enrichWorkRequest(data)
}
