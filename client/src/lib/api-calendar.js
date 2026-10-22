import { apiFetch } from './api'
import { listQueryParams } from './listResponse'

export function getCalendarEvents(params = {}) {
  return apiFetch(`/api/calendar/events${listQueryParams({
    from: params.from,
    to: params.to,
    location_id: params.locationId,
    sources: Array.isArray(params.sources) ? params.sources.join(',') : params.sources,
  })}`)
}
