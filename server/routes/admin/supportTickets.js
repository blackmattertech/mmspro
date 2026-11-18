import { Router } from 'express'
import { supabaseAdmin } from '../../services/supabase.js'
import { sendCsv } from '../../lib/listQuery.js'
import { plainTextFromRich } from '../../lib/richText.js'
import { TICKET_STATUSES } from '../../../shared/supportTickets.js'
import {
  addMessage,
  changeTicket,
  createAttachmentUploads,
  getSlaConfig,
  getTicket,
  listTickets,
  saveSlaConfig,
  ticketSummary,
} from '../../lib/supportTicketService.js'

const router = Router()

async function actorProfile(req) {
  if (req.userProfile?.email) return req.userProfile
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('id, org_id, role, email')
    .eq('id', req.user.id)
    .maybeSingle()
  return data || { id: req.user.id, email: req.user.email || 'MMS Support' }
}

function fail(res, error) {
  const status = error?.status || 500
  return res.status(status).json({ error: error?.message || 'Support ticket request failed' })
}

function page(query) {
  const limit = Math.max(1, Math.min(100, Number(query.limit) || 25))
  const offset = Math.max(0, Number(query.offset) || 0)
  return { limit, offset }
}

router.get('/summary', async (req, res) => {
  try {
    res.json(await ticketSummary(null))
  } catch (error) {
    fail(res, error)
  }
})

router.get('/sla', async (_req, res) => {
  try {
    res.json(await getSlaConfig())
  } catch (error) {
    fail(res, error)
  }
})

router.put('/sla', async (req, res) => {
  try {
    res.json(await saveSlaConfig(req.body || {}))
  } catch (error) {
    fail(res, error)
  }
})

router.get('/tickets', async (req, res) => {
  try {
    const { limit, offset } = page(req.query)
    const status = TICKET_STATUSES.some((row) => row.id === req.query.status) ? req.query.status : ''
    if (req.query.export === 'csv') {
      const result = await listTickets({ status, search: req.query.search, limit: 5000, offset: 0 })
      return sendCsv(res, 'support-tickets.csv', result.tickets, [
        { id: 'ticket_number', label: 'Ticket' },
        { label: 'Company', value: (row) => row.organizations?.name || '' },
        { id: 'subject', label: 'Subject' },
        { label: 'Description', value: (row) => plainTextFromRich(row.description) },
        { id: 'category', label: 'Category' },
        { id: 'priority', label: 'Priority' },
        { id: 'status', label: 'Status' },
        { id: 'related_module', label: 'Related module' },
        { id: 'asset_ref', label: 'Impacted asset ID' },
        { id: 'created_by_name', label: 'Requested by' },
        { id: 'assignee_name', label: 'Assigned to' },
        { id: 'sla_due_at', label: 'SLA due' },
        { id: 'created_at', label: 'Created' },
        { id: 'updated_at', label: 'Updated' },
      ])
    }
    const result = await listTickets({ status, search: req.query.search, limit, offset })
    res.json({ ...result, limit, offset })
  } catch (error) {
    fail(res, error)
  }
})

router.get('/tickets/:id', async (req, res) => {
  try {
    res.json(await getTicket(req.params.id, { includeInternal: true }))
  } catch (error) {
    fail(res, error)
  }
})

router.patch('/tickets/:id', async (req, res) => {
  try {
    const { ticket } = await getTicket(req.params.id, { includeInternal: true })
    await changeTicket(ticket, req.body || {}, await actorProfile(req))
    res.json(await getTicket(req.params.id, { includeInternal: true }))
  } catch (error) {
    fail(res, error)
  }
})

router.post('/tickets/:id/attachment-uploads', async (req, res) => {
  try {
    const { ticket } = await getTicket(req.params.id, { includeInternal: true })
    const uploads = await createAttachmentUploads(ticket, req.body?.files || [])
    res.status(201).json({ uploads })
  } catch (error) {
    fail(res, error)
  }
})

router.post('/tickets/:id/messages', async (req, res) => {
  try {
    const { ticket } = await getTicket(req.params.id, { includeInternal: true })
    const visibility = req.body?.visibility === 'internal' ? 'internal' : 'public'
    await addMessage({
      ticket,
      profile: await actorProfile(req),
      body: req.body?.body,
      visibility,
      authorRole: 'support',
      attachments: req.body?.attachments || [],
    })
    res.status(201).json(await getTicket(req.params.id, { includeInternal: true }))
  } catch (error) {
    fail(res, error)
  }
})

export default router
