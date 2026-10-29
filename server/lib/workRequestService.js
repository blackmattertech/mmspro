import { supabaseAdmin } from '../services/supabase.js'
import { loadOrgFields } from './equipmentFieldService.js'
import { listEquipment, getEquipmentDetail, deriveEquipmentIdentity, hierarchyParentFields } from './equipmentService.js'
import { notifyUser, notifyEmployees, notifyByModule } from '../services/notifications.js'
import { buildManualWorkOrderFormSchema } from './manualWorkOrderForm.js'
import {
  applyIlikeSearch,
  applyMappedFilters,
  applyMappedSort,
  applyStatusSelection,
  ilikePattern,
  listEnvelope,
  restrictToIds,
} from './listQuery.js'
import { countExactStatuses, countStatusesViaRpc } from './statusCounts.js'
import { createTtlCache } from './ttlCache.js'
import { loadTimelineActors } from './timelineActors.js'
import {
  generateWorkOrderNumber,
  addWorkOrderTimelineEvent,
  addWorkOrderAuditEntry,
  mapRequestTypeToSource,
} from './workOrderService.js'
import { clipDynamicFieldValues, clipTrimmedToLimit, getTextFieldLimitsMap } from './textFieldLimits.js'
import { isMissingDisabledModulesColumn, isProductModuleEnabled, normalizeDisabledModules } from './orgModules.js'
import { loadModuleApprovals } from './moduleApprovals.js'
import {
  loadRuntimeFormLayout,
  listFormFieldValues,
  loadOrgCatalogFields,
  attachFormFieldValueMaps,
  fillWorkRequestShortDescriptions,
} from './orgFormLayouts.js'
import { shouldRequire, systemId, parseLayoutId } from './formLayoutIds.js'
import { getMasterSource } from './formFieldSources.js'
import { assertChecklistForForm, snapshotChecklistTemplate } from './checklistService.js'
import { normalizeOptions } from './formOptionRules.js'
import { assignedStatusForTechnicians, maybePromoteAssignedToAccepted } from './formSkips.js'
import { workOrderFormIdForSource } from './workOrderForms.js'
import {
  resolveJobNatureChoiceList,
  resolveWorkCenterChoiceList,
} from './formFieldMasters.js'
import {
  findJobNatureField,
  isBreakdownJobNature,
  jobNatureOptionsFromField,
  resolveJobNatureField,
} from './jobNatureField.js'

export {
  findJobNatureField,
  isBreakdownJobNature,
  jobNatureOptionsFromField,
  resolveJobNatureField,
}

async function loadOrgDisabledModules(orgId) {
  const { data, error } = await supabaseAdmin
    .from('organizations')
    .select('disabled_modules')
    .eq('id', orgId)
    .maybeSingle()
  if (error && isMissingDisabledModulesColumn(error)) return []
  if (error) throw error
  return normalizeDisabledModules(data?.disabled_modules)
}

async function assertWorkOrdersEnabled(orgId) {
  const disabledModules = await loadOrgDisabledModules(orgId)
  if (isProductModuleEnabled(disabledModules, 'work_orders')) return
  const err = new Error('Work Orders is not enabled for this organization.')
  err.status = 400
  throw err
}

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

