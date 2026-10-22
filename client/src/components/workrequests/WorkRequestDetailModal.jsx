import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import { useWorkOrderDetail } from '../../hooks/useWorkOrderList'
import { useOrg } from '../../hooks/useOrg'
import { useAuth } from '../../hooks/useAuth'
import { usePermissions } from '../../hooks/usePermissions'
import { useTextFieldLimits } from '../../hooks/useTextFieldLimits'
import {
  approveWorkRequest,
  rejectWorkRequest,
  requestWorkRequestInfo,
  replyToWorkRequest,
  getWorkRequestDepartmentEmployees,
  saveWorkRequestChecklist,
} from '../../lib/api-work-requests'
import ChecklistExecution from '../pm/ChecklistExecution'
import { getWorkCenters } from '../../lib/api'
import { getWorkOrderFileSignedUrl, uploadWorkOrderFile } from '../../lib/workOrderAssets'
import { downloadFromUrl } from '../../lib/fileDownload'
import { getWorkOrderFiles, isImageFileItem, revokeWorkOrderFilePreviews, workOrderFilesValue, filesNeedStoredPreview } from '../../lib/workOrderFileValues'
import ImageLightbox from '../shared/ImageLightbox'
import PageBack from '../shared/PageBack'
import RecordTimeline from '../shared/RecordTimeline'
import EmployeeAvatar from '../company/EmployeeAvatar'
import DateField from '../ui/DateField'
import FilterableSelect from '../ui/FilterableSelect'
import WorkRequestAttachmentsField from './WorkRequestAttachmentsField'
import TechnicianMultiSelect from './TechnicianMultiSelect'
import SpellcheckInput from '../shared/SpellcheckInput'
import FormLabel from '../shared/FormLabel'
import OrderedFormLayout from '../forms/OrderedFormLayout'
import EquipmentQrCode from '../equipment/EquipmentQrCode'

function WorkRequestChecklistPanel({ detail }) {
  const fields = detail?.checklist_snapshot?.fields || []
  const [values, setValues] = useState(detail?.checklist_values || {})
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    setValues(detail?.checklist_values || {})
  }, [detail?.id])

  if (!fields.length) return null
  const missing = fields.filter((field) => field.is_required && !String(values?.[field.id] ?? '').trim())

  return (
    <section className="wo-received-detail__section">
      <h3>Checklist</h3>
      <ChecklistExecution snapshot={detail.checklist_snapshot} values={values} onChange={setValues} disabled={saving} />
      {missing.length > 0 && (
        <p className="company-readonly-note">Required before save: {missing.map((field) => field.name).join(', ')}</p>
      )}
      <button
        type="button"
        className="company-btn company-btn--secondary"
        disabled={saving || missing.length > 0}
        onClick={async () => {
          setSaving(true)
          setMessage('')
          try {
            await saveWorkRequestChecklist(detail.id, values)
            setMessage('Checklist saved.')
          } catch (err) {
            setMessage(err.message || 'Could not save checklist')
          } finally {
            setSaving(false)
          }
        }}
      >
        {saving ? 'Saving…' : 'Save checklist'}
      </button>
      {message && <p className="company-readonly-note">{message}</p>}
    </section>
  )
}
import { useFormLayout } from '../../hooks/useFormLayout'
import { useFormFieldValues } from '../../hooks/useFormFieldValues'
import { resolveFormActors } from '../../lib/formFillership'
import { catalogId, parseLayoutId } from '../../lib/formLayoutIds'
import { getEquipmentFieldRole } from '../../lib/workRequestAssetPicker'
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

function hasFilledValue(value) {
  if (value == null || value === '') return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') {
    if (Array.isArray(value.files)) return value.files.length > 0
    return Object.keys(value).length > 0
  }
  return String(value).trim() !== '' && String(value).trim() !== '—'
}

function fieldLabel(field, catalog) {
  return String(field?.label || catalog?.name || catalog?.label || '').trim().toLowerCase()
}

