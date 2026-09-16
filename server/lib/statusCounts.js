export function tallyStatusCounts(rows, getStatus = (row) => row?.status) {
  const map = new Map()
  for (const row of rows || []) {
    const key = String(getStatus(row) ?? '').trim()
    if (!key) continue
    map.set(key, (map.get(key) || 0) + 1)
  }
  return [...map.entries()].map(([status, count]) => ({ status, count }))
}

export async function fetchStatusCounts(query) {
  const { data, error } = await query
  if (error) throw error
  return tallyStatusCounts(data)
}
