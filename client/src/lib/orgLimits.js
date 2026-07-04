export const PLAN_DEFAULTS = {
  free: {
    location_limit: 1,
    department_limit: 5,
    employee_limit: 25,
    login_limit: 3,
  },
  pro: {
    location_limit: 10,
    department_limit: 50,
    employee_limit: 500,
    login_limit: 50,
  },
  enterprise: {
    location_limit: null,
    department_limit: null,
    employee_limit: null,
    login_limit: null,
  },
}

export const LIMIT_ITEMS = [
  { key: 'location_limit', usageKey: 'locations', label: 'Locations' },
  { key: 'department_limit', usageKey: 'departments', label: 'Departments' },
  { key: 'employee_limit', usageKey: 'employees', label: 'Employees' },
  { key: 'login_limit', usageKey: 'logins', label: 'Logins' },
]

export function formatLimitValue(limit) {
  if (limit == null) return 'Unlimited'
  return String(limit)
}

export function formatUsage(usage, limit) {
  const used = usage ?? 0
  if (limit == null) return `${used} / ∞`
  return `${used} / ${limit}`
}

export function isAtOrOverLimit(usage, limit) {
  if (limit == null) return false
  return usage >= limit
}

export function limitInputValue(limit) {
  return limit == null ? '' : String(limit)
}
