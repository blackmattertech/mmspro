export const LOCATION_ALL = '__all__'
export const LOCATION_NONE = '__none__'
export const HEAD_MODE_SINGLE = 'single'
export const HEAD_MODE_PER_LOCATION = 'per_location'

export function employeeMatchesDepartmentLocation(employeeLocationId, department) {
  if (!department) return false
  if (department.all_locations) return Boolean(employeeLocationId)
  if (!department.location_id) return true
  return employeeLocationId === department.location_id
}

export function employeesForDepartmentHead(employees, locationScope, currentHeadId = '') {
  const active = employees.filter((e) => e.is_active !== false)
  let filtered
  if (locationScope === LOCATION_ALL) {
    filtered = active.filter((e) => e.location_id)
  } else if (locationScope === LOCATION_NONE) {
    filtered = active
  } else {
    filtered = active.filter((e) => e.location_id === locationScope)
  }
  if (currentHeadId && !filtered.some((e) => e.id === currentHeadId)) {
    const current = active.find((e) => e.id === currentHeadId)
    if (current) filtered = [current, ...filtered]
  }
  return filtered
}

export function departmentsForEmployeeLocation(departments, locationId) {
  const active = departments.filter((d) => d.is_active !== false)
  if (!locationId) return active
  return active.filter((d) =>
    d.all_locations || d.location_id === locationId || (!d.all_locations && !d.location_id),
  )
}

export function buildLocationHeadsPayload(locationHeadsMap, locations) {
  return locations
    .map((loc) => ({
      location_id: loc.id,
      head_employee_id: locationHeadsMap[loc.id] || null,
    }))
    .filter((entry) => entry.head_employee_id)
}

export function locationHeadsMapFromDepartment(department) {
  if (!department?.location_heads?.length) return {}
  return Object.fromEntries(
    department.location_heads.map((row) => [row.location_id, row.head_employee_id || '']),
  )
}
