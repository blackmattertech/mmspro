export function normalizeMasterName(value) {
  return String(value ?? '').trim().toLowerCase()
}

/** First token of "Name — Location" / "Name - Location" / plain name or code. */
export function primaryMasterToken(cell) {
  return String(cell || '').trim().split(/\s*[—–−-]\s*/)[0].trim()
}

export function departmentFitsLocation(department, locationId) {
  if (!department || !locationId) return false
  if (department.all_locations) return true
  if (!department.location_id) return true
  return department.location_id === locationId
}

const DEPARTMENT_ALIASES = {
  hr: ['hr', 'human resource', 'human resources'],
  'human resource': ['hr', 'human resource', 'human resources'],
  'human resources': ['hr', 'human resource', 'human resources'],
  maintenance: ['maintenance', 'maintainance', 'maintance'],
  maintainance: ['maintenance', 'maintainance', 'maintance'],
  maintance: ['maintenance', 'maintainance', 'maintance'],
}

function tokensMatch(left, right) {
  if (!left || !right) return false
  if (left === right) return true
  if (DEPARTMENT_ALIASES[left]?.includes(right)) return true
  if (left.length >= 3 && right.length >= 3 && (left.includes(right) || right.includes(left))) {
    return true
  }
  return false
}

export function isMaintenanceDepartment(department) {
  const name = normalizeMasterName(department?.name)
  const code = normalizeMasterName(department?.code)
  if (!name && !code) return false
  if (DEPARTMENT_ALIASES.maintenance.includes(name)) return true
  if (code && DEPARTMENT_ALIASES.maintenance.includes(code)) return true
  if (name.includes('maintenance') || name.includes('maintainance') || name.includes('maintance')) {
    return true
  }
  return Boolean(code && (code === 'mnt' || code.startsWith('mnt-')))
}

export function findDepartmentForLocation(departments, deptCell, location) {
  const token = normalizeMasterName(primaryMasterToken(deptCell))
  if (!token || !location) return null
  const eligible = (departments || []).filter((department) => (
    departmentFitsLocation(department, location.id)
  ))
  const exact = eligible.find((department) => {
    const name = normalizeMasterName(department.name)
    const code = normalizeMasterName(department.code)
    return name === token || (code && code === token)
  })
  if (exact) return exact
  return eligible.find((department) => {
    const name = normalizeMasterName(department.name)
    const code = normalizeMasterName(department.code)
    return tokensMatch(name, token) || tokensMatch(code, token)
  }) || null
}

export function scopePlacementOptions(options, locationId) {
  if (!locationId) return options
  return {
    ...options,
    locations: (options.locations || []).filter((location) => location.id === locationId),
    departments: (options.departments || []).filter((department) => (
      departmentFitsLocation(department, locationId)
    )),
    areas: (options.areas || []).filter((area) => area.location_id === locationId),
  }
}

/**
 * One acceptable Department label for Valid values sheets (name only).
 * Import still accepts name or code, and optional "Name — Location" suffixes.
 */
export function departmentValidLabels(department) {
  const name = String(department?.name || '').trim()
  return name ? [name] : []
}
