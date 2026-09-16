import { apiFetch } from './api'
import { listQueryParams } from './listResponse'

export function reportsFetch(path, options = {}) {
  return apiFetch(`/api/reports${path}`, options)
}

export function getReportFilters() {
  return reportsFetch('/filters')
}

export function getReport(key, {
  dateFrom,
  dateTo,
  locationId,
  search,
  orderType,
  orderFrom,
  orderTo,
  areaId,
  facilityId,
  equipmentId,
  equipmentType,
  equipmentCapacity,
  equipmentTag,
  priority,
  status,
  jobNature,
  createdBy,
  reportedBy,
  assignedTo,
} = {}) {
  return reportsFetch(`/${encodeURIComponent(key)}${listQueryParams({
    date_from: dateFrom,
    date_to: dateTo,
    location_id: locationId && locationId !== 'all' ? locationId : undefined,
    facility_id: facilityId && facilityId !== 'all' ? facilityId : undefined,
    search,
    order_type: orderType || undefined,
    order_from: orderFrom || undefined,
    order_to: orderTo || undefined,
    area_id: areaId || undefined,
    equipment_id: equipmentId || undefined,
    equipment_type: equipmentType || undefined,
    equipment_capacity: equipmentCapacity || undefined,
    equipment_tag: equipmentTag || undefined,
    priority: priority || undefined,
    status: status || undefined,
    job_nature: jobNature || undefined,
    created_by: createdBy || undefined,
    reported_by: reportedBy || undefined,
    assigned_to: assignedTo || undefined,
  })}`)
}

export function downloadReportPdf(key, body) {
  return reportsFetch(`/${encodeURIComponent(key)}/pdf`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function downloadReportCsv(key, body) {
  return reportsFetch(`/${encodeURIComponent(key)}/csv`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function sendReportNow(key, body) {
  return reportsFetch(`/${encodeURIComponent(key)}/send`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function listCustomReports(key) {
  return reportsFetch(`/${encodeURIComponent(key)}/custom`)
}

export function createCustomReport(key, body) {
  return reportsFetch(`/${encodeURIComponent(key)}/custom`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function updateCustomReport(id, body) {
  return reportsFetch(`/custom/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export function deleteCustomReport(id) {
  return reportsFetch(`/custom/${encodeURIComponent(id)}`, {
    method: 'DELETE',
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

export function sendReportScheduleNow(id) {
  return reportsFetch(`/schedules/${encodeURIComponent(id)}/send`, {
    method: 'POST',
  })
}
