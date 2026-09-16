export function tallyStatusCounts(rows, getStatus = (row) => row?.status) {
  const map = new Map()
  for (const row of rows || []) {
    const key = String(getStatus(row) ?? '').trim()
    if (!key) continue
    map.set(key, (map.get(key) || 0) + 1)
  }
  return [...map.entries()].map(([status, count]) => ({ status, count }))
}

function humanizeStatus(value) {
  return String(value || '').replace(/_/g, ' ')
}

export function formatStatusCountItems(counts, {
  labelByKey = {},
  colorByKey = {},
  statuses = [],
} = {}) {
  const order = new Map(
    (statuses || []).map((row, index) => [String(row.key || row.value || row.id), row.sort_order ?? index]),
  )
  return (counts || [])
    .filter((row) => Number(row.count) > 0)
    .map((row) => {
      const key = String(row.status ?? row.key ?? '')
      return {
        key,
        label: labelByKey[key] || row.label || humanizeStatus(key),
        count: Number(row.count) || 0,
        color: colorByKey[key] || row.color,
      }
    })
    .sort((a, b) => {
      const ao = order.has(a.key) ? order.get(a.key) : 999
      const bo = order.has(b.key) ? order.get(b.key) : 999
      if (ao !== bo) return ao - bo
      return a.label.localeCompare(b.label)
    })
}

export function colorByStatus(statuses = []) {
  const map = {}
  for (const row of statuses) {
    const key = String(row.key || row.value || row.id || '')
    if (key && row.color) map[key] = row.color
  }
  return map
}
