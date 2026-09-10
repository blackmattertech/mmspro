import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import { useWorkOrderDetail } from '../../hooks/useWorkOrderList'
import { useOrg } from '../../hooks/useOrg'
import {
  approveWorkRequest,
  rejectWorkRequest,
  requestWorkRequestInfo,
  replyToWorkRequest,
  getWorkRequestDepartmentEmployees,
} from '../../lib/api-work-requests'
import { getWorkCenters } from '../../lib/api'
import { getWorkOrderFileSignedUrl, uploadWorkOrderFile } from '../../lib/workOrderAssets'
import { downloadFromUrl } from '../../lib/fileDownload'
import { getWorkOrderFiles, isImageFileItem, revokeWorkOrderFilePreviews } from '../../lib/workOrderFileValues'
import ImageLightbox from '../shared/ImageLightbox'
import PageBack from '../shared/PageBack'
import RecordTimeline from '../shared/RecordTimeline'
import EmployeeAvatar from '../company/EmployeeAvatar'
import DateField from '../ui/DateField'
import FilterableSelect from '../ui/FilterableSelect'
import WorkRequestAttachmentsField from './WorkRequestAttachmentsField'
import TechnicianMultiSelect from './TechnicianMultiSelect'
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

function formatFileSize(bytes) {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n <= 0) return null
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function WorkRequestAttachments({ attachments }) {
  const files = getWorkOrderFiles(attachments)
  const [fileError, setFileError] = useState(null)
  const [urls, setUrls] = useState({})
  const [lightbox, setLightbox] = useState(null)

  const pathKey = files.map((file) => file.path).filter(Boolean).join('|')

  useEffect(() => {
    if (!pathKey) {
      setUrls({})
      return undefined
    }

    let cancelled = false
    const paths = pathKey.split('|')
    ;(async () => {
      const next = {}
      await Promise.all(paths.map(async (path) => {
        try {
          const url = await getWorkOrderFileSignedUrl(path)
          if (url) next[path] = url
        } catch (err) {
          if (!cancelled) setFileError(err.message || 'Could not open file')
        }
      }))
      if (!cancelled) setUrls(next)
    })()

    return () => { cancelled = true }
  }, [pathKey])

  if (!files.length) return null

  const downloadAttachment = async (file) => {
    const label = file.name || file.file_name || 'download'
    const url = (file.path && urls[file.path]) || file.url || file.previewUrl
    setFileError(null)
    try {
      const src = url || (file.path ? await getWorkOrderFileSignedUrl(file.path) : null)
      if (src) await downloadFromUrl(src, label)
    } catch (err) {
      setFileError(err.message || 'Could not download file')
    }
  }

  const openFile = async (file) => {
    const label = file.name || file.file_name || 'Download file'
    const url = (file.path && urls[file.path]) || file.url || file.previewUrl
    setFileError(null)
    try {
      if (isImageFileItem(file)) {
        const src = url || (file.path ? await getWorkOrderFileSignedUrl(file.path) : null)
        if (!src) return
        setLightbox({ src, alt: label, filename: label })
        return
      }
      if (url) {
        await downloadFromUrl(url, label)
        return
      }
      if (!file.path) return
      const signed = await getWorkOrderFileSignedUrl(file.path)
      if (signed) await downloadFromUrl(signed, label)
    } catch (err) {
      setFileError(err.message || 'Could not open file')
    }
  }

  return (
    <section className="wo-received-detail__section">
      <h3>Attachments</h3>
      {fileError && (
        <div className="wo-alert wo-alert--error" role="alert">{fileError}</div>
      )}
      <ul className="wr-detail-attachments">
        {files.map((file, index) => {
          const label = file.name || file.file_name || 'Download file'
          const size = formatFileSize(file.size)
          const previewSrc = (file.path && urls[file.path]) || file.url || file.previewUrl
          const isImage = isImageFileItem(file)
          return (
            <li key={file.path || `${label}-${index}`} className="wr-detail-attachments__item">
              <button
                type="button"
                className="wr-detail-attachments__thumb"
                onClick={() => openFile(file)}
                aria-label={isImage ? `Preview ${label}` : `Download ${label}`}
              >
                {isImage && previewSrc ? (
                  <img src={previewSrc} alt="" />
                ) : (
                  <span className="wr-detail-attachments__fallback" aria-hidden="true">
                    {(label.split('.').pop() || 'FILE').slice(0, 4).toUpperCase()}
                  </span>
                )}
              </button>
              <div className="wr-detail-attachments__meta">
                <button
                  type="button"
                  className="wo-received-detail__file-link"
                  onClick={() => openFile(file)}
                >
                  {label}
                </button>
                {size && <span className="wr-detail-attachments__size">{size}</span>}
                <button
                  type="button"
                  className="wr-detail-attachments__download"
                  onClick={() => downloadAttachment(file)}
                >
                  Download
                </button>
              </div>
            </li>
          )
        })}
      </ul>
      {lightbox && (
        <ImageLightbox
          src={lightbox.src}
          alt={lightbox.alt}
          filename={lightbox.filename}
          onClose={() => setLightbox(null)}
        />
      )}
    </section>
  )
}

