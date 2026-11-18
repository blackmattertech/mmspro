import { SOURCE_LABELS } from '../data/calendarDemo.js'

/** Visible calendar label: short description / name, not document number. */
export function calendarEventLabel(event) {
  const text = String(event?.title || '').trim()
  return text || SOURCE_LABELS[event?.source] || 'Item'
}

/**
 * Hover details for calendar items.
 * Prefer order from / order to / work request / document number when present.
 */
export function calendarEventTooltipLines(event) {
  if (!event) return []
  const lines = []
  const typeLabel = SOURCE_LABELS[event.source] || event.type || 'Item'
  lines.push(typeLabel)

  const documentNumber = String(event.document_number || '').trim()
  if (documentNumber) lines.push(`Document: ${documentNumber}`)

  const workRequest = String(event.work_request || '').trim()
  if (workRequest && workRequest !== documentNumber) {
    lines.push(`Work request: ${workRequest}`)
  }

  const orderFrom = String(event.order_from || '').trim()
  if (orderFrom) lines.push(`Order from: ${orderFrom}`)

  const orderTo = String(event.order_to || '').trim()
  if (orderTo) lines.push(`Order to: ${orderTo}`)

  const plant = String(event.plant || '').trim()
  if (plant && plant !== '—' && plant !== orderTo && plant !== orderFrom) {
    lines.push(`Location: ${plant}`)
  }

  return lines
}

export function calendarEventTooltip(event) {
  return calendarEventTooltipLines(event).join('\n')
}
