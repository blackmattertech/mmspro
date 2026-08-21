import { supabaseAdmin } from '../services/supabase.js'
import { loadOrgFields } from './equipmentFieldService.js'
import { loadOrgFields as loadAssetOrgFields } from './assetFieldService.js'
import { listEquipment, getEquipmentDetail, deriveEquipmentIdentity, orderedParentFields } from './equipmentService.js'
import { notifyUser, notifyEmployees, notifyByModule } from '../services/notifications.js'
import { buildManualWorkOrderFormSchema } from './manualWorkOrderForm.js'
import { applyIlikeSearch, listEnvelope } from './listQuery.js'
import {
  departmentFitsLocation,
  isMaintenanceDepartment,
} from './bulkMasterMatch.js'
import { loadTimelineActors } from './timelineActors.js'
import {
  generateWorkOrderNumber,
  addWorkOrderTimelineEvent,
  addWorkOrderAuditEntry,
  mapRequestTypeToSource,
} from './workOrderService.js'

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

const WR_INBOX_MODULES = [
  ['work_request_incoming', 'read'],
  ['work_request_approve', 'update'],
  ['work_request_all', 'read'],
]

async function workRequestNotifyScope(orgId, { orderToId, equipmentId } = {}) {
  let locationId = null
  if (equipmentId) {
    const { data } = await supabaseAdmin
      .from('equipment')
      .select('location_id')
      .eq('id', equipmentId)
      .maybeSingle()
    locationId = data?.location_id || null
  }
  if (!locationId && orderToId) {
    const { data } = await supabaseAdmin
      .from('departments')
      .select('location_id')
      .eq('id', orderToId)
      .maybeSingle()
    locationId = data?.location_id || null
  }
  return { departmentId: orderToId || null, locationId }
}

