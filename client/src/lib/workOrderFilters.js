import { createId } from './id'

export const ADVANCED_FILTER_FIELDS = [
  { id: 'location', label: 'Location' },
  { id: 'status', label: 'Status' },
  { id: 'summary', label: 'Summary' },
  { id: 'assignee', label: 'Assignee' },
  { id: 'creator', label: 'Created by' },
  { id: 'wo_number', label: 'WO #' },
]

export const FILTER_JOIN_OPTIONS = [
  { id: 'and', label: 'And' },
  { id: 'or', label: 'Or' },
]

export function createFilterRule(overrides = {}) {
  return {
    id: createId(),
    join: 'and',
    field: 'location',
    operator: 'is',
    value: '',
    ...overrides,
  }
}

export function getOperatorsForField(field) {
  switch (field) {
    case 'location':
    case 'status':
      return [
        { id: 'is', label: 'is' },
        { id: 'is_not', label: 'is not' },
      ]
    case 'summary':
    case 'assignee':
    case 'creator':
    case 'wo_number':
      return [
        { id: 'contains', label: 'contains' },
        { id: 'equals', label: 'equals' },
        { id: 'not_contains', label: 'does not contain' },
      ]
    default:
      return [{ id: 'contains', label: 'contains' }]
  }
}

function getAssigneeLocationIds(order) {
  const fromAssignees = (order.assignees || [])
    .map((assignee) => assignee.location_id || assignee.org_locations?.id)
    .filter(Boolean)
  const fromAssignment = [
    order.assigned_location_id,
    order.assigned_location?.id,
    order.assigned_department?.location_id,
  ].filter(Boolean)
  return [...new Set([...fromAssignees, ...fromAssignment])]
}

function getAssigneeLocationNames(order) {
  const fromAssignees = (order.assignees || [])
    .map((assignee) => assignee.org_locations?.name)
    .filter(Boolean)
  const fromAssignment = [
    order.assigned_location?.name,
    order.assigned_department?.location_name,
  ].filter(Boolean)
  return [...new Set([...fromAssignees, ...fromAssignment])]
}

function matchesRule(order, rule, locations = []) {
  const value = String(rule.value ?? '').trim()
  if (!value) return true

  const lowerValue = value.toLowerCase()

  switch (rule.field) {
    case 'location': {
      const ids = getAssigneeLocationIds(order)
      const names = getAssigneeLocationNames(order)
      const selected = locations.find((loc) => loc.id === value)
      const nameMatch = selected
        ? names.some((name) => name.toLowerCase() === selected.name.toLowerCase())
        : names.some((name) => name.toLowerCase().includes(lowerValue))
      const idMatch = ids.includes(value)
      const matched = idMatch || nameMatch
      return rule.operator === 'is_not' ? !matched : matched
    }
    case 'status': {
      const status = (order.status || '').toLowerCase()
      const matched = rule.operator === 'equals' || rule.operator === 'is'
        ? status === lowerValue
        : status.includes(lowerValue)
      return rule.operator === 'is_not' || rule.operator === 'not_contains' ? !matched : matched
    }
    case 'summary': {
      const summary = (order.summary || '').toLowerCase()
      return compareText(summary, lowerValue, rule.operator)
    }
    case 'assignee': {
      const haystack = (order.assignees || []).map((a) => a.name).join(' ').toLowerCase()
      return compareText(haystack, lowerValue, rule.operator)
    }
    case 'creator': {
      const creator = (order.creator?.email || '').toLowerCase()
      return compareText(creator, lowerValue, rule.operator)
    }
    case 'wo_number': {
      const wo = (order.wo_number || '').toLowerCase()
      return compareText(wo, lowerValue, rule.operator)
    }
    default:
      return true
  }
}

function compareText(haystack, needle, operator) {
  switch (operator) {
    case 'equals':
      return haystack === needle
    case 'not_contains':
      return !haystack.includes(needle)
    case 'contains':
    default:
      return haystack.includes(needle)
  }
}

export function applyAdvancedFilters(orders, rules, locations = []) {
  const activeRules = (rules || []).filter((rule) => rule.field && String(rule.value ?? '').trim())
  if (!activeRules.length) return orders

  return orders.filter((order) => {
    let result = null
    for (const rule of activeRules) {
      const match = matchesRule(order, rule, locations)
      if (result === null) {
        result = match
      } else if (rule.join === 'or') {
        result = result || match
      } else {
        result = result && match
      }
    }
    return result ?? true
  })
}

export function applyLocationFilter(orders, locationId) {
  if (!locationId || locationId === 'all') return orders
  return orders.filter((order) => getAssigneeLocationIds(order).includes(locationId))
}

export function applyWorkOrderFilters(orders, {
  search,
  locationFilter,
  advancedRules,
  locations,
  sortBy,
  fieldFilter,
} = {}) {
  let result = orders || []

  if (search?.trim()) {
    const query = search.trim().toLowerCase()
    result = result.filter((order) => {
      const haystack = [
        order.wo_number,
        order.summary,
        order.status,
        order.creator?.email,
        order.scheduled_at,
        ...getAssigneeLocationNames(order),
        ...(order.assignees || []).map((a) => a.name),
      ].filter(Boolean).join(' ').toLowerCase()
      return haystack.includes(query)
    })
  }

  result = applyLocationFilter(result, locationFilter)

  if (fieldFilter?.field && String(fieldFilter.value || '').trim()) {
    const query = String(fieldFilter.value).trim().toLowerCase()
    const getters = {
      location: (order) => getAssigneeLocationNames(order).join(' '),
      status: (order) => order.status,
      summary: (order) => order.summary,
      wo_number: (order) => order.wo_number,
      assignee: (order) => (order.assignees || []).map((a) => a.name).join(' '),
      creator: (order) => order.creator?.email || order.creator?.full_name,
    }
    const getter = getters[fieldFilter.field]
    if (getter) {
      result = result.filter((order) => String(getter(order) || '').toLowerCase().includes(query))
    }
  }

  result = applyAdvancedFilters(result, advancedRules, locations)

  if (sortBy) {
    result = sortWorkOrders(result, sortBy)
  }

  return result
}

export function countActiveAdvancedRules(rules) {
  return (rules || []).filter((rule) => rule.field && String(rule.value ?? '').trim()).length
}

export const WO_SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'wo_number', label: 'WO # A–Z' },
  { value: 'summary', label: 'Summary A–Z' },
]

export function sortWorkOrders(orders, sortBy = 'newest') {
  const list = [...(orders || [])]
  switch (sortBy) {
    case 'oldest':
      return list.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))
    case 'wo_number':
      return list.sort((a, b) => String(a.wo_number || '').localeCompare(String(b.wo_number || ''), undefined, { sensitivity: 'base' }))
    case 'summary':
      return list.sort((a, b) => String(a.summary || '').localeCompare(String(b.summary || ''), undefined, { sensitivity: 'base' }))
    case 'newest':
    default:
      return list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
  }
}
