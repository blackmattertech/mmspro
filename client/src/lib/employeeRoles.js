export function isLocationHeadEmployee(employee, { accessRoleName, isLocationHead } = {}) {
  const roleName = (
    accessRoleName
    ?? employee?.access_role?.name
    ?? ''
  ).trim().toLowerCase()
  if (roleName === 'location head') return true
  if (typeof isLocationHead === 'boolean') return isLocationHead
  if (employee?.is_location_head) return true
  return (employee?.headed_locations || []).length > 0
}

export function isDepartmentHeadEmployee(employee, { accessRoleName, isDepartmentHead } = {}) {
  if (typeof isDepartmentHead === 'boolean') return isDepartmentHead
  if (employee?.is_department_head) return true
  const roleName = (
    accessRoleName
    ?? employee?.access_role?.name
    ?? ''
  ).trim().toLowerCase()
  return roleName.includes('department head')
}
