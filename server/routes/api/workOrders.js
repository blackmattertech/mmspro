import { Router } from 'express'
import { verifyAuth } from '../../middleware/auth.js'
import { requireOrgAccess, assertOrgOwnership } from '../../middleware/orgAccess.js'
import {
  requireModulePermission,
  loadOrgPermissions,
} from '../../middleware/modulePermission.js'
import { supabaseAdmin } from '../../services/supabase.js'
import { getScopedLocationId } from '../../lib/orgPermissions.js'
import { getSignedUrl, getSignedUrls } from '../../lib/signedUrlCache.js'

const router = Router()

const canReadWorkOrders = requireModulePermission('work_orders', 'read')
const canCreateWorkOrders = requireModulePermission('work_orders', 'create')
const canUpdateWorkOrders = requireModulePermission('work_orders', 'update')
const canDeleteWorkOrders = requireModulePermission('work_orders', 'delete')
const canManageFormSettings = requireModulePermission('work_orders', 'update')
const OPTION_FIELD_TYPES = new Set(['dropdown', 'radio', 'checkbox'])

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

async function loadOrgWorkOrderFields(orgId) {
  const [assetResult, equipmentResult] = await Promise.all([
    supabaseAdmin
      .from('asset_fields')
      .select('*')
      .eq('org_id', orgId)
      .order('sort_order')
      .order('name'),
    supabaseAdmin
      .from('equipment_fields')
      .select('*')
      .eq('org_id', orgId)
      .order('sort_order')
      .order('name'),
  ])

  if (assetResult.error) throw assetResult.error
  if (equipmentResult.error) throw equipmentResult.error

  const byId = new Map()
  for (const row of assetResult.data || []) byId.set(row.id, { ...row, field_source: 'asset' })
  for (const row of equipmentResult.data || []) {
    // Sections are shared and stored in asset_fields. Keep legacy equipment
    // sections only when the migration has not copied the id yet.
    if (row.kind === 'section' && byId.has(row.id)) continue
    byId.set(row.id, { ...row, field_source: 'equipment' })
  }

  return [...byId.values()]
}

function enrichWorkOrderFields(rows) {
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
      dropdown_options: OPTION_FIELD_TYPES.has(row.field_type)
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
  const enriched = enrichWorkOrderFields(fields)
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
          field_source: parent.field_source || 'asset',
          sort_order: parent.sort_order,
          is_visible: true,
          is_required: Boolean(parent.is_required),
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
    const signedUrl = await getSignedUrl('org-assets', section.icon_path)
    if (!signedUrl) return section
    return { ...section, icon_signed_url: signedUrl }
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
  const enriched = enrichWorkOrderFields(fields)
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
          field_source: parent.field_source || 'asset',
          is_visible: isFieldVisible(parent, settingsMap),
        })),
    }))
}

/** Reorder active form sections; inactive sections keep their relative slots. */
async function reorderWorkOrderSections(orgId, orderedSectionIds) {
  if (!Array.isArray(orderedSectionIds) || !orderedSectionIds.length) {
    throw Object.assign(new Error('section_ids array is required'), { status: 400 })
  }

  const fields = await loadOrgWorkOrderFields(orgId)
  const sections = fields
    .filter((f) => f.kind === 'section')
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))

  const activeSections = sections.filter((s) => s.is_active !== false)
  const activeSet = new Set(activeSections.map((s) => s.id))

  if (orderedSectionIds.length !== activeSections.length) {
    throw Object.assign(new Error('Reorder must include all form sections'), { status: 400 })
  }
  if (orderedSectionIds.some((id) => !activeSet.has(id))) {
    throw Object.assign(new Error('Invalid section id in order'), { status: 400 })
  }

  const queue = [...orderedSectionIds]
  const finalIds = []
  for (const section of sections) {
    if (activeSet.has(section.id)) {
      finalIds.push(queue.shift())
    } else {
      finalIds.push(section.id)
    }
  }

  const byId = new Map(sections.map((section) => [section.id, section]))
  const now = new Date().toISOString()
  for (let i = 0; i < finalIds.length; i++) {
    const section = byId.get(finalIds[i])
    if (!section) continue
    const table = section.field_source === 'equipment' ? 'equipment_fields' : 'asset_fields'
    const { error } = await supabaseAdmin
      .from(table)
      .update({ sort_order: i, updated_at: now })
      .eq('id', section.id)
      .eq('org_id', orgId)
      .eq('kind', 'section')
    if (error) throw error
  }
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

