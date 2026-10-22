import { apiFetch } from './api'
import { listQueryParams } from './listResponse'

export function getLogbook(params = {}) {
  return apiFetch(`/api/logbook${listQueryParams({
    search: params.search,
    location_id: params.locationId,
    limit: params.limit ?? 50,
    offset: params.offset ?? 0,
  })}`)
}

export function getLatestMeterReading(equipmentId) {
  const qs = new URLSearchParams({ equipment_id: equipmentId })
  return apiFetch(`/api/logbook/latest?${qs}`)
}

export function getMeterReadings(equipmentId) {
  return apiFetch(`/api/logbook/${equipmentId}/readings`)
}

export function addMeterReading(equipmentId, reading) {
  return apiFetch(`/api/logbook/${equipmentId}/readings`, {
    method: 'POST',
    body: JSON.stringify({ reading }),
  })
}

export function deleteMeterReading(readingId) {
  return apiFetch(`/api/logbook/readings/${readingId}`, { method: 'DELETE' })
}
