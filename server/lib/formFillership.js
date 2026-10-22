import { FILLED_BY_LABELS, normalizeFilledBy, parseLayoutId } from './formLayoutIds.js'

export { FILLED_BY_LABELS }

export function resolveFormActors({
  formId,
  isOrgAdmin = false,
  profileId = null,
  employeeId = null,
  isDepartmentHead = false,
  employeeDepartmentId = null,
  canApproveIncoming = false,
  record = null,
  isCreate = false,
} = {}) {
  const creatorProfileId = record?.requested_by
    || record?.created_by
    || record?.created_by_profile_id
    || null
  const isCreator = isCreate
    ? Boolean(profileId)
    : Boolean(profileId && creatorProfileId && String(profileId) === String(creatorProfileId))

  const orderToDeptId = record?.order_to_department_id || null
  const isOrderToDeptHead = Boolean(
    orderToDeptId
    && employeeDepartmentId
    && String(orderToDeptId) === String(employeeDepartmentId)
    && (isDepartmentHead || canApproveIncoming),
  )

  const assigneeIds = new Set()
  for (const row of record?.assignees || []) {
    const id = row?.id || row?.employee_id || row
    if (id) assigneeIds.add(String(id))
  }
  for (const id of record?.technician_ids || []) {
    if (id) assigneeIds.add(String(id))
  }
  if (record?.assigned_technician_id) {
    assigneeIds.add(String(record.assigned_technician_id))
  }
  const isTechnician = Boolean(employeeId && assigneeIds.has(String(employeeId)))

  return {
    formId: formId || null,
    isOrgAdmin: Boolean(isOrgAdmin),
    isCreator,
    isOrderToDeptHead,
    isTechnician,
    isCreate: Boolean(isCreate),
  }
}

export function canEditFilledBy(filledBy, actors = {}) {
  if (actors.isOrgAdmin) return true
  const role = normalizeFilledBy(filledBy)
  if (role === 'any') return true
  if (role === 'creator') return Boolean(actors.isCreator)
  if (role === 'order_to_dept_head') return Boolean(actors.isOrderToDeptHead)
  if (role === 'technician') return Boolean(actors.isTechnician)
  return true
}

export function filledByLabel(filledBy) {
  const role = normalizeFilledBy(filledBy)
  return FILLED_BY_LABELS[role] || FILLED_BY_LABELS.any
}

export function buildFieldFillershipMap(layout) {
  const sectionById = new Map(
    (layout?.sections || []).map((section) => [section.id, normalizeFilledBy(section.filledBy)]),
  )
  const map = new Map()
  for (const field of layout?.fields || []) {
    map.set(field.id, sectionById.get(field.sectionId) || 'any')
  }
  for (const group of layout?.groups || []) {
    map.set(group.id, sectionById.get(group.sectionId) || 'any')
  }
  return map
}

export function partitionValuesByFillership(layout, values, actors) {
  const map = buildFieldFillershipMap(layout)
  const allowed = {}
  const rejected = []
  for (const [fieldId, value] of Object.entries(values || {})) {
    const filledBy = map.get(fieldId)
    if (filledBy == null) {
      allowed[fieldId] = value
      continue
    }
    if (canEditFilledBy(filledBy, actors)) {
      allowed[fieldId] = value
    } else {
      rejected.push(fieldId)
    }
  }
  return { allowed, rejected }
}

export function isLayoutGroupId(id) {
  return parseLayoutId(id).kind === 'group'
}
