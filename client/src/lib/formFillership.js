import { FILLED_BY_LABELS, normalizeFilledBy, parseLayoutId } from './formLayoutIds.js'

export { FILLED_BY_LABELS }

/**
 * Resolve which fillership roles the current user holds for a record.
 *
 * @param {object} opts
 * @param {string} [opts.formId]
 * @param {boolean} [opts.isOrgAdmin]
 * @param {string|null} [opts.profileId]
 * @param {string|null} [opts.employeeId]
 * @param {boolean} [opts.isDepartmentHead]
 * @param {string|null} [opts.employeeDepartmentId]
 * @param {boolean} [opts.canApproveIncoming]
 * @param {boolean} [opts.isSupervisor]
 * @param {object|null} [opts.record] — existing record fields
 * @param {boolean} [opts.isCreate] — true when creating (no record yet)
 */
export function resolveFormActors({
  formId,
  isOrgAdmin = false,
  profileId = null,
  employeeId = null,
  isDepartmentHead = false,
  employeeDepartmentId = null,
  canApproveIncoming = false,
  isSupervisor = false,
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

  const orderToDeptId = record?.order_to_department_id
    || record?.assigned_department_id
    || null
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
    isSupervisor: Boolean(isSupervisor || isOrgAdmin),
    isCreate: Boolean(isCreate),
  }
}

export function canEditFilledBy(filledBy, actors = {}) {
  const role = normalizeFilledBy(filledBy)
  if (role === 'technician') return Boolean(actors.isTechnician)
  if (actors.isOrgAdmin) return true
  if (role === 'any') return true
  if (role === 'creator') return Boolean(actors.isCreator)
  if (role === 'order_to_dept_head') {
    return Boolean(actors.isOrderToDeptHead || actors.isTechnician)
  }
  if (role === 'supervisor') return Boolean(actors.isSupervisor)
  return true
}

export function filledByLabel(filledBy) {
  const role = normalizeFilledBy(filledBy)
  return FILLED_BY_LABELS[role] || FILLED_BY_LABELS.any
}

/** Map layout field/group id → section filledBy */
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

/**
 * Filter a values object to only keys the actor may write.
 * Returns { allowed, rejected }.
 */
export function partitionValuesByFillership(layout, values, actors) {
  const map = buildFieldFillershipMap(layout)
  const allowed = {}
  const rejected = []
  for (const [fieldId, value] of Object.entries(values || {})) {
    const filledBy = map.get(fieldId)
    // Unknown ids (legacy extras): allow if any/admin; otherwise reject when map missing but layout exists
    if (filledBy == null) {
      if (actors.isOrgAdmin || !layout) {
        allowed[fieldId] = value
      } else {
        // Allow unmapped catalog ids that appear as catalog: in layout? already in map.
        // Unmapped → treat as any for backward compat
        allowed[fieldId] = value
      }
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

export function emptyGroupRow(childFields = []) {
  const row = {}
  for (const child of childFields) {
    row[child.id] = child.fieldType === 'checkbox' && !(child.options || []).length
      ? false
      : (Array.isArray(child.options) && child.fieldType === 'checkbox' ? [] : '')
  }
  return row
}

export function normalizeGroupRows(value, childFields = [], { minRows = 0 } = {}) {
  const rows = Array.isArray(value) ? value.map((row) => (row && typeof row === 'object' ? { ...row } : {})) : []
  while (rows.length < minRows) {
    rows.push(emptyGroupRow(childFields))
  }
  return rows
}

export function validateRepeatableGroups(layout, values, { actors = null } = {}) {
  const errors = []
  for (const group of layout?.groups || []) {
    if (group.skipped) continue
    if (actors && !canEditFilledBy(
      (layout.sections || []).find((s) => s.id === group.sectionId)?.filledBy,
      actors,
    )) {
      continue
    }
    const rows = Array.isArray(values?.[group.id]) ? values[group.id] : []
    const minRows = Number(group.minRows) || 0
    if (rows.length < minRows) {
      errors.push(`${group.label || 'Group'} needs at least ${minRows} row${minRows === 1 ? '' : 's'}`)
      continue
    }
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i] || {}
      for (const child of group.childFields || []) {
        if (child.skipped || !child.required) continue
        const val = row[child.id]
        const empty = val == null
          || val === ''
          || (Array.isArray(val) && !val.length)
        if (empty) {
          errors.push(`${group.label || 'Group'} row ${i + 1}: ${child.label || 'field'} is required`)
        }
      }
    }
  }
  return errors
}

export function isLayoutGroupId(id) {
  return parseLayoutId(id).kind === 'group'
}
