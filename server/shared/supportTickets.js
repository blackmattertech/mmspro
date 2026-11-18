/**
 * Support ticket rules shared by the API and the company/admin UI.
 * SLA clocks use the saved minute targets as continuous time.
 * Waiting for Customer pauses both clocks when that policy is on.
 */

import {
  isRichTextEmpty,
  RICH_TEXT_STORAGE_MAX,
  richTextLength,
} from './richText.js'

export const TICKET_STATUSES = Object.freeze([
  { id: 'open', label: 'Open' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'waiting_customer', label: 'Waiting for Customer' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'closed', label: 'Closed' },
])

export const ACTIVE_TICKET_STATUSES = Object.freeze(['open', 'in_progress', 'waiting_customer'])

export const TICKET_CATEGORIES = Object.freeze([
  'Technical Issue',
  'Bug / Error',
  'User Access & Permissions',
  'Data & Reports Mismatch',
  'Hardware / Meter Failure',
])

export const RELATED_MODULES = Object.freeze([
  'Assets & Machinery',
  'Work Orders',
  'Work Request',
  'PM Schedule',
  'Reports & Analytics',
  'Configuration / Masters',
  'Warranty Manager',
  'Tasks & Follow-ups',
])

export const TICKET_PRIORITIES = Object.freeze([
  {
    id: 'critical',
    label: 'Critical',
    level: 'P1',
    description: 'Production outage, business stoppage, or data loss',
    responseMinutes: 30,
    resolutionMinutes: 240,
    operatingHours: '24x7',
    escalationLabel: '75% of resolution time',
  },
  {
    id: 'high',
    label: 'High',
    level: 'P2',
    description: 'Major module impairment with no workaround',
    responseMinutes: 60,
    resolutionMinutes: 480,
    operatingHours: '24x7',
    escalationLabel: '80% of resolution time',
  },
  {
    id: 'medium',
    label: 'Medium',
    level: 'P3',
    description: 'Minor defect with a workaround available',
    responseMinutes: 240,
    resolutionMinutes: 1440,
    operatingHours: 'Business hours',
    escalationLabel: '90% of resolution time',
  },
  {
    id: 'low',
    label: 'Low',
    level: 'P4',
    description: 'Cosmetic issue, question, or feature request',
    responseMinutes: 480,
    resolutionMinutes: 4320,
    operatingHours: 'Business hours',
    escalationLabel: 'Routine review',
  },
])

const STATUS_IDS = new Set(TICKET_STATUSES.map((row) => row.id))
const TERMINAL_STATUSES = new Set(['resolved', 'closed'])

function fail(message) {
  const error = new Error(message)
  error.status = 400
  throw error
}

export function statusLabel(id) {
  return TICKET_STATUSES.find((row) => row.id === id)?.label || 'Unknown'
}

export function priorityMeta(id) {
  return TICKET_PRIORITIES.find((row) => row.id === id) || null
}

export function priorityLabel(id) {
  return priorityMeta(id)?.label || 'Unknown'
}

export function formatTicketNumber(sequence) {
  const value = Number(sequence)
  if (!Number.isInteger(value) || value < 1 || value > 999999) {
    fail('Ticket sequence must be a positive integer')
  }
  return `MMS-SUP-${String(value).padStart(4, '0')}`
}

export function validateTicketDraft(input = {}) {
  const subject = String(input.subject || '').trim()
  const description = String(input.description || '').trim()
  const category = String(input.category || '').trim()
  const priority = String(input.priority || '').trim()
  const relatedModule = String(input.related_module || '').trim()
  const assetRef = String(input.asset_ref || '').trim()
  const descriptionPlain = richTextLength(description)

  if (subject.length < 3 || subject.length > 160) fail('Subject must be between 3 and 160 characters')
  if (!TICKET_CATEGORIES.includes(category)) fail('Choose a valid category')
  if (!priorityMeta(priority)) fail('Choose a valid priority')
  if (isRichTextEmpty(description) || descriptionPlain < 10 || descriptionPlain > 8000) {
    fail('Description must be between 10 and 8000 characters')
  }
  if (description.length > RICH_TEXT_STORAGE_MAX) fail('Description is too large')
  if (relatedModule && !RELATED_MODULES.includes(relatedModule)) fail('Choose a valid related module')
  if (assetRef.length > 80) fail('Asset reference must be 80 characters or fewer')

  return {
    subject,
    description,
    category,
    priority,
    related_module: relatedModule || null,
    asset_ref: assetRef || null,
  }
}

