import { apiFetch } from './api'
import { listQueryParams } from './listResponse'

export function reportsFetch(path, options = {}) {
  return apiFetch(`/api/reports${path}`, options)
}

export function getReport(key, { dateFrom, dateTo, locationId, search } = {}) {
  return reportsFetch(`/${encodeURIComponent(key)}${listQueryParams({
    date_from: dateFrom,
    date_to: dateTo,
    location_id: locationId && locationId !== 'all' ? locationId : undefined,
    search,
  })}`)
}

export function downloadReportPdf(key, body) {
  return reportsFetch(`/${encodeURIComponent(key)}/pdf`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function listReportSchedules(key) {
  return reportsFetch(`/${encodeURIComponent(key)}/schedules`)
}

export function createReportSchedule(key, body) {
  return reportsFetch(`/${encodeURIComponent(key)}/schedules`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function updateReportSchedule(id, body) {
  return reportsFetch(`/schedules/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export function deleteReportSchedule(id) {
  return reportsFetch(`/schedules/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}
