import { Router } from 'express'
import { verifyAuth } from '../../middleware/auth.js'
import { requireOrgAccess, assertOrgOwnership } from '../../middleware/orgAccess.js'
import {
  requireModulePermission,
  loadOrgPermissions,
} from '../../middleware/modulePermission.js'
import { supabaseAdmin } from '../../services/supabase.js'
import { getScopedLocationId } from '../../lib/orgPermissions.js'

const router = Router()

const canReadWorkOrders = requireModulePermission('work_orders', 'read')
const canCreateWorkOrders = requireModulePermission('work_orders', 'create')
const canUpdateWorkOrders = requireModulePermission('work_orders', 'update')
const canManageFormSettings = requireModulePermission('work_orders', 'update')

const LIST_SIGNED_URL_LIMIT = 25

router.use(verifyAuth, requireOrgAccess, loadOrgPermissions)

function parsePagination(query, { defaultLimit = 50, maxLimit = 200 } = {}) {
  const rawLimit = Number(query.limit)
  const rawOffset = Number(query.offset)
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(maxLimit, rawLimit))
    : defaultLimit
  const offset = Number.isFinite(rawOffset) ? Math.max(0, rawOffset) : 0
  return { limit, offset }
}

async function loadOrgAssetFields(orgId) {
  const { data, error } = await supabaseAdmin
    .from('asset_fields')
    .select('*')
    .eq('org_id', orgId)
    .order('sort_order')
    .order('name')

  if (error) throw error
  return data || []
}

function enrichAssetFields(rows) {
  const byId = new Map(rows.map((row) => [row.id, row]))
  const childrenByParent = new Map()
  for (const row of rows) {
    if (row.kind === 'child' && row.parent_id && row.is_active !== false) {
      if (!childrenByParent.has(row.parent_id)) childrenByParent.set(row.parent_id, [])
      childrenByParent.get(row.parent_id).push(row)
    }
  }

  return rows.map((row) => {
    const section = row.section_id ? byId.get(row.section_id) : null
    const parent = row.parent_id ? byId.get(row.parent_id) : null
    const sectionFromParent = parent?.section_id ? byId.get(parent.section_id) : null
    const children = row.kind === 'parent' ? (childrenByParent.get(row.id) || []) : []

    return {
      ...row,
      section_name: section?.name || sectionFromParent?.name || null,
      parent_name: parent?.name || null,
      dropdown_options: row.field_type === 'dropdown'
        ? children.map((c) => c.name)
        : undefined,
    }
  })
}

async function loadFieldSettings(orgId) {
  const { data, error } = await supabaseAdmin
    .from('work_order_field_settings')
    .select('field_id, is_visible')
    .eq('org_id', orgId)

  if (error) throw error
  return new Map((data || []).map((row) => [row.field_id, row.is_visible]))
}

function isFieldVisible(field, settingsMap) {
  if (field.is_active === false) return false
  if (settingsMap.has(field.id)) return settingsMap.get(field.id)
  return true
}

function buildFormSchema(fields, settingsMap) {
  const enriched = enrichAssetFields(fields)
  const sections = enriched
    .filter((f) => f.kind === 'section')
    .filter((f) => isFieldVisible(f, settingsMap))
    .map((section) => {
      const parents = enriched
        .filter((f) => f.kind === 'parent' && f.section_id === section.id)
        .filter((f) => isFieldVisible(f, settingsMap))
        .map((parent) => ({
          id: parent.id,
          name: parent.name,
          field_type: parent.field_type,
          sort_order: parent.sort_order,
          is_visible: true,
          dropdown_options: parent.dropdown_options || [],
          depends_on_parent_id: parent.depends_on_parent_id || null,
          depends_on_option: parent.depends_on_option || null,
        }))
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))

      return {
        id: section.id,
        name: section.name,
        sort_order: section.sort_order,
        is_visible: true,
        icon_path: section.icon_path || null,
        fields: parents,
      }
    })
    .filter((section) => section.fields.length > 0)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))

  return { sections }
}

async function attachSectionIconUrls(schema) {
  const sections = await Promise.all((schema.sections || []).map(async (section) => {
    if (!section.icon_path) return section
    const { data, error } = await supabaseAdmin.storage
      .from('org-assets')
      .createSignedUrl(section.icon_path, 3600)
    if (error || !data?.signedUrl) return section
    return { ...section, icon_signed_url: data.signedUrl }
  }))
  return { sections }
}

function buildAllowedFieldsMap(schema) {
  const allowedFields = new Map()
  for (const section of schema.sections) {
    for (const field of section.fields) {
      allowedFields.set(field.id, field.field_type)
    }
  }
  return allowedFields
}

async function upsertWorkOrderValues(orgId, workOrderId, values, allowedFields) {
  const valueRows = []
  for (const [fieldId, raw] of Object.entries(values)) {
    if (!allowedFields.has(fieldId)) continue
    const fieldType = allowedFields.get(fieldId)
    const normalized = normalizeValue(fieldType, raw)
    if (normalized.value_text === null && normalized.value_json === null) continue
    valueRows.push({
      org_id: orgId,
      work_order_id: workOrderId,
      field_id: fieldId,
      ...normalized,
      updated_at: new Date().toISOString(),
    })
  }

  if (!valueRows.length) return 0

  const { error } = await supabaseAdmin
    .from('manual_work_order_values')
    .upsert(valueRows, { onConflict: 'work_order_id,field_id' })

  if (error) throw error
  return valueRows.length
}

