import { createId } from './id'

export const WR_ADVANCED_FILTER_FIELDS = [
  { id: 'status', label: 'Status' },
  { id: 'priority', label: 'Priority' },
  { id: 'request_type', label: 'Request type' },
  { id: 'order_from', label: 'Order from' },
  { id: 'order_to', label: 'Order to' },
  { id: 'wr_number', label: 'WR #' },
  { id: 'problem', label: 'Problem' },
  { id: 'requester', label: 'Requested by' },
]

export const FILTER_JOIN_OPTIONS = [
  { id: 'and', label: 'And' },
  { id: 'or', label: 'Or' },
]

export const WR_STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'pending_approval', label: 'Pending approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'need_info', label: 'Need info' },
  { value: 'cancelled', label: 'Cancelled' },
]

export const WR_PRIORITY_FILTER_OPTIONS = [
  { value: 'all', label: 'All priorities' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

export function createWorkRequestFilterRule(overrides = {}) {
  return {
    id: createId(),
    join: 'and',
    field: 'status',
    operator: 'is',
    value: '',
    ...overrides,
  }
}

export function getOperatorsForWorkRequestField(field) {
  switch (field) {
    case 'status':
    case 'priority':
    case 'request_type':
    case 'order_from':
    case 'order_to':
      return [
        { id: 'is', label: 'is' },
        { id: 'is_not', label: 'is not' },
      ]
    case 'wr_number':
    case 'problem':
    case 'requester':
      return [
        { id: 'contains', label: 'contains' },
        { id: 'equals', label: 'equals' },
        { id: 'not_contains', label: 'does not contain' },
      ]
    default:
      return [{ id: 'contains', label: 'contains' }]
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

function matchesRule(row, rule, departments = []) {
  const value = String(rule.value ?? '').trim()
  if (!value) return true

  const lowerValue = value.toLowerCase()

  switch (rule.field) {
    case 'status': {
      const status = (row.status || '').toLowerCase()
      const matched = status === lowerValue.replace(/\s+/g, '_')
      return rule.operator === 'is_not' ? !matched : matched
    }
    case 'priority': {
      const priority = (row.priority || '').toLowerCase()
      const matched = priority === lowerValue
      return rule.operator === 'is_not' ? !matched : matched
    }
    case 'request_type': {
      const type = (row.request_type || '').toLowerCase()
      const normalized = lowerValue.replace(/\s+/g, '_')
      const matched = type === normalized
      return rule.operator === 'is_not' ? !matched : matched
    }
    case 'order_from': {
      const dept = departments.find((d) => d.id === value)
      const name = (row.order_from?.name || '').toLowerCase()
      const matched = dept
        ? name === dept.name.toLowerCase()
        : name.includes(lowerValue)
      return rule.operator === 'is_not' ? !matched : matched
    }
    case 'order_to': {
      const dept = departments.find((d) => d.id === value)
      const name = (row.order_to?.name || '').toLowerCase()
      const matched = dept
        ? name === dept.name.toLowerCase()
        : name.includes(lowerValue)
      return rule.operator === 'is_not' ? !matched : matched
    }
    case 'wr_number':
      return compareText((row.request_number || '').toLowerCase(), lowerValue, rule.operator)
    case 'problem':
      return compareText((row.problem_description || '').toLowerCase(), lowerValue, rule.operator)
    case 'requester': {
      const who = [
        row.requester?.full_name,
        row.requester?.email,
      ].filter(Boolean).join(' ').toLowerCase()
      return compareText(who, lowerValue, rule.operator)
    }
    default:
      return true
  }
}

export function applyAdvancedWorkRequestFilters(rows, rules, departments = []) {
  const activeRules = (rules || []).filter((rule) => rule.field && String(rule.value ?? '').trim())
  if (!activeRules.length) return rows

  return rows.filter((row) => {
    let result = null
    for (const rule of activeRules) {
      const match = matchesRule(row, rule, departments)
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

export function applyWorkRequestFilters(rows, {
  search,
  statusFilter,
  priorityFilter,
  advancedRules,
  departments,
  fieldFilter,
} = {}) {
  let result = rows || []

  if (search?.trim()) {
    const query = search.trim().toLowerCase()
    result = result.filter((row) => {
      const haystack = [
        row.request_number,
        row.problem_description,
        row.remarks,
        row.status,
        row.priority,
        row.request_type,
        row.order_from?.name,
        row.order_to?.name,
        row.requester?.full_name,
        row.requester?.email,
      ].filter(Boolean).join(' ').toLowerCase()
      return haystack.includes(query)
    })
  }

  if (statusFilter && statusFilter !== 'all') {
    result = result.filter((row) => row.status === statusFilter)
  }

  if (priorityFilter && priorityFilter !== 'all') {
    result = result.filter((row) => row.priority === priorityFilter)
  }

  if (fieldFilter?.field && String(fieldFilter.value || '').trim()) {
    const query = String(fieldFilter.value).trim().toLowerCase()
    const typeLabels = {
      inter_department: 'inter inter department',
      intra_department: 'intra intra department',
      user_self: 'self user self',
      manual: 'manual',
    }
    const getters = {
      status: (row) => `${row.status || ''} ${(row.status || '').replace(/_/g, ' ')}`,
      priority: (row) => row.priority,
      request_number: (row) => row.request_number,
      description: (row) => row.problem_description,
      type: (row) => `${row.request_type || ''} ${typeLabels[row.request_type] || ''}`,
      from: (row) => row.order_from?.name,
      to: (row) => row.order_to?.name,
      requester: (row) => row.requester?.full_name || row.requester?.email,
    }
    const getter = getters[fieldFilter.field]
    if (getter) {
      result = result.filter((row) => String(getter(row) || '').toLowerCase().includes(query))
    }
  }

  result = applyAdvancedWorkRequestFilters(result, advancedRules, departments)
  return result
}

export function countActiveWorkRequestFilterRules(rules) {
  return (rules || []).filter((rule) => rule.field && String(rule.value ?? '').trim()).length
}

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 }

export const WR_SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'priority_high', label: 'Priority (high → low)' },
  { value: 'priority_low', label: 'Priority (low → high)' },
]

export function sortWorkRequests(rows, sortBy = 'newest') {
  const list = [...(rows || [])]
  switch (sortBy) {
    case 'oldest':
      return list.sort((a, b) => new Date(a.request_date) - new Date(b.request_date))
    case 'priority_high':
      return list.sort((a, b) => {
        const diff = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9)
        if (diff !== 0) return diff
        return new Date(b.request_date) - new Date(a.request_date)
      })
    case 'priority_low':
      return list.sort((a, b) => {
        const diff = (PRIORITY_RANK[b.priority] ?? 9) - (PRIORITY_RANK[a.priority] ?? 9)
        if (diff !== 0) return diff
        return new Date(b.request_date) - new Date(a.request_date)
      })
    case 'newest':
    default:
      return list.sort((a, b) => new Date(b.request_date) - new Date(a.request_date))
  }
}
