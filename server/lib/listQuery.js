export function listEnvelope(items, extras = {}) {
  const { total, limit, offset, ...rest } = extras
  return {
    items: items || [],
    total: Number.isFinite(total) ? total : (items?.length || 0),
    limit,
    offset,
    ...rest,
  }
}

export function sanitizeSearch(term) {
  const q = String(term || '').trim().replace(/%/g, '').replace(/,/g, ' ')
  return q || null
}

export function applyIlikeSearch(query, term, columns) {
  const q = sanitizeSearch(term)
  if (!q || !columns?.length) return query
  return query.or(columns.map((column) => `${column}.ilike.%${q}%`).join(','))
}

const NIL_ID = '00000000-0000-0000-0000-000000000000'

export function parseListControls(query = {}) {
  let filters = {}
  if (query.filters) {
    try {
      const parsed = JSON.parse(query.filters)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) filters = parsed
    } catch {
      filters = {}
    }
  }
  const statuses = String(query.statuses || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  const excludeStatuses = String(query.exclude_statuses || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  const sortDir = query.sort_dir === 'asc' ? 'asc' : 'desc'
  return {
    filters,
    statuses,
    excludeStatuses,
    sort: query.sort ? String(query.sort) : '',
    sortDir,
    exportCsv: query.export === 'csv',
  }
}

export function ilikePattern(value) {
  const q = sanitizeSearch(value)
  if (!q) return null
  return `%${q}%`
}

/**
 * columnMap values are a column name or (query, value) => query.
 * Builders must stay synchronous — awaiting a Supabase builder runs the query.
 */
export function applyMappedFilters(query, filters, columnMap = {}) {
  let next = query
  for (const [key, raw] of Object.entries(filters || {})) {
    const spec = columnMap[key]
    const value = String(raw ?? '').trim()
    if (!spec || !value) continue
    if (typeof spec === 'function') {
      next = spec(next, value)
      continue
    }
    const pattern = ilikePattern(value)
    if (pattern) next = next.ilike(spec, pattern)
  }
  return next
}

export function applyStatusSelection(query, {
  statuses = [],
  excludeStatuses = [],
  column = 'status',
  defaultExclude = [],
} = {}) {
  if (!column) return query
  if (statuses.length) return query.in(column, statuses)
  const exclude = excludeStatuses.length ? excludeStatuses : defaultExclude
  if (exclude.length === 1) return query.neq(column, exclude[0])
  if (exclude.length > 1) return query.not(column, 'in', `(${exclude.join(',')})`)
  return query
}

export function applyMappedSort(query, sort, sortDir, sortMap = {}, fallback = null) {
  const column = sort && sortMap[sort] ? sortMap[sort] : null
  if (column) return query.order(column, { ascending: sortDir === 'asc' })
  if (typeof fallback === 'function') return fallback(query)
  return query
}

export function restrictToIds(query, column, ids) {
  const list = (ids || []).filter(Boolean)
  return query.in(column, list.length ? list : [NIL_ID])
}

export function csvEscape(value) {
  const text = value == null ? '' : String(value)
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export function sendCsv(res, filename, rows, columns) {
  const header = columns.map((col) => csvEscape(col.label)).join(',')
  const lines = (rows || []).map((row) => columns.map((col) => {
    const value = typeof col.value === 'function' ? col.value(row) : row?.[col.id]
    return csvEscape(value)
  }).join(','))
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.send(`\uFEFF${[header, ...lines].join('\n')}`)
}

export function exportLimit(controls, { limit, offset, max = 5000 }) {
  if (controls?.exportCsv) return { limit: max, offset: 0 }
  return { limit, offset }
}
