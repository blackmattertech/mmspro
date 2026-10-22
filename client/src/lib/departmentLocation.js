export const LOCATION_ALL = '__all__'
export const LOCATION_NONE = '__none__'

export function employeeMatchesDepartmentLocation(employeeLocationId, department) {
  if (!department) return false
  if (department.all_locations) return Boolean(employeeLocationId)
  if (!department.location_id) return true
  return employeeLocationId === department.location_id
}

export function employeesForLocationHead(employees, locationId, currentHeadId = '') {
  if (!locationId) return []
  const active = employees.filter((e) => e.is_active !== false)
  let filtered = active.filter((e) => e.location_id === locationId)
  if (currentHeadId && !filtered.some((e) => e.id === currentHeadId)) {
    const current = active.find((e) => e.id === currentHeadId)
    if (current) filtered = [current, ...filtered]
  }
  return filtered
}

export function departmentWithAncestorIds(departments, departmentId) {
  const ids = new Set()
  if (!departmentId) return ids
  const byId = new Map((departments || []).map((department) => [department.id, department]))
  let currentId = departmentId
  while (currentId && !ids.has(currentId)) {
    ids.add(currentId)
    currentId = byId.get(currentId)?.parent_id || ''
  }
  return ids
}

export function departmentManagerScopeIds(departments, departmentId) {
  const ids = departmentWithAncestorIds(departments, departmentId)
  if (!departmentId) return ids
  const queue = [departmentId]
  const seen = new Set()
  while (queue.length) {
    const currentId = queue.shift()
    if (!currentId || seen.has(currentId)) continue
    seen.add(currentId)
    for (const department of departments || []) {
      if (department.parent_id !== currentId || ids.has(department.id)) continue
      ids.add(department.id)
      queue.push(department.id)
    }
  }
  return ids
}

export function departmentsForEmployeeLocation(departments, locationId) {
  const active = departments.filter((d) => d.is_active !== false)
  if (!locationId) return active
  return active.filter((d) =>
    d.all_locations || d.location_id === locationId || (!d.all_locations && !d.location_id),
  )
}

const MAINTENANCE_ALIASES = ['maintenance', 'maintainance', 'maintance']

export function isMaintenanceDepartment(department) {
  const name = String(department?.name || '').trim().toLowerCase()
  const code = String(department?.code || '').trim().toLowerCase()
  if (!name && !code) return false
  if (MAINTENANCE_ALIASES.includes(name) || MAINTENANCE_ALIASES.includes(code)) return true
  if (name.includes('maintenance') || name.includes('maintainance') || name.includes('maintance')) {
    return true
  }
  return Boolean(code && (code === 'mnt' || code.startsWith('mnt-')))
}
