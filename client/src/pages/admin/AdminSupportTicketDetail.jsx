import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
} from '../../../../shared/supportTickets.js'
import FormLabel from '../../components/shared/FormLabel'
import PageBack from '../../components/shared/PageBack'
import { PriorityPill, StatusPill } from '../../components/support/TicketPills'
import { SupportMessageBubble, SupportReplyComposer } from '../../components/support/SupportConversation'
import {
  SupportActivityCard,
  SupportConversationShell,
  SupportMetaBar,
  SupportSlaCard,
  buildSupportThread,
} from '../../components/support/SupportDetailChrome'
import {
  formatTicketWhen,
  getAdminTicket,
  replyAdminTicket,
  updateAdminTicket,
} from '../../lib/supportApi'
import '../../components/company/CompanyShared.css'
import '../../components/shared/DetailView.css'
import '../../components/support/Support.css'
import './AdminPage.css'

export default function AdminSupportTicketDetail() {
  const { ticketId } = useParams()
  const navigate = useNavigate()
  const [detail, setDetail] = useState(null)
  const [form, setForm] = useState(null)
  const [tab, setTab] = useState('conversation')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const next = await getAdminTicket(ticketId)
      setDetail(next)
      setForm({
        status: next.ticket.status,
        priority: next.ticket.priority,
        category: next.ticket.category,
        assignee_name: next.ticket.assignee_name || '',
      })
    } catch (err) {
      setError(err.message || 'Could not load this ticket')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [ticketId])

  const ticket = detail?.ticket
  const messages = detail?.messages || []

  const publicThread = useMemo(
    () => buildSupportThread(ticket, messages, { publicOnly: true }),
    [messages, ticket],
  )

  const internalThread = useMemo(
    () => messages
      .filter((message) => message.visibility === 'internal')
      .map((message) => ({
        ...message,
        created_at_label: formatTicketWhen(message.created_at),
      })),
    [messages],
  )

  const save = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      setDetail(await updateAdminTicket(ticket.id, form))
    } catch (err) {
      setError(err.message || 'Could not update the ticket')
    } finally {
      setSaving(false)
    }
  }

  const send = async (visibility, { body, attachments }) => {
    setSaving(true)
    setError('')
    try {
      setDetail(await replyAdminTicket(ticket.id, body, visibility, attachments))
    } catch (err) {
      setError(err.message || 'Could not post the message')
      throw err
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="admin-page"><div className="admin-page__content"><div className="admin-loading">Loading ticket…</div></div></div>
  }

  if (!ticket || !form) {
    return (
      <div className="admin-page">
        <div className="admin-page__content">
          {error ? <div className="admin-alert">{error}</div> : <p>Ticket not found.</p>}
        </div>
      </div>
    )
  }

  const canReply = ticket.status !== 'closed'

  return (
    <div className="admin-page support-detail-page">
      <header className="admin-page__header">
        <div>
          <PageBack onClick={() => navigate('/admin/support')} label="Support Management" />
          <h1 className="admin-page__title">{ticket.ticket_number}</h1>
          <p className="admin-page__subtitle">{ticket.organizations?.name} · {ticket.subject}</p>
        </div>
        <div className="support-detail-actions">
          <PriorityPill priority={ticket.priority} />
          <StatusPill status={ticket.status} />
        </div>
      </header>

      <div className="admin-page__content">
        {error && <div className="admin-alert">{error}</div>}
        <div className="support-detail-grid">
          <div className="support-detail-main">
            <SupportMetaBar ticket={ticket} />

            <SupportConversationShell
              tabs={(
                <div className="support-tabs" role="tablist">
                  <button
                    type="button"
                    className={`support-tabs__btn${tab === 'conversation' ? ' is-active' : ''}`}
                    role="tab"
                    aria-selected={tab === 'conversation'}
                    onClick={() => setTab('conversation')}
                  >
                    Conversation
                  </button>
                  <button
                    type="button"
                    className={`support-tabs__btn${tab === 'internal' ? ' is-active' : ''}`}
                    role="tab"
                    aria-selected={tab === 'internal'}
                    onClick={() => setTab('internal')}
                  >
                    Internal Notes
                  </button>
                </div>
              )}
              composer={canReply ? (
                tab === 'conversation' ? (
                  <SupportReplyComposer
                    ticketId={ticket.id}
                    admin
                    saving={saving}
                    placeholder="Type your reply to the customer..."
                    submitLabel="Send Reply"
                    onSend={(payload) => send('public', payload)}
                  />
                ) : (
                  <SupportReplyComposer
                    ticketId={ticket.id}
                    admin
                    saving={saving}
                    placeholder="Add an internal note..."
                    submitLabel="Post Note"
                    onSend={(payload) => send('internal', payload)}
                  />
                )
              ) : null}
            >
              {tab === 'conversation' ? (
                publicThread.map((message) => (
                  <SupportMessageBubble key={message.id} message={message} />
                ))
              ) : (
                <>
                  {internalThread.length === 0 && (
                    <p className="company-page__subtitle">No internal notes yet. Notes here stay hidden from the company portal.</p>
                  )}
                  {internalThread.map((message) => (
                    <SupportMessageBubble key={message.id} message={message} />
                  ))}
                </>
              )}
            </SupportConversationShell>
          </div>

          <aside className="support-side-card">
            <SupportSlaCard ticket={ticket} />

            <div className="support-side-block">
              <h3>Routing</h3>
              <form onSubmit={save}>
                <label className="company-form__field">
                  <FormLabel>Status</FormLabel>
                  <select className="company-form__input" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                    {TICKET_STATUSES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </select>
                </label>
                <label className="company-form__field">
                  <FormLabel>Priority</FormLabel>
                  <select className="company-form__input" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>
                    {TICKET_PRIORITIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </select>
                </label>
                <label className="company-form__field">
                  <FormLabel>Category</FormLabel>
                  <select className="company-form__input" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
                    {TICKET_CATEGORIES.map((item) => <option key={item}>{item}</option>)}
                  </select>
                </label>
                <label className="company-form__field">
                  <FormLabel>Assigned specialist</FormLabel>
                  <input className="company-form__input" value={form.assignee_name} maxLength={80} onChange={(event) => setForm({ ...form, assignee_name: event.target.value })} />
                </label>
                <dl className="support-meta-list" style={{ marginBottom: 12 }}>
                  <div>
                    <span>Asset</span>
                    <strong>{ticket.asset_ref || '—'}</strong>
                  </div>
                </dl>
                <button className="company-btn company-btn--primary" type="submit" disabled={saving}>
                  {saving ? 'Updating…' : 'Update Ticket'}
                </button>
              </form>
            </div>

            <SupportActivityCard events={detail.events || []} slaLink />
          </aside>
        </div>
      </div>
    </div>
  )
}
