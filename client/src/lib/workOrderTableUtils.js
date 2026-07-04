export function formatWorkOrderDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function formatAssignees(assignees) {
  if (!assignees?.length) return '—'
  return assignees.map((a) => a.name).join(', ')
}

export function filterWorkOrders(orders, search) {
  const query = search.trim().toLowerCase()
  if (!query) return orders

  return orders.filter((order) => {
    const haystack = [
      order.wo_number,
      order.summary,
      order.status,
      order.creator?.email,
      order.scheduled_at,
      ...(order.assignees || []).map((a) => a.name),
    ].filter(Boolean).join(' ').toLowerCase()
    return haystack.includes(query)
  })
}
