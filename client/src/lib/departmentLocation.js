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

export function departmentsForEmployeeLocation(departments, locationId) {
  const active = departments.filter((d) => d.is_active !== false)
  if (!locationId) return active
  return active.filter((d) =>
    d.all_locations || d.location_id === locationId || (!d.all_locations && !d.location_id),
  )
}
