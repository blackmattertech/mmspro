import { Router } from 'express'
import { verifyAuth } from '../../middleware/auth.js'
import { requireOrgAccess, assertOrgOwnership } from '../../middleware/orgAccess.js'
import {
  requireModulePermission,
  requireAnyModulePermission,
  loadOrgPermissions,
} from '../../middleware/modulePermission.js'
import { supabaseAdmin } from '../../services/supabase.js'
import { getScopedLocationId, hasModulePermission } from '../../lib/orgPermissions.js'
import { getSignedUrl, getSignedUrls } from '../../lib/signedUrlCache.js'
import { applyIlikeSearch, listEnvelope } from '../../lib/listQuery.js'
import {
  generateWorkOrderNumber,
  displayWorkOrderNumber,
  addWorkOrderTimelineEvent,
  addWorkOrderAuditEntry,
  updateWorkOrderLifecycle,
  loadWorkOrderTimeline,
  WO_OPEN_LIST_STATUSES,
  WO_ASSIGNED_LIST_STATUSES,
  PERMIT_TYPES,
} from '../../lib/workOrderService.js'
import { getAllowedNextWorkOrderStatuses } from '../../lib/orgStatusService.js'
import {
  listWorkOrderDailyLogs,
  startWorkOrderDay,
  updateWorkOrderDailyLog,
  endWorkOrderDay,
  DAILY_LOG_ACTIVE_STATUSES,
  DAILY_LOG_READONLY_STATUSES,
} from '../../lib/workOrderDailyLogService.js'

const router = Router()

const canReadWorkOrders = requireModulePermission('work_orders', 'read')
const canCreateWorkOrders = requireModulePermission('work_orders', 'create')
const canUpdateWorkOrders = requireModulePermission('work_orders', 'update')
const canDeleteWorkOrders = requireModulePermission('work_orders', 'delete')
const canManageFormSettings = requireModulePermission('work_orders', 'update')
const canApproveWorkOrders = requireAnyModulePermission([
  ['work_orders_approve', 'update'],
  ['work_orders_received', 'update'],
  ['work_orders', 'update'],
])
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
  const assigneeQuery = supabaseAdmin
    .from('manual_work_order_assignees')
    .select('work_order_id')
    .eq('org_id', orgId)
    .eq('employee_id', employee.id)

  const { data, error } = await assigneeQuery
  if (error) throw error
  for (const row of data || []) ids.add(row.work_order_id)
  return [...ids]
}

function isOutgoingWorkOrder(row, profileId) {
  if (!profileId || !row) return false
  return row.created_by === profileId || row.requester_id === profileId
}

function assignedOutgoingOrFilter(profileId) {
  return `created_by.eq.${profileId},requester_id.eq.${profileId}`
}

function receivedWorkOrderOrFilter(employee, assigneeIds, { isLocationHead } = {}) {
  const parts = []
  if (employee.department_id) {
    if (employee.location_id) {
      parts.push(`and(assigned_department_id.eq.${employee.department_id},assigned_location_id.eq.${employee.location_id})`)
    } else {
      parts.push(`assigned_department_id.eq.${employee.department_id}`)
    }
  }
  if (isLocationHead && employee.location_id) {
    parts.push(`assigned_location_id.eq.${employee.location_id}`)
  }
  if (assigneeIds.length) parts.push(`id.in.(${assigneeIds.join(',')})`)
  return parts.join(',')
}

function isMissingRpcError(error) {
  const message = error?.message || ''
  return (
    error?.code === 'PGRST202'
    || error?.code === '42883'
    || /could not find the function|function .* does not exist/i.test(message)
  )
}

async function receivedVisibilityArgs(orgId, profile, employee, session) {
  const profileId = profile?.id || profile
  const isLocationHead = employee.location_id
    ? await isLocationHeadFor(orgId, employee, employee.location_id, session)
    : false
  return {
    p_org_id: orgId,
    p_profile_id: profileId,
    p_employee_id: employee.id,
    p_department_id: employee.department_id || null,
    p_location_id: employee.location_id || null,
    p_is_location_head: Boolean(isLocationHead),
  }
}

/** Legacy fallback when patch 72 is not applied yet — still loads all matching IDs. */
async function listVisibleReceivedWorkOrderIds(orgId, profile, employee, session, { status = 'all' } = {}) {
  if (!employee) return []

  const profileId = profile?.id || profile
  const myAssigneeIds = await listReceivedWorkOrderIds(orgId, employee)
  const isLocationHead = employee.location_id
    ? await isLocationHeadFor(orgId, employee, employee.location_id, session)
    : false
  const orFilter = receivedWorkOrderOrFilter(employee, myAssigneeIds, { isLocationHead })
  if (!orFilter) return []

  let query = supabaseAdmin
    .from('manual_work_orders')
    .select('id, created_by, requester_id')
    .eq('org_id', orgId)
    .or(orFilter)
  query = applyWorkOrderStatusFilter(query, status)

  const { data, error } = await query
  if (error) throw error

  const candidates = (data || []).filter((row) => !isOutgoingWorkOrder(row, profileId))
  return candidates.map((row) => row.id)
}

