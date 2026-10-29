import { matchesWarrantyExpiringSoon } from './warrantyExpiringFilter.js'

export const TABLE_STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
]

export const ACTIVE_STATUS_FILTER = {
  value: 'status',
  id: 'status',
  label: 'Status',
  type: 'select',
  emptyLabel: 'All Status',
  options: [
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
  ],
}

export function uniqueNameOptions(rows, getName = (row) => row?.name) {
  const seen = new Set()
  const options = []
  for (const row of rows || []) {
    const name = String(getName(row) || '').trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    options.push({ value: name, label: name })
  }
  return options.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
}

export function selectFilterField(id, label, options, emptyLabel) {
  return {
    value: id,
    id,
    label,
    type: 'select',
    emptyLabel: emptyLabel || `All ${label}`,
    options: options || [],
  }
}

export const TABLE_SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'name_asc', label: 'Name A–Z' },
  { value: 'name_desc', label: 'Name Z–A' },
]

export const EMPLOYEE_SORT_OPTIONS = [
  { value: 'department_asc', label: 'Department A–Z' },
  { value: 'department_desc', label: 'Department Z–A' },
  ...TABLE_SORT_OPTIONS,
]

export const WARRANTY_STATUS_OPTIONS = [
  { value: 'all', label: 'All warranties' },
  { value: 'in_warranty', label: 'In Warranty' },
  { value: 'out_of_warranty', label: 'Out of warranty' },
  { value: 'expiring_soon', label: 'Soon to Expired' },
  { value: 'expired', label: 'Expired' },
]

export function matchesTableSearch(haystack, search) {
  const query = String(search || '').trim().toLowerCase()
  if (!query) return true
  const terms = query.split(/\s+/).filter(Boolean)
  const value = String(haystack || '').toLowerCase()
  return terms.every((term) => value.includes(term))
}

export function matchesFieldFilter(row, field, value, getters = {}) {
  const query = String(value || '').trim().toLowerCase()
  if (!field || !query) return true
  const getter = getters[field]
  if (typeof getter !== 'function') return true
  return String(getter(row) ?? '').toLowerCase().includes(query)
}

export function matchesActiveStatus(row, statusFilter) {
  if (!statusFilter || statusFilter === 'all') return true
  const isActive = row?.is_active !== false
  return statusFilter === 'active' ? isActive : !isActive
}

export function matchesWarrantyStatus(row, statusFilter) {
  if (!statusFilter || statusFilter === 'all') return true
  const status = statusFilter === 'active' ? 'in_warranty' : statusFilter
  if (!row?.warranty_end) return status === 'out_of_warranty'
  const end = new Date(`${String(row.warranty_end).slice(0, 10)}T23:59:59`)
  if (Number.isNaN(end.getTime())) return status === 'out_of_warranty'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (end < today) return status === 'expired'
  const soon = new Date(today)
  soon.setDate(soon.getDate() + 30)
  soon.setHours(23, 59, 59, 999)
  if (end <= soon) return status === 'expiring_soon'
  return status === 'in_warranty'
}

function compareStrings(a, b) {
  return String(a || '').localeCompare(String(b || ''), undefined, { sensitivity: 'base' })
}

function compareDates(a, b) {
  const av = a ? new Date(a).getTime() : 0
  const bv = b ? new Date(b).getTime() : 0
  return av - bv
}

export function sortTableRows(rows, sortBy, {
  getName = (row) => row?.name || '',
  getCreatedAt = (row) => row?.created_at || row?.updated_at || null,
  getDepartment = (row) => row?.departments?.name || '',
} = {}) {
  const list = [...rows]
  const departmentKey = (row) => getDepartment(row) || '\uffff'
  switch (sortBy) {
    case 'oldest':
      return list.sort((a, b) => compareDates(getCreatedAt(a), getCreatedAt(b)))
    case 'name_asc':
      return list.sort((a, b) => compareStrings(getName(a), getName(b)))
    case 'name_desc':
      return list.sort((a, b) => compareStrings(getName(b), getName(a)))
    case 'department_desc':
      return list.sort((a, b) => (
        compareStrings(departmentKey(b), departmentKey(a))
        || compareStrings(getName(a), getName(b))
      ))
    case 'department_asc':
      return list.sort((a, b) => (
        compareStrings(departmentKey(a), departmentKey(b))
        || compareStrings(getName(a), getName(b))
      ))
    case 'newest':
    default:
      return list.sort((a, b) => compareDates(getCreatedAt(b), getCreatedAt(a)))
  }
}

export function serverFieldFilters(field, value) {
  const text = String(value ?? '').trim()
  if (!field || !text) return undefined
  return { [field]: text }
}

export function compactFilters(values) {
  const next = {}
  for (const [key, value] of Object.entries(values || {})) {
    const text = String(value ?? '').trim()
    if (text) next[key] = text
  }
  return Object.keys(next).length ? next : undefined
}

export function applyTableFilters(rows, {
  search,
  searchHaystack,
  statusFilter,
  fieldFilter,
  fieldFilterGetters,
  warrantyStatusFilter,
  warrantyExpiringFilter,
  sortBy,
  getName,
  getCreatedAt,
} = {}) {
  let result = rows

  if (search && searchHaystack) {
    result = result.filter((row) => matchesTableSearch(searchHaystack(row), search))
  }

  if (fieldFilter?.field && fieldFilter?.value) {
    result = result.filter((row) => matchesFieldFilter(
      row,
      fieldFilter.field,
      fieldFilter.value,
      fieldFilterGetters,
    ))
  }

  if (statusFilter && statusFilter !== 'all') {
    result = result.filter((row) => matchesActiveStatus(row, statusFilter))
  }

  if (warrantyStatusFilter === 'expiring_soon') {
    result = result.filter((row) => matchesWarrantyExpiringSoon(row, warrantyExpiringFilter))
  } else if (warrantyStatusFilter && warrantyStatusFilter !== 'all') {
    result = result.filter((row) => matchesWarrantyStatus(row, warrantyStatusFilter))
  }

  if (sortBy) {
    result = sortTableRows(result, sortBy, { getName, getCreatedAt })
  }

  return result
}
