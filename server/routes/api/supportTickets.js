import { Router } from 'express'
import { assertOrgOwnership } from '../../middleware/orgAccess.js'
import { requireAnyModulePermission, requireModulePermission } from '../../middleware/modulePermission.js'
import { sendCsv } from '../../lib/listQuery.js'
import { plainTextFromRich } from '../../lib/richText.js'
import { TICKET_STATUSES } from '../../../shared/supportTickets.js'
import {
  addMessage,
  changeTicket,
  confirmResolution,
  createAttachmentUploads,
  createTicket,
  getTicket,
  listTickets,
  ticketSummary,
} from '../../lib/supportTicketService.js'

const router = Router()
const canRead = requireModulePermission('support_tickets', 'read')
const canCreate = requireModulePermission('support_tickets', 'create')
const canUpdate = requireModulePermission('support_tickets', 'update')
const canReply = requireAnyModulePermission([
  ['support_tickets', 'update'],
  ['support_tickets', 'create'],
])

function fail(res, error) {
  const status = error?.status || 500
  return res.status(status).json({ error: error?.message || 'Support ticket request failed' })
}

function page(query) {
  const limit = Math.max(1, Math.min(100, Number(query.limit) || 25))
  const offset = Math.max(0, Number(query.offset) || 0)
  return { limit, offset }
}

router.get('/summary', canRead, async (req, res) => {
  try {
    res.json(await ticketSummary(req.userProfile.org_id))
  } catch (error) {
    fail(res, error)
  }
})

router.get('/tickets', canRead, async (req, res) => {
  try {
    const { limit, offset } = page(req.query)
    const status = TICKET_STATUSES.some((row) => row.id === req.query.status) ? req.query.status : ''
    if (req.query.export === 'csv') {
      const result = await listTickets({
        orgId: req.userProfile.org_id,
        status,
        search: req.query.search,
        limit: 5000,
        offset: 0,
      })
      return sendCsv(res, 'support-tickets.csv', result.tickets, [
        { id: 'ticket_number', label: 'Ticket' },
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
    const result = await listTickets({
      orgId: req.userProfile.org_id,
      status,
      search: req.query.search,
      limit,
      offset,
    })
    res.json({ ...result, limit, offset })
  } catch (error) {
    fail(res, error)
  }
})

router.post('/tickets', canCreate, async (req, res) => {
  try {
    const ticket = await createTicket({
      orgId: req.userProfile.org_id,
      profile: req.userProfile,
      input: req.body || {},
    })
    res.status(201).json({ ticket })
  } catch (error) {
    fail(res, error)
  }
})

router.get('/tickets/:id', canRead, assertOrgOwnership('support_tickets'), async (req, res) => {
  try {
    res.json(await getTicket(req.params.id, { orgId: req.userProfile.org_id, includeInternal: false }))
  } catch (error) {
    fail(res, error)
  }
})

router.post('/tickets/:id/attachment-uploads', canReply, assertOrgOwnership('support_tickets'), async (req, res) => {
  try {
    const { ticket } = await getTicket(req.params.id, { orgId: req.userProfile.org_id })
    const uploads = await createAttachmentUploads(ticket, req.body?.files || [])
    res.status(201).json({ uploads })
  } catch (error) {
    fail(res, error)
  }
})

router.post('/tickets/:id/messages', canReply, assertOrgOwnership('support_tickets'), async (req, res) => {
  try {
    const { ticket } = await getTicket(req.params.id, { orgId: req.userProfile.org_id })
    await addMessage({
      ticket,
      profile: req.userProfile,
      body: req.body?.body,
      visibility: 'public',
      authorRole: 'customer',
      attachments: req.body?.attachments || [],
    })
    res.status(201).json(await getTicket(req.params.id, { orgId: req.userProfile.org_id }))
  } catch (error) {
    fail(res, error)
  }
})

router.post('/tickets/:id/confirm', canUpdate, assertOrgOwnership('support_tickets'), async (req, res) => {
  try {
    const { ticket } = await getTicket(req.params.id, { orgId: req.userProfile.org_id })
    await confirmResolution(ticket, req.body?.rating, req.userProfile)
    res.json(await getTicket(req.params.id, { orgId: req.userProfile.org_id }))
  } catch (error) {
    fail(res, error)
  }
})

router.post('/tickets/:id/close', canUpdate, assertOrgOwnership('support_tickets'), async (req, res) => {
  try {
    const { ticket } = await getTicket(req.params.id, { orgId: req.userProfile.org_id })
    await changeTicket(ticket, { status: 'closed' }, req.userProfile)
    res.json(await getTicket(req.params.id, { orgId: req.userProfile.org_id }))
  } catch (error) {
    fail(res, error)
  }
})

export default router