function sanitizeTimelineAttachments(list) {
  return (Array.isArray(list) ? list : []).map((file) => {
    if (!file || typeof file !== 'object') return null
    const path = file.path || file.url || ''
    const name = file.name || file.file_name || ''
    if (!path && !name) return null
    return {
      path: path || null,
      url: file.url || null,
      name: name || 'file',
      size: Number.isFinite(Number(file.size)) ? Number(file.size) : null,
      mime_type: file.mime_type || file.type || '',
      bucket: file.bucket || null,
    }
  }).filter(Boolean)
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

function hierarchyStepText(item) {
  if (!item) return ''
  if (item.value_text) return String(item.value_text).trim()
  if (Array.isArray(item.value_json?.values)) {
    return item.value_json.values.map((value) => String(value ?? '').trim()).filter(Boolean).join(', ')
  }
  return ''
}

export async function buildAssetHierarchy(orgId, equipmentId) {
  if (!equipmentId) return []
  const detail = await getEquipmentDetail(orgId, equipmentId)
  if (!detail) return []

  const fields = await loadOrgFields(orgId)
  const chain = hierarchyParentFields(fields)
  const byId = new Map()
  for (const item of detail.field_values || []) {
    if (item?.field_id) byId.set(item.field_id, item)
  }
  if (!byId.size) {
    const fieldById = new Map(fields.map((field) => [field.id, field]))
    for (const val of detail.values || []) {
      const field = fieldById.get(val.field_id)
      if (!field || field.kind === 'section' || field.kind === 'child') continue
      byId.set(val.field_id, {
        field_id: val.field_id,
        field_name: field.name,
        field_type: field.field_type,
        value_text: val.value_text,
        value_json: val.value_json,
      })
    }
  }

  const path = []
  const seenNames = new Set()
  for (const field of chain) {
    if (field.field_type === 'image' || field.field_type === 'file') continue
    const name = String(field.name || '').trim()
    const text = hierarchyStepText(byId.get(field.id))
    if (!name || !text) continue
    const key = name.toLowerCase()
    if (seenNames.has(key)) continue
    seenNames.add(key)
    path.push({ field_id: field.id, field_name: name, value: text })
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
    option_bindings: p.option_bindings || [],
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

/** Merge equipment.name / equipment.code into the first and last levels when missing. */
function enrichEquipmentCatalogValues(fields, equipmentRow, valuesByFieldId) {
  const values = { ...valuesByFieldId }
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

async function areaIdsWithNames(orgId, names) {
  const unique = [...new Set(names.map((name) => String(name || '').trim()).filter(Boolean))]
  if (!unique.length) return []
  const clauses = unique.map((name) => {
    const safe = name.replace(/[%_,.()]/g, '')
    return `name.ilike."${safe}"`
  })
  const { data, error } = await supabaseAdmin
    .from('areas')
    .select('id, name')
    .eq('org_id', orgId)
    .or(clauses.join(','))
  if (error) throw error
  const wanted = new Set(unique.map((name) => name.toLowerCase()))
  return (data || [])
    .filter((row) => wanted.has(String(row.name || '').trim().toLowerCase()))
    .map((row) => row.id)
}

async function shapeEquipmentCatalog(orgId, equipment, fields = null) {
  if (!equipment.length) return []
  const orgFields = fields || await loadOrgFields(orgId)
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

  return equipment.map((row) => {
    const raw = valuesByEquipment.get(row.id) || {}
    const values = enrichEquipmentCatalogValues(orgFields, row, raw)
    for (const item of row.field_values || []) {
      if (item?.field_id && item.value_text) values[item.field_id] = item.value_text
    }
    return {
      id: row.id,
      name: row.name,
      code: row.code,
      location_id: row.location_id,
      department_id: row.department_id,
      area_id: row.area_id,
      area_name: row.areas?.name ?? row.area_name ?? null,
      location_name: row.org_locations?.name ?? row.location_name ?? null,
      qr_code: row.qr_code || null,
      image_signed_url: row.image_signed_url || null,
      values,
    }
  })
}

export async function listEquipmentCatalogForDepartment(orgId, departmentId, {
  search = null,
  limit = 500,
  offset = 0,
  locationId = null,
} = {}) {
  const page = await listEquipment(orgId, {
    departmentId,
    locationId: locationId || null,
    search,
    limit,
    offset,
  })
  const equipment = [...(page.items || [])]
  const seen = new Set(equipment.map((row) => row.id))
  const areaNames = equipment.map((row) => row.areas?.name).filter(Boolean)
  const sharedAreaIds = (await areaIdsWithNames(orgId, areaNames))
    .filter((areaId) => !equipment.some((row) => row.area_id === areaId))
  for (const areaId of sharedAreaIds) {
    const extra = await listEquipment(orgId, { areaId, locationId: locationId || null, search, limit: 200 })
    for (const row of extra.items || []) {
      if (seen.has(row.id)) continue
      if (locationId && row.location_id && row.location_id !== locationId) continue
      seen.add(row.id)
      equipment.push(row)
    }
  }

  const fields = await loadOrgFields(orgId)
  const sections = buildAssetFieldSections(fields)

  if (!equipment.length) {
    return { equipment: [], has_assets: false, total: page.total || 0, sections }
  }

  return {
    has_assets: true,
    equipment: await shapeEquipmentCatalog(orgId, equipment, fields),
    total: page.total || equipment.length,
    sections,
  }
}

/** Equipment picker catalog for PM plans: department and/or plant, plus asset field sections. */
export async function listEquipmentPickerCatalog(orgId, {
  departmentId = null,
  locationId = null,
  search = null,
  limit = 200,
} = {}) {
  const fields = await loadOrgFields(orgId)
  const sections = buildAssetFieldSections(fields)
  if (!departmentId && !locationId) {
    return { equipment: [], has_assets: false, total: 0, sections }
  }

  if (departmentId) {
    const catalog = await listEquipmentCatalogForDepartment(orgId, departmentId, {
      search,
      limit,
      locationId,
    })
    const { data: areaRows, error: areaError } = await supabaseAdmin
      .from('areas')
      .select('id, name, department_id, is_active')
      .eq('org_id', orgId)
      .eq('department_id', departmentId)
      .order('name')
    if (areaError) throw areaError
    const areas = (areaRows || [])
      .filter((row) => row.is_active !== false && row.name)
      .map((row) => ({ id: row.id, name: row.name }))
    return { ...catalog, sections, areas }
  }

  const page = await listEquipment(orgId, {
    locationId,
    search,
    limit,
    offset: 0,
  })
  const equipment = await shapeEquipmentCatalog(orgId, page.items || [], fields)
  return {
    has_assets: equipment.length > 0,
    equipment,
    total: page.total || equipment.length,
    sections,
  }
}

const DEFAULT_WORK_REQUEST_PRIORITIES = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

function canonicalWorkRequestPriority(value, fallback = 'medium') {
  const raw = String(value || '').trim().toLowerCase()
  if (raw === 'high' || raw === 'medium' || raw === 'low') return raw
  const next = String(fallback || '').trim().toLowerCase()
  if (next === 'high' || next === 'medium' || next === 'low') return next
  return 'medium'
}

function isPriorityLayoutField(field) {
  const parsed = parseLayoutId(field?.id)
  const key = field?.bindKey || (parsed.kind === 'system' ? parsed.value : '')
  const label = String(field?.label || '').toLowerCase().replace(/[^a-z0-9]+/g, '')
  return key === 'priority' || label === 'priority' || label === 'jobpriority'
}

function priorityChoicesFromLayout(layout) {
  const fields = (layout?.fields || []).filter(isPriorityLayoutField)
  const field = fields.find((item) => normalizeOptions(item.options).length) || fields[0]
  const usable = []
  const seen = new Set()
  for (const item of normalizeOptions(field?.options)) {
    const valueKey = String(item.value || '').trim().toLowerCase()
    const labelKey = String(item.label || '').trim().toLowerCase()
    const canonical = ['high', 'medium', 'low'].includes(valueKey)
      ? valueKey
      : (['high', 'medium', 'low'].includes(labelKey) ? labelKey : '')
    if (!canonical || seen.has(canonical)) continue
    seen.add(canonical)
    usable.push({ value: canonical, label: item.label || DEFAULT_WORK_REQUEST_PRIORITIES.find((row) => row.value === canonical).label })
  }
  return usable.length ? usable : DEFAULT_WORK_REQUEST_PRIORITIES.map((item) => ({ ...item }))
}

async function syncWorkRequestPriorityField(orgId, workRequestId, priority) {
  const canonical = canonicalWorkRequestPriority(priority, '')
  if (!['high', 'medium', 'low'].includes(canonical)) return
  const layout = await loadRuntimeFormLayout(orgId, 'work_request.create')
  const fields = (layout?.fields || []).filter(isPriorityLayoutField)
  const field = fields.find((item) => normalizeOptions(item.options).length) || fields[0]
  if (!field?.id) return
  const option = normalizeOptions(field.options).find((item) => (
    canonicalWorkRequestPriority(item.value, '') === canonical
    || canonicalWorkRequestPriority(item.label, '') === canonical
  ))
  const stored = option?.label || option?.value || canonical
  const { error } = await supabaseAdmin
    .from('org_form_field_values')
    .upsert({
      org_id: orgId,
      form_id: 'work_request.create',
      record_id: workRequestId,
      field_id: field.id,
      value_json: stored,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'org_id,form_id,record_id,field_id' })
  if (error) throw error
}

export async function loadWorkRequestPriorityOptions(orgId) {
  try {
    const layout = await loadRuntimeFormLayout(orgId, 'work_request.create')
    return priorityChoicesFromLayout(layout)
  } catch {
    return DEFAULT_WORK_REQUEST_PRIORITIES.map((item) => ({ ...item }))
  }
}

export async function loadWorkRequestAssignmentOptions(orgId) {
  const [priorities, workCenterChoice] = await Promise.all([
    loadWorkRequestPriorityOptions(orgId),
    resolveWorkCenterChoiceList(orgId),
  ])
  return {
    priorities,
    work_centers: workCenterChoice.options,
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

  const [departments, fromDeptResult, moduleApprovals] = await Promise.all([
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
    loadModuleApprovals(orgId),
  ])

  if (fromDeptResult.error) throw fromDeptResult.error

  const orgFields = await loadOrgFields(orgId)
  const assetSections = buildAssetFieldSections(orgFields)
  const maintenanceFormSchema = await buildManualWorkOrderFormSchema(orgId)
  const jobNatureField = await resolveJobNatureField(orgId)
  const jobNatureChoices = await resolveJobNatureChoiceList(orgId)

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
    inter_department_approval_required: moduleApprovals.work_request !== false,
    asset_sections: assetSections,
    maintenance_form_schema: maintenanceFormSchema,
    job_nature_field: jobNatureField
      ? {
        id: jobNatureField.id,
        name: jobNatureField.name,
        is_required: Boolean(jobNatureField.is_required),
      }
      : null,
    job_natures: jobNatureChoices,
    request_types: [
      { value: 'inter_department', label: 'Inter Department' },
      { value: 'intra_department', label: 'Intra Department' },
      { value: 'user_self', label: 'User Self Request' },
      { value: 'manual', label: 'Manual Work Request' },
    ],
    priorities: await loadWorkRequestPriorityOptions(orgId),
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
    const err = new Error('Selected asset is not available.')
    err.status = 400
    throw err
  }
  if (data.department_id !== departmentId) {
    const err = new Error('Asset does not belong to the selected executing department.')
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

  const layout = await loadRuntimeFormLayout(orgId, 'work_request.create')
  const requireField = (key, whenNoLayout) => shouldRequire(layout, systemId(key), whenNoLayout)

  let requestType = body?.request_type
  const validTypes = new Set(['inter_department', 'intra_department', 'user_self', 'manual'])
  if (!validTypes.has(requestType)) {
    if (requireField('request_type', true)) {
      const err = new Error('Invalid request type.')
      err.status = 400
      throw err
    }
    requestType = 'inter_department'
  }

  let orderToId = body?.order_to_department_id || null
  let orderFromId = body?.order_from_department_id || employee?.department_id || null

  if (!orderFromId && isOrgAdmin && requireField('order_from_department_id', true)) {
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
    if (requireField('order_to_department_id', true)) {
      const err = new Error('Order To department is required.')
      err.status = 400
      throw err
    }
    orderToId = orderFromId
  }
  if (!orderFromId || !orderToId) {
    const err = new Error('A department is required to save this request.')
    err.status = 400
    throw err
  }

  if (requestType === 'inter_department' && orderToId === orderFromId) {
    if (requireField('order_to_department_id', true)) {
      const err = new Error('Inter-department requests must select a different Order To department.')
      err.status = 400
      throw err
    }
    requestType = 'intra_department'
  }

  await assertDepartmentInOrg(orgId, orderToId, 'Order to department', {
    locationId: isOrgAdmin ? null : (employee?.location_id || null),
  })

  const isDraft = body?.save_as === 'draft'

  const fieldLimits = await getTextFieldLimitsMap(orgId)
  let problem = clipTrimmedToLimit(fieldLimits, 'problem_description', body?.problem_description) || ''
  let shortDescription = clipTrimmedToLimit(fieldLimits, 'short_description', body?.short_description) || ''
  let priority = canonicalWorkRequestPriority(body?.priority, 'medium')
  const equipmentId = body?.equipment_id || null

  if (isDraft) {
    if (!['high', 'medium', 'low'].includes(priority)) {
      priority = 'medium'
    }
    if (equipmentId) {
      await assertEquipmentInDepartment(orgId, equipmentId, orderToId)
    }
  } else {
    if (requireField('short_description', true) && !shortDescription) {
      const err = new Error('Short description is required.')
      err.status = 400
      throw err
    }

    if (requireField('problem_description', true) && !problem) {
      const err = new Error('Problem description is required.')
      err.status = 400
      throw err
    }
    if (!problem) problem = ''

    if (!['high', 'medium', 'low'].includes(priority)) {
      if (requireField('priority', true)) {
        const err = new Error('Priority is required.')
        err.status = 400
        throw err
      }
      priority = 'medium'
    }

    if (requireField('asset_picker', true) && !equipmentId) {
      const err = new Error('An asset selection is required.')
      err.status = 400
      throw err
    }

    if (equipmentId) {
      await assertEquipmentInDepartment(orgId, equipmentId, orderToId)
    }

    if (requireField('asset_picker', true)) {
      const equipmentList = await listEquipmentForDepartment(orgId, orderToId)
      if (!equipmentList.length) {
        const err = new Error('No assets are available for the selected department.')
        err.status = 400
        throw err
      }
    }
  }

  const moduleApprovals = await loadModuleApprovals(orgId)
  const approvalRequired = moduleApprovals.work_request !== false
  const status = isDraft ? 'draft' : resolveInitialStatus(requestType, approvalRequired)
  const requestNumber = isDraft ? null : await generateWorkRequestNumber(orgId, orderToId)
  const assetHierarchy = equipmentId ? await buildAssetHierarchy(orgId, equipmentId) : []
  const now = new Date().toISOString()
  const maintenanceFormSchema = await buildManualWorkOrderFormSchema(orgId)
  const formFieldValues = clipDynamicFieldValues(
    fieldLimits,
    maintenanceFormSchema,
    body?.form_field_values && typeof body.form_field_values === 'object'
      ? body.form_field_values
      : {},
  )

  const jobNatureField = await resolveJobNatureField(orgId)
  const jobNatureOptions = (await resolveJobNatureChoiceList(orgId)).map((row) => row.value)
  let jobNature = String(body?.job_nature || '').trim() || null
  if (jobNature && jobNatureOptions.length && !jobNatureOptions.includes(jobNature)) {
    const err = new Error('Selected job nature is not valid.')
    err.status = 400
    throw err
  }
  if (!isDraft && jobNatureField?.is_required && requireField('job_nature', true) && !jobNature) {
    const err = new Error('Job nature is required.')
    err.status = 400
    throw err
  }
  if (!isDraft && !jobNature && jobNatureOptions.length && requireField('job_nature', true)) {
    const err = new Error('Job nature is required.')
    err.status = 400
    throw err
  }
  const isBreakdown = jobNature
    ? isBreakdownJobNature(jobNature)
    : Boolean(body?.is_breakdown)

  let checklistTemplateId = null
  let checklistSnapshot = {}
  if (body?.checklist_template_id) {
    const template = await assertChecklistForForm(orgId, body.checklist_template_id, 'work_request.create')
    checklistTemplateId = template.id
    checklistSnapshot = await snapshotChecklistTemplate(orgId, template.id) || {}
  }

  const insertPayload = {
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
    remarks: clipTrimmedToLimit(fieldLimits, 'remarks', body?.remarks),
    attachments: Array.isArray(body?.attachments) ? body.attachments : [],
    form_field_values: formFieldValues,
    requested_by: profileId,
    checklist_template_id: checklistTemplateId,
    checklist_snapshot: checklistSnapshot,
    checklist_values: {},
    updated_at: now,
  }
  let { data: row, error } = await supabaseAdmin
    .from('work_requests')
    .insert(insertPayload)
    .select('*')
    .single()
  if (error && /checklist_/i.test(error.message || '')) {
    if (checklistTemplateId) {
      const err = new Error('Apply the module-actions database patch before attaching a work request checklist.')
      err.status = 400
      throw err
    }
    delete insertPayload.checklist_template_id
    delete insertPayload.checklist_snapshot
    delete insertPayload.checklist_values
    const retry = await supabaseAdmin.from('work_requests').insert(insertPayload).select('*').single()
    row = retry.data
    error = retry.error
  }
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
      const disabledModules = await loadOrgDisabledModules(orgId)
      if (!isProductModuleEnabled(disabledModules, 'work_orders')) {
        return enrichWorkRequest(row)
      }
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
  const fieldLimits = await getTextFieldLimitsMap(orgId)
  const limitedAssignmentRemarks = clipTrimmedToLimit(fieldLimits, 'remarks', assignmentRemarks)

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
  const resolvedPriority = canonicalWorkRequestPriority(priority, wr.priority)
  const resolvedWorkCenter = String(workCenter || '').trim() || 'General'
  let woNumber = workOrder?.wo_number || null

  if (!workOrder) {
    woNumber = await generateWorkOrderNumber(orgId, departmentId)
    const initialStatus = await assignedStatusForTechnicians(
      orgId,
      workOrderFormIdForSource(sourceType),
      Boolean(assigneeIds.length),
    )
    const insert = await supabaseAdmin
      .from('manual_work_orders')
      .insert({
        org_id: orgId,
        status: initialStatus,
        wo_number: woNumber,
        source_type: sourceType,
        created_by: profileId,
        supervisor_id: profileId,
        requester_id: wr.requested_by,
        assigned_department_id: assignedDepartmentId,
        assigned_location_id: assignedLocationId,
        work_request_id: wr.id,
        equipment_id: wr.equipment_id,
        asset_hierarchy: wr.equipment_id
          ? await buildAssetHierarchy(orgId, wr.equipment_id)
          : (wr.asset_hierarchy || []),
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
  } else if (wr.short_description && !String(workOrder.short_description || '').trim()) {
    await supabaseAdmin
      .from('manual_work_orders')
      .update({ short_description: wr.short_description })
      .eq('id', workOrder.id)
    workOrder = { ...workOrder, short_description: wr.short_description }
  }

  const linkedNumber = workOrder.wo_number || woNumber

  if (assigneeIds.length) {
    await syncWorkOrderAssignees(orgId, workOrder.id, assigneeIds)
    const nextStatus = await maybePromoteAssignedToAccepted(orgId, {
      formId: workOrderFormIdForSource(workOrder.source_type || sourceType),
      workOrderId: workOrder.id,
      currentStatus: workOrder.status,
      hasAssignees: true,
    })
    workOrder = { ...workOrder, status: nextStatus }
  }

  if (!wr.manual_work_order_id) {
    await addWorkOrderTimelineEvent(
      orgId,
      workOrder.id,
      'work_order_generated',
      `Work order ${linkedNumber} generated from ${wr.request_number}.`,
      profileId,
      { newStatus: workOrder.status, metadata: { work_request_id: wr.id, auto_approved: autoApproved } },
    )

    if (assigneeIds.length) {
      await addWorkOrderTimelineEvent(
        orgId,
        workOrder.id,
        'technician_assigned',
        'Technician(s) assigned.',
        profileId,
        { newStatus: workOrder.status, metadata: { assignee_ids: assigneeIds } },
      )
    }

    await addWorkOrderAuditEntry(
      orgId,
      workOrder.id,
      profileId,
      autoApproved ? 'auto_created_from_work_request' : 'created_from_work_request',
      {
        newStatus: workOrder.status,
        departmentId,
        remarks: limitedAssignmentRemarks,
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
      approval_remarks: limitedAssignmentRemarks || (autoApproved ? 'Auto-converted (no approval required).' : null),
      manual_work_order_id: workOrder.id,
      priority: resolvedPriority,
      updated_at: now,
    })
    .eq('id', wr.id)
    .select('*')
    .single()

  if (updateError) throw updateError
  await syncWorkRequestPriorityField(orgId, wr.id, resolvedPriority)

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

  await assertWorkOrdersEnabled(orgId)

  if (!APPROVABLE_STATUSES.includes(wr.status)) {
    const err = new Error('This work request cannot be approved in its current status.')
    err.status = 400
    throw err
  }

  const assigneeIds = Array.isArray(body?.assigned_employee_ids)
    ? [...new Set(body.assigned_employee_ids.filter(Boolean))]
    : []

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

  const extraAttachments = sanitizeTimelineAttachments(body?.attachments)
  const attachments = [
    ...(Array.isArray(wr.attachments) ? wr.attachments : []),
    ...extraAttachments,
  ]

  const moduleApprovals = await loadModuleApprovals(orgId)
  const approvalRequired = moduleApprovals.work_request !== false
  const nextStatus = resolveInitialStatus(wr.request_type, approvalRequired)
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
    attachments: extraAttachments,
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

async function loadWorkRequestLocationIds(orgId, locationId) {
  const key = `${orgId}:${locationId}`
  const cached = wrLocationScopeCache.get(key)
  if (cached) return cached

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

  const value = {
    departmentIds: (departments || []).map((row) => row.id),
    equipmentIds: (equipment || []).map((row) => row.id),
  }
  wrLocationScopeCache.set(key, value)
  return value
}

async function applyWorkRequestLocationScope(query, orgId, locationId) {
  if (!locationId) return { query }

  const { departmentIds, equipmentIds } = await loadWorkRequestLocationIds(orgId, locationId)
  const parts = []
  if (departmentIds.length) {
    const list = departmentIds.join(',')
    parts.push(`order_from_department_id.in.(${list})`)
    parts.push(`order_to_department_id.in.(${list})`)
  }
  if (equipmentIds.length) {
    parts.push(`equipment_id.in.(${equipmentIds.join(',')})`)
  }
  if (!parts.length) return { query: query.eq('id', EMPTY_UUID) }
  return { query: query.or(parts.join(',')) }
}

export async function listWorkRequestTechnicians(orgId, workRequestId) {
  const wr = await getWorkRequestById(orgId, workRequestId)
  if (!wr) {
    const err = new Error('Work request not found')
    err.status = 404
    throw err
  }

  const departmentId = wr.order_to_department_id || wr.order_to?.id || null
  if (!departmentId) return []

  const { data, error } = await supabaseAdmin
    .from('org_employees')
    .select(`
      id, name, emp_id, email, mobile, photo_url, department_id, location_id,
      departments!department_id ( id, name ),
      org_locations!location_id ( id, name, code )
    `)
    .eq('org_id', orgId)
    .eq('is_active', true)
    .eq('department_id', departmentId)
    .order('name')

  if (error) throw error
  return data || []
}

const WR_LIST_SELECT = `
  id, org_id, request_number, status, request_type, request_date, created_at, updated_at,
  order_from_department_id, order_to_department_id, equipment_id, requested_by,
  priority, short_description, problem_description, job_nature, is_breakdown, execution_status, manual_work_order_id, remarks, form_field_values,
  asset_hierarchy,
  order_from:departments!work_requests_order_from_department_id_fkey(id, name, location_id, all_locations),
  order_to:departments!work_requests_order_to_department_id_fkey(id, name, location_id, all_locations),
  equipment(id, name, code),
  requester:profiles!work_requests_requested_by_fkey(id, full_name, email)
`

const wrLocationScopeCache = createTtlCache({ ttlMs: 60_000, maxEntries: 200 })

const WR_SELECT = `
  *,
  order_from:departments!work_requests_order_from_department_id_fkey(id, name, location_id, all_locations),
  order_to:departments!work_requests_order_to_department_id_fkey(id, name, location_id, all_locations),
  equipment(
    id, name, code, qr_code, location_id, department_id, area_id,
    areas(id, name, code),
    departments(id, name),
    org_locations(id, name, code)
  ),
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

const WR_TEXT_FILTERS = {
  wr_number: 'request_number',
  request_number: 'request_number',
  type: 'request_type',
  problem: 'short_description',
  description: 'short_description',
  priority: 'priority',
  status: 'status',
  job_nature: 'job_nature',
  remarks: 'remarks',
}

const WR_RANGE_FILTERS = {
  request_date_from: (query, value) => query.gte('request_date', value),
  request_date_to: (query, value) => query.lte('request_date', `${value}T23:59:59.999`),
}

const WR_SORT_COLUMNS = {
  ...WR_TEXT_FILTERS,
  request_date: 'request_date',
}

const WR_RELATION_FILTERS = new Set([
  'from', 'order_from', 'to', 'order_to', 'equipment', 'requester', 'work_order', 'assigned',
])

async function lookupOrgIds(table, orgId, column, value) {
  const pattern = ilikePattern(value)
  if (!pattern) return []
  const { data, error } = await supabaseAdmin
    .from(table)
    .select('id')
    .eq('org_id', orgId)
    .ilike(column, pattern)
    .limit(300)
  if (error) throw error
  return (data || []).map((row) => row.id)
}

async function applyWorkRequestRelationFilters(query, orgId, filters = {}) {
  let next = query
  const from = filters.from || filters.order_from
  if (from) next = restrictToIds(next, 'order_from_department_id', await lookupOrgIds('departments', orgId, 'name', from))
  const to = filters.to || filters.order_to
  if (to) next = restrictToIds(next, 'order_to_department_id', await lookupOrgIds('departments', orgId, 'name', to))
  if (filters.equipment) {
    next = restrictToIds(next, 'equipment_id', await lookupOrgIds('equipment', orgId, 'name', filters.equipment))
  }
  if (filters.requester) {
    const pattern = ilikePattern(filters.requester)
    if (pattern) {
      const { data, error } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('org_id', orgId)
        .or(`full_name.ilike.${pattern},email.ilike.${pattern}`)
        .limit(300)
      if (error) throw error
      next = restrictToIds(next, 'requested_by', (data || []).map((row) => row.id))
    }
  }
  if (filters.work_order) {
    next = restrictToIds(next, 'manual_work_order_id', await lookupOrgIds('manual_work_orders', orgId, 'wo_number', filters.work_order))
  }
  if (filters.assigned) {
    const employeeIds = await lookupOrgIds('org_employees', orgId, 'name', filters.assigned)
    if (!employeeIds.length) {
      next = restrictToIds(next, 'manual_work_order_id', [])
    } else {
      const { data, error } = await supabaseAdmin
        .from('manual_work_order_assignees')
        .select('work_order_id')
        .eq('org_id', orgId)
        .in('employee_id', employeeIds)
        .limit(500)
      if (error) throw error
      next = restrictToIds(next, 'manual_work_order_id', (data || []).map((row) => row.work_order_id))
    }
  }
  return { query: next }
}

function textOnlyFilters(filters = {}) {
  return Object.fromEntries(
    Object.entries(filters).filter(([key]) => !WR_RELATION_FILTERS.has(key)),
  )
}

async function scopeWorkRequestQuery(query, orgId, filter, { profileId, departmentId, locationId, search }) {
  let next = query
  if (filter === 'my' && profileId) next = next.eq('requested_by', profileId)
  else if (filter === 'outgoing' && departmentId) next = next.eq('order_from_department_id', departmentId)
  else if (filter === 'incoming' && departmentId) next = next.eq('order_to_department_id', departmentId)
  if (filter !== 'my') {
    const scoped = await applyWorkRequestLocationScope(next, orgId, locationId)
    next = scoped.query
  }
  return { query: applyIlikeSearch(next, search, ['request_number', 'short_description', 'status']) }
}

export async function countWorkRequestTabs(orgId, {
  profileId,
  departmentId,
  locationId = null,
} = {}) {
  const tabs = ['my', 'incoming', 'outgoing', 'all']
  const entries = await Promise.all(tabs.map(async (filter) => {
    if ((filter === 'incoming' || filter === 'outgoing') && !departmentId) {
      return [filter, 0]
    }
    let query = supabaseAdmin
      .from('work_requests')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .neq('status', 'draft')
    query = (await scopeWorkRequestQuery(query, orgId, filter, { profileId, departmentId, locationId })).query
    const { count, error } = await query
    if (error) throw error
    return [filter, count || 0]
  }))
  return Object.fromEntries(entries)
}

export async function listWorkRequests(orgId, filter, {
  profileId,
  departmentId,
  locationId = null,
  search = null,
  limit = 50,
  offset = 0,
  filters = {},
  statuses = [],
  excludeStatuses = [],
  sort = '',
  sortDir = 'desc',
} = {}) {
  let query = supabaseAdmin
    .from('work_requests')
    .select(WR_LIST_SELECT, { count: 'exact' })
    .eq('org_id', orgId)

  query = (await scopeWorkRequestQuery(query, orgId, filter, {
    profileId, departmentId, locationId, search,
  })).query
  query = applyMappedFilters(query, textOnlyFilters(filters), { ...WR_TEXT_FILTERS, ...WR_RANGE_FILTERS })
  query = (await applyWorkRequestRelationFilters(query, orgId, filters)).query
  query = applyStatusSelection(query, {
    statuses,
    excludeStatuses,
    defaultExclude: ['draft'],
  })
  query = applyMappedSort(query, sort, sortDir, WR_SORT_COLUMNS, (sorted) => (
    sorted.order('request_date', { ascending: false })
  ))
  query = query.range(offset, offset + limit - 1)

  const WR_LIST_STATUSES = [
    'draft',
    'submitted',
    'pending_approval',
    'need_info',
    'info_provided',
    'approved',
    'rejected',
    'cancelled',
    'converted',
  ]

  const [{ data, error, count }, status_counts] = await Promise.all([
    query,
    countStatusesViaRpc(
      'count_work_request_statuses',
      {
        p_org_id: orgId,
        p_filter: filter || 'all',
        p_profile_id: profileId || null,
        p_department_id: departmentId || null,
        p_location_id: locationId || null,
        p_search: search ? String(search).trim() || null : null,
      },
      () => countExactStatuses(
        () => {
          let q = supabaseAdmin
            .from('work_requests')
            .select('id', { count: 'exact', head: true })
            .eq('org_id', orgId)
          if (filter === 'my' && profileId) q = q.eq('requested_by', profileId)
          else if (filter === 'outgoing' && departmentId) q = q.eq('order_from_department_id', departmentId)
          else if (filter === 'incoming' && departmentId) q = q.eq('order_to_department_id', departmentId)
          return (async () => {
            if (filter !== 'my') {
              const scoped = await applyWorkRequestLocationScope(q, orgId, locationId)
              q = scoped.query
            }
            return {
              query: applyIlikeSearch(q, search, ['request_number', 'short_description', 'status']),
            }
          })()
        },
        WR_LIST_STATUSES,
      ),
    ),
  ])
  if (error) throw error

  const rows = await fillWorkRequestShortDescriptions(
    orgId,
    await attachFormFieldValueMaps(
      orgId,
      'work_request.create',
      await enrichWorkRequests(data || [], { lean: true }),
    ),
  )
  return listEnvelope(rows, { total: count || 0, limit, offset, status_counts })
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
  const enriched = await enrichWorkRequest(data)
  const detailed = await attachWorkRequestDetailFields(orgId, enriched)
  const [withShortDescription] = await fillWorkRequestShortDescriptions(orgId, [detailed])
  return withShortDescription || detailed
}

function formatStoredFieldValue(value) {
  if (value == null || value === '') return ''
  if (Array.isArray(value)) return value.map((item) => String(item ?? '').trim()).filter(Boolean).join(', ')
  if (typeof value === 'object') {
    if (value.label != null) return String(value.label)
    if (value.name != null) return String(value.name)
    if (Array.isArray(value.values)) {
      return value.values.map((item) => String(item ?? '').trim()).filter(Boolean).join(', ')
    }
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

async function attachWorkRequestDetailFields(orgId, row) {
  if (!row) return null

  let assetHierarchy = Array.isArray(row.asset_hierarchy) ? [...row.asset_hierarchy] : []
  if (row.equipment_id) {
    try {
      const live = await buildAssetHierarchy(orgId, row.equipment_id)
      if (live.length) assetHierarchy = live
    } catch {
      // keep stored hierarchy
    }
  }

  const [layout, catalogFields, layoutValues] = await Promise.all([
    loadRuntimeFormLayout(orgId, 'work_request.create'),
    loadOrgCatalogFields(orgId),
    listFormFieldValues(orgId, 'work_request.create', row.id),
  ])

  const catalogById = new Map((catalogFields || []).map((item) => [String(item.id), item]))
  const layoutFieldRows = []
  const skipBindKeys = new Set([
    'request_type',
    'order_from_department_id',
    'order_to_department_id',
    'equipment_id',
    'area_id',
  ])

  for (const field of layout?.fields || []) {
    const parsed = parseLayoutId(field.id)
    if (parsed.kind === 'system') continue
    if (field.bindKey && skipBindKeys.has(field.bindKey)) continue
    if (field.masterSource === 'equipment' || field.masterSource === 'areas' || field.masterSource === 'departments') {
      continue
    }
    if (parsed.kind === 'master' && ['equipment', 'areas', 'departments', 'locations'].includes(parsed.value)) {
      continue
    }

    const catalog = parsed.kind === 'catalog' ? catalogById.get(parsed.value) : null
    if (catalog?.field_source === 'equipment') continue
    const rawKey = parsed.kind === 'catalog' ? parsed.value : field.id
    const stored = layoutValues[rawKey] ?? layoutValues[field.id] ?? layoutValues[catalogIdSafe(field.id)]
    const display = formatStoredFieldValue(stored)
    if (!display) continue

    const master = getMasterSource(field.masterSource || (parsed.kind === 'master' ? parsed.value : ''))
    layoutFieldRows.push({
      id: field.id,
      label: field.label || catalog?.name || master?.label || parsed.value,
      value: display,
    })
  }

  // Also include any saved values not covered by layout (legacy / removed fields)
  const usedKeys = new Set()
  for (const field of layout?.fields || []) {
    const parsed = parseLayoutId(field.id)
    usedKeys.add(field.id)
    if (parsed.kind === 'catalog') usedKeys.add(parsed.value)
  }
  for (const [fieldId, stored] of Object.entries(layoutValues || {})) {
    if (usedKeys.has(fieldId)) continue
    const catalog = catalogById.get(String(fieldId))
    if (catalog?.field_source === 'equipment') continue
    const display = formatStoredFieldValue(stored)
    if (!display) continue
    layoutFieldRows.push({
      id: fieldId,
      label: catalog?.name || fieldId,
      value: display,
    })
  }

  const breakdownValues = row.form_field_values && typeof row.form_field_values === 'object'
    ? row.form_field_values
    : {}
  const breakdownFields = []
  for (const [fieldId, stored] of Object.entries(breakdownValues)) {
    const display = formatStoredFieldValue(stored)
    if (!display) continue
    const catalog = catalogById.get(String(fieldId))
    breakdownFields.push({
      id: fieldId,
      label: catalog?.name || fieldId,
      value: display,
    })
  }
  breakdownFields.sort((a, b) => {
    const aOrder = catalogById.get(String(a.id))?.sort_order ?? 9999
    const bOrder = catalogById.get(String(b.id))?.sort_order ?? 9999
    return aOrder - bOrder
  })

  if (!String(row.job_nature || '').trim()) {
    const fromLayout = layoutFieldRows.find((item) => /job\s*nature/i.test(String(item.label || '')))
    if (fromLayout?.value) row.job_nature = fromLayout.value
  }

  const equipment = row.equipment
    ? {
      ...row.equipment,
      area_name: row.equipment.areas?.name || row.equipment.area_name || null,
      department_name: row.equipment.departments?.name || null,
      location_name: row.equipment.org_locations?.name || null,
    }
    : null

  return {
    ...row,
    equipment,
    asset_hierarchy: assetHierarchy,
    layout_fields: layoutFieldRows,
    breakdown_fields: breakdownFields,
    field_values: {
      ...(row.field_values || {}),
      ...(layoutValues || {}),
    },
  }
}

function catalogIdSafe(id) {
  const value = String(id || '')
  return value.startsWith('catalog:') ? value.slice('catalog:'.length) : value
}

export async function saveWorkRequestChecklist(orgId, requestId, values = {}) {
  const request = await getWorkRequestById(orgId, requestId)
  const fields = request.checklist_snapshot?.fields || []
  if (!fields.length) {
    const err = new Error('This work request has no checklist.')
    err.status = 400
    throw err
  }
  const next = values && typeof values === 'object' ? values : {}
  const { data, error } = await supabaseAdmin
    .from('work_requests')
    .update({ checklist_values: next, updated_at: new Date().toISOString() })
    .eq('org_id', orgId)
    .eq('id', requestId)
    .select('id, checklist_values')
    .single()
  if (error) throw error
  return data
}
