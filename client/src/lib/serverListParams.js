export function buildServerListParams({
  search,
  limit,
  offset,
  columnFilters,
  fieldFilter,
  statusFilters = [],
  headerSort,
  sortBy,
  excludeDraft = false,
} = {}) {
  const filters = { ...(columnFilters || {}) }
  if (fieldFilter?.field && String(fieldFilter.value || '').trim()) {
    filters[fieldFilter.field] = fieldFilter.value
  }
  return {
    search,
    limit,
    offset,
    filters,
    statuses: statusFilters,
    excludeStatuses: statusFilters.length ? [] : (excludeDraft ? ['draft'] : []),
    sort: headerSort?.id || '',
    sortDir: headerSort?.dir || '',
    sort_by: headerSort ? '' : (sortBy || ''),
  }
}

export const LIST_TABLE_PROPS = [
  'headerSort',
  'onHeaderSort',
  'columnFilters',
  'onColumnFilter',
  'statusFilters',
  'onToggleStatus',
]