export const SUPPORT_ATTACHMENT_MAX_FILES = 5
export const SUPPORT_ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024
export const SUPPORT_ATTACHMENT_ACCEPT = '.jpg,.jpeg,.png,.pdf,.xlsx,.docx'
export const SUPPORT_ATTACHMENT_MIME = Object.freeze([
  'image/jpeg',
  'image/png',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

const SUPPORT_ATTACHMENT_NAME_RE = /\.(jpe?g|png|pdf|xlsx|docx)$/i

export function validateMessageBody(body, { allowEmpty = false } = {}) {
  const text = String(body || '').trim()
  if (allowEmpty && (!text || isRichTextEmpty(text))) return ''
  const plain = richTextLength(text)
  if (plain < 1 || plain > 8000) fail('Message must be between 1 and 8000 characters')
  if (text.length > RICH_TEXT_STORAGE_MAX) fail('Message is too large')
  return text
}

export function validateSupportAttachments(attachments = []) {
  if (!Array.isArray(attachments)) fail('Attachments must be a list')
  if (attachments.length > SUPPORT_ATTACHMENT_MAX_FILES) {
    fail(`You can attach up to ${SUPPORT_ATTACHMENT_MAX_FILES} files`)
  }
  return attachments.map((item, index) => {
    const name = String(item?.name || '').trim()
    const path = String(item?.path || '').trim()
    const mime = String(item?.mime_type || item?.type || '').trim().toLowerCase()
    const size = Number(item?.size)
    if (!name) fail(`Attachment ${index + 1} is missing a file name`)
    if (!path) fail(`Attachment ${index + 1} is missing storage path`)
    if (!Number.isFinite(size) || size < 1 || size > SUPPORT_ATTACHMENT_MAX_BYTES) {
      fail(`${name} must be between 1 byte and 25 MB`)
    }
    const mimeOk = SUPPORT_ATTACHMENT_MIME.includes(mime) || SUPPORT_ATTACHMENT_NAME_RE.test(name)
    if (!mimeOk) fail(`${name} must be JPG, PNG, PDF, XLSX, or DOCX`)
    return {
      path,
      name: name.slice(0, 160),
      mime_type: mime || 'application/octet-stream',
      size: Math.round(size),
      bucket: item?.bucket || 'support-ticket-assets',
    }
  })
}

export function validateSupportUploadRequest(files = []) {
  if (!Array.isArray(files) || !files.length) fail('Choose at least one file to upload')
  if (files.length > SUPPORT_ATTACHMENT_MAX_FILES) {
    fail(`You can attach up to ${SUPPORT_ATTACHMENT_MAX_FILES} files`)
  }
  return files.map((item, index) => {
    const name = String(item?.name || '').trim()
    const mime = String(item?.mime_type || item?.type || '').trim().toLowerCase()
    const size = Number(item?.size)
    if (!name) fail(`File ${index + 1} is missing a name`)
    if (!Number.isFinite(size) || size < 1 || size > SUPPORT_ATTACHMENT_MAX_BYTES) {
      fail(`${name || 'File'} must be 25 MB or smaller`)
    }
    const mimeOk = SUPPORT_ATTACHMENT_MIME.includes(mime) || SUPPORT_ATTACHMENT_NAME_RE.test(name)
    if (!mimeOk) fail(`${name} must be JPG, PNG, PDF, XLSX, or DOCX`)
    return { name: name.slice(0, 160), mime_type: mime || 'application/octet-stream', size: Math.round(size) }
  })
}

export function validateRating(value) {
  const rating = Number(value)
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) fail('Rating must be a whole number from 1 to 5')
  return rating
}

export function validateAssigneeName(value) {
  const name = String(value || '').trim()
  if (!name) return null
  if (name.length > 80) fail('Assignee name must be 80 characters or fewer')
  return name
}

export function addMinutes(start, minutes) {
  const base = start instanceof Date ? start : new Date(start)
  const span = Number(minutes)
  if (Number.isNaN(base.getTime())) fail('Invalid start time')
  if (!Number.isInteger(span) || span < 1 || span > 43200) fail('Invalid SLA minutes')
  return new Date(base.getTime() + span * 60 * 1000)
}

export function formatDuration(ms) {
  const totalMinutes = Math.max(0, Math.round(Math.abs(Number(ms) || 0) / 60000))
  const days = Math.floor(totalMinutes / (60 * 24))
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
  const minutes = totalMinutes % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function clockSnapshot(dueAt, pausedAt, now, terminalLabel) {
  if (terminalLabel) return { state: 'done', label: terminalLabel, remainingMs: 0, paused: false }
  const due = new Date(dueAt)
  if (Number.isNaN(due.getTime())) return { state: 'unknown', label: 'No SLA', remainingMs: null, paused: false }
  const anchor = pausedAt ? new Date(pausedAt) : now
  const remainingMs = due.getTime() - anchor.getTime()
  const paused = Boolean(pausedAt)
  const suffix = paused ? ' paused' : ' left'
  if (remainingMs < 0) {
    return { state: 'breached', label: `Breached ${formatDuration(remainingMs)}`, remainingMs, paused }
  }
  if (remainingMs <= 30 * 60 * 1000) {
    return { state: 'risk', label: `${formatDuration(remainingMs)}${suffix}`, remainingMs, paused }
  }
  return { state: 'ok', label: `${formatDuration(remainingMs)}${suffix}`, remainingMs, paused }
}

export function resolutionSnapshot(ticket, now = new Date()) {
  if (ticket?.status === 'closed') return clockSnapshot(null, null, now, 'Closed')
  if (ticket?.status === 'resolved') return clockSnapshot(null, null, now, 'Resolved')
  return clockSnapshot(ticket?.sla_due_at, ticket?.sla_paused_at, now)
}

export function responseSnapshot(ticket, now = new Date()) {
  if (ticket?.first_response_at) {
    const taken = new Date(ticket.first_response_at).getTime() - new Date(ticket.created_at).getTime()
    return { state: 'met', label: `Met in ${formatDuration(taken)}`, remainingMs: 0, paused: false }
  }
  if (ticket?.status === 'closed' || ticket?.status === 'resolved') {
    return { state: 'missed', label: 'No first response', remainingMs: 0, paused: false }
  }
  return clockSnapshot(ticket?.first_response_due_at, ticket?.sla_paused_at, now)
}

function shiftIso(iso, pausedMs) {
  if (!iso) return iso
  return new Date(new Date(iso).getTime() + Math.max(0, pausedMs)).toISOString()
}

export function applyStatusChange(ticket, nextStatus, { now = new Date(), pauseOnWaiting = true } = {}) {
  if (!STATUS_IDS.has(nextStatus)) fail('Unknown ticket status')
  if (ticket.status === nextStatus) return {}

  const patch = { status: nextStatus, updated_at: now.toISOString() }
  const enteringWait = nextStatus === 'waiting_customer'
  const leavingWait = ticket.status === 'waiting_customer' && !enteringWait

  if (pauseOnWaiting && enteringWait && !ticket.sla_paused_at) {
    patch.sla_paused_at = now.toISOString()
  }

  if (pauseOnWaiting && leavingWait && ticket.sla_paused_at) {
    const pausedMs = now.getTime() - new Date(ticket.sla_paused_at).getTime()
    patch.sla_paused_at = null
    patch.sla_due_at = shiftIso(ticket.sla_due_at, pausedMs)
    if (!ticket.first_response_at) {
      patch.first_response_due_at = shiftIso(ticket.first_response_due_at, pausedMs)
    }
  }

  if (!pauseOnWaiting && enteringWait) patch.sla_paused_at = null

  if (nextStatus === 'resolved') {
    patch.resolved_at = now.toISOString()
    patch.sla_paused_at = null
  } else if (nextStatus === 'closed') {
    patch.closed_at = now.toISOString()
    patch.resolved_at = ticket.resolved_at || now.toISOString()
    patch.sla_paused_at = null
  } else if (!TERMINAL_STATUSES.has(nextStatus)) {
    patch.closed_at = null
    patch.resolved_at = null
  }

  return patch
}

export function customerReplyStatus(ticket, { now = new Date(), pauseOnWaiting = true } = {}) {
  if (ticket.status !== 'waiting_customer') return {}
  return applyStatusChange(ticket, 'in_progress', { now, pauseOnWaiting })
}

export function supportReplyStatus(ticket, now = new Date()) {
  const patch = {}
  if (!ticket.first_response_at) patch.first_response_at = now.toISOString()
  if (ticket.status === 'open') patch.status = 'in_progress'
  return patch
}

export function validateSlaPolicyInput(input = {}) {
  const priority = String(input.priority || '')
  if (!priorityMeta(priority)) fail('Unknown SLA priority')
  const first = Number(input.first_response_minutes)
  const resolution = Number(input.resolution_minutes)
  if (!Number.isInteger(first) || first < 5 || first > 10080) {
    fail('First response must be between 5 and 10080 minutes')
  }
  if (!Number.isInteger(resolution) || resolution < first || resolution > 43200) {
    fail('Resolution target must be at least the first-response target and at most 43200 minutes')
  }
  return {
    priority,
    first_response_minutes: first,
    resolution_minutes: resolution,
    is_active: input.is_active !== false,
  }
}

export function validateSlaSettings(input = {}) {
  const hours = Number(input.auto_close_hours)
  const label = String(input.business_hours_label || '').trim()
  if (!Number.isInteger(hours) || hours < 1 || hours > 720) {
    fail('Auto-close must be between 1 and 720 hours')
  }
  if (label.length < 3 || label.length > 120) fail('Business hours label must be between 3 and 120 characters')
  return {
    pause_on_waiting: Boolean(input.pause_on_waiting),
    auto_close_hours: hours,
    business_hours_label: label,
  }
}

export function defaultSlaPolicies() {
  return TICKET_PRIORITIES.map((row) => ({
    priority: row.id,
    label: row.label,
    level_label: row.level,
    description: row.description,
    first_response_minutes: row.responseMinutes,
    resolution_minutes: row.resolutionMinutes,
    operating_hours: row.operatingHours,
    escalation_label: row.escalationLabel,
    is_active: true,
  }))
}

export function defaultSlaSettings() {
  return {
    pause_on_waiting: true,
    auto_close_hours: 48,
    business_hours_label: 'Mon – Fri (08:00 AM – 08:00 PM IST)',
  }
}

export function isClosedStatus(status) {
  return status === 'closed'
}
