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
