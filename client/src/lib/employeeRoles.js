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
