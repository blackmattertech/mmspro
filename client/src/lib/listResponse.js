export function unwrapList(data) {
  if (Array.isArray(data)) {
    return { items: data, total: data.length }
  }
  const items = Array.isArray(data?.items) ? data.items : []
  return {
    items,
    total: Number.isFinite(data?.total) ? data.total : items.length,
    limit: data?.limit,
    offset: data?.offset,
  }
}

/** Array of items with non-enumerable total/limit/offset for existing .map callers. */
export function asListArray(data) {
  const page = unwrapList(data)
  const items = page.items.slice()
  Object.defineProperties(items, {
    total: { value: page.total, enumerable: false },
    limit: { value: page.limit, enumerable: false },
    offset: { value: page.offset, enumerable: false },
  })
  return items
}

export function listQueryParams(params = {}) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    if (typeof value === 'boolean') {
      search.set(key, value ? '1' : '0')
      return
    }
    search.set(key, String(value))
  })
  const suffix = search.toString()
  return suffix ? `?${suffix}` : ''
}
