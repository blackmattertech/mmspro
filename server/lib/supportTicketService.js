import { randomUUID } from 'node:crypto'
import { supabaseAdmin } from '../services/supabase.js'
import { applyIlikeSearch } from './listQuery.js'
import { getSignedUrls } from './signedUrlCache.js'
import {
  addMinutes,
  applyStatusChange,
  customerReplyStatus,
  defaultSlaPolicies,
  defaultSlaSettings,
  priorityMeta,
  supportReplyStatus,
  validateAssigneeName,
  validateMessageBody,
  validateRating,
  validateSlaPolicyInput,
  validateSlaSettings,
  validateSupportAttachments,
  validateSupportUploadRequest,
  validateTicketDraft,
} from '../shared/supportTickets.js'
import { enforceNestedCloneOrThrow, loadNestedCloneSource } from './nestedClone.js'

export const SUPPORT_ASSETS_BUCKET = 'support-ticket-assets'

const TICKET_COLUMNS = `
  id, ticket_number, org_id, subject, description, category, priority, status,
  related_module, asset_ref, created_by, created_by_name, assignee_name,
  first_response_at, resolved_at, closed_at, sla_due_at, first_response_due_at,
  sla_paused_at, rating, created_at, updated_at,
  organizations(name, slug)
`

function httpError(message, status = 400) {
  const error = new Error(message)
  error.status = status
  return error
}

export function isMissingSupportSchema(error) {
  const code = error?.code || ''
  const message = error?.message || ''
  if (code === '42P01' || code === 'PGRST205' || code === '42883') return true
  return /support_ticket|support_sla|next_support_ticket_number/i.test(message)
    && /does not exist|schema cache|Could not find/i.test(message)
}

function schemaError() {
  return httpError('Support tickets are not set up yet. Apply supabase-patches/128-support-tickets.sql.', 500)
}

function raise(error) {
  if (isMissingSupportSchema(error)) throw schemaError()
  if (error?.status) throw error
  throw httpError(error?.message || 'Support ticket request failed', 500)
}

async function actorName(profile) {
  if (profile?.org_id && profile?.id) {
    const { data, error } = await supabaseAdmin
      .from('org_employees')
      .select('name')
      .eq('org_id', profile.org_id)
      .eq('profile_id', profile.id)
      .maybeSingle()
    if (!error && data?.name) return data.name
  }
  return profile?.email || 'MMS Support'
}

async function loadPolicies() {
  const { data, error } = await supabaseAdmin
    .from('support_sla_policies')
    .select('priority, label, level_label, description, first_response_minutes, resolution_minutes, operating_hours, escalation_label, is_active')
    .order('first_response_minutes')
  if (error) raise(error)
  if (data?.length) return data
  return defaultSlaPolicies()
}

async function loadSettings() {
  const { data, error } = await supabaseAdmin
    .from('support_sla_settings')
    .select('pause_on_waiting, auto_close_hours, business_hours_label, updated_at')
    .eq('id', true)
    .maybeSingle()
  if (error) raise(error)
  return data || defaultSlaSettings()
}

function policyFor(policies, priority) {
  const active = policies.find((row) => row.priority === priority && row.is_active !== false)
  if (active) return active
  const fallback = priorityMeta(priority)
  if (!fallback) return null
  return {
    first_response_minutes: fallback.responseMinutes,
    resolution_minutes: fallback.resolutionMinutes,
  }
}

export async function closeStaleResolvedTickets(orgId) {
  try {
    const settings = await loadSettings()
    const cutoff = new Date(Date.now() - settings.auto_close_hours * 60 * 60 * 1000).toISOString()
    const now = new Date().toISOString()
    let query = supabaseAdmin
      .from('support_tickets')
      .update({ status: 'closed', closed_at: now, updated_at: now, sla_paused_at: null })
      .eq('status', 'resolved')
      .lt('resolved_at', cutoff)
    if (orgId) query = query.eq('org_id', orgId)
    const { error } = await query
    if (error && !isMissingSupportSchema(error)) raise(error)
  } catch (error) {
    if (error?.status === 500 && isMissingSupportSchema(error)) return
    if (isMissingSupportSchema(error)) return
    throw error
  }
}

