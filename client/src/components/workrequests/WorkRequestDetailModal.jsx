import { useEffect, useState } from 'react'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import { useWorkOrderDetail } from '../../hooks/useWorkOrderList'
import {
  approveWorkRequest,
  rejectWorkRequest,
  requestWorkRequestInfo,
  getWorkRequestDepartmentEmployees,
} from '../../lib/api-work-requests'
import PageBack from '../shared/PageBack'
import '../company/CompanyShared.css'
import '../workorders/WorkOrdersPage.css'
import '../workorders/ManualWorkOrder.css'
import './WorkRequests.css'

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function MetaItem({ label, children }) {
  return (
    <div className="wr-detail-meta__item">
      <span className="wo-received-detail__label">{label}</span>
      <div className="wr-detail-meta__value">{children}</div>
    </div>
  )
}

const ACTIONABLE = new Set(['submitted', 'pending_approval', 'need_info'])

export default function WorkRequestDetailModal({
  requestId,
  onClose,
  fetchWorkRequest,
  canApprove,
  onUpdated,
}) {
  const { detail, loading, error, reload } = useWorkOrderDetail(requestId, fetchWorkRequest)
  const handleBackdropClick = useBackdropClose(onClose)
  const [employees, setEmployees] = useState([])
  const [assigneeIds, setAssigneeIds] = useState([])
  const [assignmentRemarks, setAssignmentRemarks] = useState('')
  const [workCenter, setWorkCenter] = useState('')
  const [approvePriority, setApprovePriority] = useState('medium')
  const [plannedStartAt, setPlannedStartAt] = useState('')
  const [plannedEndAt, setPlannedEndAt] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [infoMessage, setInfoMessage] = useState('')
  const [actionError, setActionError] = useState(null)
  const [acting, setActing] = useState(false)
  const [mode, setMode] = useState(null)

  useEffect(() => {
    if (!detail) return
    if (detail.priority) setApprovePriority(detail.priority)
  }, [detail?.id, detail?.priority])

  const showActions = canApprove && detail && ACTIONABLE.has(detail.status)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (!showActions || !requestId) return
    let cancelled = false
    ;(async () => {
      try {
        const rows = await getWorkRequestDepartmentEmployees(requestId)
        if (!cancelled) setEmployees(rows)
      } catch {
        if (!cancelled) setEmployees([])
      }
    })()
    return () => { cancelled = true }
  }, [showActions, requestId])

  const runAction = async (fn) => {
    setActing(true)
    setActionError(null)
    try {
      await fn()
      onUpdated?.()
      reload()
      setMode(null)
    } catch (err) {
      setActionError(err.message)
    } finally {
      setActing(false)
    }
  }

  const hierarchy = detail?.asset_hierarchy || []
  const technicians = detail?.assigned_technicians || []

  return (
    <div className="wr-detail-overlay" onClick={handleBackdropClick} role="presentation">
      <div
        className="wr-detail-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="wr-detail-title"
        aria-modal="true"
      >
        <header className="wr-detail-sheet__header">
          <div className="wr-detail-sheet__header-main">
            <PageBack onClick={onClose} />
            <div>
              <p className="wr-detail-sheet__eyebrow">Work request</p>
              <h2 id="wr-detail-title" className="wr-detail-sheet__title">
                {detail
                  ? (detail.request_number || (detail.status === 'draft' ? 'Draft' : '—'))
                  : 'Loading…'}
              </h2>
            </div>
          </div>
          <button type="button" className="wr-detail-sheet__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="wr-detail-sheet__body">
          {loading && !detail && <p className="wo-received-detail__status">Loading…</p>}
          {error && <div className="wo-alert wo-alert--error">{error}</div>}

          {detail && (
            <div className="wr-detail-layout">
              <div className="wr-detail-main">
                <div className="wr-detail-meta">
                  <MetaItem label="Status">
                    <span className={`wo-status wo-status--${detail.status}`}>
                      {(detail.status || '').replace(/_/g, ' ')}
                    </span>
                  </MetaItem>
                  <MetaItem label="Priority">
                    <span style={{ textTransform: 'capitalize' }}>{detail.priority}</span>
                  </MetaItem>
                  <MetaItem label="Request type">
                    {(detail.request_type || '').replace(/_/g, ' ')}
                  </MetaItem>
                  <MetaItem label="Breakdown">{detail.is_breakdown_label}</MetaItem>
                  <MetaItem label="Order from">{detail.order_from?.name || '—'}</MetaItem>
                  <MetaItem label="Order to">{detail.order_to?.name || '—'}</MetaItem>
                  <MetaItem label="Requested by">
                    {detail.requester?.full_name || detail.requester?.email || '—'}
                  </MetaItem>
                  <MetaItem label="Request date">{formatDate(detail.request_date)}</MetaItem>
                  {detail.linked_work_order && (
                    <MetaItem label="Work order">
                      {detail.linked_work_order.wo_number || detail.manual_work_order_id?.slice(0, 8)}
                      {detail.execution_status
                        ? ` · ${detail.execution_status.replace(/_/g, ' ')}`
                        : ''}
                    </MetaItem>
                  )}
                  {!detail.linked_work_order && detail.manual_work_order_id && (
                    <MetaItem label="Work order">
                      Linked · {detail.manual_work_order_id.slice(0, 8)}…
                    </MetaItem>
                  )}
                </div>

                {hierarchy.length > 0 && (
                  <section className="wo-received-detail__section">
                    <h3>Equipment &amp; asset</h3>
                    <dl className="wo-received-detail__fields">
                      {hierarchy.map((step, i) => (
                        <div key={`${step.field_id}-${i}`} className="wo-received-detail__field">
                          <dt>{step.field_name}</dt>
                          <dd>{step.value || '—'}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                )}

                <section className="wo-received-detail__section">
                  <h3>Maintenance</h3>
                  <dl className="wo-received-detail__fields">
                    <div className="wo-received-detail__field wo-received-detail__field--full">
                      <dt>Problem description</dt>
                      <dd style={{ whiteSpace: 'pre-wrap' }}>{detail.problem_description}</dd>
                    </div>
                    {detail.remarks && (
                      <div className="wo-received-detail__field wo-received-detail__field--full">
                        <dt>Remarks</dt>
                        <dd style={{ whiteSpace: 'pre-wrap' }}>{detail.remarks}</dd>
                      </div>
                    )}
                    {technicians.length > 0 && (
                      <div className="wo-received-detail__field">
                        <dt>Assigned technicians</dt>
                        <dd>{technicians.map((t) => t.name).join(', ')}</dd>
                      </div>
                    )}
                  </dl>
                </section>

                {actionError && (
                  <div className="wo-alert wo-alert--error" role="alert">{actionError}</div>
                )}

                {showActions && (
                  <section className="wo-received-detail__section wo-assignment-actions">
                    <h3>Actions</h3>
                    {mode !== 'reject' && mode !== 'info' && (
                      <div className="wr-actions">
                        <button
                          type="button"
                          className="company-btn company-btn--primary"
                          onClick={() => setMode(mode === 'approve' ? null : 'approve')}
                          disabled={acting}
                        >
                          Approve &amp; assign
                        </button>
                        <button
                          type="button"
                          className="company-btn company-btn--secondary"
                          onClick={() => setMode('reject')}
                          disabled={acting}
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          className="company-btn company-btn--secondary"
                          onClick={() => setMode('info')}
                          disabled={acting}
                        >
                          Request more info
                        </button>
                      </div>
                    )}

                    {mode === 'approve' && (
                      <div className="wr-assign-block">
                        <label className="company-form__field company-form__field--full">
                          <span className="company-form__label">
                            Technicians
                            {assigneeIds.length > 0 ? ` (${assigneeIds.length} selected)` : ''}
                          </span>
                          <div className="wr-assign-block__technicians" role="group" aria-label="Technicians">
                            {employees.map((emp) => {
                              const checked = assigneeIds.includes(emp.id)
                              return (
                                <label key={emp.id} className="wr-assign-block__technician">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {
                                      setAssigneeIds((prev) => (
                                        checked
                                          ? prev.filter((id) => id !== emp.id)
                                          : [...prev, emp.id]
                                      ))
                                    }}
                                  />
                                  <span>
                                    {emp.name}{emp.emp_id ? ` (${emp.emp_id})` : ''}
                                  </span>
                                </label>
                              )
                            })}
                          </div>
                        </label>
                        <label className="company-form__field">
                          <span className="company-form__label">Work center</span>
                          <input
                            className="company-form__input"
                            value={workCenter}
                            onChange={(e) => setWorkCenter(e.target.value)}
                            placeholder="e.g. Mechanical Workshop"
                            required
                          />
                        </label>
                        <label className="company-form__field">
                          <span className="company-form__label">Priority</span>
                          <select
                            className="company-form__input"
                            value={approvePriority}
                            onChange={(e) => setApprovePriority(e.target.value)}
                          >
                            <option value="high">High</option>
                            <option value="medium">Medium</option>
                            <option value="low">Low</option>
                          </select>
                        </label>
                        <label className="company-form__field">
                          <span className="company-form__label">Planned start</span>
                          <input
                            type="datetime-local"
                            className="company-form__input"
                            value={plannedStartAt}
                            onChange={(e) => setPlannedStartAt(e.target.value)}
                          />
                        </label>
                        <label className="company-form__field">
                          <span className="company-form__label">Planned end</span>
                          <input
                            type="datetime-local"
                            className="company-form__input"
                            value={plannedEndAt}
                            onChange={(e) => setPlannedEndAt(e.target.value)}
                          />
                        </label>
                        <label className="company-form__field company-form__field--full">
                          <span className="company-form__label">Assignment remarks</span>
                          <textarea
                            className="company-form__input company-form__textarea"
                            rows={2}
                            value={assignmentRemarks}
                            onChange={(e) => setAssignmentRemarks(e.target.value)}
                          />
                        </label>
                        <div className="wr-actions">
                          <button
                            type="button"
                            className="company-btn company-btn--primary"
                            disabled={acting || !assigneeIds.length || !workCenter.trim()}
                            onClick={() => runAction(() => approveWorkRequest(requestId, {
                              assignedEmployeeIds: assigneeIds,
                              assignmentRemarks,
                              workCenter: workCenter.trim(),
                              priority: approvePriority,
                              plannedStartAt: plannedStartAt
                                ? new Date(plannedStartAt).toISOString()
                                : null,
                              plannedEndAt: plannedEndAt
                                ? new Date(plannedEndAt).toISOString()
                                : null,
                            }))}
                          >
                            {acting ? 'Saving…' : 'Confirm approval'}
                          </button>
                          <button
                            type="button"
                            className="company-btn company-btn--secondary"
                            onClick={() => setMode(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {mode === 'reject' && (
                      <div className="wr-assign-block">
                        <label className="company-form__field company-form__field--full">
                          <span className="company-form__label">Rejection reason</span>
                          <textarea
                            className="company-form__input company-form__textarea"
                            rows={3}
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            required
                          />
                        </label>
                        <div className="wr-actions">
                          <button
                            type="button"
                            className="company-btn company-btn--primary"
                            disabled={acting || !rejectReason.trim()}
                            onClick={() => runAction(() => rejectWorkRequest(requestId, rejectReason))}
                          >
                            Confirm reject
                          </button>
                          <button
                            type="button"
                            className="company-btn company-btn--secondary"
                            onClick={() => setMode(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {mode === 'info' && (
                      <div className="wr-assign-block">
                        <label className="company-form__field company-form__field--full">
                          <span className="company-form__label">Message to requester</span>
                          <textarea
                            className="company-form__input company-form__textarea"
                            rows={3}
                            value={infoMessage}
                            onChange={(e) => setInfoMessage(e.target.value)}
                          />
                        </label>
                        <div className="wr-actions">
                          <button
                            type="button"
                            className="company-btn company-btn--primary"
                            disabled={acting || !infoMessage.trim()}
                            onClick={() => runAction(() => requestWorkRequestInfo(requestId, infoMessage))}
                          >
                            Send request
                          </button>
                          <button
                            type="button"
                            className="company-btn company-btn--secondary"
                            onClick={() => setMode(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </section>
                )}
              </div>

              <aside className="wr-detail-timeline" aria-label="Timeline">
                <h3 className="wr-detail-timeline__title">Timeline</h3>
                {detail.timeline?.length ? (
                  <ul className="wr-timeline wr-timeline--panel">
                    {detail.timeline.map((ev) => (
                      <li key={ev.id}>
                        <span className="wr-timeline__event">
                          {ev.event_type.replace(/_/g, ' ')}
                        </span>
                        <p className="wr-timeline__message">{ev.message}</p>
                        <time className="wr-timeline__time" dateTime={ev.created_at}>
                          {formatDate(ev.created_at)}
                        </time>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="wo-received-detail__status">No timeline events yet.</p>
                )}
              </aside>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
