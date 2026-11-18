import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { orgPath } from '../../config/navigation'
import { useOrg } from '../../hooks/useOrg'
import { usePermissions } from '../../hooks/usePermissions'
import RecordDetailLayout from '../../components/shared/RecordDetailLayout'
import { PriorityPill, StatusPill } from '../../components/support/TicketPills'
import { SupportMessageBubble, SupportReplyComposer } from '../../components/support/SupportConversation'
import {
  SupportActivityCard,
  SupportConversationShell,
  SupportDetailsCard,
  SupportMetaBar,
  SupportSlaCard,
  buildSupportThread,
} from '../../components/support/SupportDetailChrome'
import {
  closeCompanyTicket,
  confirmCompanyTicket,
  getCompanyTicket,
  replyCompanyTicket,
} from '../../lib/supportApi'
import '../../components/company/CompanyShared.css'
import '../../components/shared/DetailView.css'
import '../../components/support/Support.css'

export default function SupportTicketDetail() {
  const { ticketId } = useParams()
  const navigate = useNavigate()
  const { org } = useOrg()
  const { canCreate, canUpdate } = usePermissions()
  const [detail, setDetail] = useState(null)
  const [rating, setRating] = useState(0)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const goBack = useCallback(() => {
    if (org?.slug) navigate(orgPath(org.slug, 'support'))
  }, [navigate, org?.slug])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setDetail(await getCompanyTicket(ticketId))
    } catch (err) {
      setError(err.message || 'Could not load this ticket')
    } finally {
      setLoading(false)
    }
  }, [ticketId])

  useEffect(() => { load() }, [load])

  const ticket = detail?.ticket
  const canReply = (canCreate('support_tickets') || canUpdate('support_tickets')) && ticket && ticket.status !== 'closed'
  const canManage = canUpdate('support_tickets') && ticket && ticket.status !== 'closed'

  const thread = useMemo(
    () => buildSupportThread(ticket, detail?.messages || []),
    [detail?.messages, ticket],
  )

  const send = async ({ body, attachments }) => {
    setSaving(true)
    setError('')
    try {
      setDetail(await replyCompanyTicket(ticket.id, body, attachments))
    } catch (err) {
      setError(err.message || 'Could not send the reply')
      throw err
    } finally {
      setSaving(false)
    }
  }

  const confirm = async () => {
    setSaving(true)
    setError('')
    try {
      setDetail(await confirmCompanyTicket(ticket.id, rating))
    } catch (err) {
      setError(err.message || 'Could not confirm resolution')
    } finally {
      setSaving(false)
    }
  }

  const close = async () => {
    setSaving(true)
    setError('')
    try {
      setDetail(await closeCompanyTicket(ticket.id))
    } catch (err) {
      setError(err.message || 'Could not close the ticket')
    } finally {
      setSaving(false)
    }
  }

  return (
    <RecordDetailLayout
      className="support-detail-page"
      backLabel="Back to Support Center"
      onBack={goBack}
      title={ticket?.ticket_number || 'Ticket details'}
      subtitle={ticket?.subject}
      loading={loading}
      error={error}
      actions={ticket ? (
        <div className="support-detail-actions">
          <PriorityPill priority={ticket.priority} />
          <StatusPill status={ticket.status} />
          {canManage && (
            <button type="button" className="company-btn company-btn--primary" onClick={close} disabled={saving}>
              Close Ticket
            </button>
          )}
        </div>
      ) : null}
    >
      {ticket && (
        <div className="support-detail-grid">
          <div className="support-detail-main">
            <SupportMetaBar ticket={ticket} />

            <SupportConversationShell
              tabs={(
                <div className="support-tabs" role="tablist">
                  <button type="button" className="support-tabs__btn is-active" role="tab" aria-selected="true">
                    Conversation
                  </button>
                </div>
              )}
              composer={canReply ? (
                <SupportReplyComposer
                  ticketId={ticket.id}
                  saving={saving}
                  onSend={send}
                />
              ) : null}
            >
              {thread.map((message) => (
                <SupportMessageBubble key={message.id} message={message} />
              ))}
            </SupportConversationShell>

            {canManage && ticket.status === 'resolved' && (
              <div className="support-side-block support-confirm-card">
                <h3>Confirm resolution</h3>
                <p className="company-page__subtitle">Rate the support response to close this ticket.</p>
                <div className="support-stars" role="group" aria-label="Rating">
                  {[1, 2, 3, 4, 5].map((score) => (
                    <button
                      key={score}
                      type="button"
                      className="company-btn company-btn--secondary company-btn--compact"
                      aria-pressed={rating === score}
                      onClick={() => setRating(score)}
                    >
                      {score}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="company-btn company-btn--primary"
                  disabled={!rating || saving}
                  onClick={confirm}
                >
                  Confirm and close
                </button>
              </div>
            )}
          </div>

          <aside className="support-side-card">
            <SupportSlaCard ticket={ticket} />
            <SupportDetailsCard ticket={ticket} />
            <SupportActivityCard events={detail.events || []} />
          </aside>
        </div>
      )}
    </RecordDetailLayout>
  )
}