function buildSettingsList(fields, settingsMap) {
  const enriched = enrichAssetFields(fields)
  const sections = enriched.filter((f) => f.kind === 'section' && f.is_active !== false)
  const parents = enriched.filter((f) => f.kind === 'parent' && f.is_active !== false)

  return sections
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    .map((section) => ({
      id: section.id,
      name: section.name,
      kind: 'section',
      is_visible: isFieldVisible(section, settingsMap),
      fields: parents
        .filter((p) => p.section_id === section.id)
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
        .map((parent) => ({
          id: parent.id,
          name: parent.name,
          kind: 'parent',
          field_type: parent.field_type,
          is_visible: isFieldVisible(parent, settingsMap),
        })),
    }))
}

async function getEmployeeByProfile(orgId, profileId, { email = null } = {}) {
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

async function listHeadedDepartmentIds(orgId, employeeId) {
  if (!employeeId) return []

  const [{ data: asPrimary }, { data: asLocationHead }] = await Promise.all([
    supabaseAdmin
      .from('departments')
      .select('id')
      .eq('org_id', orgId)
      .eq('head_employee_id', employeeId),
    supabaseAdmin
      .from('department_location_heads')
      .select('department_id')
      .eq('org_id', orgId)
      .eq('head_employee_id', employeeId),
  ])

  return [...new Set([
    ...(asPrimary || []).map((row) => row.id),
    ...(asLocationHead || []).map((row) => row.department_id),
  ].filter(Boolean))]
}

async function listReceivedWorkOrderIds(orgId, employee) {
  if (!employee) return []

  const ids = new Set()

  // 1) Explicit personal assignees
  const { data: assignments, error: assignmentError } = await supabaseAdmin
    .from('manual_work_order_assignees')
    .select('work_order_id')
    .eq('org_id', orgId)
    .eq('employee_id', employee.id)

  if (assignmentError) throw assignmentError
  for (const row of assignments || []) ids.add(row.work_order_id)

  // 2) Location pool — anyone at the location (incl. Location Head)
  if (employee.location_id) {
    const { data: locOrders, error: locError } = await supabaseAdmin
      .from('manual_work_orders')
      .select('id')
      .eq('org_id', orgId)
      .eq('assigned_location_id', employee.location_id)
      .eq('status', 'created')

    if (locError) throw locError
    for (const row of locOrders || []) ids.add(row.id)
  }

  // 3) Department pool — same department (at matching location when set)
  if (employee.department_id) {
    let deptQuery = supabaseAdmin
      .from('manual_work_orders')
      .select('id, assigned_location_id')
      .eq('org_id', orgId)
      .eq('assigned_department_id', employee.department_id)
      .eq('status', 'created')

    const { data: deptOrders, error: deptError } = await deptQuery
    if (deptError) throw deptError
    for (const row of deptOrders || []) {
      if (
        !row.assigned_location_id
        || !employee.location_id
        || row.assigned_location_id === employee.location_id
      ) {
        ids.add(row.id)
      }
    }
  }

  // 4) Departments this employee heads (may differ from their own department_id)
  const headedDeptIds = await listHeadedDepartmentIds(orgId, employee.id)
  if (headedDeptIds.length) {
    const { data: headedOrders, error: headedError } = await supabaseAdmin
      .from('manual_work_orders')
      .select('id, assigned_location_id')
      .eq('org_id', orgId)
      .in('assigned_department_id', headedDeptIds)
      .eq('status', 'created')

    if (headedError) throw headedError
    for (const row of headedOrders || []) {
      // Prefer same-location when employee has a location; still include if WO has no location
      if (
        !employee.location_id
        || !row.assigned_location_id
        || row.assigned_location_id === employee.location_id
      ) {
        ids.add(row.id)
      }
    }
  }

  return [...ids]
}

async function validateAssignedDepartment(orgId, departmentId, locationId) {
  if (!departmentId && !locationId) return null

  // Department requires location; location-only is allowed.
  if (departmentId && !locationId) {
    throw new Error('Department assignment requires a location')
  }

  const { data: location, error: locError } = await supabaseAdmin
    .from('org_locations')
    .select('id, name, is_active, head_employee_id')
    .eq('org_id', orgId)
    .eq('id', locationId)
    .maybeSingle()

  if (locError) throw locError
  if (!location || location.is_active === false) {
    throw new Error('Assigned location is invalid')
  }

  if (!departmentId) {
    return {
      assigned_department_id: null,
      assigned_location_id: location.id,
      assigned_department: null,
      assigned_location: {
        id: location.id,
        name: location.name,
        head_employee_id: location.head_employee_id || null,
      },
    }
  }

  const { data: department, error: deptError } = await supabaseAdmin
    .from('departments')
    .select('id, name, location_id, all_locations, is_active, head_employee_id, per_location_heads')
    .eq('org_id', orgId)
    .eq('id', departmentId)
    .maybeSingle()

  if (deptError) throw deptError
  if (!department || department.is_active === false) {
    throw new Error('Assigned department is invalid')
  }
  if (!department.all_locations && department.location_id && department.location_id !== locationId) {
    throw new Error('Department is not available at the selected location')
  }

  return {
    assigned_department_id: department.id,
    assigned_location_id: location.id,
    assigned_department: {
      id: department.id,
      name: department.name,
      location_id: location.id,
      location_name: location.name,
    },
    assigned_location: {
      id: location.id,
      name: location.name,
      head_employee_id: location.head_employee_id || null,
    },
  }
}

async function attachDepartmentAssignments(rows) {
  if (!rows.length) return rows

  const deptIds = [...new Set(rows.map((row) => row.assigned_department_id).filter(Boolean))]
  const locIds = [...new Set(rows.map((row) => row.assigned_location_id).filter(Boolean))]

  const [{ data: departments }, { data: locations }] = await Promise.all([
    deptIds.length
      ? supabaseAdmin.from('departments').select('id, name').in('id', deptIds)
      : Promise.resolve({ data: [] }),
    locIds.length
      ? supabaseAdmin.from('org_locations').select('id, name, head_employee_id').in('id', locIds)
      : Promise.resolve({ data: [] }),
  ])

  const deptById = new Map((departments || []).map((d) => [d.id, d]))
  const locById = new Map((locations || []).map((l) => [l.id, l]))

  return rows.map((row) => {
    const location = row.assigned_location_id ? locById.get(row.assigned_location_id) : null
    const department = row.assigned_department_id ? deptById.get(row.assigned_department_id) : null
    return {
      ...row,
      assigned_location: location
        ? {
            id: location.id,
            name: location.name,
            head_employee_id: location.head_employee_id || null,
          }
        : null,
      assigned_department: department
        ? {
            id: department.id,
            name: department.name,
            location_id: row.assigned_location_id,
            location_name: location?.name || null,
          }
        : (location && !row.assigned_department_id
          ? {
              id: null,
              name: null,
              location_id: location.id,
              location_name: location.name,
              location_only: true,
            }
          : null),
    }
  })
}

function employeeMatchesDepartmentAssignment(employee, workOrder) {
  if (!employee?.department_id || !workOrder?.assigned_department_id) return false
  if (employee.department_id !== workOrder.assigned_department_id) return false
  if (
    workOrder.assigned_location_id
    && employee.location_id
    && workOrder.assigned_location_id !== employee.location_id
  ) {
    return false
  }
  return true
}

async function isLocationHead(orgId, employee) {
  if (!employee?.id || !employee?.location_id) return false
  const { data, error } = await supabaseAdmin
    .from('org_locations')
    .select('id')
    .eq('org_id', orgId)
    .eq('id', employee.location_id)
    .eq('head_employee_id', employee.id)
    .maybeSingle()
  if (error) throw error
  return Boolean(data)
}

async function isDepartmentHeadFor(orgId, employee, departmentId, locationId) {
  if (!employee?.id || !departmentId) return false

  const { data: department, error } = await supabaseAdmin
    .from('departments')
    .select('id, head_employee_id, per_location_heads, all_locations')
    .eq('org_id', orgId)
    .eq('id', departmentId)
    .maybeSingle()

  if (error) throw error
  if (!department) return false
  if (department.head_employee_id === employee.id) return true

  if (department.per_location_heads && locationId) {
    const { data: row, error: headError } = await supabaseAdmin
      .from('department_location_heads')
      .select('id')
      .eq('org_id', orgId)
      .eq('department_id', departmentId)
      .eq('location_id', locationId)
      .eq('head_employee_id', employee.id)
      .maybeSingle()
    if (headError) throw headError
    return Boolean(row)
  }

  return false
}

async function validateAssignedEmployees(orgId, rawIds, { locationId = null } = {}) {
  const ids = Array.isArray(rawIds)
    ? rawIds
    : rawIds
      ? [rawIds]
      : []

  const unique = [...new Set(ids.filter(Boolean))]
  if (!unique.length) return []

  let query = supabaseAdmin
    .from('org_employees')
    .select('id, location_id')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .in('id', unique)

  if (locationId) {
    query = query.eq('location_id', locationId)
  }

  const { data, error } = await query

  if (error) throw error
  if ((data || []).length !== unique.length) {
    throw new Error(
      locationId
        ? 'Assignees must be active employees at the selected location'
        : 'One or more assigned employees are invalid',
    )
  }
  return unique
}

async function syncWorkOrderAssignees(orgId, workOrderId, employeeIds) {
  const { error: deleteError } = await supabaseAdmin
    .from('manual_work_order_assignees')
    .delete()
    .eq('org_id', orgId)
    .eq('work_order_id', workOrderId)

  if (deleteError) throw deleteError
  if (!employeeIds.length) return

  const rows = employeeIds.map((employeeId) => ({
    org_id: orgId,
    work_order_id: workOrderId,
    employee_id: employeeId,
  }))

  const { error } = await supabaseAdmin
    .from('manual_work_order_assignees')
    .insert(rows)

  if (error) throw error
}

async function loadAssigneesForWorkOrders(orgId, workOrderIds) {
  if (!workOrderIds.length) return new Map()

  const { data, error } = await supabaseAdmin
    .from('manual_work_order_assignees')
    .select('work_order_id, employee_id, org_employees(id, name, emp_id, location_id, org_locations!location_id(id, name))')
    .eq('org_id', orgId)
    .in('work_order_id', workOrderIds)

  if (error) throw error

  const byWorkOrder = new Map()
  for (const row of data || []) {
    const employee = row.org_employees
    if (!employee) continue
    if (!byWorkOrder.has(row.work_order_id)) byWorkOrder.set(row.work_order_id, [])
    byWorkOrder.get(row.work_order_id).push(employee)
  }

  for (const list of byWorkOrder.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name))
  }

  return byWorkOrder
}

