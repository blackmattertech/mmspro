import { apiFetch } from './api'
import { listQueryParams } from './listResponse'

export function reportsFetch(path, options = {}) {
  return apiFetch(`/api/reports${path}`, options)
}

export function getReportFilters(reportKey) {
  return reportsFetch(`/filters${listQueryParams({
    report_key: reportKey || undefined,
  })}`)
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

export function generateReadyReport(key, body) {
  return reportsFetch(`/${encodeURIComponent(key)}/ready`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function listReadyReports({ reportKey } = {}) {
  return reportsFetch(`/ready${listQueryParams({
    report_key: reportKey || undefined,
  })}`).then((data) => data?.items || [])
}

export function downloadReadyReportFile(id, format = 'pdf') {
  return reportsFetch(`/ready/${encodeURIComponent(id)}/download${listQueryParams({
    format,
  })}`).then(async (file) => {
    const { downloadBase64File } = await import('./fileDownload.js')
    downloadBase64File(file)
    return file
  })
}

export function deleteReadyReport(id) {
  return reportsFetch(`/ready/${encodeURIComponent(id)}`, {
    method: 'DELETE',
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

export function listAllCustomReports() {
  return reportsFetch('/customs')
}

export function getCustomReport(id) {
  return reportsFetch(`/custom/${encodeURIComponent(id)}`)
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

export function listAllReportSchedules() {
  return reportsFetch('/schedules')
}

export function listReportSchedules(key) {
  return reportsFetch(`/${encodeURIComponent(key)}/schedules`)
}

export function previewReportEmail(key, body) {
  return reportsFetch(`/${encodeURIComponent(key)}/email-preview`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
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