async function notifyWorkRequestInbox(orgId, wr, payload) {
  const scope = await workRequestNotifyScope(orgId, {
    orderToId: wr.order_to_department_id,
    equipmentId: wr.equipment_id,
  })
  await notifyByModule(orgId, WR_INBOX_MODULES, payload, {
    ...scope,
    excludeTechnicianRoles: true,
  })
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

function departmentHeadRoleScore(employee) {
  const role = employee?.access_role?.name?.trim().toLowerCase() || ''
  if (!role) return 0
  if (role.includes('department head')) return 4
  if (role.includes('head') && !role.includes('location')) return 3
  if (role.includes('supervisor')) return 2
  if (role.includes('manager')) return 1
  return 0
}

function pickDepartmentHead(employees) {
  if (!employees?.length) return null
  const managedIds = new Set(employees.map((employee) => employee.manager_id).filter(Boolean))
  const ranked = employees.map((employee) => ({
    employee,
    score: departmentHeadRoleScore(employee) * 10 + (managedIds.has(employee.id) ? 1 : 0),
  }))
  ranked.sort((a, b) => b.score - a.score || String(a.employee.name || '').localeCompare(String(b.employee.name || '')))
  const best = ranked[0]
  if (!best || best.score <= 0) return null
  const { id, name, photo_url } = best.employee
  return { id, name, photo_url: photo_url || null }
}

async function loadDepartmentHeads(orgId, departments, locationId) {
  const ids = (departments || []).map((department) => department.id).filter(Boolean)
  if (!ids.length) return new Map()

  const { data: employees, error } = await supabaseAdmin
    .from('org_employees')
    .select('id, name, photo_url, department_id, location_id, manager_id, access_role:access_role_id(id, name)')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .in('department_id', ids)

  if (error) throw error

  const byDepartment = new Map()
  for (const employee of employees || []) {
    const department = departments.find((row) => row.id === employee.department_id)
    if (department?.all_locations && locationId && employee.location_id && employee.location_id !== locationId) {
      continue
    }
    const list = byDepartment.get(employee.department_id) || []
    list.push(employee)
    byDepartment.set(employee.department_id, list)
  }

  const heads = new Map()
  for (const [departmentId, list] of byDepartment) {
    const head = pickDepartmentHead(list)
    if (head) heads.set(departmentId, head)
  }
  return heads
}

async function loadDepartments(orgId, { locationId } = {}) {
  let query = supabaseAdmin
    .from('departments')
    .select('id, name, code, location_id, all_locations, is_active, org_locations!location_id(id, name)')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .order('name')

  if (locationId) {
    query = query.or(`location_id.eq.${locationId},all_locations.eq.true`)
  }

  const { data, error } = await query
  if (error) throw error

  const departments = data || []
  const heads = await loadDepartmentHeads(orgId, departments, locationId)
  return departments.map((department) => ({
    id: department.id,
    name: department.name,
    code: department.code,
    location_id: department.location_id,
    all_locations: Boolean(department.all_locations),
    location_name: department.all_locations
      ? 'All locations'
      : (department.org_locations?.name || null),
    head: heads.get(department.id) || null,
  }))
}

function normalizeFieldName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Match Assets field "Job Nature" / "Job Natures" (user-configured dropdown). */
export function findJobNatureField(fields) {
  const candidates = (fields || []).filter((field) => {
    if (field?.kind === 'section') return false
    if (field?.kind === 'child') return false
    if (field?.is_active === false) return false
    const name = normalizeFieldName(field?.name)
    return name === 'job nature' || name === 'job natures'
  })
  const withOptions = candidates.find((field) => Array.isArray(field.dropdown_options) && field.dropdown_options.length)
  return withOptions || candidates[0] || null
}

export function jobNatureOptionsFromField(field) {
  if (!field) return []
  return (field.dropdown_options || [])
    .map((option) => String(option || '').trim())
    .filter(Boolean)
    .map((value) => ({ value, label: value }))
}

export function isBreakdownJobNature(value) {
  return String(value || '').trim().toLowerCase() === 'breakdown'
}

/** Prefer Assets Job Natures; fall back to Equipment fields with the same name. */
export async function resolveJobNatureField(orgId) {
  const assetFields = await loadAssetOrgFields(orgId)
  const fromAssets = findJobNatureField(assetFields)
  if (fromAssets) return fromAssets
  const equipmentFields = await loadOrgFields(orgId)
  return findJobNatureField(equipmentFields)
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

export async function listEquipmentCatalogForDepartment(orgId, departmentId, { search = null, limit = 100, offset = 0 } = {}) {
  const page = await listEquipment(orgId, {
    departmentId,
    search,
    limit,
    offset,
  })
  const equipment = page.items || []

  if (!equipment.length) {
    return { equipment: [], has_assets: false, total: page.total || 0 }
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
    total: page.total || equipment.length,
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
    loadDepartments(orgId, {
      locationId: orderFromSelectable ? null : (employee?.location_id || null),
    }),
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
  const jobNatureField = await resolveJobNatureField(orgId)

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
    job_nature_field: jobNatureField
      ? {
        id: jobNatureField.id,
        name: jobNatureField.name,
        is_required: Boolean(jobNatureField.is_required),
      }
      : null,
    job_natures: jobNatureOptionsFromField(jobNatureField),
    request_types: [
      { value: 'inter_department', label: 'Inter Department' },
      { value: 'intra_department', label: 'Intra Department' },
      { value: 'user_self', label: 'User Self Request' },
      { value: 'manual', label: 'Manual Work Request' },
    ],
    priorities: [
      { value: 'high', label: 'High' },
      { value: 'medium', label: 'Medium' },
      { value: 'low', label: 'Low' },
    ],
  }
}

export async function listEquipmentForDepartment(orgId, departmentId, { search = null } = {}) {
  const page = await listEquipment(orgId, {
    departmentId,
    search,
    limit: 100,
    offset: 0,
  })
  return page.items || []
}

function resolveInitialStatus(requestType, interApprovalRequired) {
  if (requestType === 'inter_department' && interApprovalRequired) {
    return 'pending_approval'
  }
  return 'submitted'
}

const APPROVABLE_STATUSES = ['submitted', 'pending_approval', 'need_info', 'info_provided']

async function getWorkOrderForRequest(orgId, workRequestId) {
  const { data, error } = await supabaseAdmin
    .from('manual_work_orders')
    .select('*')
    .eq('org_id', orgId)
    .eq('work_request_id', workRequestId)
    .maybeSingle()
  if (error) throw error
  return data || null
}

function isUniqueViolation(error) {
  return error?.code === '23505' || String(error?.message || '').includes('duplicate key')
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

async function assertDepartmentInOrg(orgId, departmentId, label = 'Department', { locationId } = {}) {
  const { data, error } = await supabaseAdmin
    .from('departments')
    .select('id, location_id, all_locations, is_active')
    .eq('org_id', orgId)
    .eq('id', departmentId)
    .maybeSingle()

  if (error) throw error
  if (!data || data.is_active === false) {
    const err = new Error(`${label} is not valid for this organization.`)
    err.status = 400
    throw err
  }
  if (locationId && data.location_id && !data.all_locations && data.location_id !== locationId) {
    const err = new Error(`${label} is not available at your location.`)
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
    await assertDepartmentInOrg(orgId, orderFromId, 'Order from department', {
      locationId: isOrgAdmin ? null : (employee?.location_id || null),
    })
  }

  if (requestType === 'intra_department' || requestType === 'user_self') {
    orderToId = orderFromId
  }

  if (!orderToId) {
    const err = new Error('Order To department is required.')
    err.status = 400
    throw err
  }

  if (requestType === 'inter_department' && orderToId === orderFromId) {
    const err = new Error('Inter-department requests must select a different Order To department.')
    err.status = 400
    throw err
  }

  await assertDepartmentInOrg(orgId, orderToId, 'Order to department', {
    locationId: isOrgAdmin ? null : (employee?.location_id || null),
  })

  const isDraft = body?.save_as === 'draft'

  let problem = String(body?.problem_description || '').trim()
  let shortDescription = String(body?.short_description || '').trim().slice(0, 200)
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
    if (!shortDescription) {
      const err = new Error('Short description is required.')
      err.status = 400
      throw err
    }

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

  const jobNatureField = await resolveJobNatureField(orgId)
  const jobNatureOptions = jobNatureOptionsFromField(jobNatureField).map((row) => row.value)
  let jobNature = String(body?.job_nature || '').trim() || null
  if (jobNature && jobNatureOptions.length && !jobNatureOptions.includes(jobNature)) {
    const err = new Error('Selected job nature is not valid.')
    err.status = 400
    throw err
  }
  if (!isDraft && jobNatureField?.is_required && !jobNature) {
    const err = new Error('Job nature is required.')
    err.status = 400
    throw err
  }
  if (!isDraft && !jobNature && jobNatureOptions.length) {
    const err = new Error('Job nature is required.')
    err.status = 400
    throw err
  }
  const isBreakdown = jobNature
    ? isBreakdownJobNature(jobNature)
    : Boolean(body?.is_breakdown)

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
      short_description: shortDescription,
      problem_description: problem,
      job_nature: jobNature,
      is_breakdown: isBreakdown,
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
      await notifyWorkRequestInbox(orgId, row, {
        title: 'New work request',
        body: requestNumber,
        data: { work_request_id: row.id, type: 'work_request_created', actor_id: profileId, message: shortDescription },
        url: '/',
      })
    } catch {
      // non-blocking
    }
  }

  // Spec: Intra / User Self / Manual (and Inter when approval disabled) auto-convert to WO
  if (!isDraft && status === 'submitted') {
    try {
      const { updated, workOrder, woNumber } = await createLinkedWorkOrderFromRequest(
        orgId,
        profileId,
        row,
        { autoApproved: true },
      )
      try {
        await notifyWorkRequestInbox(orgId, row, {
          title: 'Work order generated',
          body: `${requestNumber} → ${woNumber}`,
          data: {
            work_request_id: row.id,
            work_order_id: workOrder.id,
            type: 'work_order_generated',
            actor_id: profileId,
          },
          url: '/',
        })
      } catch {
        // non-blocking
      }
      return enrichWorkRequest(updated)
    } catch (convertError) {
      // Request is saved; conversion failure should not hide the WR
      console.error('Auto WO conversion failed:', convertError.message)
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

/**
 * Create a linked manual work order from a work request (approval or auto-convert).
 */
async function createLinkedWorkOrderFromRequest(orgId, profileId, wr, {
  assigneeIds = [],
  workCenter = null,
  priority = null,
  assignmentRemarks = null,
  plannedStartAt = null,
  plannedEndAt = null,
  plannedDurationHours = null,
  autoApproved = false,
} = {}) {
  const { data: equipment } = await supabaseAdmin
    .from('equipment')
    .select('location_id, department_id')
    .eq('id', wr.equipment_id)
    .maybeSingle()

  const departmentId = equipment?.department_id || wr.order_to_department_id
  let locationId = equipment?.location_id || null
  if (departmentId && !locationId) {
    const { data: dept } = await supabaseAdmin
      .from('departments')
      .select('location_id')
      .eq('id', departmentId)
      .maybeSingle()
    locationId = dept?.location_id || null
  }
  // Constraint: department assignment requires a location
  const assignedDepartmentId = locationId ? departmentId : null
  const assignedLocationId = locationId

  let workOrder = await getWorkOrderForRequest(orgId, wr.id)
  const sourceType = mapRequestTypeToSource(wr.request_type)
  const resolvedPriority = ['high', 'medium', 'low'].includes(priority) ? priority : wr.priority
  const resolvedWorkCenter = String(workCenter || '').trim() || 'General'
  let woNumber = workOrder?.wo_number || null

  if (!workOrder) {
    woNumber = await generateWorkOrderNumber(orgId, departmentId)
    const insert = await supabaseAdmin
      .from('manual_work_orders')
      .insert({
        org_id: orgId,
        status: 'assigned',
        wo_number: woNumber,
        source_type: sourceType,
        created_by: profileId,
        supervisor_id: profileId,
        requester_id: wr.requested_by,
        assigned_department_id: assignedDepartmentId,
        assigned_location_id: assignedLocationId,
        work_request_id: wr.id,
        equipment_id: wr.equipment_id,
        asset_hierarchy: wr.asset_hierarchy || [],
        short_description: wr.short_description || null,
        problem_description: wr.problem_description,
        is_breakdown: Boolean(wr.is_breakdown),
        priority: resolvedPriority,
        attachments: Array.isArray(wr.attachments) ? wr.attachments : [],
        form_field_values: wr.form_field_values && typeof wr.form_field_values === 'object'
          ? wr.form_field_values
          : {},
        work_center: resolvedWorkCenter,
        special_instructions: assignmentRemarks?.trim() || null,
        planned_start_at: plannedStartAt || null,
        planned_end_at: plannedEndAt || null,
        planned_duration_hours: plannedDurationHours ?? null,
      })
      .select('*')
      .single()

    if (insert.error) {
      if (!isUniqueViolation(insert.error)) throw insert.error
      workOrder = await getWorkOrderForRequest(orgId, wr.id)
      if (!workOrder) throw insert.error
    } else {
      workOrder = insert.data
    }
  }

  const linkedNumber = workOrder.wo_number || woNumber

  if (assigneeIds.length) {
    await syncWorkOrderAssignees(orgId, workOrder.id, assigneeIds)
  }

  if (!wr.manual_work_order_id) {
    await addWorkOrderTimelineEvent(
      orgId,
      workOrder.id,
      'work_order_generated',
      `Work order ${linkedNumber} generated from ${wr.request_number}.`,
      profileId,
      { newStatus: 'assigned', metadata: { work_request_id: wr.id, auto_approved: autoApproved } },
    )

    if (assigneeIds.length) {
      await addWorkOrderTimelineEvent(
        orgId,
        workOrder.id,
        'technician_assigned',
        'Technician(s) assigned.',
        profileId,
        { newStatus: 'assigned', metadata: { assignee_ids: assigneeIds } },
      )
    }

    await addWorkOrderAuditEntry(
      orgId,
      workOrder.id,
      profileId,
      autoApproved ? 'auto_created_from_work_request' : 'created_from_work_request',
      {
        newStatus: 'assigned',
        departmentId,
        remarks: assignmentRemarks?.trim() || null,
        metadata: { work_request_id: wr.id, wo_number: linkedNumber },
      },
    )
  }

  if (wr.status === 'approved' && wr.manual_work_order_id === workOrder.id) {
    return { workOrder, updated: wr, woNumber: linkedNumber }
  }

  const now = new Date().toISOString()
  const { data: updated, error: updateError } = await supabaseAdmin
    .from('work_requests')
    .update({
      status: 'approved',
      execution_status: 'assigned',
      approved_by: profileId,
      approved_at: now,
      approval_remarks: assignmentRemarks?.trim() || (autoApproved ? 'Auto-converted (no approval required).' : null),
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
    autoApproved ? 'auto_approved' : 'approved',
    autoApproved
      ? `Work request auto-converted. Work order ${linkedNumber} generated.`
      : `Work request approved. Work order ${linkedNumber} generated.`,
    profileId,
    { manual_work_order_id: workOrder.id, wo_number: linkedNumber, assignee_ids: assigneeIds },
  )
  await addTimelineEvent(
    orgId,
    wr.id,
    'work_order_generated',
    `Work order ${linkedNumber} linked.`,
    profileId,
    { manual_work_order_id: workOrder.id, wo_number: linkedNumber },
  )

  if (assigneeIds.length) {
    await addTimelineEvent(
      orgId,
      wr.id,
      'technician_assigned',
      'Technician(s) assigned.',
      profileId,
      { assignee_ids: assigneeIds },
    )
  }

  return { workOrder, updated, woNumber: linkedNumber }
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

  if (wr.status === 'approved' && wr.manual_work_order_id) {
    const existing = await getWorkOrderForRequest(orgId, wr.id)
    const enriched = await enrichWorkRequest(wr)
    return {
      ...enriched,
      work_order: existing
        ? { id: existing.id, wo_number: existing.wo_number, status: existing.status }
        : { id: wr.manual_work_order_id },
    }
  }

  if (!APPROVABLE_STATUSES.includes(wr.status)) {
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

  const { workOrder, updated, woNumber } = await createLinkedWorkOrderFromRequest(
    orgId,
    profileId,
    wr,
    {
      assigneeIds,
      workCenter: body?.work_center,
      priority: body?.priority,
      assignmentRemarks: body?.assignment_remarks,
      plannedStartAt: body?.planned_start_at,
      plannedEndAt: body?.planned_end_at,
      plannedDurationHours: body?.planned_duration_hours,
      autoApproved: false,
    },
  )

  try {
    if (wr.requested_by) {
      await notifyUser(wr.requested_by, {
        title: 'Work request approved',
        body: `${wr.request_number} → ${woNumber}`,
        data: {
          work_request_id: wr.id,
          work_order_id: workOrder.id,
          type: 'work_request_approved',
          actor_id: profileId,
          message: body?.assignment_remarks || null,
        },
        url: '/',
      })
    }
    await notifyEmployees(orgId, assigneeIds, {
      title: 'Work order assigned',
      body: `${woNumber} assigned to you`,
      data: {
        work_request_id: wr.id,
        work_order_id: workOrder.id,
        type: 'work_order_assigned',
        actor_id: profileId,
        message: body?.assignment_remarks || null,
      },
      url: '/',
    })
  } catch {
    // non-blocking
  }

  const enriched = await enrichWorkRequest(updated)
  return {
    ...enriched,
    work_order: { id: workOrder.id, wo_number: woNumber, status: workOrder.status },
  }
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

  if (!APPROVABLE_STATUSES.includes(wr.status)) {
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

  try {
    if (updated.requested_by) {
      await notifyUser(updated.requested_by, {
        title: 'Work request rejected',
        body: updated.request_number || 'Work request',
        data: {
          work_request_id: workRequestId,
          type: 'work_request_rejected',
          actor_id: profileId,
          message: text,
        },
        url: '/',
      })
    }
  } catch {
    // non-blocking
  }

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

  try {
    if (updated.requested_by) {
      await notifyUser(updated.requested_by, {
        title: 'Clarification requested',
        body: updated.request_number || 'Work request',
        data: {
          work_request_id: workRequestId,
          type: 'work_request_need_info',
          actor_id: profileId,
          message: text,
        },
        url: '/',
      })
    }
  } catch {
    // non-blocking
  }

  return enrichWorkRequest(updated)
}

export async function replyToWorkRequest(orgId, profileId, workRequestId, body) {
  const text = String(body?.message || '').trim()
  if (!text) {
    const err = new Error('Reply message is required.')
    err.status = 400
    throw err
  }

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

  if (wr.status !== 'need_info') {
    const err = new Error('This work request is not waiting for more information.')
    err.status = 400
    throw err
  }

  if (wr.requested_by !== profileId) {
    const err = new Error('Only the requester can reply to this information request.')
    err.status = 403
    throw err
  }

  const extraAttachments = Array.isArray(body?.attachments) ? body.attachments : []
  const attachments = [
    ...(Array.isArray(wr.attachments) ? wr.attachments : []),
    ...extraAttachments,
  ]

  const { data: orgRow } = await supabaseAdmin
    .from('organizations')
    .select('work_request_inter_approval_required')
    .eq('id', orgId)
    .maybeSingle()

  const interApproval = orgRow?.work_request_inter_approval_required !== false
  const nextStatus = resolveInitialStatus(wr.request_type, interApproval)
  const now = new Date().toISOString()

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('work_requests')
    .update({
      status: nextStatus,
      attachments,
      updated_at: now,
    })
    .eq('id', workRequestId)
    .select('*')
    .single()

  if (updateError) throw updateError

  await addTimelineEvent(orgId, workRequestId, 'info_provided', text, profileId, {
    attachments_added: extraAttachments.length,
  })

  try {
    await notifyWorkRequestInbox(orgId, wr, {
      title: 'Work request updated',
      body: `${wr.request_number || 'Work request'}: information provided`,
      data: {
        work_request_id: workRequestId,
        type: 'work_request_info_provided',
        actor_id: profileId,
        message: text,
      },
      url: '/',
    })
  } catch {
    // non-blocking
  }

  return enrichWorkRequest(updated)
}

async function resolveWorkRequestLocationId(orgId, wr) {
  if (wr?.equipment?.location_id) return wr.equipment.location_id
  if (wr?.order_to?.location_id) return wr.order_to.location_id
  if (wr?.order_from?.location_id) return wr.order_from.location_id
  if (wr?.requested_by) {
    const employee = await getEmployeeByProfile(orgId, wr.requested_by)
    if (employee?.location_id) return employee.location_id
  }
  return null
}

export function workRequestMatchesLocation(wr, locationId) {
  if (!locationId) return true
  if (!wr) return false
  if (wr.equipment?.location_id === locationId) return true
  if (wr.order_from?.location_id === locationId) return true
  if (wr.order_to?.location_id === locationId) return true
  return false
}

export function assertWorkRequestAccessible(wr, { profileId, locationId } = {}) {
  if (!wr) {
    const err = new Error('Work request not found.')
    err.status = 404
    throw err
  }
  if (!locationId) return wr
  if (profileId && wr.requested_by === profileId) return wr
  if (workRequestMatchesLocation(wr, locationId)) return wr
  const err = new Error('Work request not found.')
  err.status = 404
  throw err
}

const EMPTY_UUID = '00000000-0000-0000-0000-000000000000'

async function applyWorkRequestLocationScope(query, orgId, locationId) {
  if (!locationId) return query

  const [{ data: departments, error: deptError }, { data: equipment, error: equipmentError }] = await Promise.all([
    supabaseAdmin
      .from('departments')
      .select('id')
      .eq('org_id', orgId)
      .eq('location_id', locationId),
    supabaseAdmin
      .from('equipment')
      .select('id')
      .eq('org_id', orgId)
      .eq('location_id', locationId),
  ])

  if (deptError) throw deptError
  if (equipmentError) throw equipmentError

  const departmentIds = (departments || []).map((row) => row.id)
  const equipmentIds = (equipment || []).map((row) => row.id)
  const parts = []
  if (departmentIds.length) {
    const list = departmentIds.join(',')
    parts.push(`order_from_department_id.in.(${list})`)
    parts.push(`order_to_department_id.in.(${list})`)
  }
  if (equipmentIds.length) {
    parts.push(`equipment_id.in.(${equipmentIds.join(',')})`)
  }
  if (!parts.length) return query.eq('id', EMPTY_UUID)
  return query.or(parts.join(','))
}

export async function listWorkRequestTechnicians(orgId, workRequestId) {
  const wr = await getWorkRequestById(orgId, workRequestId)
  if (!wr) {
    const err = new Error('Work request not found')
    err.status = 404
    throw err
  }

  const locationId = await resolveWorkRequestLocationId(orgId, wr)
  const { data: departments, error: deptError } = await supabaseAdmin
    .from('departments')
    .select('id, name, code, location_id, all_locations, is_active')
    .eq('org_id', orgId)
    .eq('is_active', true)

  if (deptError) throw deptError

  const maintenanceIds = (departments || [])
    .filter((department) => (
      isMaintenanceDepartment(department)
      && (!locationId || departmentFitsLocation(department, locationId))
    ))
    .map((department) => department.id)

  if (!maintenanceIds.length) return []

  let query = supabaseAdmin
    .from('org_employees')
    .select(`
      id, name, emp_id, email, mobile, photo_url, department_id, location_id,
      departments!department_id ( id, name, code )
    `)
    .eq('org_id', orgId)
    .eq('is_active', true)
    .in('department_id', maintenanceIds)
    .order('name')

  if (locationId) query = query.eq('location_id', locationId)

  const { data, error } = await query
  if (error) throw error
  return data || []
}

const WR_LIST_SELECT = `
  id, org_id, request_number, status, request_type, request_date, created_at, updated_at,
  order_from_department_id, order_to_department_id, equipment_id, requested_by,
  priority, short_description, job_nature, is_breakdown, execution_status, manual_work_order_id,
  order_from:departments!work_requests_order_from_department_id_fkey(id, name, code, location_id, all_locations),
  order_to:departments!work_requests_order_to_department_id_fkey(id, name, code, location_id, all_locations),
  equipment(id, name, code),
  requester:profiles!work_requests_requested_by_fkey(id, full_name, email)
`

const WR_SELECT = `
  *,
  order_from:departments!work_requests_order_from_department_id_fkey(id, name, code, location_id, all_locations),
  order_to:departments!work_requests_order_to_department_id_fkey(id, name, code, location_id, all_locations),
  equipment(id, name, code, location_id, department_id, area_id),
  requester:profiles!work_requests_requested_by_fkey(id, full_name, email),
  approver:profiles!work_requests_approved_by_fkey(id, full_name, email)
`

export async function enrichWorkRequest(row) {
  if (!row) return null
  const [enriched] = await enrichWorkRequests([row])
  return enriched ?? null
}

async function enrichWorkRequests(rows, { lean = false } = {}) {
  if (!rows?.length) return []

  const workRequestIds = rows.map((row) => row.id)
  const manualWorkOrderIds = [...new Set(
    rows.map((row) => row.manual_work_order_id).filter(Boolean),
  )]

  const [timelineResult, assigneeResult, woResult] = await Promise.all([
    lean
      ? Promise.resolve({ data: [], error: null })
      : supabaseAdmin
        .from('work_request_timeline')
        .select('id, work_request_id, event_type, message, actor_id, metadata, created_at')
        .in('work_request_id', workRequestIds)
        .order('created_at', { ascending: true }),
    manualWorkOrderIds.length
      ? supabaseAdmin
        .from('manual_work_order_assignees')
        .select('work_order_id, employee_id, org_employees(id, name, emp_id)')
        .in('work_order_id', manualWorkOrderIds)
      : Promise.resolve({ data: [], error: null }),
    manualWorkOrderIds.length
      ? supabaseAdmin
        .from('manual_work_orders')
        .select('id, wo_number, status, work_center, priority')
        .in('id', manualWorkOrderIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (timelineResult.error) throw timelineResult.error
  if (assigneeResult.error) throw assigneeResult.error
  if (woResult.error) throw woResult.error

  const orgId = rows[0]?.org_id
  const requesterIds = [...new Set(rows.map((row) => row.requested_by).filter(Boolean))]
  const actorIds = [...new Set(
    (timelineResult.data || []).map((event) => event.actor_id).filter(Boolean),
  )]
  const peopleIds = [...new Set([...requesterIds, ...actorIds])]
  const peopleById = peopleIds.length
    ? await loadTimelineActors(orgId, peopleIds)
    : new Map()

  const timelineByRequest = new Map()
  for (const event of timelineResult.data || []) {
    if (!timelineByRequest.has(event.work_request_id)) {
      timelineByRequest.set(event.work_request_id, [])
    }
    timelineByRequest.get(event.work_request_id).push({
      ...event,
      actor: event.actor_id ? (peopleById.get(event.actor_id) || null) : null,
    })
  }

  const assigneesByWorkOrder = new Map()
  for (const link of assigneeResult.data || []) {
    if (!assigneesByWorkOrder.has(link.work_order_id)) {
      assigneesByWorkOrder.set(link.work_order_id, [])
    }
    if (link.org_employees) {
      assigneesByWorkOrder.get(link.work_order_id).push(link.org_employees)
    }
  }

  const woById = new Map((woResult.data || []).map((wo) => [wo.id, wo]))

  return rows.map((row) => {
    const linkedWo = row.manual_work_order_id ? woById.get(row.manual_work_order_id) : null
    const requester = row.requested_by
      ? (peopleById.get(row.requested_by) || row.requester || null)
      : row.requester || null
    return {
      ...row,
      requester,
      timeline: timelineByRequest.get(row.id) || [],
      assigned_technicians: row.manual_work_order_id
        ? (assigneesByWorkOrder.get(row.manual_work_order_id) || [])
        : [],
      is_breakdown_label: row.is_breakdown ? 'Yes' : 'No',
      job_nature_label: row.job_nature || (row.is_breakdown ? 'Breakdown' : null),
      linked_work_order: linkedWo
        ? {
          id: linkedWo.id,
          wo_number: linkedWo.wo_number,
          status: linkedWo.status,
          work_center: linkedWo.work_center,
          priority: linkedWo.priority,
        }
        : null,
    }
  })
}

export async function listWorkRequests(orgId, filter, {
  profileId,
  departmentId,
  locationId = null,
  search = null,
  limit = 50,
  offset = 0,
} = {}) {
  let query = supabaseAdmin
    .from('work_requests')
    .select(WR_LIST_SELECT, { count: 'exact' })
    .eq('org_id', orgId)
    .order('request_date', { ascending: false })
    .range(offset, offset + limit - 1)

  if (filter === 'my' && profileId) {
    query = query.eq('requested_by', profileId)
  } else if (filter === 'outgoing' && departmentId) {
    query = query.eq('order_from_department_id', departmentId)
  } else if (filter === 'incoming' && departmentId) {
    query = query.eq('order_to_department_id', departmentId)
  }

  if (filter !== 'my') {
    query = await applyWorkRequestLocationScope(query, orgId, locationId)
  }

  query = applyIlikeSearch(query, search, ['request_number', 'short_description', 'status'])

  const { data, error, count } = await query
  if (error) throw error

  const rows = await enrichWorkRequests(data || [], { lean: true })
  return listEnvelope(rows, { total: count || 0, limit, offset })
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
