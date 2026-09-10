import { createId } from './id'

export const PM_PLAN_FILTER_FIELDS = [
  { value: 'location', label: 'Location' },
  { value: 'status', label: 'Status' },
  { value: 'name', label: 'Name' },
  { value: 'plan_number', label: 'Plan #' },
  { value: 'activity', label: 'Activity' },
  { value: 'equipment', label: 'Asset' },
  { value: 'technician', label: 'Technician' },
]

export const PM_PLAN_ADVANCED_FILTER_FIELDS = PM_PLAN_FILTER_FIELDS.map((field) => ({
  id: field.value,
  label: field.label,
}))

export const PM_PLAN_SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'name', label: 'Name A–Z' },
  { value: 'plan_number', label: 'Plan # A–Z' },
  { value: 'next_due', label: 'Next due' },
]

export const PM_PLAN_STATUS_FILTER_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'overdue', label: 'Overdue' },
]

export function createPmPlanFilterRule(overrides = {}) {
  return {
    id: createId(),
    join: 'and',
    field: 'status',
    operator: 'is',
    value: '',
    ...overrides,
  }
}

export function getOperatorsForPmPlanField(field) {
  switch (field) {
    case 'location':
    case 'status':
      return [
        { id: 'is', label: 'is' },
        { id: 'is_not', label: 'is not' },
      ]
    default:
      return [
        { id: 'contains', label: 'contains' },
        { id: 'equals', label: 'equals' },
        { id: 'not_contains', label: 'does not contain' },
      ]
  }
}

function compareText(haystack, needle, operator) {
  switch (operator) {
    case 'equals':
    case 'is':
      return haystack === needle
    case 'is_not':
    case 'not_contains':
      return !haystack.includes(needle)
    case 'contains':
    default:
      return haystack.includes(needle)
  }
}

function planLocationIds(plan) {
  return [plan.location_id, plan.location?.id].filter(Boolean)
}

function planLocationNames(plan) {
  return [plan.location?.name].filter(Boolean)
}

function planSearchHaystack(plan) {
  return [
    plan.plan_number,
    plan.name,
    plan.status,
    plan.activity_type?.name,
    plan.equipment?.name,
    plan.equipment?.code,
    plan.department?.name,
    plan.location?.name,
    plan.area?.name,
    ...(plan.technicians || []).map((row) => row.name),
  ].filter(Boolean).join(' ').toLowerCase()
}

function fieldValue(plan, field) {
  switch (field) {
    case 'location':
      return planLocationNames(plan).join(' ').toLowerCase()
    case 'status':
      return String(plan.status || '').toLowerCase()
    case 'name':
      return String(plan.name || '').toLowerCase()
    case 'plan_number':
      return String(plan.plan_number || '').toLowerCase()
    case 'activity':
      return String(plan.activity_type?.name || '').toLowerCase()
    case 'equipment':
      return [plan.equipment?.code, plan.equipment?.name].filter(Boolean).join(' ').toLowerCase()
    case 'technician':
      return (plan.technicians || []).map((row) => row.name).join(' ').toLowerCase()
    default:
      return ''
  }
}

function matchesRule(plan, rule, locations = []) {
  const value = String(rule.value ?? '').trim()
  if (!value) return true
  const lowerValue = value.toLowerCase()

  if (rule.field === 'location') {
    const ids = planLocationIds(plan)
    const names = planLocationNames(plan)
    const selected = locations.find((loc) => loc.id === value)
    const nameMatch = selected
      ? names.some((name) => name.toLowerCase() === selected.name.toLowerCase())
      : names.some((name) => name.toLowerCase().includes(lowerValue))
    const matched = ids.includes(value) || nameMatch
    return rule.operator === 'is_not' ? !matched : matched
  }

  return compareText(fieldValue(plan, rule.field), lowerValue, rule.operator)
}

function applyAdvancedFilters(plans, rules, locations = []) {
  const activeRules = (rules || []).filter((rule) => rule.field && String(rule.value ?? '').trim())
  if (!activeRules.length) return plans

  return plans.filter((plan) => {
    let result = null
    for (const rule of activeRules) {
      const match = matchesRule(plan, rule, locations)
      if (result === null) result = match
      else if (rule.join === 'or') result = result || match
      else result = result && match
    }
    return result ?? true
  })
}

function sortPmPlans(plans, sortBy = 'newest') {
  const list = [...(plans || [])]
  switch (sortBy) {
    case 'oldest':
      return list.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))
    case 'name':
      return list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }))
    case 'plan_number':
      return list.sort((a, b) => String(a.plan_number || '').localeCompare(String(b.plan_number || ''), undefined, { sensitivity: 'base' }))
    case 'next_due':
      return list.sort((a, b) => String(a.next_due_at || '9999-12-31').localeCompare(String(b.next_due_at || '9999-12-31')))
    case 'newest':
    default:
      return list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
  }
}

export function applyPmPlanFilters(plans, {
  search,
  locationFilter,
  advancedRules,
  locations,
  sortBy,
  fieldFilter,
} = {}) {
  let result = plans || []

  if (search?.trim()) {
    const query = search.trim().toLowerCase()
    result = result.filter((plan) => planSearchHaystack(plan).includes(query))
  }

  if (locationFilter && locationFilter !== 'all') {
    result = result.filter((plan) => planLocationIds(plan).includes(locationFilter))
  }

  if (fieldFilter?.field && String(fieldFilter.value || '').trim()) {
    const query = String(fieldFilter.value).trim().toLowerCase()
    result = result.filter((plan) => {
      if (fieldFilter.field === 'location') {
        return planLocationIds(plan).includes(fieldFilter.value)
          || planLocationNames(plan).some((name) => name.toLowerCase().includes(query))
      }
      return fieldValue(plan, fieldFilter.field).includes(query)
    })
  }

  result = applyAdvancedFilters(result, advancedRules, locations)
  if (sortBy) result = sortPmPlans(result, sortBy)
  return result
}
