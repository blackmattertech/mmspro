import { apiFetch } from './api'

function qs(params = {}) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value == null || value === '') return
    search.set(key, String(value))
  })
  const raw = search.toString()
  return raw ? `?${raw}` : ''
}

function reportQuery(params = {}) {
  return qs({
    location_id: params.locationId,
    department_id: params.departmentId,
    equipment_id: params.equipmentId,
    date_from: params.dateFrom,
    date_to: params.dateTo,
    evaluation_hours: params.evaluationHours,
    name_field_id: params.nameFieldId,
  })
}

export function getReliabilityReport(params = {}) {
  return apiFetch(`/api/reliability/report${reportQuery(params)}`)
}

export async function exportReliabilityExcel(params = {}) {
  const data = await apiFetch(`/api/reliability/report/excel${reportQuery(params)}`)
  if (!data?.data) {
    throw new Error(data?.error || 'Excel export failed')
  }
  const bytes = Uint8Array.from(atob(data.data), (c) => c.charCodeAt(0))
  return {
    blob: new Blob([bytes], {
      type: data.contentType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    filename: data.filename || 'reliability-calculator.xlsx',
  }
}

export function listManualRunningHours(params = {}) {
  return apiFetch(`/api/reliability/manual-hours${qs({
    location_id: params.locationId,
    equipment_id: params.equipmentId,
    date_from: params.dateFrom,
    date_to: params.dateTo,
    limit: params.limit,
    offset: params.offset,
  })}`)
}

export function createManualRunningHours(body) {
  return apiFetch('/api/reliability/manual-hours', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function updateManualRunningHours(id, body) {
  return apiFetch(`/api/reliability/manual-hours/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export function deleteManualRunningHours(id) {
  return apiFetch(`/api/reliability/manual-hours/${id}`, {
    method: 'DELETE',
  })
}
