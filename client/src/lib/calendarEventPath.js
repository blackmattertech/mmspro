import { orgPath } from '../config/navigation'

function recordId(event) {
  if (event?.record_id) return event.record_id
  const raw = String(event?.id || '')
  const splitAt = raw.indexOf(':')
  return splitAt === -1 ? '' : raw.slice(splitAt + 1)
}

function firstSegment(canRead, options) {
  const match = options.find(([moduleKey]) => canRead(moduleKey))
  return match?.[1] || null
}

/** In-app path for a calendar event, or null when there is no record page. */
export function calendarEventPath(orgSlug, event, canRead) {
  if (!orgSlug || !event || typeof canRead !== 'function') return null
  const id = recordId(event)
  if (!id) return null
  const source = event.source || event.type

  if (source === 'task') return orgPath(orgSlug, `tasks-and-followups/${id}`)
  if (source === 'warranty') return orgPath(orgSlug, `warranty-manager/${id}`)

  if (source === 'pm_plan') {
    return `${orgPath(orgSlug, 'work-orders/scheduled')}?plan=${encodeURIComponent(id)}`
  }

  if (source === 'work_order') {
    const segment = firstSegment(canRead, [
      ['work_orders_manual', 'work-orders/manual'],
      ['work_orders_received', 'work-orders/received'],
      ['work_orders_assigned', 'work-orders/assigned'],
      ['work_orders_scheduled', 'work-orders/scheduled'],
    ])
    if (!segment) return null
    return `${orgPath(orgSlug, segment)}?open=${encodeURIComponent(id)}`
  }

  if (source === 'work_request') {
    const segment = firstSegment(canRead, [
      ['work_request_all', 'work-request/all'],
      ['work_request_my', 'work-request/my'],
      ['work_request_incoming', 'work-request/incoming'],
      ['work_request_outgoing', 'work-request/outgoing'],
    ])
    if (!segment) return null
    return `${orgPath(orgSlug, segment)}?open=${encodeURIComponent(id)}`
  }

  return null
}
