import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import { useWorkOrderDetail } from '../../hooks/useWorkOrderList'
import { useOrg } from '../../hooks/useOrg'
import { useAuth } from '../../hooks/useAuth'
import { usePermissions } from '../../hooks/usePermissions'
import {
  approveWorkRequest,
  rejectWorkRequest,
  requestWorkRequestInfo,
  replyToWorkRequest,
  submitWorkRequestDraft,
  saveWorkRequestChecklist,
} from '../../lib/api-work-requests'
import { getReceivedWorkOrder, getWorkOrderDetail } from '../../lib/api-work-orders'
import { notifyTabCountsChanged } from '../../lib/tabCountEvents'
import { orgPath } from '../../config/navigation'
import ChecklistExecution from '../pm/ChecklistExecution'
import { getWorkOrderFileSignedUrl, uploadWorkOrderFile } from '../../lib/workOrderAssets'
import { getWorkOrderFiles, revokeWorkOrderFilePreviews, workOrderFilesValue, filesNeedStoredPreview } from '../../lib/workOrderFileValues'
import PageBack from '../shared/PageBack'
import SaveAsTemplateButton from '../templates/SaveAsTemplateButton'
import RecordTimeline, { hydrateTimelineAttachments } from '../shared/RecordTimeline'
import EmployeeAvatar from '../company/EmployeeAvatar'
import FilterableSelect from '../ui/FilterableSelect'
import WorkRequestAttachmentsField from './WorkRequestAttachmentsField'
import WorkOrderAttachmentsField from '../workorders/WorkOrderAttachmentsField'
import SpellcheckInput from '../shared/SpellcheckInput'
import RichTextDisplay from '../shared/RichTextDisplay'
import FormLabel from '../shared/FormLabel'
import { useTextFieldLimits } from '../../hooks/useTextFieldLimits'
import { firstCharacterLimitMessage, findVisibleCharacterLimitError } from '../../lib/textFieldLimits'
import OrderedFormLayout from '../forms/OrderedFormLayout'
import EquipmentQrCode from '../equipment/EquipmentQrCode'
import { AssetHierarchySummary } from './WorkRequestAssetFields'
import { hierarchyDisplaySteps } from '../../lib/assetHierarchy'
import WorkOrderAssignmentActions from '../workorders/WorkOrderAssignmentActions'
import { useOrgStatusOptions } from '../../hooks/useOrgStatusOptions'
import { workRequestStatusDisplay } from '../../lib/workRequestStatusLabel'

const WorkOrderLifecyclePanel = lazy(() => import('../workorders/WorkOrderLifecyclePanel'))

function WorkRequestChecklistPanel({ detail, readOnly = false }) {
  const fields = detail?.checklist_snapshot?.fields || []
  const [values, setValues] = useState(detail?.checklist_values || {})
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    setValues(detail?.checklist_values || {})
  }, [detail?.id])

  if (!fields.length) return null
  const missing = fields.filter((field) => field.is_required && !String(values?.[field.id] ?? '').trim())

  const handleSave = async () => {
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
  }

  return (
    <section className="wo-received-detail__section wr-checklist-panel">
      <ChecklistExecution
        snapshot={detail.checklist_snapshot}
        values={values}
        onChange={setValues}
        disabled={saving || readOnly}
        record={detail}
        recordKind="work_request"
        embedded
        defaultOpen={missing.length > 0}
        onSave={readOnly ? null : handleSave}
        saving={saving}
        saveLabel="Save checklist"
      />
      {!readOnly && missing.length > 0 && (
        <p className="company-readonly-note">Required before save: {missing.map((field) => field.name).join(', ')}</p>
      )}
      {message && <p className="company-readonly-note wr-checklist-panel__message">{message}</p>}
    </section>
  )
}
import { useFormLayout } from '../../hooks/useFormLayout'
import { useFormFieldValues } from '../../hooks/useFormFieldValues'
import {
  canEditFilledBy,
  canEditWorkOrderStatusProgressRemarks,
  canEditWorkOrderSupervisorStatus,
  resolveFormActors,
} from '../../lib/formFillership'
import {
  catalogId,
  parseLayoutId,
  isPrimaryAssetPickerField,
  isAssetPickerLayoutField,
} from '../../lib/formLayoutIds'
import { SYSTEM_FIELD_OPTIONS } from '../../lib/systemFieldFallback'
import { formatDisplayDateTime } from '../../lib/displayDate'

