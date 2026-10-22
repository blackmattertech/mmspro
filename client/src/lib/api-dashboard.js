import { apiFetch } from './api'

export function getDashboardSummary({ locationId, dateFrom, dateTo } = {}) {
  const params = new URLSearchParams()
  if (locationId && locationId !== 'all') params.set('location_id', locationId)
  if (dateFrom) params.set('date_from', dateFrom)
  if (dateTo) params.set('date_to', dateTo)
  const qs = params.toString()
  return apiFetch(`/api/dashboard/summary${qs ? `?${qs}` : ''}`)
}
