import { matchesWarrantyExpiringSoon } from './warrantyExpiringFilter.js'

export const TABLE_STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
]

export const TABLE_SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'name_asc', label: 'Name A–Z' },
  { value: 'name_desc', label: 'Name Z–A' },
]

export const WARRANTY_STATUS_OPTIONS = [
  { value: 'all', label: 'All warranties' },
  { value: 'active', label: 'Active' },
  { value: 'expired', label: 'Expired' },
  { value: 'expiring_soon', label: 'Expiring soon' },
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
  if (!row?.warranty_end) return statusFilter === 'active'
  const end = new Date(`${row.warranty_end}T23:59:59`)
  if (Number.isNaN(end.getTime())) return true
  const expired = end < new Date()
  return statusFilter === 'expired' ? expired : !expired
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
} = {}) {
  const list = [...rows]
  switch (sortBy) {
    case 'oldest':
      return list.sort((a, b) => compareDates(getCreatedAt(a), getCreatedAt(b)))
    case 'name_asc':
      return list.sort((a, b) => compareStrings(getName(a), getName(b)))
    case 'name_desc':
      return list.sort((a, b) => compareStrings(getName(b), getName(a)))
    case 'newest':
    default:
      return list.sort((a, b) => compareDates(getCreatedAt(b), getCreatedAt(a)))
  }
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