export async function listTickets({ orgId = null, status = '', search = '', limit = 25, offset = 0 } = {}) {
  await closeStaleResolvedTickets(orgId)
  let query = supabaseAdmin
    .from('support_tickets')
    .select(TICKET_COLUMNS, { count: 'exact' })
  if (orgId) query = query.eq('org_id', orgId)
  if (status && status !== 'all') query = query.eq('status', status)
  query = applyIlikeSearch(query, search, ['ticket_number', 'subject', 'category', 'created_by_name'])
  query = query.order('updated_at', { ascending: false }).range(offset, offset + limit - 1)
  const { data, error, count } = await query
  if (error) raise(error)
  return { tickets: data || [], total: count || 0 }
}

export async function ticketSummary(orgId = null) {
  const { data, error } = await supabaseAdmin.rpc('support_ticket_summary', { p_org_id: orgId })
  if (error) raise(error)
  const summary = data || {}

  let averageQuery = supabaseAdmin
    .from('support_tickets')
    .select('created_at, resolved_at')
    .not('resolved_at', 'is', null)
    .order('resolved_at', { ascending: false })
    .limit(200)
  if (orgId) averageQuery = averageQuery.eq('org_id', orgId)
  const averageResult = await averageQuery
  if (averageResult.error) raise(averageResult.error)
  const samples = averageResult.data || []
  const totalMs = samples.reduce((sum, row) => {
    return sum + (new Date(row.resolved_at).getTime() - new Date(row.created_at).getTime())
  }, 0)
  summary.avg_resolution_minutes = samples.length ? Math.round(totalMs / samples.length / 60000) : null
  summary.avg_resolution_sample = samples.length

  if (!orgId) {
    const volume = await supabaseAdmin.rpc('support_ticket_org_volume', { p_limit: 5 })
    if (volume.error) raise(volume.error)
    summary.top_orgs = volume.data || []
  }
  return summary
}

async function insertEvent(ticket, actor, message) {
  const { error } = await supabaseAdmin.from('support_ticket_events').insert({
    ticket_id: ticket.id,
    org_id: ticket.org_id,
    actor_name: actor,
    message: message.slice(0, 300),
  })
  if (error) raise(error)
}

function sanitizeFileName(name) {
  return String(name || 'file')
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, '_')
    .slice(0, 120) || 'file'
}

async function withSignedAttachments(messages = []) {
  const paths = []
  for (const message of messages) {
    for (const file of message.attachments || []) {
      if (file?.path) paths.push(file.path)
    }
  }
  const signed = await getSignedUrls(SUPPORT_ASSETS_BUCKET, paths)
  return messages.map((message) => ({
    ...message,
    attachments: (message.attachments || []).map((file) => ({
      ...file,
      signed_url: file.path ? (signed.get(file.path) || null) : null,
    })),
  }))
}

export async function createAttachmentUploads(ticket, filesInput = []) {
  if (ticket.status === 'closed') throw httpError('Closed tickets cannot receive new attachments', 409)
  const files = validateSupportUploadRequest(filesInput)
  const uploads = []
  for (const file of files) {
    const path = `${ticket.org_id}/support/${ticket.id}/${randomUUID()}-${sanitizeFileName(file.name)}`
    const { data, error } = await supabaseAdmin.storage
      .from(SUPPORT_ASSETS_BUCKET)
      .createSignedUploadUrl(path)
    if (error || !data?.signedUrl) {
      raise(error || httpError('Could not prepare the upload', 500))
    }
    uploads.push({
      path,
      name: file.name,
      mime_type: file.mime_type,
      size: file.size,
      bucket: SUPPORT_ASSETS_BUCKET,
      signedUrl: data.signedUrl,
      token: data.token || null,
    })
  }
  return uploads
}

export async function getTicket(id, { orgId = null, includeInternal = false } = {}) {
  let query = supabaseAdmin.from('support_tickets').select(TICKET_COLUMNS).eq('id', id)
  if (orgId) query = query.eq('org_id', orgId)
  const { data: ticket, error } = await query.maybeSingle()
  if (error) raise(error)
  if (!ticket) throw httpError('Ticket not found', 404)

  let messagesQuery = supabaseAdmin
    .from('support_ticket_messages')
    .select('id, visibility, author_name, author_role, body, attachments, created_at')
    .eq('ticket_id', ticket.id)
    .order('created_at', { ascending: true })
    .limit(500)
  if (!includeInternal) messagesQuery = messagesQuery.eq('visibility', 'public')

  const [messages, events] = await Promise.all([
    messagesQuery,
    supabaseAdmin
      .from('support_ticket_events')
      .select('id, actor_name, message, created_at')
      .eq('ticket_id', ticket.id)
      .order('created_at', { ascending: false })
      .limit(50),
  ])
  if (messages.error) raise(messages.error)
  if (events.error) raise(events.error)
  return {
    ticket,
    messages: await withSignedAttachments(messages.data || []),
    events: events.data || [],
  }
}