const ACTIONABLE = new Set(['submitted', 'pending_approval', 'need_info', 'info_provided'])

export default function WorkRequestDetailModal({
  requestId,
  onClose,
  fetchWorkRequest,
  canApprove,
  onUpdated,
}) {
  const { detail, loading, error, reload } = useWorkOrderDetail(requestId, fetchWorkRequest)
  const { org } = useOrg()
  const handleBackdropClick = useBackdropClose(onClose)
  const [employees, setEmployees] = useState([])
  const [assigneeIds, setAssigneeIds] = useState([])
  const [assignmentRemarks, setAssignmentRemarks] = useState('')
  const [workCenter, setWorkCenter] = useState('')
  const [workCenters, setWorkCenters] = useState([])
  const [approvePriority, setApprovePriority] = useState('medium')
  const [plannedStartAt, setPlannedStartAt] = useState('')
  const [plannedEndAt, setPlannedEndAt] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [infoMessage, setInfoMessage] = useState('')
  const [replyMessage, setReplyMessage] = useState('')
  const [replyFiles, setReplyFiles] = useState([])
  const replyFilesRef = useRef(replyFiles)
  replyFilesRef.current = replyFiles
  const [actionError, setActionError] = useState(null)
  const [acting, setActing] = useState(false)
  const [mode, setMode] = useState(null)

  const closeRejectDialog = useCallback(() => {
    if (acting) return
    setMode((current) => (current === 'reject' ? null : current))
    setRejectReason('')
  }, [acting])
  const handleRejectBackdropClick = useBackdropClose(closeRejectDialog)

  useEffect(() => {
    if (!detail) return
    if (detail.priority) setApprovePriority(detail.priority)
  }, [detail?.id, detail?.priority])

  const showActions = canApprove && detail && ACTIONABLE.has(detail.status)
  const canReply = Boolean(detail?.can_reply)
  const latestInfoRequest = [...(detail?.timeline || [])]
    .reverse()
    .find((ev) => ev.event_type === 'need_info')

  useEffect(() => () => revokeWorkOrderFilePreviews(replyFilesRef.current), [])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      if (mode === 'reject') {
        closeRejectDialog()
        return
      }
      onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [closeRejectDialog, mode, onClose])

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

  useEffect(() => {
    if (!showActions) return undefined
    let cancelled = false
    ;(async () => {
      try {
        const rows = await getWorkCenters({ limit: 200 })
        if (cancelled) return
        const active = (rows || []).filter((row) => row.is_active !== false)
        setWorkCenters(active)
        setWorkCenter((current) => {
          if (current) return current
          const general = active.find((row) => String(row.name).toLowerCase() === 'general')
          return general?.name || active[0]?.name || ''
        })
      } catch {
        if (!cancelled) setWorkCenters([])
      }
    })()
    return () => { cancelled = true }
  }, [showActions])

  const runAction = async (fn) => {
    setActing(true)
    setActionError(null)
    try {
      await fn()
      onUpdated?.()
      reload()
      setMode(null)
      setRejectReason('')
    } catch (err) {
      setActionError(err.message)
      onUpdated?.()
      reload()
    } finally {
      setActing(false)
    }
  }

  const sendReply = () => runAction(async () => {
    if (!org?.id) throw new Error('Organization is not available.')
    const uploaded = []
    for (const item of replyFiles) {
      const file = item?.file instanceof File ? item.file : item
      const meta = await uploadWorkOrderFile(
        org.id,
        `work-requests/${requestId}`,
        'attachments',
        file,
        'file',
      )
      uploaded.push(meta)
    }
    await replyToWorkRequest(requestId, {
      message: replyMessage,
      attachments: uploaded,
    })
    setReplyMessage('')
    revokeWorkOrderFilePreviews(replyFiles)
    setReplyFiles([])
  })

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
                  <MetaItem label="Job nature">{detail.job_nature || detail.job_nature_label || '—'}</MetaItem>
                  <MetaItem label="Order from">{detail.order_from?.name || '—'}</MetaItem>
                  <MetaItem label="Order to">{detail.order_to?.name || '—'}</MetaItem>
                  <MetaItem label="Requested by">
                    {detail.requester ? (
                      <span className="wr-requester">
                        <EmployeeAvatar employee={detail.requester} size="sm" />
                        <span className="wr-requester__copy">
                          <span className="wr-requester__name">
                            {detail.requester.name || detail.requester.full_name || detail.requester.email || '—'}
                          </span>
                          {Boolean(detail.requester.department_name || detail.requester.department?.name || detail.requester.role) && (
                            <span className="wr-requester__meta">
                              {[
                                detail.requester.department_name || detail.requester.department?.name,
                                detail.requester.role,
                              ].filter(Boolean).join(' · ')}
                            </span>
                          )}
                        </span>
                      </span>
                    ) : '—'}
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
                      {hierarchy
                        .filter((step, i, list) => {
                          const name = String(step.field_name || '').trim().toLowerCase()
                          if (!name) return false
                          return list.findIndex((item) => String(item.field_name || '').trim().toLowerCase() === name) === i
                        })
                        .map((step, i) => (
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
                    {detail.short_description ? (
                      <div className="wo-received-detail__field wo-received-detail__field--full">
                        <dt>Short description</dt>
                        <dd>{detail.short_description}</dd>
                      </div>
                    ) : null}
                    <div className="wo-received-detail__field wo-received-detail__field--full">
                      <dt>Problem description</dt>
                      <dd style={{ whiteSpace: 'pre-wrap' }}>{detail.problem_description || '—'}</dd>
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

                <WorkRequestAttachments attachments={detail.attachments} />

                {actionError && (
                  <div className="wo-alert wo-alert--error" role="alert">{actionError}</div>
                )}

                {canReply && (
                  <section className="wo-received-detail__section wo-assignment-actions">
                    <h3>Reply</h3>
                    {latestInfoRequest?.message && (
                      <div className="wr-need-info-prompt">
                        <span className="wr-need-info-prompt__label">Requested information</span>
                        <p>{latestInfoRequest.message}</p>
                      </div>
                    )}
                    <div className="wr-assign-block">
                      <label className="company-form__field company-form__field--full">
                        <span className="company-form__label">Your reply</span>
                        <textarea
                          className="company-form__input company-form__textarea"
                          rows={3}
                          value={replyMessage}
                          onChange={(e) => setReplyMessage(e.target.value)}
                          placeholder="Add the requested details"
                          disabled={acting}
                        />
                      </label>
                      <WorkRequestAttachmentsField
                        label="Additional attachments"
                        files={replyFiles}
                        onChange={setReplyFiles}
                        disabled={acting}
                      />
                      <div className="wr-actions">
                        <button
                          type="button"
                          className="company-btn company-btn--primary"
                          disabled={acting || !replyMessage.trim()}
                          onClick={sendReply}
                        >
                          {acting ? 'Sending…' : 'Send reply'}
                        </button>
                      </div>
                    </div>
                  </section>
                )}

                {showActions && (
                  <section className="wo-received-detail__section wo-assignment-actions">
                    <h3>Actions</h3>
                    {mode !== 'approve' && mode !== 'info' && (
                      <div className="wr-actions">
                        <button
                          type="button"
                          className="company-btn company-btn--primary"
                          onClick={() => setMode(mode === 'approve' ? null : 'approve')}
                          disabled={acting || mode === 'reject'}
                        >
                          Approve &amp; assign
                        </button>
                        <button
                          type="button"
                          className="company-btn company-btn--secondary"
                          onClick={() => setMode('reject')}
                          disabled={acting || mode === 'reject'}
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          className="company-btn company-btn--secondary"
                          onClick={() => setMode('info')}
                          disabled={acting || mode === 'reject'}
                        >
                          Request more info
                        </button>
                      </div>
                    )}

                    {mode === 'approve' && (
                      <div className="wr-assign-block">
                        <div className="company-form__field company-form__field--full">
                          <span className="company-form__label">
                            Technicians
                            {assigneeIds.length > 0 ? ` (${assigneeIds.length} selected)` : ''}
                          </span>
                          <TechnicianMultiSelect
                            employees={employees}
                            value={assigneeIds}
                            onChange={setAssigneeIds}
                            disabled={acting}
                            placeholder="Select technicians…"
                          />
                        </div>
                        <div className="company-form__grid">
                          <label className="company-form__field">
                            <span className="company-form__label">Work center</span>
                            {workCenters.length ? (
                              <FilterableSelect
                                className="company-form__input--select"
                                value={workCenter}
                                onChange={setWorkCenter}
                                options={workCenters}
                                getOptionValue={(row) => row.name}
                                getOptionLabel={(row) => row.code ? `${row.name} (${row.code})` : row.name}
                                placeholder="Select work center"
                                allowEmpty={false}
                                required
                              />
                            ) : (
                              <input
                                className="company-form__input"
                                value={workCenter}
                                onChange={(e) => setWorkCenter(e.target.value)}
                                placeholder="e.g. Mechanical Workshop"
                                required
                              />
                            )}
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
                            <DateField
                              value={plannedStartAt}
                              onChange={setPlannedStartAt}
                              withTime
                              disabled={acting}
                            />
                          </label>
                          <label className="company-form__field">
                            <span className="company-form__label">Planned end</span>
                            <DateField
                              value={plannedEndAt}
                              onChange={setPlannedEndAt}
                              withTime
                              disabled={acting}
                            />
                          </label>
                        </div>
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
                <RecordTimeline events={detail.timeline} />
              </aside>
            </div>
          )}
        </div>
      </div>
      {mode === 'reject' && createPortal(
        <div
          className="company-modal-overlay company-modal-overlay--popup wr-reject-overlay"
          onMouseDown={handleRejectBackdropClick}
          role="presentation"
        >
          <div
            className="company-modal company-modal--popup"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="wr-reject-title"
          >
            <div className="company-modal__header">
              <h2 id="wr-reject-title">Reject work request</h2>
              <button
                type="button"
                className="company-modal__close"
                onClick={closeRejectDialog}
                disabled={acting}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <form
              className="company-modal__form"
              onSubmit={(e) => {
                e.preventDefault()
                if (!rejectReason.trim() || acting) return
                runAction(() => rejectWorkRequest(requestId, rejectReason))
              }}
            >
              <p className="company-modal__hint">
                This will reject the work request
                {detail?.request_number ? ` ${detail.request_number}` : ''}. This cannot be undone.
              </p>
              <label className="company-form__field">
                <span className="company-form__label">Rejection reason *</span>
                <textarea
                  className="company-form__input company-form__textarea"
                  rows={4}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Explain why this request is being rejected"
                  required
                  autoFocus
                  disabled={acting}
                />
              </label>
              {actionError && (
                <div className="wo-alert wo-alert--error" role="alert">{actionError}</div>
              )}
              <div className="company-modal__actions">
                <button
                  type="button"
                  className="company-btn company-btn--secondary"
                  onClick={closeRejectDialog}
                  disabled={acting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="company-btn company-btn--danger"
                  disabled={acting || !rejectReason.trim()}
                >
                  {acting ? 'Rejecting…' : 'Reject request'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