export { isPrimaryAssetPickerField, isAssetPickerLayoutField }
import '../company/CompanyShared.css'
import '../workorders/WorkOrdersPage.css'
import '../workorders/ManualWorkOrder.css'
import './WorkRequests.css'

function formatDate(value) {
  if (!value) return '—'
  return formatDisplayDateTime(value) || '—'
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

export function requestTypeLabel(value) {
  const option = SYSTEM_FIELD_OPTIONS.request_type.find((item) => item.value === value)
  if (option) return option.label
  return String(value || '').replace(/_/g, ' ').trim()
}

export function renderIncomingRequestInfoField(detail, key, props = {}) {
  const known = {
    request_type: {
      label: 'Request type',
      value: detail?.request_type || '',
      options: SYSTEM_FIELD_OPTIONS.request_type,
      getOptionValue: (row) => row.value,
      getOptionLabel: (row) => row.label,
      placeholder: 'Select Request type',
    },
    order_from_department_id: {
      label: 'Order from',
      value: detail?.order_from_department_id || detail?.order_from?.id || '',
      name: detail?.order_from?.name || '',
      placeholder: 'Select Department',
    },
    order_to_department_id: {
      label: 'Order to',
      value: detail?.order_to_department_id || detail?.order_to?.id || '',
      name: detail?.order_to?.name || '',
      placeholder: 'Select Department',
    },
  }
  const field = known[key]
  if (!field) return null
  const options = field.options || (
    field.value ? [{ id: field.value, name: field.name || '—' }] : []
  )
  return (
    <label key={key} className={props.className}>
      <span className="company-form__label">
        {props.field?.label || field.label}
        {props.required ? ' *' : ''}
      </span>
      <FilterableSelect
        value={field.value}
        options={options}
        getOptionValue={field.getOptionValue || ((row) => row.id)}
        getOptionLabel={field.getOptionLabel || ((row) => row.name)}
        placeholder={field.placeholder}
        disabled
        className="company-form__input--select wr-request-info-value"
      />
    </label>
  )
}

export function isAssetLayoutSection(sectionId, _section, layout) {
  return (layout?.fields || []).some((field) => (
    field.sectionId === sectionId && isPrimaryAssetPickerField(field)
  ))
}

function isAreaLayoutField(field, _catalog, parsed) {
  return parsed.value === 'areas'
    || field.masterSource === 'areas'
    || field.bindKey === 'area_id'
}

function isImageLayoutField(field, catalog, parsed) {
  const label = fieldLabel(field, catalog)
  const type = String(field.fieldType || catalog?.field_type || '').toLowerCase()
  return type === 'image' || /^images?$/.test(label)
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

export function seedWorkRequestFormValues(layout, catalogFields, values, detail) {
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
    request_type: detail?.request_type,
    order_from_department_id: detail?.order_from_department_id || detail?.order_from?.id,
    order_to_department_id: detail?.order_to_department_id || detail?.order_to?.id,
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
    const systemKey = parsed.kind === 'system' ? parsed.value : ''
    const type = String(field.fieldType || catalog?.field_type || '').toLowerCase()

    if (nativeByKey[bind]) assignBoth(field.id, catalogKey, nativeByKey[bind])
    if (nativeByKey[systemKey]) assignBoth(field.id, catalogKey, nativeByKey[systemKey])
    if ((bind === 'request_type' || systemKey === 'request_type' || /request\s*type/.test(label)) && nativeByKey.request_type) {
      assignBoth(field.id, catalogKey, nativeByKey.request_type)
    }
    if (
      (bind === 'order_from_department_id' || systemKey === 'order_from_department_id' || /order\s*from/.test(label))
      && nativeByKey.order_from_department_id
    ) {
      assignBoth(field.id, catalogKey, nativeByKey.order_from_department_id)
    }
    if (
      (bind === 'order_to_department_id' || systemKey === 'order_to_department_id' || /order\s*to/.test(label))
      && nativeByKey.order_to_department_id
    ) {
      assignBoth(field.id, catalogKey, nativeByKey.order_to_department_id)
    }
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

function WorkRequestAttachments({ attachments }) {
  const files = getWorkOrderFiles(attachments)
  if (!files.length) return null

  return (
    <section className="wo-received-detail__section">
      <WorkOrderAttachmentsField
        title="Attachments & Evidence"
        description="Photos and documents submitted with this work request."
        files={files}
        readOnly
      />
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
  const { isOrgAdmin, session, canUpdate, canCreate } = usePermissions()
  const canSaveTemplate = canCreate('work_request_create') || canCreate('work_request')
  const { labelByKey: requestStatusLabels } = useOrgStatusOptions('work_request', { includeInactive: true })
  const { labelByKey: workOrderStatusLabels } = useOrgStatusOptions('work_order', { includeInactive: true })
  const { layout, catalogFields, hasLayout } = useFormLayout('work_request.create')
  const extras = useFormFieldValues('work_request.create', requestId || null)
  const { maxLength } = useTextFieldLimits()
  const remarksLimit = maxLength('remarks')
  const handleBackdropClick = useBackdropClose(onClose)
  const [rejectReason, setRejectReason] = useState('')
  const [infoMessage, setInfoMessage] = useState('')
  const [replyMessage, setReplyMessage] = useState('')
  const [replyFiles, setReplyFiles] = useState([])
  const replyFilesRef = useRef(replyFiles)
  replyFilesRef.current = replyFiles
  const [actionError, setActionError] = useState(null)
  const [acting, setActing] = useState(false)
  const [mode, setMode] = useState(null)
  const [linkedOrder, setLinkedOrder] = useState(null)

  const closeRejectDialog = useCallback(() => {
    if (acting) return
    setMode((current) => (current === 'reject' ? null : current))
    setRejectReason('')
  }, [acting])
  const handleRejectBackdropClick = useBackdropClose(closeRejectDialog)

  const showActions = canApprove && detail && ACTIONABLE.has(detail.status)
  const canSubmitDraft = Boolean(detail?.can_submit_draft)
  const canEditDraft = Boolean(detail?.can_edit_draft)
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

  const runAction = async (fn, { refreshWorkOrders = false } = {}) => {
    setActing(true)
    setActionError(null)
    try {
      await fn()
      notifyTabCountsChanged('work_requests')
      if (refreshWorkOrders) notifyTabCountsChanged('work_orders')
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

  const assertMessageLimit = (label, value) => {
    const limitError = firstCharacterLimitMessage([
      { key: 'remarks', label, value },
    ], maxLength) || findVisibleCharacterLimitError(document)
    if (limitError) throw new Error(limitError)
  }

  const sendReply = () => runAction(async () => {
    assertMessageLimit('Your reply', replyMessage)
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

  const submitDraft = () => runAction(async () => {
    await submitWorkRequestDraft(requestId)
  }, { refreshWorkOrders: true })

  const hierarchy = detail?.asset_hierarchy || []
  const technicians = detail?.assigned_technicians || []
  const statusDisplay = detail
    ? workRequestStatusDisplay(detail, {
      requestLabels: requestStatusLabels,
      workOrderLabels: workOrderStatusLabels,
    })
    : null
  const workOrderId = detail?.linked_work_order?.id || detail?.manual_work_order_id || null
  const showPostApproveAssign = Boolean(
    canApprove
    && detail?.status === 'approved'
    && workOrderId
    && technicians.length === 0
  )

  useEffect(() => {
    if (!workOrderId) {
      setLinkedOrder(null)
      return undefined
    }
    let cancelled = false
    getWorkOrderDetail(workOrderId, { prefer: getReceivedWorkOrder })
      .then((row) => {
        if (!cancelled) setLinkedOrder(row)
      })
      .catch(() => {
        if (!cancelled) setLinkedOrder(null)
      })
    return () => { cancelled = true }
  }, [workOrderId])

  const handleLinkedOrderUpdated = (updated) => {
    setLinkedOrder(updated)
    notifyTabCountsChanged('work_orders')
    notifyTabCountsChanged('work_requests')
    onUpdated?.()
    reload()
  }

  const linkedAssignmentActions = linkedOrder?.assignment_actions || {}
  const canEditLinkedAssignment = Boolean(
    showPostApproveAssign
    || linkedAssignmentActions.can_assign_department_technicians
    || linkedAssignmentActions.can_reassign_as_location_head
    || linkedAssignmentActions.can_claim_self
  )
  const linkedLifecycleActors = useMemo(() => {
    if (!linkedOrder) return null
    return resolveFormActors({
      formId: 'work_orders.manual',
      isOrgAdmin,
      profileId: user?.id,
      employeeId: session?.employee_id,
      isDepartmentHead: Boolean(session?.is_department_head),
      employeeDepartmentId: session?.department_id,
      canApproveIncoming: canUpdate('work_request_approve') || canUpdate('work_request_incoming'),
      isSupervisor: isOrgAdmin
        || canUpdate('work_orders_approve')
        || Boolean(linkedOrder.supervisor_id && user?.id && String(linkedOrder.supervisor_id) === String(user.id)),
      record: {
        created_by: linkedOrder.created_by,
        requested_by: linkedOrder.requester_id,
        assigned_department_id: linkedOrder.assigned_department_id,
        order_to_department_id: linkedOrder.assigned_department_id,
        supervisor_id: linkedOrder.supervisor_id,
        assignees: linkedOrder.assignees || [],
      },
    })
  }, [
    linkedOrder,
    isOrgAdmin,
    user?.id,
    session?.employee_id,
    session?.is_department_head,
    session?.department_id,
    canUpdate,
  ])
  const canEditLinkedLifecycle = Boolean(
    linkedLifecycleActors
    && (
      canEditWorkOrderStatusProgressRemarks(linkedLifecycleActors)
      || canEditWorkOrderSupervisorStatus(linkedLifecycleActors)
    ),
  )
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

  const displayLayout = layout
  const routingValueLabels = useMemo(() => {
    const map = {}
    if (!detail) return map
    for (const field of displayLayout?.fields || []) {
      const parsed = parseLayoutId(field.id)
      const key = field.bindKey || (parsed.kind === 'system' ? parsed.value : '')
      const label = String(field.label || '')
      if ((key === 'request_type' || /request\s*type/i.test(label)) && detail.request_type) {
        map[field.id] = requestTypeLabel(detail.request_type)
      }
      if ((key === 'order_from_department_id' || /order\s*from/i.test(label)) && detail.order_from?.name) {
        map[field.id] = detail.order_from.name
      }
      if ((key === 'order_to_department_id' || /order\s*to/i.test(label)) && detail.order_to?.name) {
        map[field.id] = detail.order_to.name
      }
    }
    return map
  }, [detail, displayLayout])
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
            <div className="wr-detail-sheet__heading">
              <p className="wr-detail-sheet__eyebrow">Work request</p>
              <h2 id="wr-detail-title" className="wr-detail-sheet__title">
                {detail
                  ? (detail.request_number || (detail.status === 'draft' ? 'Draft' : '—'))
                  : 'Loading…'}
              </h2>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {detail && canSaveTemplate ? (
              <SaveAsTemplateButton
                moduleKey="work_request"
                sourceRecordId={detail.id}
                defaultName={detail.short_description || detail.request_number || 'Work request'}
              />
            ) : null}
            <button type="button" className="wr-detail-sheet__close" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>
        </header>

        <div className="wr-detail-sheet__body">
          {loading && !detail && <p className="wo-received-detail__status">Loading…</p>}
          {error && <div className="wo-alert wo-alert--error">{error}</div>}

          {detail && (
            <div className="wr-detail-board">
              <div className="wr-detail-main">
                <div className="wr-detail-meta">
                  <MetaItem label="Status">
                    <span
                      className={`wo-status wo-status--${statusDisplay.key}${statusDisplay.pendingApprover && detail.pending_approvers?.[0] ? ' wo-status--with-avatar' : ''}`}
                      title={statusDisplay.title}
                    >
                      {statusDisplay.pendingApprover && detail.pending_approvers?.[0] && (
                        <EmployeeAvatar
                          employee={{
                            name: detail.pending_approvers[0].name,
                            photo_signed_url: detail.pending_approvers[0].photo_signed_url,
                            photo_url: detail.pending_approvers[0].photo_url,
                          }}
                          size="sm"
                          className="wo-status__avatar"
                        />
                      )}
                      <span className="wo-status__text">{statusDisplay.label}</span>
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
                    <MetaItem label="Asset">
                      {[equipment.name, equipment.code].filter(Boolean).join(' · ') || '—'}
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
                  {Array.isArray(detail.pending_approvers) && detail.pending_approvers.length > 0 && (
                    <MetaItem label="Approval required from">
                      <div className="wr-approvers">
                        {detail.pending_approvers.map((person) => (
                          <span key={person.id || person.name} className="wr-requester">
                            <EmployeeAvatar
                              employee={{
                                name: person.name,
                                photo_signed_url: person.photo_signed_url,
                              }}
                              size="sm"
                            />
                            <span className="wr-requester__copy">
                              <span className="wr-requester__name">{person.name || '—'}</span>
                              {(person.department?.name || person.department_name || person.role) && (
                                <span className="wr-requester__meta">
                                  {[
                                    person.department?.name || person.department_name,
                                    person.role,
                                  ].filter(Boolean).join(' · ')}
                                </span>
                              )}
                            </span>
                          </span>
                        ))}
                      </div>
                    </MetaItem>
                  )}
                  {detail.approver && !detail.pending_approvers?.length && (
                    <MetaItem label="Approved by">
                      <span className="wr-requester">
                        <EmployeeAvatar employee={detail.approver} size="sm" />
                        <span className="wr-requester__copy">
                          <span className="wr-requester__name">
                            {detail.approver.name || detail.approver.full_name || detail.approver.email || '—'}
                          </span>
                          {(detail.approver.department_name || detail.approver.department?.name || detail.approver.role) && (
                            <span className="wr-requester__meta">
                              {[
                                detail.approver.department_name || detail.approver.department?.name,
                                detail.approver.role,
                              ].filter(Boolean).join(' · ')}
                            </span>
                          )}
                        </span>
                      </span>
                    </MetaItem>
                  )}
                  <MetaItem label="Request date">{formatDate(detail.request_date)}</MetaItem>
                  {(detail.linked_work_order || detail.manual_work_order_id) && (
                    <MetaItem label="Work order">
                      {(() => {
                        const woLabel = detail.linked_work_order?.wo_number
                          || detail.manual_work_order_id?.slice(0, 8)
                          || 'Open work order'
                        const requesterId = detail.requested_by || detail.requester?.id || detail.requester?.profile_id
                        const isOrderFromViewer = Boolean(user?.id && requesterId && user.id === requesterId)
                        // Order From tracks progress on the work request — do not deep-link to WO page.
                        if (isOrderFromViewer || !org?.slug || !workOrderId) return woLabel
                        return (
                          <Link
                            to={orgPath(org.slug, `work-orders/all?open=${encodeURIComponent(workOrderId)}`)}
                            className="company-link"
                          >
                            {woLabel}
                          </Link>
                        )
                      })()}
                    </MetaItem>
                  )}
                </div>

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
                        valueLabels={routingValueLabels}
                        renderField={(key, props) => renderIncomingRequestInfoField(detail, key, props)}
                        assetPicker={({ className, field }) => {
                          const steps = hierarchyDisplaySteps(hierarchy)
                          if (!steps.length && !qrValue) {
                            return (
                              <div key={field?.id || 'asset_picker'} className={className}>
                                <p className="company-form__hint">No asset selected.</p>
                              </div>
                            )
                          }
                          return (
                            <div key={field?.id || 'asset_picker'} className={`wr-detail-equip ${className || ''}`.trim()}>
                              <AssetHierarchySummary steps={hierarchy} />
                              {qrValue ? (
                                <EquipmentQrCode
                                  value={qrValue}
                                  caption={{ label: 'QR code', value: equipment?.code || equipment?.name || qrValue }}
                                  fileName={equipment?.code || equipment?.name || 'asset-qr'}
                                />
                              ) : null}
                            </div>
                          )
                        }}
                        renderSection={(id, children, section) => {
                          const nodes = (Array.isArray(children) ? children : [children]).filter(Boolean)
                          if (!nodes.length) return null
                          const filledBy = section.filledBy || 'any'
                          return (
                            <section
                              key={id}
                              data-section-id={id}
                              className={`company-form__layout-section wo-section ${filledBy !== 'any' ? 'is-fillership-locked' : ''}`}
                            >
                              {section.label || section.badge ? (
                                <div className="wo-section__header company-form__layout-section-head">
                                  {section.label ? <h3 className="wo-section__title">{section.label}</h3> : null}
                                  {section.badge}
                                </div>
                              ) : null}
                              <div className={`wo-section__body company-form__layout-section-body ${section.label || section.badge ? '' : 'company-form__layout-section-body--flush'}`.trim()}>
                                <div className="company-form__grid company-form__grid--12">{nodes}</div>
                              </div>
                            </section>
                          )
                        }}
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
                            <dd><RichTextDisplay value={field.value} /></dd>
                          </div>
                        ))}
                      </dl>
                    </section>
                  )}

                <WorkRequestChecklistPanel
                  detail={detail}
                  readOnly={!canEditFilledBy('technician', formActors)}
                />

                {breakdownFields.length > 0 && (
                  <section className="wo-received-detail__section">
                    <h3>Breakdown</h3>
                    <dl className="wo-received-detail__fields">
                      {breakdownFields.map((field) => (
                        <div key={field.id} className="wo-received-detail__field">
                          <dt>{field.label}</dt>
                          <dd><RichTextDisplay value={field.value} /></dd>
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

                {(canEditDraft || canSubmitDraft) && (
                  <section className="wo-received-detail__section wo-assignment-actions">
                    <h3>Draft actions</h3>
                    <p className="wo-permit__hint">
                      Edit this draft, then save or submit to create the work request.
                    </p>
                    <div className="wr-actions">
                      {canEditDraft && org?.slug && (
                        <Link
                          to={orgPath(org.slug, `work-request/${detail.id}/edit`)}
                          className="company-btn company-btn--secondary"
                        >
                          Edit draft
                        </Link>
                      )}
                      {canSubmitDraft && (
                        <button
                          type="button"
                          className="company-btn company-btn--primary"
                          disabled={acting}
                          onClick={submitDraft}
                        >
                          {acting ? 'Submitting…' : 'Submit work request'}
                        </button>
                      )}
                    </div>
                  </section>
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
                        <FormLabel fieldType="textarea" limit={remarksLimit}>Your reply</FormLabel>
                        <SpellcheckInput
                          richText
                          multiline
                          className="company-form__input company-form__textarea"
                          rows={3}
                          value={replyMessage}
                          onChange={(e) => setReplyMessage(e.target.value)}
                          placeholder="Add the requested details"
                          disabled={acting}
                          maxLength={remarksLimit}
                        />
                      </label>
                      <WorkRequestAttachmentsField
                        label="Additional attachments"
                        description="Add photos or documents with your reply."
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
                          Approve
                        </button>
                        <button
                          type="button"
                          className="company-btn company-btn--outline wr-actions__info"
                          onClick={() => setMode('info')}
                          disabled={acting || mode === 'reject'}
                        >
                          Request More Info
                        </button>
                        <button
                          type="button"
                          className="company-btn company-btn--outline wr-actions__reject"
                          onClick={() => setMode('reject')}
                          disabled={acting || mode === 'reject'}
                        >
                          Reject
                        </button>
                      </div>
                    )}

                    {mode === 'approve' && (
                      <div className="wr-assign-block">
                        <p className="wo-permit__hint">
                          Approving creates a work order. You can assign technicians next, or leave it
                          Unassigned for anyone to pick up in Received work orders.
                        </p>
                        <div className="wr-actions">
                          <button
                            type="button"
                            className="company-btn company-btn--primary"
                            disabled={acting}
                            onClick={() => runAction(() => approveWorkRequest(requestId, {}), { refreshWorkOrders: true })}
                          >
                            {acting ? 'Saving…' : 'Confirm approval'}
                          </button>
                          <button
                            type="button"
                            className="company-btn company-btn--secondary"
                            onClick={() => setMode(null)}
                            disabled={acting}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {mode === 'info' && (
                      <div className="wr-assign-block">
                        <label className="company-form__field company-form__field--full">
                          <FormLabel fieldType="textarea" limit={remarksLimit}>Message to requester</FormLabel>
                          <SpellcheckInput
                            richText
                            multiline
                            className="company-form__input company-form__textarea"
                            rows={3}
                            value={infoMessage}
                            onChange={(e) => setInfoMessage(e.target.value)}
                            maxLength={remarksLimit}
                          />
                        </label>
                        <div className="wr-actions">
                          <button
                            type="button"
                            className="company-btn company-btn--primary"
                            disabled={acting || !infoMessage.trim()}
                            onClick={() => runAction(() => {
                              assertMessageLimit('Message to requester', infoMessage)
                              return requestWorkRequestInfo(requestId, infoMessage)
                            })}
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

                {linkedOrder && (
                  <>
                    <WorkOrderAssignmentActions
                      detail={linkedOrder}
                      onUpdated={handleLinkedOrderUpdated}
                      readOnly={!canEditLinkedAssignment}
                    />
                    <Suspense fallback={<div className="loading">Loading workflow…</div>}>
                      <WorkOrderLifecyclePanel
                        key={linkedOrder.id}
                        detail={linkedOrder}
                        onUpdated={handleLinkedOrderUpdated}
                        canUpdate={canEditLinkedLifecycle}
                        hideHeader
                        hideWorkRequestForm
                      />
                    </Suspense>
                  </>
                )}
              </div>
              <aside className="wr-detail-timeline" aria-label="Timeline">
                <h3 className="wr-detail-timeline__title">Timeline</h3>
                <RecordTimeline
                  events={hydrateTimelineAttachments(detail.timeline, detail.attachments)}
                  pendingApprovers={detail.pending_approvers}
                />
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
                runAction(() => {
                  assertMessageLimit('Rejection reason', rejectReason)
                  return rejectWorkRequest(requestId, rejectReason)
                })
              }}
            >
              <p className="company-modal__hint">
                This will reject the work request
                {detail?.request_number ? ` ${detail.request_number}` : ''}. This cannot be undone.
              </p>
              <label className="company-form__field">
                <FormLabel fieldType="textarea" limit={remarksLimit}>Rejection reason *</FormLabel>
                <SpellcheckInput
                  richText
                  multiline
                  className="company-form__input company-form__textarea"
                  rows={4}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Explain why this request is being rejected"
                  required
                  autoFocus
                  disabled={acting}
                  maxLength={remarksLimit}
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