export async function createTicket({ orgId, profile, input }) {
  const draft = validateTicketDraft(input)
  await enforceNestedCloneOrThrow({
    // Compare the validated draft (what would be stored), never client-sent identity fields.
    body: { ...draft, clone_of_id: input?.clone_of_id || input?.cloneOfId || null },
    kind: 'support_ticket',
    loadSource: (id) => loadNestedCloneSource({
      table: 'support_tickets',
      orgId,
      id,
      select: 'id, subject, description, category, priority, related_module, asset_ref',
    }),
  })
  const policies = await loadPolicies()
  const policy = policyFor(policies, draft.priority) || priorityMeta(draft.priority)
  const responseMinutes = policy.first_response_minutes || policy.responseMinutes
  const resolutionMinutes = policy.resolution_minutes || policy.resolutionMinutes
  const now = new Date()
  const name = await actorName(profile)

  const numberResult = await supabaseAdmin.rpc('next_support_ticket_number')
  if (numberResult.error) raise(numberResult.error)

  const row = {
    ticket_number: numberResult.data,
    org_id: orgId,
    ...draft,
    status: 'open',
    created_by: profile.id,
    created_by_name: name,
    sla_due_at: addMinutes(now, resolutionMinutes).toISOString(),
    first_response_due_at: addMinutes(now, responseMinutes).toISOString(),
  }
  const { data, error } = await supabaseAdmin
    .from('support_tickets')
    .insert(row)
    .select(TICKET_COLUMNS)
    .single()
  if (error) raise(error)
  await insertEvent(data, name, 'Ticket created')
  return data
}

async function writeTicketPatch(ticket, patch, actor, eventMessage) {
  if (!Object.keys(patch).length) return ticket
  const { data, error } = await supabaseAdmin
    .from('support_tickets')
    .update(patch)
    .eq('id', ticket.id)
    .select(TICKET_COLUMNS)
    .single()
  if (error) raise(error)
  if (eventMessage) await insertEvent(data, actor, eventMessage)
  return data
}

export async function addMessage({
  ticket,
  profile,
  body,
  visibility = 'public',
  authorRole,
  attachments = [],
  skipStatusSideEffects = false,
}) {
  if (ticket.status === 'closed') throw httpError('Closed tickets cannot receive new messages', 409)
  if (authorRole === 'customer' && visibility !== 'public') {
    throw httpError('Customer replies are visible on the ticket', 403)
  }
  const files = validateSupportAttachments(attachments)
  const text = validateMessageBody(body, { allowEmpty: files.length > 0 })
  if (!text && !files.length) failMessageRequired()
  const name = await actorName(profile)
  const settings = await loadSettings()
  const now = new Date().toISOString()

  const { error } = await supabaseAdmin.from('support_ticket_messages').insert({
    ticket_id: ticket.id,
    org_id: ticket.org_id,
    visibility: visibility === 'internal' ? 'internal' : 'public',
    author_profile_id: profile?.id || null,
    author_name: name,
    author_role: authorRole,
    body: text,
    attachments: files,
    created_at: now,
  })
  if (error) raise(error)

  if (skipStatusSideEffects) {
    if (files.length) await insertEvent(ticket, name, `Attachment added (${files.length})`)
    return ticket
  }

  const at = new Date(now)
  let patch = { updated_at: now }
  let eventMessage = visibility === 'internal' ? 'Internal note added' : 'Reply posted'
  if (files.length) eventMessage = `${eventMessage} with ${files.length} attachment${files.length === 1 ? '' : 's'}`
  if (authorRole === 'support' && visibility !== 'internal') {
    patch = { ...patch, ...supportReplyStatus(ticket, at) }
    if (ticket.status === 'waiting_customer') {
      patch = {
        ...patch,
        ...applyStatusChange(ticket, 'in_progress', { now: at, pauseOnWaiting: settings.pause_on_waiting }),
        first_response_at: patch.first_response_at,
      }
    }
    if (patch.first_response_at && !ticket.first_response_at) eventMessage = 'First response sent'
  }
  if (authorRole === 'customer') {
    patch = {
      ...patch,
      ...customerReplyStatus(ticket, { now: at, pauseOnWaiting: settings.pause_on_waiting }),
    }
    if (patch.status === 'in_progress') eventMessage = 'Customer replied'
  }
  return writeTicketPatch(ticket, patch, name, eventMessage)
}