function isAreaLayoutField(field, catalog, parsed) {
  return parsed.value === 'areas'
    || field.masterSource === 'areas'
    || field.bindKey === 'area_id'
    || fieldLabel(field, catalog) === 'area'
    || getEquipmentFieldRole(catalog || { name: field?.label }) === 'area'
}

function isImageLayoutField(field, catalog, parsed) {
  const label = fieldLabel(field, catalog)
  const type = String(field.fieldType || catalog?.field_type || '').toLowerCase()
  return type === 'image' || /^images?$/.test(label)
}

function incomingDisplayLayout(layout, catalogFields) {
  if (!layout) return layout
  const catalogById = new Map((catalogFields || []).map((row) => [String(row.id), row]))
  return {
    ...layout,
    fields: (layout.fields || []).filter((field) => {
      const parsed = parseLayoutId(field.id)
      const catalog = parsed.kind === 'catalog' ? catalogById.get(String(parsed.value)) : null
      return !isAreaLayoutField(field, catalog, parsed)
    }),
  }
}

function firstLayoutText(layout, catalogFields, values, test) {
  const catalogById = new Map((catalogFields || []).map((row) => [String(row.id), row]))
  for (const field of layout?.fields || []) {
    const parsed = parseLayoutId(field.id)
    const catalog = parsed.kind === 'catalog' ? catalogById.get(String(parsed.value)) : null
    if (!test(field, catalog, parsed, fieldLabel(field, catalog))) continue
    const candidates = [values?.[field.id], values?.[catalog?.id], values?.[parsed.value]]
    for (const raw of candidates) {
      if (raw == null || typeof raw === 'object') continue
      const text = String(raw).trim()
      if (text && text !== '—') return text
    }
  }
  return ''
}

function jobNatureDisplay(detail, layout, catalogFields, extrasValues) {
  const native = String(detail?.job_nature || detail?.job_nature_label || '').trim()
  if (native) return native
  const fromRows = (detail?.layout_fields || []).find((field) => /job\s*nature/i.test(String(field.label || '')))?.value
  if (fromRows) return fromRows
  return firstLayoutText(
    layout,
    catalogFields,
    extrasValues,
    (field, catalog, parsed, label) => field.bindKey === 'job_nature' || /job\s*nature/.test(label),
  ) || '—'
}