function shortWorkOrderId(id) {
  return String(id || '').slice(0, 8).toUpperCase()
}

async function attachSummaries(orgId, workOrders) {
  if (!workOrders.length) return workOrders

  const ids = workOrders.map((row) => row.id)
  const { data: values, error } = await supabaseAdmin
    .from('manual_work_order_values')
    .select('work_order_id, value_text, created_at')
    .eq('org_id', orgId)
    .in('work_order_id', ids)
    .not('value_text', 'is', null)
    .order('created_at')

  if (error) throw error

  const summaryByWo = new Map()
  for (const row of values || []) {
    if (!summaryByWo.has(row.work_order_id) && row.value_text) {
      summaryByWo.set(row.work_order_id, row.value_text.slice(0, 120))
    }
  }

  return workOrders.map((row) => ({
    ...row,
    wo_number: shortWorkOrderId(row.id),
    summary: summaryByWo.get(row.id) || 'Work order',
  }))
}

async function buildWorkOrderListResponse(orgId, rows, { includeSignedUrls = false } = {}) {
  if (!rows.length) return []

  const withDepartments = await attachDepartmentAssignments(rows)
  const withSummaries = await attachSummaries(orgId, withDepartments)
  const assigneesByWo = await loadAssigneesForWorkOrders(orgId, withSummaries.map((r) => r.id))
  const creatorIds = [...new Set(withSummaries.map((r) => r.created_by).filter(Boolean))]

  const { data: creators } = creatorIds.length
    ? await supabaseAdmin.from('profiles').select('id, email').in('id', creatorIds)
    : { data: [] }

  const creatorById = new Map((creators || []).map((c) => [c.id, c]))

  return withSummaries.map((row, idx) => ({
    ...row,
    assignees: includeSignedUrls || idx < LIST_SIGNED_URL_LIMIT ? (assigneesByWo.get(row.id) || []) : [],
    creator: creatorById.get(row.created_by) || null,
  }))
}