function failMessageRequired() {
  throw httpError('Add a reply or attach at least one file', 400)
}

export async function changeTicket(ticket, input, profile) {
  const settings = await loadSettings()
  const name = await actorName(profile)
  const patch = { updated_at: new Date().toISOString() }
  const events = []

  if (input.status && input.status !== ticket.status) {
    Object.assign(patch, applyStatusChange(ticket, input.status, {
      pauseOnWaiting: settings.pause_on_waiting,
    }))
    events.push(`Status changed to ${input.status.replaceAll('_', ' ')}`)
  }
  if (Object.prototype.hasOwnProperty.call(input, 'assignee_name')) {
    const assignee = validateAssigneeName(input.assignee_name)
    if (assignee !== (ticket.assignee_name || null)) {
      patch.assignee_name = assignee
      events.push(assignee ? `Assigned to ${assignee}` : 'Assignee cleared')
    }
  }
  if (input.priority && input.priority !== ticket.priority) {
    if (!priorityMeta(input.priority)) throw httpError('Choose a valid priority')
    patch.priority = input.priority
    events.push(`Priority changed to ${input.priority}`)
  }
  if (input.category && input.category !== ticket.category) {
    const draft = validateTicketDraft({
      subject: ticket.subject,
      description: ticket.description,
      category: input.category,
      priority: patch.priority || ticket.priority,
      related_module: ticket.related_module,
      asset_ref: ticket.asset_ref,
    })
    patch.category = draft.category
    events.push(`Category changed to ${draft.category}`)
  }

  if (!events.length) return ticket
  const saved = await writeTicketPatch(ticket, patch, name, null)
  if (events.length) {
    const { error } = await supabaseAdmin.from('support_ticket_events').insert(events.map((message) => ({
      ticket_id: saved.id,
      org_id: saved.org_id,
      actor_name: name,
      message: message.slice(0, 300),
    })))
    if (error) raise(error)
  }
  return saved
}

export async function confirmResolution(ticket, rating, profile) {
  if (ticket.status !== 'resolved') throw httpError('Only a resolved ticket can be confirmed', 409)
  const score = validateRating(rating)
  const name = await actorName(profile)
  const now = new Date()
  return writeTicketPatch(
    ticket,
    { ...applyStatusChange(ticket, 'closed', { now, pauseOnWaiting: true }), rating: score },
    name,
    `Resolution confirmed (${score}/5)`,
  )
}

export async function getSlaConfig() {
  const [policies, settings] = await Promise.all([loadPolicies(), loadSettings()])
  return { policies, settings }
}

export async function saveSlaConfig(input = {}) {
  const policies = (input.policies || []).map(validateSlaPolicyInput)
  if (policies.length !== 4) throw httpError('All four priority policies are required')
  const settings = validateSlaSettings(input.settings || {})
  const now = new Date().toISOString()
  const policyRows = policies.map((row) => {
    const defaults = defaultSlaPolicies().find((item) => item.priority === row.priority)
    return { ...defaults, ...row, updated_at: now }
  })
  const savedPolicies = await supabaseAdmin
    .from('support_sla_policies')
    .upsert(policyRows, { onConflict: 'priority' })
    .select('priority, label, level_label, description, first_response_minutes, resolution_minutes, operating_hours, escalation_label, is_active')
  if (savedPolicies.error) raise(savedPolicies.error)
  const savedSettings = await supabaseAdmin
    .from('support_sla_settings')
    .upsert({ id: true, ...settings, updated_at: now }, { onConflict: 'id' })
    .select('pause_on_waiting, auto_close_hours, business_hours_label, updated_at')
    .single()
  if (savedSettings.error) raise(savedSettings.error)
  return { policies: savedPolicies.data || [], settings: savedSettings.data }
}