function seedWorkRequestFormValues(layout, catalogFields, values, detail) {
  if (!layout) return null
  const next = { ...values }
  let changed = false
  const equipment = detail?.equipment || {}
  const hierarchy = Array.isArray(detail?.asset_hierarchy) ? detail.asset_hierarchy : []
  const areaId = equipment.area_id || null
  const areaName = equipment.area_name
    || hierarchy.find((step) => /^area$/i.test(String(step.field_name || '')))?.value
    || ''
  const catalogById = new Map((catalogFields || []).map((row) => [String(row.id), row]))
  const nativeByKey = {
    short_description: detail?.short_description,
    problem_description: detail?.problem_description,
    remarks: detail?.remarks,
    job_nature: detail?.job_nature_label || detail?.job_nature,
    priority: detail?.priority,
    area_id: areaId || areaName,
    location_id: equipment.location_id,
    department_id: equipment.department_id,
    equipment_id: equipment.id,
  }

  const assign = (key, value) => {
    if (!key || !hasFilledValue(value) || hasFilledValue(next[key])) return
    next[key] = value
    changed = true
  }

  const assignBoth = (fieldId, catalogKey, value) => {
    assign(fieldId, value)
    if (catalogKey && catalogKey !== fieldId) assign(catalogKey, value)
  }

  for (const [key, stored] of Object.entries(detail?.field_values || {})) {
    assign(key, stored)
    assign(catalogId(key), stored)
  }

  for (const step of hierarchy) {
    if (!hasFilledValue(step?.value)) continue
    if (step.field_id) {
      assign(step.field_id, step.value)
      assign(catalogId(step.field_id), step.value)
    }
  }

  const equipmentValues = equipment.values && typeof equipment.values === 'object' && !Array.isArray(equipment.values)
    ? equipment.values
    : {}
  for (const [id, value] of Object.entries(equipmentValues)) {
    assign(id, value)
    assign(catalogId(id), value)
  }

  for (const field of layout.fields || []) {
    const parsed = parseLayoutId(field.id)
    const catalog = parsed.kind === 'catalog' ? catalogById.get(String(parsed.value)) : null
    const catalogKey = catalog?.id || (parsed.kind === 'catalog' ? parsed.value : null)
    const label = fieldLabel(field, catalog)
    const bind = String(field.bindKey || '')
    const type = String(field.fieldType || catalog?.field_type || '').toLowerCase()

    if (nativeByKey[bind]) assignBoth(field.id, catalogKey, nativeByKey[bind])
    if (bind === 'short_description' || label === 'short description') {
      assignBoth(field.id, catalogKey, nativeByKey.short_description)
    }
    if (bind === 'problem_description' || label === 'problem description' || label === 'problem detailed description') {
      assignBoth(field.id, catalogKey, nativeByKey.problem_description)
    }
    if (bind === 'remarks' || label === 'remarks') {
      assignBoth(field.id, catalogKey, nativeByKey.remarks)
    }
    if (bind === 'job_nature' || /job\s*nature/.test(label)) {
      assignBoth(field.id, catalogKey, nativeByKey.job_nature)
    }
    if (bind === 'priority' || /^(job\s*)?priority$/.test(label)) {
      assignBoth(field.id, catalogKey, nativeByKey.priority)
    }

    if (isAreaLayoutField(field, catalog, parsed)) {
      const options = catalog?.dropdown_options || []
      const match = options.find((option) => {
        const value = option?.value ?? option?.id ?? option
        const optionLabel = option?.label ?? option?.name ?? option
        return String(value) === String(areaId)
          || String(optionLabel) === String(areaName)
          || String(value) === String(areaName)
      })
      const masterValue = areaId || areaName
      const catalogValue = match
        ? (match.value ?? match.id ?? match)
        : (areaName || areaId)
      if (parsed.kind === 'master' || field.masterSource === 'areas' || bind === 'area_id') {
        assignBoth(field.id, catalogKey, masterValue)
      } else {
        assignBoth(field.id, catalogKey, catalogValue)
      }
    }

    if (type === 'image' || /^images?$/.test(label)) {
      const current = next[field.id] ?? next[catalogKey]
      const storedFiles = getWorkOrderFiles(current)
      const attachmentFiles = getWorkOrderFiles(detail?.attachments)
      const byName = new Map(attachmentFiles.map((file) => [String(file.name || '').toLowerCase(), file]))
      if (storedFiles.length && attachmentFiles.length) {
        let merged = false
        const nextFiles = storedFiles.map((file) => {
          if (file.path || file.url) return file
          const match = byName.get(String(file.name || '').toLowerCase())
          if (!match?.path && !match?.url) return file
          merged = true
          return { ...file, path: match.path || file.path, url: match.url || file.url }
        })
        if (merged) {
          next[field.id] = workOrderFilesValue(nextFiles)
          if (catalogKey) next[catalogKey] = workOrderFilesValue(nextFiles)
          changed = true
        }
      } else if (filesNeedStoredPreview(current) && attachmentFiles.length) {
        next[field.id] = workOrderFilesValue(attachmentFiles)
        if (catalogKey) next[catalogKey] = workOrderFilesValue(attachmentFiles)
        changed = true
      }
    }
  }

  return changed ? next : null
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
  const { user } = useAuth()
  const { isOrgAdmin, session, canUpdate } = usePermissions()
  const { maxLength } = useTextFieldLimits()
  const { layout, catalogFields, hasLayout } = useFormLayout('work_request.create')
  const extras = useFormFieldValues('work_request.create', requestId || null)
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
        const rows = await getWorkCenters({ limit: 50 })
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
  const layoutFields = detail?.layout_fields || []
  const breakdownFields = detail?.breakdown_fields || []
  const equipment = detail?.equipment

  const formActors = useMemo(() => resolveFormActors({
    formId: 'work_request.create',
    isOrgAdmin,
    profileId: user?.id,
    employeeId: session?.employee_id,
    isDepartmentHead: session?.is_department_head,
    employeeDepartmentId: session?.department_id,
    canApproveIncoming: canUpdate('work_request_approve') || canUpdate('work_request_incoming'),
    isCreate: false,
    record: detail ? {
      requested_by: detail.requested_by || detail.requester?.id || detail.requester?.profile_id,
      order_to_department_id: detail.order_to_department_id || detail.order_to?.id,
      assignees: detail.assigned_technicians || [],
    } : null,
  }), [
    isOrgAdmin,
    user?.id,
    session?.employee_id,
    session?.is_department_head,
    session?.department_id,
    canUpdate,
    detail,
  ])

  const displayLayout = useMemo(
    () => incomingDisplayLayout(layout, catalogFields),
    [layout, catalogFields],
  )
  const hasFormImages = useMemo(() => {
    const catalogById = new Map((catalogFields || []).map((row) => [String(row.id), row]))
    return (displayLayout?.fields || []).some((field) => {
      const parsed = parseLayoutId(field.id)
      const catalog = parsed.kind === 'catalog' ? catalogById.get(String(parsed.value)) : null
      return isImageLayoutField(field, catalog, parsed)
    })
  }, [displayLayout, catalogFields])
  const jobNature = jobNatureDisplay(detail, layout, catalogFields, extras.values)
  const qrValue = equipment?.qr_code || equipment?.code || ''

  useEffect(() => {
    if (!detail?.id || extras.loading || !hasLayout || !layout) return
    extras.setValues((prev) => seedWorkRequestFormValues(layout, catalogFields, prev, detail) || prev)
  }, [detail, extras.loading, extras.setValues, hasLayout, layout, catalogFields])

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
            <PageBack onClick={onClose} label="Back to Work Requests" />
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
            <div className="wr-detail-board">
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
                  <MetaItem label="Job nature">{jobNature}</MetaItem>
                  <MetaItem label="Order from">{detail.order_from?.name || '—'}</MetaItem>
                  <MetaItem label="Order to">{detail.order_to?.name || '—'}</MetaItem>
                  {equipment && (
                    <MetaItem label="Equipment">
                      {[equipment.name, equipment.code].filter(Boolean).join(' · ') || '—'}
                    </MetaItem>
                  )}
                  {(equipment?.area_name || hierarchy.some((step) => /^area$/i.test(step.field_name))) && (
                    <MetaItem label="Area">
                      {equipment?.area_name
                        || hierarchy.find((step) => /^area$/i.test(step.field_name))?.value
                        || '—'}
                    </MetaItem>
                  )}
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

                  {(hierarchy.length > 0 || equipment) && (
                    <section className="wr-form-section">
                      <div className="wr-form-section__head">
                        <h3 className="wr-form-section__title">Equipment &amp; Asset Information</h3>
                      </div>
                      <div className="wr-detail-equip wr-form-section__body">
                        <dl className="wo-received-detail__fields">
                          {hierarchy.length > 0 ? hierarchy
                            .filter((step, i, list) => {
                              const name = String(step.field_name || '').trim().toLowerCase()
                              if (!name) return false
                              return list.findIndex((item) => String(item.field_name || '').trim().toLowerCase() === name) === i
                            })
                            .map((step, i) => (
                            <div key={`${step.field_id || step.field_name}-${i}`} className="wo-received-detail__field">
                              <dt>{step.field_name}</dt>
                              <dd>{step.value || '—'}</dd>
                            </div>
                          )) : (
                            <>
                              {equipment?.area_name && (
                                <div className="wo-received-detail__field">
                                  <dt>Area</dt>
                                  <dd>{equipment.area_name}</dd>
                                </div>
                              )}
                              <div className="wo-received-detail__field">
                                <dt>Equipment</dt>
                                <dd>{[equipment?.name, equipment?.code].filter(Boolean).join(' · ') || '—'}</dd>
                              </div>
                            </>
                          )}
                        </dl>
                        {qrValue ? (
                          <EquipmentQrCode
                            value={qrValue}
                            caption={{ label: 'QR code', value: equipment?.code || equipment?.name || qrValue }}
                            fileName={equipment?.code || equipment?.name || 'equipment-qr'}
                          />
                        ) : null}
                      </div>
                    </section>
                  )}

                  {hasLayout ? (
                    <>
                      {extras.loading && (
                        <div className="wo-received-detail__status">Loading form fields…</div>
                      )}
                      <OrderedFormLayout
                        formId="work_request.create"
                        layout={displayLayout}
                        catalogLookup={catalogFields}
                        catalogValues={extras.values}
                        onCatalogChange={extras.setFieldValue}
                        masterValues={extras.values}
                        onMasterChange={extras.setFieldValue}
                        disabled
                        actors={formActors}
                        renderField={() => null}
                      />
                    </>
                  ) : layoutFields.length > 0 && (
                    <section className="wr-form-section">
                      <div className="wr-form-section__head">
                        <h3 className="wr-form-section__title">Form fields</h3>
                      </div>
                      <dl className="wo-received-detail__fields wr-form-section__body">
                        {layoutFields.map((field) => (
                          <div key={field.id} className="wo-received-detail__field">
                            <dt>{field.label}</dt>
                            <dd style={{ whiteSpace: 'pre-wrap' }}>{field.value || '—'}</dd>
                          </div>
                        ))}
                      </dl>
                    </section>
                  )}

              {technicians.length > 0 && (
                <p className="wr-detail-technicians">
                  Assigned technicians: {technicians.map((t) => t.name).join(', ')}
                </p>
              )}

                <WorkRequestChecklistPanel detail={detail} />

                {breakdownFields.length > 0 && (
                  <section className="wo-received-detail__section">
                    <h3>Breakdown</h3>
                    <dl className="wo-received-detail__fields">
                      {breakdownFields.map((field) => (
                        <div key={field.id} className="wo-received-detail__field">
                          <dt>{field.label}</dt>
                          <dd style={{ whiteSpace: 'pre-wrap' }}>{field.value || '—'}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                )}

                {!hasFormImages && (
                  <WorkRequestAttachments attachments={detail.attachments} />
                )}

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
                        <SpellcheckInput
                          multiline
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
                  <section className="wr-detail-actions">
                    {mode !== 'approve' && mode !== 'info' && (
                      <div className="wr-actions wr-actions--bar">
                        <button
                          type="button"
                          className="company-btn company-btn--primary"
                          onClick={() => setMode(mode === 'approve' ? null : 'approve')}
                          disabled={acting || mode === 'reject'}
                        >
                          Approve &amp; Assign
                        </button>
                        <button
                          type="button"
                          className="company-btn wr-actions__info"
                          onClick={() => setMode('info')}
                          disabled={acting || mode === 'reject'}
                        >
                          Request More Info
                        </button>
                        <button
                          type="button"
                          className="company-btn wr-actions__reject"
                          onClick={() => setMode('reject')}
                          disabled={acting || mode === 'reject'}
                        >
                          Reject
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
                              <SpellcheckInput
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
                          <FormLabel limit={maxLength('assignment_remarks')}>Assignment remarks</FormLabel>
                          <SpellcheckInput
                            multiline
                            className="company-form__input company-form__textarea"
                            rows={2}
                            value={assignmentRemarks}
                            onChange={(e) => setAssignmentRemarks(e.target.value)}
                            maxLength={maxLength('assignment_remarks')}
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
                          <SpellcheckInput
                            multiline
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
                <SpellcheckInput
                  multiline
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