async function pageVisibleReceivedWorkOrderIds(orgId, profile, employee, session, {
  status = 'all',
  limit = 50,
  offset = 0,
  search = null,
} = {}) {
  if (!employee) return { ids: [], total: 0 }

  const args = {
    ...(await receivedVisibilityArgs(orgId, profile, employee, session)),
    p_status: status || 'all',
    p_search: search ? String(search).trim() || null : null,
    p_limit: limit,
    p_offset: offset,
  }

  const { data, error } = await supabaseAdmin.rpc('list_visible_received_work_order_ids', args)
  if (error) {
    if (!isMissingRpcError(error)) throw error
    const allIds = await listVisibleReceivedWorkOrderIds(orgId, profile, employee, session, { status })
    return {
      ids: allIds.slice(offset, offset + limit),
      total: allIds.length,
    }
  }

  const rows = data || []
  return {
    ids: rows.map((row) => row.id).filter(Boolean),
    total: Number(rows[0]?.total_count) || 0,
  }
}

async function countVisibleReceivedWorkOrders(orgId, profile, employee, session, { status = 'all' } = {}) {
  if (!employee) return 0

  const args = {
    ...(await receivedVisibilityArgs(orgId, profile, employee, session)),
    p_status: status || 'all',
  }

  const { data, error } = await supabaseAdmin.rpc('count_visible_received_work_orders', args)
  if (error) {
    if (!isMissingRpcError(error)) throw error
    const ids = await listVisibleReceivedWorkOrderIds(orgId, profile, employee, session, { status })
    return ids.length
  }

  return Number(data) || 0
}