async function listReceivedWorkOrderIds(orgId, employee) {
  if (!employee) return []

  const ids = new Set()

  const [assignmentResult, locResult, deptResult] = await Promise.all([
    supabaseAdmin
      .from('manual_work_order_assignees')
      .select('work_order_id')
      .eq('org_id', orgId)
      .eq('employee_id', employee.id),
    employee.location_id
      ? supabaseAdmin
          .from('manual_work_orders')
          .select('id')
          .eq('org_id', orgId)
          .eq('assigned_location_id', employee.location_id)
          .eq('status', 'created')
      : Promise.resolve({ data: [], error: null }),
    employee.department_id
      ? supabaseAdmin
          .from('manual_work_orders')
          .select('id, assigned_location_id')
          .eq('org_id', orgId)
          .eq('assigned_department_id', employee.department_id)
          .eq('status', 'created')
      : Promise.resolve({ data: [], error: null }),
  ])

  if (assignmentResult.error) throw assignmentResult.error
  if (locResult.error) throw locResult.error
  if (deptResult.error) throw deptResult.error

  for (const row of assignmentResult.data || []) ids.add(row.work_order_id)
  for (const row of locResult.data || []) ids.add(row.id)
  for (const row of deptResult.data || []) {
    if (
      !row.assigned_location_id
      || !employee.location_id
      || row.assigned_location_id === employee.location_id
    ) {
      ids.add(row.id)
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
    .select('id, name, location_id, all_locations, is_active')
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

async function isLocationHeadFor(orgId, employee, locationId, session = null) {
  if (!employee?.id || !locationId) return false

  const { data, error } = await supabaseAdmin
    .from('org_locations')
    .select('id')
    .eq('org_id', orgId)
    .eq('id', locationId)
    .eq('head_employee_id', employee.id)
    .maybeSingle()

  if (error) throw error
  if (data) return true

  // Access role "Location Head" at this location (same convention as company employee flags)
  const roleName = session?.access_role?.name?.trim().toLowerCase()
  if (roleName === 'location head' && employee.location_id === locationId) {
    return true
  }

  return false
}

async function buildAssignmentActions(orgId, detail, employee, session = null) {
  if (!detail || !employee) {
    return {
      can_reassign_as_location_head: false,
      can_claim_self: false,
      employee_id: employee?.id || null,
    }
  }

  const isLH = await isLocationHeadFor(orgId, employee, detail.assigned_location_id, session)
  const inDeptPool = employeeMatchesDepartmentAssignment(employee, detail)
  const locationPool = Boolean(
    detail.assigned_location_id
    && detail.assigned_location_id === employee.location_id,
  )
  const alreadyAssignee = (detail.assignees || []).some((a) => a.id === employee.id)

  return {
    can_reassign_as_location_head: Boolean(isLH && locationPool),
    can_claim_self: Boolean(
      (inDeptPool || (locationPool && !detail.assigned_department_id))
      && !alreadyAssignee,
    ),
    employee_id: employee.id,
  }
}

async function validateAssignedEmployees(orgId, rawIds, { locationId = null, departmentId = null } = {}) {
  const ids = Array.isArray(rawIds)
    ? rawIds
    : rawIds
      ? [rawIds]
      : []

  const unique = [...new Set(ids.filter(Boolean))]
  if (!unique.length) return []

  let query = supabaseAdmin
    .from('org_employees')
    .select('id, location_id, department_id')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .in('id', unique)

  if (locationId) {
    query = query.eq('location_id', locationId)
  }
  if (departmentId) {
    query = query.eq('department_id', departmentId)
  }

  const { data, error } = await query

  if (error) throw error
  if ((data || []).length !== unique.length) {
    throw new Error(
      departmentId
        ? 'Assignees must be active employees in the selected department'
        : locationId
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

async function loadAssigneesForWorkOrders(orgId, workOrderIds, { withPhotos = true } = {}) {
  if (!workOrderIds.length) return new Map()

  const { data, error } = await supabaseAdmin
    .from('manual_work_order_assignees')
    .select(`
      work_order_id,
      employee_id,
      org_employees(
        id,
        name,
        emp_id,
        photo_url,
        location_id,
        department_id,
        org_locations!location_id(id, name),
        departments!department_id(id, name)
      )
    `)
    .eq('org_id', orgId)
    .in('work_order_id', workOrderIds)

  if (error) throw error

  const byWorkOrder = new Map()
  const photoPaths = []

  for (const row of data || []) {
    const employee = row.org_employees
    if (!employee) continue

    const mapped = {
      id: employee.id,
      name: employee.name,
      emp_id: employee.emp_id,
      photo_url: employee.photo_url || null,
      photo_signed_url: null,
      location_id: employee.location_id || null,
      department_id: employee.department_id || null,
      department_name: employee.departments?.name || null,
      location_name: employee.org_locations?.name || null,
      departments: employee.departments || null,
      org_locations: employee.org_locations || null,
    }

    if (mapped.photo_url) photoPaths.push(mapped.photo_url)
    if (!byWorkOrder.has(row.work_order_id)) byWorkOrder.set(row.work_order_id, [])
    byWorkOrder.get(row.work_order_id).push(mapped)
  }

  let signedByPath = new Map()
  if (withPhotos && photoPaths.length) {
    signedByPath = await getSignedUrls('org-assets', photoPaths)
  }

  for (const list of byWorkOrder.values()) {
    for (const employee of list) {
      if (employee.photo_url) {
        employee.photo_signed_url = signedByPath.get(employee.photo_url) || null
      }
    }
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

async function buildWorkOrderListResponse(orgId, rows, existingAssigneesByWo = null) {
  if (!rows.length) return []

  const withDepartments = await attachDepartmentAssignments(rows)
  const withSummaries = await attachSummaries(orgId, withDepartments)
  const assigneesByWo = existingAssigneesByWo
    || await loadAssigneesForWorkOrders(orgId, withSummaries.map((r) => r.id))
  const creatorIds = [...new Set(withSummaries.map((r) => r.created_by).filter(Boolean))]

  const { data: creators } = creatorIds.length
    ? await supabaseAdmin.from('profiles').select('id, email, full_name').in('id', creatorIds)
    : { data: [] }

  const creatorById = new Map((creators || []).map((c) => [c.id, {
    id: c.id,
    email: c.email || null,
    full_name: c.full_name || null,
    display_name: c.full_name || c.email || null,
  }]))

  return withSummaries.map((row) => ({
    ...row,
    assignees: assigneesByWo.get(row.id) || [],
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

function isAssignedByMeRow(wo, assignees, myEmployeeId) {
  const hasDepartment = Boolean(wo.assigned_department_id)
  const hasLocation = Boolean(wo.assigned_location_id)
  if (!assignees.length && !hasDepartment && !hasLocation) return false
  if (hasDepartment || hasLocation) return true
  if (!myEmployeeId) return true
  return assignees.some((a) => a.id !== myEmployeeId)
}

/** Lightweight count for badge — no summaries, creators, or signed URLs. */
async function countAssignedByMe(orgId, profile, { status = 'created' } = {}) {
  const profileId = profile?.id || profile
  const employee = await getEmployeeByProfile(orgId, profileId, { email: profile?.email })
  const myEmployeeId = employee?.id

  let query = supabaseAdmin
    .from('manual_work_orders')
    .select('id, assigned_department_id, assigned_location_id')
    .eq('org_id', orgId)
    .eq('created_by', profileId)

  if (status) query = query.eq('status', status)

  const { data: workOrders, error } = await query
  if (error) throw error
  if (!workOrders?.length) return 0

  const assigneesByWo = await loadAssigneesForWorkOrders(
    orgId,
    workOrders.map((row) => row.id),
    { withPhotos: false },
  )

  return workOrders.filter((wo) =>
    isAssignedByMeRow(wo, assigneesByWo.get(wo.id) || [], myEmployeeId),
  ).length
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

  const filtered = workOrders.filter((wo) =>
    isAssignedByMeRow(wo, assigneesByWo.get(wo.id) || [], myEmployeeId),
  )

  return buildWorkOrderListResponse(orgId, filtered, assigneesByWo)
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
      .select('id, email, full_name')
      .eq('id', row.created_by)
      .maybeSingle()
      .then(({ data }) => data)
    : null

  return {
    ...withSummary,
    assignees,
    creator: creator
      ? {
          id: creator.id,
          email: creator.email || null,
          full_name: creator.full_name || null,
          display_name: creator.full_name || creator.email || null,
        }
      : null,
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

  const [fields, settingsMap] = await Promise.all([
    loadOrgWorkOrderFields(orgId),
    loadFieldSettings(orgId),
  ])
  const schema = buildFormSchema(fields, settingsMap)
  const fieldById = new Map(fields.map((f) => [f.id, f]))
  const valueByFieldId = new Map((values || []).map((val) => [val.field_id, val]))
  const seenFieldIds = new Set()

  const sections = []
  for (const section of schema.sections || []) {
    const sectionFields = []
    for (const field of section.fields || []) {
      seenFieldIds.add(field.id)
      const val = valueByFieldId.get(field.id)
      sectionFields.push({
        id: field.id,
        name: field.name,
        field_type: field.field_type,
        value_text: val?.value_text ?? null,
        value_json: val?.value_json ?? null,
      })
    }
    if (sectionFields.length) {
      sections.push({ id: section.id, name: section.name, fields: sectionFields })
    }
  }

  // Keep values for fields later removed from the form schema
  const orphanBySection = new Map()
  for (const val of values || []) {
    if (seenFieldIds.has(val.field_id)) continue
    const field = fieldById.get(val.field_id)
    if (!field || field.kind !== 'parent') continue
    const sectionId = field.section_id || '_other'
    if (!orphanBySection.has(sectionId)) {
      const sectionMeta = fieldById.get(sectionId)
      orphanBySection.set(sectionId, {
        id: sectionId,
        name: sectionMeta?.name || 'Other fields',
        fields: [],
      })
    }
    orphanBySection.get(sectionId).fields.push({
      id: field.id,
      name: field.name,
      field_type: field.field_type,
      value_text: val.value_text,
      value_json: val.value_json,
    })
  }
  for (const section of orphanBySection.values()) {
    if (section.fields.length) sections.push(section)
  }

  const enriched = await enrichWorkOrderRow(orgId, workOrder)
  return { ...enriched, sections }
}

function normalizeFileMeta(item) {
  if (!item || typeof item !== 'object' || !item.path) return null
  return {
    path: item.path,
    name: item.name || null,
    mime_type: item.mime_type || item.type || null,
    size: item.size ?? null,
    bucket: item.bucket || 'work-order-assets',
  }
}

function normalizeValue(fieldType, raw) {
  if (raw === null || raw === undefined || raw === '') return { value_text: null, value_json: null }

  if (fieldType === 'checkbox' && Array.isArray(raw)) {
    const values = raw.map((item) => String(item ?? '').trim()).filter(Boolean)
    if (!values.length) return { value_text: null, value_json: null }
    return { value_text: values.join(', '), value_json: { values } }
  }

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
    if (typeof raw !== 'object' || raw === null) return { value_text: null, value_json: null }

    const list = Array.isArray(raw.files)
      ? raw.files.map(normalizeFileMeta).filter(Boolean)
      : raw.path
        ? [normalizeFileMeta(raw)].filter(Boolean)
        : []

    if (!list.length) return { value_text: null, value_json: null }

    return {
      value_text: list.map((f) => f.name || f.path).join(', '),
      value_json: { files: list },
    }
  }

  if (Array.isArray(raw)) {
    const joined = raw.map((item) => String(item ?? '').trim()).filter(Boolean).join(', ')
    if (!joined) return { value_text: null, value_json: null }
    return { value_text: joined, value_json: { values: raw } }
  }

  if (typeof raw === 'object') {
    return { value_text: null, value_json: null }
  }

  return { value_text: String(raw), value_json: null }
}

router.get('/manual/form', canReadWorkOrders, async (req, res) => {
  try {
    const orgId = req.userProfile.org_id
    const [fields, settingsMap] = await Promise.all([
      loadOrgWorkOrderFields(orgId),
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
      loadOrgWorkOrderFields(orgId),
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
    const sectionIds = Array.isArray(req.body?.section_ids) ? req.body.section_ids : null
    if (!updates.length && !sectionIds?.length) {
      return res.status(400).json({ error: 'No settings provided' })
    }

    if (sectionIds?.length) {
      await reorderWorkOrderSections(orgId, sectionIds)
    }

    let fields = await loadOrgWorkOrderFields(orgId)

    if (updates.length) {
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
      fields = await loadOrgWorkOrderFields(orgId)
    }

    const settingsMap = await loadFieldSettings(orgId)
    res.json({ sections: buildSettingsList(fields, settingsMap) })
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.post('/manual', canCreateWorkOrders, async (req, res) => {
  const orgId = req.userProfile.org_id
  const userId = req.userProfile.id
  try {
    const status = req.body?.status === 'created' ? 'created' : 'draft'
    const values = req.body?.values && typeof req.body.values === 'object' ? req.body.values : {}

    const [fields, settingsMap] = await Promise.all([
      loadOrgWorkOrderFields(orgId),
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

    const isLH = await isLocationHeadFor(
      orgId,
      employee,
      workOrder.assigned_location_id,
      req.orgPermissions,
    )
    const inDeptPool = employeeMatchesDepartmentAssignment(employee, workOrder)
    const atLocation = Boolean(
      workOrder.assigned_location_id
      && workOrder.assigned_location_id === employee.location_id,
    )
    const locationOnlyPool = atLocation && !workOrder.assigned_department_id

    const respondWithDetail = async () => {
      const detail = await loadWorkOrderDetail(orgId, workOrderId)
      const assignment_actions = await buildAssignmentActions(
        orgId,
        detail,
        employee,
        req.orgPermissions,
      )
      return res.json({ ...detail, assignment_actions })
    }

    // Self-claim from department or location pool
    if (claimSelf) {
      if (!inDeptPool && !locationOnlyPool) {
        return res.status(403).json({ error: 'You can only claim work orders assigned to your location or department' })
      }
      const current = (await loadAssigneesForWorkOrders(orgId, [workOrderId])).get(workOrderId) || []
      const ids = [...new Set([...current.map((a) => a.id), employee.id])]
      await syncWorkOrderAssignees(orgId, workOrderId, ids)
      return respondWithDetail()
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
      const scopeLocationId = departmentAssignment?.assigned_location_id || workOrder.assigned_location_id
      const scopeDepartmentId = departmentAssignment?.assigned_department_id || null
      const employeeIds = hasEmployeeIds
        ? await validateAssignedEmployees(orgId, req.body.assigned_employee_ids, {
          locationId: scopeLocationId,
          departmentId: scopeDepartmentId,
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
      return respondWithDetail()
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
      loadOrgWorkOrderFields(orgId),
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

router.patch('/manual/:id', canUpdateWorkOrders, assertOrgOwnership('manual_work_orders'), async (req, res) => {
  const orgId = req.userProfile.org_id
  const workOrderId = req.params.id

  try {
    const { data: existing, error: loadError } = await supabaseAdmin
      .from('manual_work_orders')
      .select('id, status, assigned_department_id, assigned_location_id')
      .eq('org_id', orgId)
      .eq('id', workOrderId)
      .maybeSingle()

    if (loadError) throw loadError
    if (!existing) return res.status(404).json({ error: 'Work order not found' })

    const nextStatus = req.body?.status === 'created'
      ? 'created'
      : req.body?.status === 'draft'
        ? 'draft'
        : existing.status

    const assignedLocationId = req.body?.assigned_location_id !== undefined
      ? (req.body.assigned_location_id || null)
      : existing.assigned_location_id
    const departmentAssignment = await validateAssignedDepartment(
      orgId,
      req.body?.assigned_department_id !== undefined
        ? (req.body.assigned_department_id || null)
        : existing.assigned_department_id,
      assignedLocationId,
    )

    const hasEmployeeIds = Array.isArray(req.body?.assigned_employee_ids)
    const assignedEmployeeIds = hasEmployeeIds
      ? await validateAssignedEmployees(
        orgId,
        req.body.assigned_employee_ids,
        { locationId: departmentAssignment?.assigned_location_id || assignedLocationId },
      )
      : null

    const updates = {
      status: nextStatus,
      assigned_department_id: departmentAssignment?.assigned_department_id || null,
      assigned_location_id: departmentAssignment?.assigned_location_id || assignedLocationId || null,
      updated_at: new Date().toISOString(),
    }

    const { data: workOrder, error: updateError } = await supabaseAdmin
      .from('manual_work_orders')
      .update(updates)
      .eq('id', workOrderId)
      .eq('org_id', orgId)
      .select('*')
      .single()

    if (updateError) throw updateError

    if (assignedEmployeeIds) {
      await syncWorkOrderAssignees(orgId, workOrderId, assignedEmployeeIds)
    }

    let valueCount = 0
    if (req.body?.values && typeof req.body.values === 'object') {
      const [fields, settingsMap] = await Promise.all([
        loadOrgWorkOrderFields(orgId),
        loadFieldSettings(orgId),
      ])
      const schema = buildFormSchema(fields, settingsMap)
      const allowedFields = buildAllowedFieldsMap(schema)
      valueCount = await upsertWorkOrderValues(orgId, workOrderId, req.body.values, allowedFields)
    }

    const enriched = await enrichWorkOrderRow(orgId, workOrder)
    res.json({ ...enriched, value_count: valueCount })
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.delete('/manual/:id', canDeleteWorkOrders, assertOrgOwnership('manual_work_orders'), async (req, res) => {
  const orgId = req.userProfile.org_id
  const workOrderId = req.params.id

  try {
    const { data: existing, error: loadError } = await supabaseAdmin
      .from('manual_work_orders')
      .select('id')
      .eq('org_id', orgId)
      .eq('id', workOrderId)
      .maybeSingle()

    if (loadError) throw loadError
    if (!existing) return res.status(404).json({ error: 'Work order not found' })

    // Best-effort cleanup of uploaded files under this work order folder
    const folderPrefix = `${orgId}/${workOrderId}`
    try {
      const { data: files } = await supabaseAdmin.storage
        .from('work-order-assets')
        .list(folderPrefix, { limit: 1000 })
      if (files?.length) {
        const paths = files.map((file) => `${folderPrefix}/${file.name}`)
        await supabaseAdmin.storage.from('work-order-assets').remove(paths)
      }
    } catch {
      // Storage cleanup is best-effort; DB delete still proceeds
    }

    const { error: deleteError } = await supabaseAdmin
      .from('manual_work_orders')
      .delete()
      .eq('id', workOrderId)
      .eq('org_id', orgId)

    if (deleteError) throw deleteError
    res.json({ id: workOrderId, deleted: true })
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.get('/dashboard', canReadWorkOrders, async (req, res) => {
  const orgId = req.userProfile.org_id
  const profileId = req.userProfile.id
  const scopedLocationId = getScopedLocationId(req.orgPermissions)
  const locationFilter = typeof req.query.location_id === 'string' ? req.query.location_id : null
  const dateFrom = typeof req.query.date_from === 'string' ? req.query.date_from : null
  const dateTo = typeof req.query.date_to === 'string' ? req.query.date_to : null
  const RECENT_LIMIT = 10

  try {
    const employee = await getEmployeeByProfile(orgId, profileId, { email: req.userProfile.email })

    let query = supabaseAdmin
      .from('manual_work_orders')
      .select('id, status, created_at, updated_at, created_by, assigned_department_id, assigned_location_id')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(2000)

    if (dateFrom) query = query.gte('created_at', new Date(dateFrom).toISOString())
    if (dateTo) {
      const end = new Date(`${dateTo}T23:59:59.999`)
      query = query.lte('created_at', end.toISOString())
    }

    const { data: rows, error } = await query
    if (error) return res.status(500).json({ error: error.message })

    const workOrders = rows || []
    const woIds = workOrders.map((row) => row.id)

    // Lightweight assignee counts + location ids (no photos / full employee joins)
    const [assigneeRows, deptRows, receivedIds] = await Promise.all([
      woIds.length
        ? supabaseAdmin
            .from('manual_work_order_assignees')
            .select('work_order_id, employee_id, org_employees(location_id, org_locations!location_id(name))')
            .eq('org_id', orgId)
            .in('work_order_id', woIds)
            .then(({ data, error: e }) => { if (e) throw e; return data || [] })
        : Promise.resolve([]),
      (() => {
        const deptIds = [...new Set(workOrders.map((r) => r.assigned_department_id).filter(Boolean))]
        const locIds = [...new Set(workOrders.map((r) => r.assigned_location_id).filter(Boolean))]
        return Promise.all([
          deptIds.length
            ? supabaseAdmin.from('departments').select('id, name, location_id').eq('org_id', orgId).in('id', deptIds)
                .then(({ data, error: e }) => { if (e) throw e; return data || [] })
            : Promise.resolve([]),
          locIds.length
            ? supabaseAdmin.from('org_locations').select('id, name').eq('org_id', orgId).in('id', locIds)
                .then(({ data, error: e }) => { if (e) throw e; return data || [] })
            : Promise.resolve([]),
        ]).then(([depts, locs]) => ({ depts, locs }))
      })(),
      employee ? listReceivedWorkOrderIds(orgId, employee) : Promise.resolve([]),
    ])

    const assigneeCountByWo = new Map()
    const assigneeLocationByWo = new Map()
    for (const row of assigneeRows) {
      assigneeCountByWo.set(row.work_order_id, (assigneeCountByWo.get(row.work_order_id) || 0) + 1)
      const locId = row.org_employees?.location_id
      const locName = row.org_employees?.org_locations?.name
      if (!assigneeLocationByWo.has(row.work_order_id)) {
        assigneeLocationByWo.set(row.work_order_id, { ids: [], name: null })
      }
      const entry = assigneeLocationByWo.get(row.work_order_id)
      if (locId && !entry.ids.includes(locId)) entry.ids.push(locId)
      if (!entry.name && locName) entry.name = locName
    }

    const deptById = new Map((deptRows.depts || []).map((d) => [d.id, d]))
    const locById = new Map((deptRows.locs || []).map((l) => [l.id, l]))
    const receivedSet = new Set(receivedIds)

    // Resolve department location names
    const deptLocIds = [...new Set([...deptById.values()].map((d) => d.location_id).filter(Boolean))]
    if (deptLocIds.length) {
      const missing = deptLocIds.filter((id) => !locById.has(id))
      if (missing.length) {
        const { data: moreLocs, error: locErr } = await supabaseAdmin
          .from('org_locations')
          .select('id, name')
          .eq('org_id', orgId)
          .in('id', missing)
        if (locErr) throw locErr
        for (const loc of moreLocs || []) locById.set(loc.id, loc)
      }
    }

    const effectiveLocationId = scopedLocationId
      || (locationFilter && locationFilter !== 'all' ? locationFilter : null)

    const orders = workOrders.map((row) => {
      const assigneeCount = assigneeCountByWo.get(row.id) || 0
      const assigneeLoc = assigneeLocationByWo.get(row.id)
      const dept = row.assigned_department_id ? deptById.get(row.assigned_department_id) : null
      const assignedLoc = row.assigned_location_id ? locById.get(row.assigned_location_id) : null
      const deptLocName = dept?.location_id ? locById.get(dept.location_id)?.name : null

      const locationIds = [
        ...new Set([
          ...(assigneeLoc?.ids || []),
          row.assigned_location_id,
          dept?.location_id,
        ].filter(Boolean)),
      ]

      const locationName = assignedLoc?.name
        || deptLocName
        || assigneeLoc?.name
        || (assigneeCount || dept || assignedLoc ? 'Unknown location' : 'Unassigned')

      return {
        id: row.id,
        wo_number: shortWorkOrderId(row.id),
        title: 'Work order',
        summary: 'Work order',
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
        created_by: row.created_by,
        assignee_count: assigneeCount,
        location_ids: locationIds,
        location_id: locationIds[0] || null,
        location_name: locationName,
        is_received: receivedSet.has(row.id),
      }
    }).filter((row) => {
      if (!effectiveLocationId) return true
      return row.location_ids.includes(effectiveLocationId)
    })

    // Server-side aggregates (client no longer needs 1000 enriched rows)
    const total = orders.length
    const statusCounts = {}
    const locationCounts = {}
    let assigned = 0
    let received = 0
    for (const o of orders) {
      statusCounts[o.status] = (statusCounts[o.status] || 0) + 1
      if (o.assignee_count > 0) assigned += 1
      if (o.is_received) received += 1
      const name = o.location_name || 'Unassigned'
      locationCounts[name] = (locationCounts[name] || 0) + 1
    }

    const now = Date.now()
    const dayMs = 86400000
    const last30 = orders.filter((o) => now - new Date(o.created_at).getTime() <= 30 * dayMs).length
    const prev30 = orders.filter((o) => {
      const age = now - new Date(o.created_at).getTime()
      return age > 30 * dayMs && age <= 60 * dayMs
    }).length
    const trendPercent = !prev30 ? (last30 > 0 ? 100 : 0) : Math.round(((last30 - prev30) / prev30) * 1000) / 10

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const trend_data = []
    for (let i = 6; i >= 0; i -= 1) {
      const day = new Date(today)
      day.setDate(today.getDate() - i)
      const next = new Date(day)
      next.setDate(day.getDate() + 1)
      const value = orders.filter((o) => {
        const created = new Date(o.created_at)
        return created >= day && created < next
      }).length
      trend_data.push({
        date: day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        value,
      })
    }

    const status_breakdown = ['created', 'draft'].map((status) => ({
      status,
      count: statusCounts[status] || 0,
      percent: total ? Math.round(((statusCounts[status] || 0) / total) * 1000) / 10 : 0,
    }))

    const location_breakdown = Object.entries(locationCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    // Enrich only recent rows with summaries for the recent list
    const recentSlice = orders.slice(0, RECENT_LIMIT)
    let recent_orders = recentSlice
    if (recentSlice.length) {
      const withSummaries = await attachSummaries(orgId, recentSlice.map((o) => ({
        id: o.id,
        status: o.status,
        created_at: o.created_at,
        updated_at: o.updated_at,
        created_by: o.created_by,
      })))
      const summaryById = new Map(withSummaries.map((r) => [r.id, r]))
      recent_orders = recentSlice.map((o) => {
        const s = summaryById.get(o.id)
        return {
          ...o,
          wo_number: s?.wo_number || o.wo_number,
          title: s?.summary || o.title,
          summary: s?.summary || o.summary,
        }
      })
    }

    res.json({
      work_orders: recent_orders,
      recent_orders,
      stats: {
        total,
        created: statusCounts.created || 0,
        draft: statusCounts.draft || 0,
        assigned,
        received,
        open: statusCounts.created || 0,
        inProgress: statusCounts.draft || 0,
        completed: assigned,
        overdue: received,
        trendPercent,
        slaPercent: null,
        slaTrend: null,
      },
      status_breakdown,
      location_breakdown,
      trend_data,
      received_count: received,
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

    const [receivedResult, assigned, manualResult] = await Promise.all([
      (async () => {
        if (!employee) return 0
        const workOrderIds = await listReceivedWorkOrderIds(orgId, employee)
        if (!workOrderIds.length) return 0
        const { count, error } = await supabaseAdmin
          .from('manual_work_orders')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', orgId)
          .in('id', workOrderIds)
          .eq('status', 'created')
        if (error) throw error
        return count || 0
      })(),
      countAssignedByMe(orgId, req.userProfile),
      supabaseAdmin
        .from('manual_work_orders')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('status', 'created')
        .then(({ count, error }) => {
          if (error) throw error
          return count || 0
        }),
    ])

    res.json({
      received: receivedResult,
      assigned,
      scheduled: 0,
      manual: manualResult,
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

    const assignment_actions = await buildAssignmentActions(
      orgId,
      detail,
      employee,
      req.orgPermissions,
    )

    res.json({
      ...detail,
      assignment_actions,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