async function listReceivedWorkOrders(orgId, profile, { status = 'created', limit = 50, offset = 0 } = {}) {
  const employee = await getEmployeeByProfile(orgId, profile?.id, { email: profile?.email })
  if (!employee) return []

  const workOrderIds = await listReceivedWorkOrderIds(orgId, employee)
  if (!workOrderIds.length) return []

  let query = supabaseAdmin
    .from('manual_work_orders')
    .select('id, status, created_at, updated_at, created_by, assigned_department_id, assigned_location_id')
    .eq('org_id', orgId)
    .in('id', workOrderIds)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) throw error
  return buildWorkOrderListResponse(orgId, data || [])
}

async function listAssignedByMeWorkOrders(orgId, profile, { status = 'created', limit = 50, offset = 0 } = {}) {
  const profileId = profile?.id || profile
  const employee = await getEmployeeByProfile(orgId, profileId, { email: profile?.email })
  const myEmployeeId = employee?.id

  let query = supabaseAdmin
    .from('manual_work_orders')
    .select('id, status, created_at, updated_at, created_by, assigned_department_id, assigned_location_id')
    .eq('org_id', orgId)
    .eq('created_by', profileId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status) query = query.eq('status', status)

  const { data: workOrders, error } = await query
  if (error) throw error
  if (!workOrders?.length) return []

  const assigneesByWo = await loadAssigneesForWorkOrders(
    orgId,
    workOrders.map((row) => row.id),
  )

  const filtered = workOrders.filter((wo) => {
    const assignees = assigneesByWo.get(wo.id) || []
    const hasDepartment = Boolean(wo.assigned_department_id)
    const hasLocation = Boolean(wo.assigned_location_id)
    if (!assignees.length && !hasDepartment && !hasLocation) return false
    if (hasDepartment || hasLocation) return true
    if (!myEmployeeId) return true
    return assignees.some((a) => a.id !== myEmployeeId)
  })

  return buildWorkOrderListResponse(orgId, filtered)
}

async function loadAssignedByMeDetail(orgId, workOrderId, profile) {
  const profileId = profile?.id || profile
  const employee = await getEmployeeByProfile(orgId, profileId, { email: profile?.email })
  const myEmployeeId = employee?.id

  const detail = await loadWorkOrderDetail(orgId, workOrderId)
  if (!detail) return null
  if (detail.created_by !== profileId) return null
  if (detail.status !== 'created') return null

  const assignees = detail.assignees || []
  const hasDepartment = Boolean(detail.assigned_department_id)
  const hasLocation = Boolean(detail.assigned_location_id)
  if (!assignees.length && !hasDepartment && !hasLocation) return null
  if (!hasDepartment && !hasLocation && myEmployeeId && assignees.every((a) => a.id === myEmployeeId)) return null

  return detail
}

