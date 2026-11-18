import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyStatusChange,
  customerReplyStatus,
  formatDuration,
  formatTicketNumber,
  resolutionSnapshot,
  responseSnapshot,
  supportReplyStatus,
  validateMessageBody,
  validateSlaPolicyInput,
  validateSlaSettings,
  validateSupportAttachments,
  validateTicketDraft,
} from '../shared/supportTickets.js'

const NOW = new Date('2026-11-05T10:00:00.000Z')

function ticket(overrides = {}) {
  return {
    status: 'open',
    priority: 'critical',
    created_at: '2026-11-05T08:00:00.000Z',
    sla_due_at: '2026-11-05T12:00:00.000Z',
    first_response_due_at: '2026-11-05T08:30:00.000Z',
    first_response_at: null,
    sla_paused_at: null,
    resolved_at: null,
    closed_at: null,
    ...overrides,
  }
}

test('formatTicketNumber pads the global sequence', () => {
  assert.equal(formatTicketNumber(1), 'MMS-SUP-0001')
  assert.equal(formatTicketNumber(148), 'MMS-SUP-0148')
  assert.throws(() => formatTicketNumber(0), /positive integer/)
})

test('validateTicketDraft keeps the company create-ticket fields', () => {
  const draft = validateTicketDraft({
    subject: 'Unable to generate PO report',
    category: 'Technical Issue',
    priority: 'critical',
    related_module: 'Reports & Analytics',
    asset_ref: 'PO-2026-1102',
    description: 'The purchase order export times out after 90 seconds.',
  })
  assert.equal(draft.priority, 'critical')
  assert.equal(draft.asset_ref, 'PO-2026-1102')
  assert.throws(() => validateTicketDraft({ ...draft, category: 'Other' }), /category/)
})

test('validateTicketDraft counts visible rich-text characters', () => {
  const draft = validateTicketDraft({
    subject: 'Rich text ticket',
    category: 'Technical Issue',
    priority: 'medium',
    description: '<p>The <strong>purchase order</strong> export times out after 90 seconds.</p>',
  })
  assert.match(draft.description, /<strong>/)
  assert.throws(
    () => validateTicketDraft({
      subject: 'Too short',
      category: 'Technical Issue',
      priority: 'low',
      description: '<p>short</p>',
    }),
    /Description must be between 10 and 8000/,
  )
})

test('waiting for the customer pauses the SLA and resuming extends the due time', () => {
  const waiting = applyStatusChange(ticket(), 'waiting_customer', { now: NOW, pauseOnWaiting: true })
  assert.equal(waiting.status, 'waiting_customer')
  assert.equal(waiting.sla_paused_at, NOW.toISOString())

  const resumed = applyStatusChange(
    ticket({ status: 'waiting_customer', sla_paused_at: '2026-11-05T09:00:00.000Z' }),
    'in_progress',
    { now: NOW, pauseOnWaiting: true },
  )
  assert.equal(resumed.sla_due_at, '2026-11-05T13:00:00.000Z')
  assert.equal(resumed.first_response_due_at, '2026-11-05T09:30:00.000Z')
  assert.equal(resumed.sla_paused_at, null)
})

test('resolution snapshot reports remaining, risk, breach, and pause', () => {
  assert.equal(resolutionSnapshot(ticket(), NOW).state, 'ok')
  assert.equal(
    resolutionSnapshot(ticket({ sla_due_at: '2026-11-05T10:20:00.000Z' }), NOW).state,
    'risk',
  )
  assert.equal(
    resolutionSnapshot(ticket({ sla_due_at: '2026-11-05T09:00:00.000Z' }), NOW).state,
    'breached',
  )
  assert.equal(
    resolutionSnapshot(ticket({ sla_paused_at: '2026-11-05T09:30:00.000Z' }), NOW).paused,
    true,
  )
  assert.equal(resolutionSnapshot(ticket({ status: 'resolved' }), NOW).label, 'Resolved')
})

test('first response is met from the customer submit time', () => {
  const met = responseSnapshot(ticket({
    first_response_at: '2026-11-05T08:12:00.000Z',
  }), NOW)
  assert.equal(met.state, 'met')
  assert.equal(met.label, 'Met in 12m')
  assert.equal(formatDuration(90 * 60 * 1000), '1h 30m')
})

test('customer reply while waiting returns the ticket to in progress', () => {
  const patch = customerReplyStatus(ticket({
    status: 'waiting_customer',
    sla_paused_at: '2026-11-05T09:00:00.000Z',
  }), { now: NOW })
  assert.equal(patch.status, 'in_progress')
  assert.equal(patch.sla_paused_at, null)
  assert.equal(patch.sla_due_at, '2026-11-05T13:00:00.000Z')
})

test('first public support reply records first response and leaves open', () => {
  const patch = supportReplyStatus(ticket())
  assert.equal(patch.status, 'in_progress')
  assert.ok(patch.first_response_at)
  const later = supportReplyStatus(ticket({ status: 'in_progress', first_response_at: NOW.toISOString() }))
  assert.deepEqual(later, {})
})

test('SLA policy minutes cannot be shorter than the response target', () => {
  assert.throws(
    () => validateSlaPolicyInput({ priority: 'high', first_response_minutes: 120, resolution_minutes: 60 }),
    /Resolution target/,
  )
  const settings = validateSlaSettings({
    pause_on_waiting: true,
    auto_close_hours: 48,
    business_hours_label: 'Mon – Fri (08:00 AM – 08:00 PM IST)',
  })
  assert.equal(settings.auto_close_hours, 48)
})

test('message body can be empty when attachments are present', () => {
  assert.equal(validateMessageBody('', { allowEmpty: true }), '')
  assert.equal(validateMessageBody('<p></p>', { allowEmpty: true }), '')
  assert.throws(() => validateMessageBody(''), /between 1 and 8000/)
  assert.equal(
    validateMessageBody('<p>Thanks — restarted the service.</p>'),
    '<p>Thanks — restarted the service.</p>',
  )
})

test('support attachments allow up to five JPG PNG PDF XLSX DOCX files', () => {
  const files = validateSupportAttachments([
    {
      path: 'org/support/ticket/a.jpg',
      name: 'compressor_reading.jpg',
      mime_type: 'image/jpeg',
      size: 1024,
    },
  ])
  assert.equal(files[0].bucket, 'support-ticket-assets')
  assert.throws(
    () => validateSupportAttachments([{ path: 'x', name: 'notes.txt', mime_type: 'text/plain', size: 10 }]),
    /JPG, PNG, PDF, XLSX, or DOCX/,
  )
})
