import { apiFetch, apiFetchBlob } from './api'

function query(params = {}) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
  })
  const text = search.toString()
  return text ? `?${text}` : ''
}

export function formatTicketWhen(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function listCompanyTickets(params) {
  return apiFetch(`/api/company/support/tickets${query(params)}`)
}

export function companyTicketSummary() {
  return apiFetch('/api/company/support/summary')
}

export function createCompanyTicket(body) {
  return apiFetch('/api/company/support/tickets', { method: 'POST', body: JSON.stringify(body) })
}

export function getCompanyTicket(id) {
  return apiFetch(`/api/company/support/tickets/${id}`)
}

export function createCompanyAttachmentUploads(id, files) {
  return apiFetch(`/api/company/support/tickets/${id}/attachment-uploads`, {
    method: 'POST',
    body: JSON.stringify({ files }),
  })
}

export function replyCompanyTicket(id, body, attachments = []) {
  return apiFetch(`/api/company/support/tickets/${id}/messages`, {
    method: 'POST',
    body: JSON.stringify({ body, attachments }),
  })
}

export function confirmCompanyTicket(id, rating) {
  return apiFetch(`/api/company/support/tickets/${id}/confirm`, {
    method: 'POST',
    body: JSON.stringify({ rating }),
  })
}

export function closeCompanyTicket(id) {
  return apiFetch(`/api/company/support/tickets/${id}/close`, { method: 'POST', body: JSON.stringify({}) })
}

export function exportCompanyTickets(params) {
  return apiFetchBlob(`/api/company/support/tickets${query({ ...params, export: 'csv' })}`)
}

export function listAdminTickets(params) {
  return apiFetch(`/admin-api/support/tickets${query(params)}`)
}

export function adminTicketSummary() {
  return apiFetch('/admin-api/support/summary')
}

export function getAdminTicket(id) {
  return apiFetch(`/admin-api/support/tickets/${id}`)
}

export function updateAdminTicket(id, body) {
  return apiFetch(`/admin-api/support/tickets/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
}

export function createAdminAttachmentUploads(id, files) {
  return apiFetch(`/admin-api/support/tickets/${id}/attachment-uploads`, {
    method: 'POST',
    body: JSON.stringify({ files }),
  })
}

export function replyAdminTicket(id, body, visibility, attachments = []) {
  return apiFetch(`/admin-api/support/tickets/${id}/messages`, {
    method: 'POST',
    body: JSON.stringify({ body, visibility, attachments }),
  })
}

export function exportAdminTickets(params) {
  return apiFetchBlob(`/admin-api/support/tickets${query({ ...params, export: 'csv' })}`)
}

export function getSupportSla() {
  return apiFetch('/admin-api/support/sla')
}

export function saveSupportSla(body) {
  return apiFetch('/admin-api/support/sla', { method: 'PUT', body: JSON.stringify(body) })
}