async function enrichWorkOrderRow(orgId, row, assigneesByWo = null) {
  const [withDept] = await attachDepartmentAssignments([row])
  const [withSummary] = await attachSummaries(orgId, [withDept])
  const assignees = assigneesByWo?.get(row.id)
    ?? (await loadAssigneesForWorkOrders(orgId, [row.id])).get(row.id)
    ?? []

  const creator = row.created_by
    ? await supabaseAdmin
      .from('profiles')
      .select('id, email')
      .eq('id', row.created_by)
      .maybeSingle()
      .then(({ data }) => data)
    : null

  return {
    ...withSummary,
    assignees,
    creator,
  }
}

async function loadWorkOrderDetail(orgId, workOrderId, { employee = null } = {}) {
  if (employee) {
    const receivedIds = await listReceivedWorkOrderIds(orgId, employee)
    if (!receivedIds.includes(workOrderId)) return null
  }

  const { data: workOrder, error } = await supabaseAdmin
    .from('manual_work_orders')
    .select('*')
    .eq('org_id', orgId)
    .eq('id', workOrderId)
    .maybeSingle()

  if (error) throw error
  if (!workOrder) return null
  if (employee && workOrder.status !== 'created') return null

  const { data: values, error: valuesError } = await supabaseAdmin
    .from('manual_work_order_values')
    .select('*')
    .eq('org_id', orgId)
    .eq('work_order_id', workOrderId)

  if (valuesError) throw valuesError

  const fields = await loadOrgAssetFields(orgId)
  const fieldById = new Map(fields.map((f) => [f.id, f]))

  const sections = []
  const sectionMap = new Map()

  for (const field of fields.filter((f) => f.kind === 'section')) {
    sectionMap.set(field.id, { id: field.id, name: field.name, fields: [] })
  }

  for (const val of values || []) {
    const field = fieldById.get(val.field_id)
    if (!field || field.kind !== 'parent') continue

    const sectionId = field.section_id
    if (!sectionMap.has(sectionId)) continue

    sectionMap.get(sectionId).fields.push({
      id: field.id,
      name: field.name,
      field_type: field.field_type,
      value_text: val.value_text,
      value_json: val.value_json,
    })
  }

  for (const section of sectionMap.values()) {
    if (section.fields.length) sections.push(section)
  }

  const enriched = await enrichWorkOrderRow(orgId, workOrder)
  return { ...enriched, sections }
}

function normalizeValue(fieldType, raw) {
  if (raw === null || raw === undefined || raw === '') return { value_text: null, value_json: null }

  if (fieldType === 'checkbox') {
    const checked = Boolean(raw)
    return { value_text: checked ? 'true' : 'false', value_json: { checked } }
  }

  if (fieldType === 'number') {
    const num = Number(raw)
    if (Number.isNaN(num)) throw new Error('Invalid number value')
    return { value_text: String(num), value_json: { number: num } }
  }

  if (fieldType === 'file' || fieldType === 'image') {
    if (typeof raw === 'object' && raw !== null && raw.path) {
      return {
        value_text: raw.name || raw.path,
        value_json: {
          path: raw.path,
          name: raw.name || null,
          mime_type: raw.mime_type || null,
          size: raw.size ?? null,
          bucket: raw.bucket || 'work-order-assets',
        },
      }
    }
    return { value_text: null, value_json: null }
  }

  return { value_text: String(raw), value_json: null }
}

