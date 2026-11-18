import { Link } from 'react-router-dom'
import { resolutionSnapshot, responseSnapshot } from '../../../../shared/supportTickets.js'
import { formatTicketWhen } from '../../lib/supportApi'
import './Support.css'

function slaClass(state) {
  return `company-badge company-badge--support company-badge--sla-${state || 'ok'}`
}

/** Opening description bubble + messages; merge first attachment-only reply into opening. */
export function buildSupportThread(ticket, messages = [], { publicOnly = true } = {}) {
  if (!ticket) return []
  const opening = {
    id: `opening-${ticket.id}`,
    author_name: ticket.created_by_name || 'Requester',
    author_role: 'customer',
    body: ticket.description,
    attachments: [],
    created_at: ticket.created_at,
    created_at_label: formatTicketWhen(ticket.created_at),
  }
  const list = (messages || [])
    .filter((message) => (publicOnly ? message.visibility !== 'internal' : true))
    .map((message) => ({
      ...message,
      created_at_label: formatTicketWhen(message.created_at),
    }))

  if (list[0] && !String(list[0].body || '').trim() && (list[0].attachments || []).length) {
    opening.attachments = list[0].attachments
    return [opening, ...list.slice(1)]
  }
  return [opening, ...list]
}

export function SupportMetaBar({ ticket }) {
  if (!ticket) return null
  return (
    <div className="support-meta-bar" role="group" aria-label="Ticket summary">
      <div className="support-meta-bar__cell">
        <span>Requested by</span>
        <strong>{ticket.created_by_name || '—'}</strong>
      </div>
      <div className="support-meta-bar__cell">
        <span>Submitted on</span>
        <strong>{formatTicketWhen(ticket.created_at)}</strong>
      </div>
      <div className="support-meta-bar__cell">
        <span>Category</span>
        <strong>{ticket.category || '—'}</strong>
      </div>
      <div className="support-meta-bar__cell">
        <span>Module</span>
        <strong>{ticket.related_module || '—'}</strong>
      </div>
    </div>
  )
}

export function SupportSlaCard({ ticket }) {
  if (!ticket) return null
  const response = responseSnapshot(ticket)
  const resolution = resolutionSnapshot(ticket)
  return (
    <div className="support-side-block">
      <h3>SLA</h3>
      <div className="support-sla-row">
        <span>First Response</span>
        <span className={slaClass(response.state)}>{response.label}</span>
      </div>
      <div className="support-sla-row">
        <span>Resolution</span>
        <span className={slaClass(resolution.state)}>{resolution.label}</span>
      </div>
    </div>
  )
}

export function SupportDetailsCard({ ticket, children }) {
  return (
    <div className="support-side-block">
      <h3>Ticket Details</h3>
      <dl className="support-meta-list">
        <div>
          <span>Asset</span>
          <strong>{ticket?.asset_ref || '—'}</strong>
        </div>
        <div>
          <span>Assigned To</span>
          <strong>{ticket?.assignee_name || 'Unassigned'}</strong>
        </div>
        {ticket?.rating ? (
          <div>
            <span>Rating</span>
            <strong>{ticket.rating} / 5</strong>
          </div>
        ) : null}
        {children}
      </dl>
    </div>
  )
}

export function SupportActivityCard({ events = [], slaLink = false }) {
  return (
    <div className="support-side-block">
      <h3>Activity</h3>
      <div className="support-activity">
        {events.length === 0 && (
          <p className="company-page__subtitle">No activity yet.</p>
        )}
        {events.map((event) => (
          <div className="support-activity__item" key={event.id}>
            <strong>{event.message}</strong>
            <span>{event.actor_name} · {formatTicketWhen(event.created_at)}</span>
          </div>
        ))}
      </div>
      {slaLink && (
        <p className="support-activity__link">
          <Link to="/admin/support/sla">Open SLA policy</Link>
        </p>
      )}
    </div>
  )
}

export function SupportConversationShell({ tabs, children, composer }) {
  return (
    <section className="support-conversation-card">
      {tabs}
      <div className="support-thread">{children}</div>
      {composer}
    </section>
  )
}