async function employeeCanViewReceivedWorkOrder(orgId, employee, workOrder, profile, session) {
  if (!employee || !workOrder) return false
  if (isOutgoingWorkOrder(workOrder, profile?.id || profile)) return false

  const myAssigneeIds = await listReceivedWorkOrderIds(orgId, employee)
  if (myAssigneeIds.includes(workOrder.id)) return true

  if (employeeMatchesDepartmentAssignment(employee, workOrder)) return true
  if (!workOrder.assigned_location_id) return false
  return isLocationHeadFor(orgId, employee, workOrder.assigned_location_id, session)
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

  const canApprove = session?.is_org_admin
    || hasModulePermission(session, 'work_orders_approve', 'update')
    || hasModulePermission(session, 'work_orders_received', 'update')
    || hasModulePermission(session, 'work_orders', 'update')

  if (!canApprove) {
    return {
      can_reassign_as_location_head: false,
      can_claim_self: false,
      employee_id: employee.id,
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

function resolveDisplayWoNumber(row) {
  return displayWorkOrderNumber(row) || shortWorkOrderId(row?.id)
}

/** Map legacy "created" filter to assigned; support "open" for active lifecycle. */
function normalizeStatusFilter(status) {
  if (!status || status === 'all') return null
  if (status === 'created') return 'assigned'
  return status
}

function applyWorkOrderStatusFilter(query, status) {
  const normalized = normalizeStatusFilter(status)
  if (!normalized) return query
  if (normalized === 'open') return query.in('status', WO_OPEN_LIST_STATUSES)
  if (normalized === 'inbox') return query.in('status', WO_ASSIGNED_LIST_STATUSES)
  return query.eq('status', normalized)
}

function isAssignableStatus(status) {
  return status === 'assigned' || status === 'returned_rework'
}

async function attachSummaries(_orgId, workOrders) {
  const wrIds = [...new Set((workOrders || []).map((row) => row.work_request_id).filter(Boolean))]
  let wrDescriptions = new Map()
  if (wrIds.length) {
    const { data } = await supabaseAdmin
      .from('work_requests')
      .select('id, short_description')
      .in('id', wrIds)
    wrDescriptions = new Map((data || []).map((row) => [row.id, row.short_description]))
  }

  return workOrders.map((row) => {
    const wrShort = String(wrDescriptions.get(row.work_request_id) || '').trim()
    const woShort = String(row.short_description || '').trim()
    const shortDescription = wrShort || woShort || null
    return {
      ...row,
      wo_number: resolveDisplayWoNumber(row),
      short_description: shortDescription,
      summary: shortDescription || '',
    }
  })
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

async function listReceivedWorkOrders(orgId, profile, {
  status = 'all',
  limit = 50,
  offset = 0,
  search = null,
  session = null,
} = {}) {
  const employee = await getEmployeeByProfile(orgId, profile?.id, { email: profile?.email })
  if (!employee) return listEnvelope([], { total: 0, limit, offset })

  const { ids, total } = await pageVisibleReceivedWorkOrderIds(
    orgId,
    profile,
    employee,
    session,
    { status, limit, offset, search },
  )
  if (!ids.length) return listEnvelope([], { total: 0, limit, offset })

  const { data, error } = await supabaseAdmin
    .from('manual_work_orders')
    .select('id, status, wo_number, source_type, priority, short_description, problem_description, created_at, updated_at, created_by, assigned_department_id, assigned_location_id, work_request_id, work_center')
    .eq('org_id', orgId)
    .in('id', ids)

  if (error) throw error
  const rows = await buildWorkOrderListResponse(orgId, data || [])
  const byId = new Map(rows.map((row) => [row.id, row]))
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean)
  return listEnvelope(ordered, { total, limit, offset })
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
async function countAssignedByMe(orgId, profile, { status = 'all' } = {}) {
  const profileId = profile?.id || profile
  let query = supabaseAdmin
    .from('manual_work_orders')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .or(assignedOutgoingOrFilter(profileId))
  query = applyWorkOrderStatusFilter(query, status)
  const { count, error } = await query
  if (error) throw error
  return count || 0
}

async function listAssignedByMeWorkOrders(orgId, profile, { status = 'all', limit = 50, offset = 0, search = null } = {}) {
  const profileId = profile?.id || profile

  let query = supabaseAdmin
    .from('manual_work_orders')
    .select('id, status, wo_number, source_type, priority, short_description, problem_description, created_at, updated_at, created_by, assigned_department_id, assigned_location_id, work_request_id, work_center', { count: 'exact' })
    .eq('org_id', orgId)
    .or(assignedOutgoingOrFilter(profileId))
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  query = applyIlikeSearch(query, search, ['wo_number', 'short_description', 'problem_description'])
  query = applyWorkOrderStatusFilter(query, status)

  const { data: workOrders, error, count } = await query
  if (error) throw error
  const rows = await buildWorkOrderListResponse(orgId, workOrders || [])
  return listEnvelope(rows, { total: count || 0, limit, offset })
}

async function loadAssignedByMeDetail(orgId, workOrderId, profile) {
  const profileId = profile?.id || profile
  const employee = await getEmployeeByProfile(orgId, profileId, { email: profile?.email })
  const myEmployeeId = employee?.id

  const detail = await loadWorkOrderDetail(orgId, workOrderId)
  if (!detail) return null
  if (detail.created_by !== profileId && detail.requester_id !== profileId) return null

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

async function loadWorkOrderDetail(orgId, workOrderId, { employee = null, profile = null, session = null } = {}) {
  const { data: workOrder, error } = await supabaseAdmin
    .from('manual_work_orders')
    .select('*')
    .eq('org_id', orgId)
    .eq('id', workOrderId)
    .maybeSingle()

  if (error) throw error
  if (!workOrder) return null
  if (employee) {
    const allowed = await employeeCanViewReceivedWorkOrder(
      orgId,
      employee,
      workOrder,
      profile,
      session,
    )
    if (!allowed) return null
  }

  const { data: values, error: valuesError } = await supabaseAdmin
    .from('manual_work_order_values')
    .select('*')
    .eq('org_id', orgId)
    .eq('work_order_id', workOrderId)

  if (valuesError) throw valuesError

  const timeline = await loadWorkOrderTimeline(orgId, workOrderId)

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

  let jobNature = workOrder.job_nature || null
  let workRequestNumber = null
  if (workOrder.work_request_id) {
    const { data: wr } = await supabaseAdmin
      .from('work_requests')
      .select('request_number, job_nature, is_breakdown, short_description')
      .eq('org_id', orgId)
      .eq('id', workOrder.work_request_id)
      .maybeSingle()
    workRequestNumber = wr?.request_number || null
    if (!jobNature) {
      jobNature = wr?.job_nature || (wr?.is_breakdown ? 'Breakdown' : null)
    }
    const wrShort = String(wr?.short_description || '').trim()
    if (wrShort) {
      enriched.short_description = wrShort
      enriched.summary = wrShort
    }
  }
  if (!jobNature && workOrder.is_breakdown) jobNature = 'Breakdown'

  // Legacy WOs used source_type "breakdown" for job nature Breakdown — treat as work request.
  const displaySourceType = workOrder.source_type === 'breakdown'
    ? 'approved_work_request'
    : workOrder.source_type

  let dailyLogsPayload = { logs: [], open_log: null, material_summary: [] }
  try {
    dailyLogsPayload = await listWorkOrderDailyLogs(orgId, workOrderId)
  } catch {
    // Table may not exist until patch 71 is applied — keep detail usable.
  }

  return {
    ...enriched,
    source_type: displaySourceType,
    source_type_raw: workOrder.source_type,
    job_nature: jobNature,
    work_request_id: workOrder.work_request_id || null,
    work_request_number: workRequestNumber,
    wo_number: resolveDisplayWoNumber(workOrder),
    sections,
    timeline,
    permit_type_options: PERMIT_TYPES,
    allowed_next_statuses: await getAllowedNextWorkOrderStatuses(orgId, workOrder.status),
    daily_logs: dailyLogsPayload.logs,
    daily_log_open: dailyLogsPayload.open_log,
    material_summary: dailyLogsPayload.material_summary,
    daily_log_can_edit: DAILY_LOG_ACTIVE_STATUSES.has(workOrder.status),
    daily_log_visible: (
      DAILY_LOG_ACTIVE_STATUSES.has(workOrder.status)
      || DAILY_LOG_READONLY_STATUSES.has(workOrder.status)
      || (dailyLogsPayload.logs || []).length > 0
    ),
  }
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
    const wantsSubmit = req.body?.status === 'created' || req.body?.status === 'assigned'
    const status = wantsSubmit ? 'assigned' : 'draft'
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

    const departmentId = departmentAssignment?.assigned_department_id || null
    let woNumber = null
    if (status === 'assigned' && departmentId) {
      woNumber = await generateWorkOrderNumber(orgId, departmentId)
    }

    const { data: workOrder, error: woError } = await supabaseAdmin
      .from('manual_work_orders')
      .insert({
        org_id: orgId,
        status,
        wo_number: woNumber,
        source_type: 'manual',
        created_by: userId,
        supervisor_id: userId,
        assigned_department_id: departmentAssignment?.assigned_department_id || null,
        assigned_location_id: departmentAssignment?.assigned_location_id || null,
        priority: ['high', 'medium', 'low'].includes(req.body?.priority) ? req.body.priority : 'medium',
        problem_description: req.body?.problem_description?.trim() || null,
        short_description: req.body?.short_description?.trim()?.slice(0, 200)
          || req.body?.problem_description?.trim()?.slice(0, 200)
          || null,
        work_center: req.body?.work_center?.trim() || null,
        equipment_id: req.body?.equipment_id || null,
        special_instructions: req.body?.special_instructions?.trim() || null,
        planned_start_at: req.body?.planned_start_at || null,
        planned_end_at: req.body?.planned_end_at || null,
      })
      .select('*')
      .single()

    if (woError) return res.status(500).json({ error: woError.message })

    await syncWorkOrderAssignees(orgId, workOrder.id, assignedEmployeeIds)

    const valueCount = await upsertWorkOrderValues(orgId, workOrder.id, values, allowedFields)

    if (status === 'assigned') {
      await addWorkOrderTimelineEvent(
        orgId,
        workOrder.id,
        'work_order_generated',
        woNumber ? `Manual work order ${woNumber} created.` : 'Manual work order created.',
        userId,
        { newStatus: 'assigned' },
      )
      await addWorkOrderAuditEntry(
        orgId,
        workOrder.id,
        userId,
        'manual_created',
        { newStatus: 'assigned', departmentId },
      )
    }

    const enriched = await enrichWorkOrderRow(orgId, workOrder)

    res.status(201).json({ ...enriched, wo_number: resolveDisplayWoNumber(workOrder), value_count: valueCount })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

router.patch('/manual/:id/assignment', canApproveWorkOrders, assertOrgOwnership('manual_work_orders'), async (req, res) => {
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
    if (!isAssignableStatus(workOrder.status)) {
      return res.status(400).json({ error: 'Only assigned work orders can be reassigned' })
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

router.patch('/:id/lifecycle', canUpdateWorkOrders, assertOrgOwnership('manual_work_orders'), async (req, res) => {
  const orgId = req.userProfile.org_id
  const profileId = req.userProfile.id
  try {
    const updated = await updateWorkOrderLifecycle(orgId, profileId, req.params.id, req.body || {})
    const detail = await loadWorkOrderDetail(orgId, updated.id)
    res.json(detail)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.patch('/manual/:id/lifecycle', canUpdateWorkOrders, assertOrgOwnership('manual_work_orders'), async (req, res) => {
  const orgId = req.userProfile.org_id
  const profileId = req.userProfile.id
  try {
    const updated = await updateWorkOrderLifecycle(orgId, profileId, req.params.id, req.body || {})
    const detail = await loadWorkOrderDetail(orgId, updated.id)
    res.json(detail)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.get('/manual/:id/daily-logs', canReadWorkOrders, assertOrgOwnership('manual_work_orders'), async (req, res) => {
  const orgId = req.userProfile.org_id
  try {
    const payload = await listWorkOrderDailyLogs(orgId, req.params.id)
    res.json(payload)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.post('/manual/:id/daily-logs/start-day', canUpdateWorkOrders, assertOrgOwnership('manual_work_orders'), async (req, res) => {
  const orgId = req.userProfile.org_id
  const profileId = req.userProfile.id
  try {
    await startWorkOrderDay(orgId, profileId, req.params.id, {
      timeZone: req.body?.time_zone || req.body?.timeZone,
    })
    const detail = await loadWorkOrderDetail(orgId, req.params.id)
    res.json(detail)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.patch('/manual/:id/daily-logs/:logId', canUpdateWorkOrders, assertOrgOwnership('manual_work_orders'), async (req, res) => {
  const orgId = req.userProfile.org_id
  const profileId = req.userProfile.id
  try {
    await updateWorkOrderDailyLog(
      orgId,
      profileId,
      req.params.id,
      req.params.logId,
      req.body || {},
    )
    const detail = await loadWorkOrderDetail(orgId, req.params.id)
    res.json(detail)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.post('/manual/:id/daily-logs/:logId/end-day', canUpdateWorkOrders, assertOrgOwnership('manual_work_orders'), async (req, res) => {
  const orgId = req.userProfile.org_id
  const profileId = req.userProfile.id
  try {
    await endWorkOrderDay(
      orgId,
      profileId,
      req.params.id,
      req.params.logId,
      req.body || {},
    )
    const detail = await loadWorkOrderDetail(orgId, req.params.id)
    res.json(detail)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.patch('/manual/:id', canUpdateWorkOrders, assertOrgOwnership('manual_work_orders'), async (req, res) => {
  const orgId = req.userProfile.org_id
  const workOrderId = req.params.id

  try {
    const { data: existing, error: loadError } = await supabaseAdmin
      .from('manual_work_orders')
      .select('id, status, wo_number, assigned_department_id, assigned_location_id')
      .eq('org_id', orgId)
      .eq('id', workOrderId)
      .maybeSingle()

    if (loadError) throw loadError
    if (!existing) return res.status(404).json({ error: 'Work order not found' })

    const requestedStatus = req.body?.status
    let nextStatus = existing.status
    if (requestedStatus === 'draft') nextStatus = 'draft'
    else if (requestedStatus === 'created' || requestedStatus === 'assigned') nextStatus = 'assigned'
    else if (typeof requestedStatus === 'string' && requestedStatus !== existing.status) {
      const allowed = await getAllowedNextWorkOrderStatuses(orgId, existing.status)
      if (!allowed.includes(requestedStatus)) {
        return res.status(400).json({ error: `Invalid status transition to ${requestedStatus}` })
      }
      nextStatus = requestedStatus
    }

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

    if (nextStatus === 'assigned' && existing.status === 'draft' && !existing.wo_number) {
      const deptId = updates.assigned_department_id
      if (deptId) {
        updates.wo_number = await generateWorkOrderNumber(orgId, deptId)
        updates.source_type = 'manual'
      }
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

const DASHBOARD_STATUS_KEYS = ['assigned', 'accepted', 'in_progress', 'completed', 'verified', 'closed', 'draft']

function applyDashboardFilters(query, { orgId, locationId, dateFrom, dateTo }) {
  query = query.eq('org_id', orgId)
  if (locationId) query = query.eq('assigned_location_id', locationId)
  if (dateFrom) query = query.gte('created_at', new Date(dateFrom).toISOString())
  if (dateTo) {
    query = query.lte('created_at', new Date(`${dateTo}T23:59:59.999`).toISOString())
  }
  return query
}

function finiteCount(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function statusPercent(count, total) {
  if (!total) return 0
  const pct = Math.round((count / total) * 1000) / 10
  return Number.isFinite(pct) ? pct : 0
}

function formatTrendLabel(isoDay) {
  const day = isoDay instanceof Date ? isoDay : new Date(`${String(isoDay).slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(day.getTime())) return ''
  return day.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function dashboardDateBounds(dateFrom, dateTo) {
  return {
    dateFromIso: dateFrom ? new Date(dateFrom).toISOString() : null,
    dateToIso: dateTo ? new Date(`${dateTo}T23:59:59.999`).toISOString() : null,
  }
}

function assembleDashboardPayload({ byStatus, byLocation, locations, last30, prev30, trend, recentRows }) {
  const statusMap = new Map()
  for (const row of byStatus || []) {
    if (!row?.status) continue
    statusMap.set(row.status, finiteCount(row.count) + (statusMap.get(row.status) || 0))
  }

  const total = [...statusMap.values()].reduce((sum, count) => sum + count, 0)
  const draft = statusMap.get('draft') || 0
  const assigned = statusMap.get('assigned') || 0
  const inProgress = statusMap.get('in_progress') || 0
  const completed = statusMap.get('completed') || 0
  const open = WO_OPEN_LIST_STATUSES.reduce((sum, status) => sum + (statusMap.get(status) || 0), 0)
  const last30Count = finiteCount(last30)
  const prev30Count = finiteCount(prev30)
  const rawTrendPercent = !prev30Count
    ? (last30Count > 0 ? 100 : 0)
    : Math.round(((last30Count - prev30Count) / prev30Count) * 1000) / 10
  const trendPercent = Number.isFinite(rawTrendPercent) ? rawTrendPercent : 0

  const locationNames = new Map((locations || []).map((loc) => [loc.id, loc.name]))
  const location_breakdown = (byLocation || [])
    .map((row) => ({
      name: row.assigned_location_id
        ? (locationNames.get(row.assigned_location_id) || 'Unknown location')
        : 'Unassigned',
      count: finiteCount(row.count),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  const recent_orders = (recentRows || []).map((row) => ({
    id: row.id,
    wo_number: resolveDisplayWoNumber(row),
    title: row.short_description || row.problem_description?.slice(0, 80) || 'Work order',
    summary: row.short_description || row.problem_description?.slice(0, 120) || 'Work order',
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_by: row.created_by,
    location_id: row.assigned_location_id,
    location_name: locationNames.get(row.assigned_location_id) || null,
  }))

  return {
    stats: {
      total,
      created: total,
      draft,
      assigned,
      received: open,
      open,
      inProgress,
      completed,
      overdue: 0,
      trendPercent,
      slaPercent: null,
      slaTrend: null,
    },
    recent_orders,
    status_breakdown: DASHBOARD_STATUS_KEYS.map((status) => {
      const count = statusMap.get(status) || 0
      return { status, count, percent: statusPercent(count, total) }
    }),
    location_breakdown,
    trend_data: (trend || []).map((row) => ({
      date: row.date || formatTrendLabel(row.day),
      value: finiteCount(row.value ?? row.count),
    })),
    received_count: open,
  }
}

let dashboardRpcAvailable = true

async function loadDashboardAggregates(orgId, filters) {
  if (dashboardRpcAvailable) {
    try {
      return await loadDashboardAggregatesRpc(orgId, filters)
    } catch (err) {
      const message = String(err?.message || err?.code || '')
      if (/could not find the function|PGRST202|does not exist/i.test(message)) {
        dashboardRpcAvailable = false
      }
    }
  }
  return loadDashboardAggregatesFallback(orgId, filters)
}

async function loadDashboardAggregatesRpc(orgId, { locationId, dateFrom, dateTo }) {
  const { dateFromIso, dateToIso } = dashboardDateBounds(dateFrom, dateTo)
  const { data, error } = await supabaseAdmin.rpc('work_order_dashboard_stats', {
    p_org_id: orgId,
    p_location_id: locationId || null,
    p_date_from: dateFromIso,
    p_date_to: dateToIso,
  })
  if (error) throw error
  if (data && typeof data === 'string') {
    try {
      return JSON.parse(data)
    } catch {
      return {}
    }
  }
  return data || {}
}

async function loadDashboardAggregatesFallback(orgId, filters) {
  const trendFrom = new Date(Date.now() - 60 * 86400000).toISOString()
  const [kpiResult, trendResult, recentResult] = await Promise.all([
    applyDashboardFilters(
      supabaseAdmin
        .from('manual_work_orders')
        .select('status, assigned_location_id')
        .range(0, 9999),
      { orgId, ...filters },
    ),
    applyDashboardFilters(
      supabaseAdmin
        .from('manual_work_orders')
        .select('created_at')
        .gte('created_at', trendFrom)
        .range(0, 9999),
      { orgId, locationId: filters.locationId },
    ),
    applyDashboardFilters(
      supabaseAdmin
        .from('manual_work_orders')
        .select('id, status, wo_number, created_at, updated_at, created_by, assigned_location_id, work_request_id, short_description, problem_description')
        .order('created_at', { ascending: false })
        .limit(10),
      { orgId, ...filters },
    ),
  ])
  if (kpiResult.error) throw kpiResult.error
  if (trendResult.error) throw trendResult.error
  if (recentResult.error) throw recentResult.error

  const byStatusMap = new Map()
  const byLocationMap = new Map()
  for (const row of kpiResult.data || []) {
    byStatusMap.set(row.status, (byStatusMap.get(row.status) || 0) + 1)
    const locKey = row.assigned_location_id || ''
    byLocationMap.set(locKey, (byLocationMap.get(locKey) || 0) + 1)
  }

  const now = Date.now()
  const last30From = now - 30 * 86400000
  const prev30From = now - 60 * 86400000
  let last30 = 0
  let prev30 = 0
  const dayCounts = new Map()
  const todayUtc = new Date()
  todayUtc.setUTCHours(0, 0, 0, 0)
  for (let index = 0; index < 7; index += 1) {
    const day = new Date(todayUtc)
    day.setUTCDate(todayUtc.getUTCDate() - (6 - index))
    dayCounts.set(day.toISOString().slice(0, 10), 0)
  }
  for (const row of trendResult.data || []) {
    const created = new Date(row.created_at).getTime()
    if (!Number.isFinite(created)) continue
    if (created >= last30From) last30 += 1
    else if (created >= prev30From) prev30 += 1
    const dayKey = new Date(row.created_at).toISOString().slice(0, 10)
    if (dayCounts.has(dayKey)) dayCounts.set(dayKey, dayCounts.get(dayKey) + 1)
  }

  return {
    by_status: [...byStatusMap.entries()].map(([status, count]) => ({ status, count })),
    by_location: [...byLocationMap.entries()].map(([assigned_location_id, count]) => ({
      assigned_location_id: assigned_location_id || null,
      count,
    })),
    last30,
    prev30,
    trend: [...dayCounts.entries()].map(([day, count]) => ({ day, count })),
    recent: recentResult.data || [],
  }
}

router.get('/dashboard', canReadWorkOrders, async (req, res) => {
  const orgId = req.userProfile.org_id
  const scopedLocationId = getScopedLocationId(req.orgPermissions)
  const locationFilter = typeof req.query.location_id === 'string' ? req.query.location_id : null
  const dateFrom = typeof req.query.date_from === 'string' ? req.query.date_from : null
  const dateTo = typeof req.query.date_to === 'string' ? req.query.date_to : null
  const locationId = scopedLocationId
    || (locationFilter && locationFilter !== 'all' ? locationFilter : null)
  const filters = { locationId, dateFrom, dateTo }

  try {
    const [aggregates, locationRows] = await Promise.all([
      loadDashboardAggregates(orgId, filters),
      supabaseAdmin.from('org_locations').select('id, name').eq('org_id', orgId).eq('is_active', true),
    ])
    if (locationRows.error) throw locationRows.error

    const recentSource = aggregates.recent || []
    let recentRows = recentSource
    if (recentSource.length) {
      const missingWr = recentSource.some((row) => !row.work_request_id)
      if (missingWr) {
        const ids = recentSource.map((row) => row.id).filter(Boolean)
        const { data: woRows } = await supabaseAdmin
          .from('manual_work_orders')
          .select('id, work_request_id, short_description')
          .eq('org_id', orgId)
          .in('id', ids)
        const extra = new Map((woRows || []).map((row) => [row.id, row]))
        recentRows = recentSource.map((row) => ({
          ...row,
          work_request_id: row.work_request_id || extra.get(row.id)?.work_request_id,
          short_description: row.short_description ?? extra.get(row.id)?.short_description,
        }))
      }
      recentRows = await attachSummaries(orgId, recentRows)
    }

    const payload = assembleDashboardPayload({
      byStatus: aggregates.by_status,
      byLocation: aggregates.by_location,
      locations: locationRows.data || [],
      last30: aggregates.last30,
      prev30: aggregates.prev30,
      trend: aggregates.trend,
      recentRows,
    })

    res.json({
      ...payload,
      locations: (locationRows.data || []).map((loc) => ({ id: loc.id, name: loc.name })),
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

    const [receivedResult, assigned, scheduledResult, manualResult] = await Promise.all([
      employee
        ? countVisibleReceivedWorkOrders(
          orgId,
          req.userProfile,
          employee,
          req.orgPermissions,
          { status: 'all' },
        )
        : 0,
      countAssignedByMe(orgId, req.userProfile),
      supabaseAdmin
        .from('manual_work_orders')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('source_type', 'preventive_maintenance')
        .then(({ count, error }) => {
          if (error) throw error
          return count || 0
        }),
      supabaseAdmin
        .from('manual_work_orders')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('source_type', 'manual')
        .then(({ count, error }) => {
          if (error) throw error
          return count || 0
        }),
    ])

    res.json({
      received: receivedResult,
      assigned,
      scheduled: scheduledResult,
      manual: manualResult,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/manual/orders', canReadWorkOrders, async (req, res) => {
  const orgId = req.userProfile.org_id
  const { limit, offset } = parsePagination(req.query)
  const scopedLocationId = getScopedLocationId(req.orgPermissions)
  try {
    let query = supabaseAdmin
      .from('manual_work_orders')
      .select('id, status, wo_number, source_type, priority, short_description, problem_description, created_at, updated_at, created_by, assigned_department_id, assigned_location_id, work_request_id', { count: 'exact' })
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (scopedLocationId) query = query.eq('assigned_location_id', scopedLocationId)

    query = applyIlikeSearch(query, req.query.search, ['wo_number', 'short_description', 'problem_description'])

    const { data, error, count } = await query

    if (error) return res.status(500).json({ error: error.message })
    const rows = await buildWorkOrderListResponse(orgId, data || [])
    res.json(listEnvelope(rows, { total: count || 0, limit, offset }))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/manual/orders/:id', canReadWorkOrders, async (req, res) => {
  const orgId = req.userProfile.org_id
  const scopedLocationId = getScopedLocationId(req.orgPermissions)
  try {
    const detail = await loadWorkOrderDetail(orgId, req.params.id)
    if (!detail) return res.status(404).json({ error: 'Not found' })
    if (
      scopedLocationId
      && detail.assigned_location_id
      && detail.assigned_location_id !== scopedLocationId
      && detail.created_by !== req.userProfile.id
    ) {
      return res.status(404).json({ error: 'Not found' })
    }
    res.json(detail)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/assigned', canReadWorkOrders, async (req, res) => {
  const orgId = req.userProfile.org_id
  const { limit, offset } = parsePagination(req.query)
  try {
    const rows = await listAssignedByMeWorkOrders(orgId, req.userProfile, {
      limit,
      offset,
      search: req.query.search,
    })
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

router.get('/scheduled', canReadWorkOrders, async (req, res) => {
  const orgId = req.userProfile.org_id
  const { limit, offset } = parsePagination(req.query)
  const scopedLocationId = getScopedLocationId(req.orgPermissions)
  try {
    let query = supabaseAdmin
      .from('manual_work_orders')
      .select('id, status, wo_number, source_type, priority, short_description, problem_description, created_at, updated_at, created_by, assigned_department_id, assigned_location_id, work_request_id, work_center, scheduled_at, pm_plan_id', { count: 'exact' })
      .eq('org_id', orgId)
      .eq('source_type', 'preventive_maintenance')
      .order('scheduled_at', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (scopedLocationId) query = query.eq('assigned_location_id', scopedLocationId)
    query = applyIlikeSearch(query, req.query.search, ['wo_number', 'short_description', 'problem_description'])

    const { data, error, count } = await query
    if (error) throw error
    const rows = await buildWorkOrderListResponse(orgId, data || [])
    res.json(listEnvelope(rows, { total: count || 0, limit, offset }))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/scheduled/:id', canReadWorkOrders, async (req, res) => {
  const orgId = req.userProfile.org_id
  const scopedLocationId = getScopedLocationId(req.orgPermissions)
  try {
    const detail = await loadWorkOrderDetail(orgId, req.params.id)
    if (!detail || detail.source_type !== 'preventive_maintenance') {
      return res.status(404).json({ error: 'Not found' })
    }
    if (
      scopedLocationId
      && detail.assigned_location_id
      && detail.assigned_location_id !== scopedLocationId
      && detail.created_by !== req.userProfile.id
    ) {
      return res.status(404).json({ error: 'Not found' })
    }
    res.json(detail)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/received', canReadWorkOrders, async (req, res) => {
  const orgId = req.userProfile.org_id
  const { limit, offset } = parsePagination(req.query)
  try {
    const rows = await listReceivedWorkOrders(orgId, req.userProfile, {
      limit,
      offset,
      search: req.query.search,
      session: req.orgPermissions,
    })
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
      profile: req.userProfile,
      session: req.orgPermissions,
    })
    if (!detail) return res.status(404).json({ error: 'Not found' })

    const scopedLocationId = getScopedLocationId(req.orgPermissions)
    const isAssignee = (detail.assignees || []).some((row) => row.id === employee.id)
    if (
      scopedLocationId
      && detail.assigned_location_id
      && detail.assigned_location_id !== scopedLocationId
      && !isAssignee
    ) {
      return res.status(404).json({ error: 'Not found' })
    }

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