router.get('/manual/form', canReadWorkOrders, async (req, res) => {
  try {
    const orgId = req.userProfile.org_id
    const [fields, settingsMap] = await Promise.all([
      loadOrgAssetFields(orgId),
      loadFieldSettings(orgId),
    ])
    res.json(await attachSectionIconUrls(buildFormSchema(fields, settingsMap)))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/manual/form-settings', canReadWorkOrders, async (req, res) => {
  try {
    const orgId = req.userProfile.org_id
    const [fields, settingsMap] = await Promise.all([
      loadOrgAssetFields(orgId),
      loadFieldSettings(orgId),
    ])
    res.json({ sections: buildSettingsList(fields, settingsMap) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/manual/form-settings', canManageFormSettings, async (req, res) => {
  const orgId = req.userProfile.org_id
  try {
    const updates = Array.isArray(req.body?.settings) ? req.body.settings : []
    if (!updates.length) {
      return res.status(400).json({ error: 'No settings provided' })
    }

    const fields = await loadOrgAssetFields(orgId)
    const validIds = new Set(
      fields
        .filter((f) => (f.kind === 'section' || f.kind === 'parent') && f.is_active !== false)
        .map((f) => f.id)
    )

    const now = new Date().toISOString()
    const rows = []
    for (const item of updates) {
      if (!item?.field_id || !validIds.has(item.field_id)) {
        return res.status(400).json({ error: 'Invalid field in settings' })
      }
      rows.push({
        org_id: orgId,
        field_id: item.field_id,
        is_visible: Boolean(item.is_visible),
        updated_at: now,
      })
    }

    const { error } = await supabaseAdmin
      .from('work_order_field_settings')
      .upsert(rows, { onConflict: 'org_id,field_id' })

    if (error) return res.status(500).json({ error: error.message })

    const settingsMap = await loadFieldSettings(orgId)
    res.json({ sections: buildSettingsList(fields, settingsMap) })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

router.post('/manual', canCreateWorkOrders, async (req, res) => {
  const orgId = req.userProfile.org_id
  const userId = req.userProfile.id
  try {
    const status = req.body?.status === 'created' ? 'created' : 'draft'
    const values = req.body?.values && typeof req.body.values === 'object' ? req.body.values : {}

    const [fields, settingsMap] = await Promise.all([
      loadOrgAssetFields(orgId),
      loadFieldSettings(orgId),
    ])
    const schema = buildFormSchema(fields, settingsMap)
    const allowedFields = buildAllowedFieldsMap(schema)
    const assignedLocationId = req.body?.assigned_location_id || null
    const departmentAssignment = await validateAssignedDepartment(
      orgId,
      req.body?.assigned_department_id || null,
      assignedLocationId,
    )
    const assignedEmployeeIds = await validateAssignedEmployees(
      orgId,
      req.body?.assigned_employee_ids ?? req.body?.assigned_to ?? [],
      { locationId: departmentAssignment?.assigned_location_id || assignedLocationId },
    )

    const { data: workOrder, error: woError } = await supabaseAdmin
      .from('manual_work_orders')
      .insert({
        org_id: orgId,
        status,
        created_by: userId,
        assigned_department_id: departmentAssignment?.assigned_department_id || null,
        assigned_location_id: departmentAssignment?.assigned_location_id || null,
      })
      .select('*')
      .single()

    if (woError) return res.status(500).json({ error: woError.message })

    await syncWorkOrderAssignees(orgId, workOrder.id, assignedEmployeeIds)

    const valueCount = await upsertWorkOrderValues(orgId, workOrder.id, values, allowedFields)

    const enriched = await enrichWorkOrderRow(orgId, workOrder)

    res.status(201).json({ ...enriched, value_count: valueCount })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

router.patch('/manual/:id/assignment', canReadWorkOrders, assertOrgOwnership('manual_work_orders'), async (req, res) => {
  const orgId = req.userProfile.org_id
  const profileId = req.userProfile.id
  const workOrderId = req.params.id
  const claimSelf = Boolean(req.body?.claim_self)

  try {
    const employee = await getEmployeeByProfile(orgId, profileId, { email: req.userProfile.email })
    if (!employee) return res.status(403).json({ error: 'No employee profile linked to your account' })

    const { data: workOrder, error: woError } = await supabaseAdmin
      .from('manual_work_orders')
      .select('id, status, assigned_department_id, assigned_location_id, created_by')
      .eq('org_id', orgId)
      .eq('id', workOrderId)
      .maybeSingle()

    if (woError) throw woError
    if (!workOrder) return res.status(404).json({ error: 'Work order not found' })
    if (workOrder.status !== 'created') {
      return res.status(400).json({ error: 'Only created work orders can be reassigned' })
    }

    const isLH = await isLocationHead(orgId, employee)
    const isDH = workOrder.assigned_department_id
      ? await isDepartmentHeadFor(
        orgId,
        employee,
        workOrder.assigned_department_id,
        workOrder.assigned_location_id,
      )
      : false
    const headedDeptIds = await listHeadedDepartmentIds(orgId, employee.id)
    const inDeptPool = employeeMatchesDepartmentAssignment(employee, workOrder)
      || (
        Boolean(workOrder.assigned_department_id)
        && headedDeptIds.includes(workOrder.assigned_department_id)
        && (
          !employee.location_id
          || !workOrder.assigned_location_id
          || workOrder.assigned_location_id === employee.location_id
        )
      )
    const atLocation = Boolean(
      workOrder.assigned_location_id
      && workOrder.assigned_location_id === employee.location_id,
    )
    const locationOnlyPool = atLocation && !workOrder.assigned_department_id

    // Self-claim from department or location pool
    if (claimSelf) {
      if (!inDeptPool && !locationOnlyPool) {
        return res.status(403).json({ error: 'You can only claim work orders assigned to your location or department' })
      }
      const current = (await loadAssigneesForWorkOrders(orgId, [workOrderId])).get(workOrderId) || []
      const ids = [...new Set([...current.map((a) => a.id), employee.id])]
      await syncWorkOrderAssignees(orgId, workOrderId, ids)
      const detail = await loadWorkOrderDetail(orgId, workOrderId)
      return res.json(detail)
    }

    const nextLocationId = req.body?.assigned_location_id !== undefined
      ? (req.body.assigned_location_id || null)
      : workOrder.assigned_location_id
    const nextDepartmentId = req.body?.assigned_department_id !== undefined
      ? (req.body.assigned_department_id || null)
      : workOrder.assigned_department_id
    const hasEmployeeIds = Array.isArray(req.body?.assigned_employee_ids)

    // Location Head of this WO's location may set department and/or employees
    if (isLH && atLocation) {
      if (nextLocationId && nextLocationId !== workOrder.assigned_location_id) {
        return res.status(403).json({ error: 'Location Heads cannot move work orders to another location' })
      }
      const departmentAssignment = await validateAssignedDepartment(
        orgId,
        nextDepartmentId,
        nextLocationId || workOrder.assigned_location_id,
      )
      const employeeIds = hasEmployeeIds
        ? await validateAssignedEmployees(orgId, req.body.assigned_employee_ids, {
          locationId: departmentAssignment?.assigned_location_id || workOrder.assigned_location_id,
        })
        : null

      const updates = {
        assigned_department_id: departmentAssignment?.assigned_department_id ?? null,
        assigned_location_id: departmentAssignment?.assigned_location_id || workOrder.assigned_location_id,
        updated_at: new Date().toISOString(),
      }
      const { error: updateError } = await supabaseAdmin
        .from('manual_work_orders')
        .update(updates)
        .eq('id', workOrderId)
        .eq('org_id', orgId)
      if (updateError) throw updateError

      if (employeeIds) await syncWorkOrderAssignees(orgId, workOrderId, employeeIds)
      const detail = await loadWorkOrderDetail(orgId, workOrderId)
      return res.json(detail)
    }

    // Department Head may set employees (keep dept/location)
    if (isDH && inDeptPool) {
      if (!hasEmployeeIds) {
        return res.status(400).json({ error: 'assigned_employee_ids is required' })
      }
      if (
        (req.body.assigned_location_id && req.body.assigned_location_id !== workOrder.assigned_location_id)
        || (req.body.assigned_department_id && req.body.assigned_department_id !== workOrder.assigned_department_id)
      ) {
        return res.status(403).json({ error: 'Department Heads cannot change location or department' })
      }
      const employeeIds = await validateAssignedEmployees(orgId, req.body.assigned_employee_ids, {
        locationId: workOrder.assigned_location_id,
      })
      await syncWorkOrderAssignees(orgId, workOrderId, employeeIds)
      const detail = await loadWorkOrderDetail(orgId, workOrderId)
      return res.json(detail)
    }

    // Same-dept employee may only claim self (handled above)
    return res.status(403).json({ error: 'You do not have permission to reassign this work order' })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

router.patch('/manual/:id/values', canUpdateWorkOrders, assertOrgOwnership('manual_work_orders'), async (req, res) => {
  const orgId = req.userProfile.org_id
  try {
    const values = req.body?.values && typeof req.body.values === 'object' ? req.body.values : {}
    const [fields, settingsMap] = await Promise.all([
      loadOrgAssetFields(orgId),
      loadFieldSettings(orgId),
    ])
    const schema = buildFormSchema(fields, settingsMap)
    const allowedFields = buildAllowedFieldsMap(schema)
    const valueCount = await upsertWorkOrderValues(orgId, req.params.id, values, allowedFields)
    res.json({ id: req.params.id, value_count: valueCount })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

router.get('/dashboard', canReadWorkOrders, async (req, res) => {
  const orgId = req.userProfile.org_id
  const profileId = req.userProfile.id
  const scopedLocationId = getScopedLocationId(req.orgPermissions)
  const locationFilter = typeof req.query.location_id === 'string' ? req.query.location_id : null
  const dateFrom = typeof req.query.date_from === 'string' ? req.query.date_from : null
  const dateTo = typeof req.query.date_to === 'string' ? req.query.date_to : null

  try {
    const employee = await getEmployeeByProfile(orgId, profileId, { email: req.userProfile.email })

    let query = supabaseAdmin
      .from('manual_work_orders')
      .select('id, status, created_at, updated_at, created_by, assigned_department_id, assigned_location_id')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(1000)

    if (dateFrom) query = query.gte('created_at', new Date(dateFrom).toISOString())
    if (dateTo) {
      const end = new Date(`${dateTo}T23:59:59.999`)
      query = query.lte('created_at', end.toISOString())
    }

    const { data: rows, error } = await query
    if (error) return res.status(500).json({ error: error.message })

    const workOrders = rows || []
    const [assigneesByWo, withDepartments, withSummaries] = await Promise.all([
      loadAssigneesForWorkOrders(orgId, workOrders.map((row) => row.id)),
      attachDepartmentAssignments(workOrders),
      attachSummaries(orgId, workOrders),
    ])

    const summaryById = new Map(withSummaries.map((row) => [row.id, row]))
    const deptById = new Map(withDepartments.map((row) => [row.id, row]))

    const receivedIds = new Set(employee ? await listReceivedWorkOrderIds(orgId, employee) : [])

    const effectiveLocationId = scopedLocationId
      || (locationFilter && locationFilter !== 'all' ? locationFilter : null)

    const orders = workOrders.map((row) => {
      const assignees = assigneesByWo.get(row.id) || []
      const withDept = deptById.get(row.id) || row
      const summary = summaryById.get(row.id)
      const locationIds = [
        ...new Set([
          ...assignees.map((a) => a.location_id).filter(Boolean),
          withDept.assigned_location_id,
        ].filter(Boolean)),
      ]
      const locationName = withDept.assigned_department?.location_name
        || assignees.find((a) => a.org_locations?.name)?.org_locations?.name
        || (assignees.length || withDept.assigned_department ? 'Unknown location' : 'Unassigned')

      return {
        id: row.id,
        wo_number: summary?.wo_number || shortWorkOrderId(row.id),
        title: summary?.summary || 'Work order',
        summary: summary?.summary || 'Work order',
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
        created_by: row.created_by,
        assignee_count: assignees.length,
        assigned_department: withDept.assigned_department || null,
        location_ids: locationIds,
        location_id: locationIds[0] || null,
        location_name: locationName,
        is_received: receivedIds.has(row.id),
      }
    }).filter((row) => {
      if (!effectiveLocationId) return true
      return row.location_ids.includes(effectiveLocationId)
    })

    res.json({
      work_orders: orders,
      received_count: orders.filter((o) => o.is_received).length,
      scoped_location_id: scopedLocationId,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/counts', canReadWorkOrders, async (req, res) => {
  const orgId = req.userProfile.org_id
  const profileId = req.userProfile.id

  try {
    const employee = await getEmployeeByProfile(orgId, profileId, { email: req.userProfile.email })

    let received = 0
    if (employee) {
      const workOrderIds = await listReceivedWorkOrderIds(orgId, employee)
      if (workOrderIds.length) {
        const { count, error } = await supabaseAdmin
          .from('manual_work_orders')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', orgId)
          .in('id', workOrderIds)
          .eq('status', 'created')

        if (error) throw error
        received = count || 0
      }
    }

    const assignedRows = await listAssignedByMeWorkOrders(orgId, req.userProfile)
    const assigned = assignedRows.length

    const { count: manualCount, error: manualError } = await supabaseAdmin
      .from('manual_work_orders')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'created')

    if (manualError) throw manualError

    res.json({
      received,
      assigned,
      scheduled: 0,
      manual: manualCount || 0,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/manual/orders', canReadWorkOrders, async (req, res) => {
  const orgId = req.userProfile.org_id
  const { limit, offset } = parsePagination(req.query)
  try {
    const { data, error } = await supabaseAdmin
      .from('manual_work_orders')
      .select('id, status, created_at, updated_at, created_by, assigned_department_id, assigned_location_id')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) return res.status(500).json({ error: error.message })
    res.json(await buildWorkOrderListResponse(orgId, data || []))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/manual/orders/:id', canReadWorkOrders, async (req, res) => {
  const orgId = req.userProfile.org_id
  try {
    const detail = await loadWorkOrderDetail(orgId, req.params.id)
    if (!detail) return res.status(404).json({ error: 'Not found' })
    res.json(detail)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/assigned', canReadWorkOrders, async (req, res) => {
  const orgId = req.userProfile.org_id
  const { limit, offset } = parsePagination(req.query)
  try {
    const rows = await listAssignedByMeWorkOrders(orgId, req.userProfile, { limit, offset })
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/assigned/:id', canReadWorkOrders, async (req, res) => {
  const orgId = req.userProfile.org_id
  try {
    const detail = await loadAssignedByMeDetail(orgId, req.params.id, req.userProfile)
    if (!detail) return res.status(404).json({ error: 'Not found' })
    res.json(detail)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/scheduled', canReadWorkOrders, async (_req, res) => {
  res.json([])
})

router.get('/received', canReadWorkOrders, async (req, res) => {
  const orgId = req.userProfile.org_id
  const { limit, offset } = parsePagination(req.query)
  try {
    const rows = await listReceivedWorkOrders(orgId, req.userProfile, { limit, offset })
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/received/:id', canReadWorkOrders, async (req, res) => {
  const orgId = req.userProfile.org_id
  const profileId = req.userProfile.id
  try {
    const employee = await getEmployeeByProfile(orgId, profileId, { email: req.userProfile.email })
    if (!employee) return res.status(404).json({ error: 'Not found' })

    const detail = await loadWorkOrderDetail(orgId, req.params.id, {
      employee,
    })
    if (!detail) return res.status(404).json({ error: 'Not found' })

    const isLH = await isLocationHead(orgId, employee)
    const isDH = detail.assigned_department_id
      ? await isDepartmentHeadFor(
        orgId,
        employee,
        detail.assigned_department_id,
        detail.assigned_location_id,
      )
      : false
    const headedDeptIds = await listHeadedDepartmentIds(orgId, employee.id)
    const inDeptPool = employeeMatchesDepartmentAssignment(employee, detail)
      || (
        Boolean(detail.assigned_department_id)
        && headedDeptIds.includes(detail.assigned_department_id)
        && (
          !employee.location_id
          || !detail.assigned_location_id
          || detail.assigned_location_id === employee.location_id
        )
      )
    const locationPool = Boolean(
      detail.assigned_location_id
      && detail.assigned_location_id === employee.location_id,
    )
    const alreadyAssignee = (detail.assignees || []).some((a) => a.id === employee.id)

    res.json({
      ...detail,
      assignment_actions: {
        can_reassign_as_location_head: Boolean(isLH && locationPool),
        can_reassign_as_department_head: Boolean(isDH && inDeptPool),
        can_claim_self: Boolean(
          (inDeptPool || (locationPool && !detail.assigned_department_id))
          && !alreadyAssignee,
        ),
        employee_id: employee.id,
      },
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
