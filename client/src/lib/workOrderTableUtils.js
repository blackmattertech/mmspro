export function formatWorkOrderDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function formatAssignees(assignees, assignedDepartment = null, assignedLocation = null) {
  const names = (assignees || []).map((a) => a.name).filter(Boolean)
  if (assignedDepartment?.name) {
    const deptLabel = assignedDepartment.location_name
      ? `${assignedDepartment.name} (${assignedDepartment.location_name})`
      : assignedDepartment.name
    if (!names.length) return deptLabel
    return `${deptLabel}; ${names.join(', ')}`
  }
  if (assignedDepartment?.location_only || (assignedLocation?.name && !assignedDepartment?.name)) {
    const locName = assignedLocation?.name || assignedDepartment?.location_name || 'Location'
    const locLabel = `${locName} (Location Head)`
    if (!names.length) return locLabel
    return `${locLabel}; ${names.join(', ')}`
  }
  if (!names.length) return '—'
  return names.join(', ')
}

export function filterWorkOrders(orders, search) {
  const query = search.trim().toLowerCase()
  if (!query) return orders

  return orders.filter((order) => {
    const haystack = [
      order.wo_number,
      order.short_description,
      order.summary,
      order.status,
      order.creator?.email,
      order.scheduled_at,
      order.assigned_department?.name,
      order.assigned_department?.location_name,
      order.assigned_location?.name,
      ...(order.assignees || []).map((a) => a.name),
    ].filter(Boolean).join(' ').toLowerCase()
    return haystack.includes(query)
  })
}
