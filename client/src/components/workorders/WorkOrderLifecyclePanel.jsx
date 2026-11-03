import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { createManualWorkOrder, updateWorkOrderLifecycle } from '../../lib/api-work-orders'
import { useFormFieldValues } from '../../hooks/useFormFieldValues'
import { canEditFilledBy, resolveFormActors } from '../../lib/formFillership'
import { formFieldClassName, parseLayoutId } from '../../lib/formLayoutIds'
import {
  layoutHasSystemKey,
  lifecycleStagesForStatus,
  workOrderFormIdForSource,
} from '../../lib/workOrderForms'
import WorkOrderProcessLayout, { useWorkOrderProcessLayout } from './WorkOrderProcessLayout'
import { uploadWorkOrderFile } from '../../lib/workOrderAssets'
import { useOrg } from '../../hooks/useOrg'
import { useProfile } from '../../hooks/useProfile'
import { usePermissions } from '../../hooks/usePermissions'
import { useOrgStatusOptions } from '../../hooks/useOrgStatusOptions'
import { useTextFieldLimits } from '../../hooks/useTextFieldLimits'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import { orgPath } from '../../config/navigation'
import DateField from '../ui/DateField'
import FilterableSelect from '../ui/FilterableSelect'
import MasterPicker from '../forms/MasterPicker'
import { hydrateMasterValues, splitBoundValues } from '../../lib/formFieldSources'
import WorkOrderAttachmentsField from './WorkOrderAttachmentsField'
import WorkOrderDayTabs from './WorkOrderDayTabs'
import WorkOrderMaterialDetailsModal from './WorkOrderMaterialDetailsModal'
import WorkOrderMaterialRowsTable, { normalizeMaterialRows } from './WorkOrderMaterialRowsTable'
import WorkRequestFormSections from './WorkRequestFormSections'
import ChecklistExecution, { isChecklistComplete } from '../pm/ChecklistExecution'
import SpellcheckInput from '../shared/SpellcheckInput'
import FormLabel from '../shared/FormLabel'
import { AssetHierarchySummary } from '../workrequests/WorkRequestAssetFields'
import { hierarchyDisplaySteps } from '../../lib/assetHierarchy'
import { formatWorkOrderStatusLabel } from '../../lib/workOrderStatusLabel'
import {
  DAILY_SNAPSHOT_ACTIVE_STATUSES,
  blankExecutionForm,
  formPatchFromSnapshot,
  todayDateString,
} from '../../lib/workOrderDaySnapshot'
import './ManualWorkOrder.css'

const PERMIT_LABELS = {
  hot_work: 'Hot Work Permit',
  cold_work: 'Cold Work Permit',
  confined_space: 'Confined Space Permit',
  excavation: 'Excavation Permit',
  electrical_isolation: 'Electrical Isolation',
  loto: 'LOTO',
  height_work: 'Height Work',
  radiography: 'Radiography',
}

const STATUS_LABELS = {
  draft: 'Draft',
  assigned: 'Approval Pending',
  accepted: 'Accepted',
  started: 'Started',
  in_progress: 'In Progress',
  waiting_material: 'Waiting Material',
  waiting_shutdown: 'Waiting Shutdown',
  on_hold: 'On Hold',
  completed: 'Completed',
  verified: 'Verified',
  closed: 'Closed',
  returned_rework: 'Returned for Rework',
}

const SOURCE_LABELS = {
  approved_work_request: 'Work request',
  preventive_maintenance: 'Preventive maintenance',
  manual: 'Manual',
  breakdown: 'Work request',
  user_self_request: 'User self request',
}

function formatStatus(status, labelByKey = null, order = null) {
  if (order || status === 'assigned') {
    return formatWorkOrderStatusLabel(order ? { ...order, status } : status, labelByKey)
  }
  if (labelByKey?.[status]) return labelByKey[status]
  return STATUS_LABELS[status] || String(status || '').replace(/_/g, ' ')
}

function formatSource(sourceType) {
  if (!sourceType) return '—'
  return SOURCE_LABELS[sourceType] || String(sourceType).replace(/_/g, ' ')
}

const SUPERVISOR_STATUSES = new Set(['verified', 'closed', 'returned_rework'])
const MAINTENANCE_DOC_STATUSES = new Set([
  'accepted',
  'started',
  'in_progress',
  'waiting_material',
  'waiting_shutdown',
  'on_hold',
  'completed',
  'verified',
  'closed',
  'returned_rework',
])

function splitWorkOrderAttachments(attachments) {
  const list = Array.isArray(attachments) ? attachments : []
  return {
    requestFiles: list.filter((file) => file?.source !== 'execution'),
    executionFiles: list.filter((file) => file?.source === 'execution'),
  }
}

function toPendingFile(file) {
  return {
    file,
    name: file.name,
    size: file.size,
    type: file.type,
    previewUrl: file.type?.startsWith('image/') ? URL.createObjectURL(file) : null,
  }
}

function Field({ label, children, full = false, maxLength }) {
  return (
    <label className={`company-form__field${full ? ' company-form__field--full' : ''}`}>
      <FormLabel limit={maxLength}>{label}</FormLabel>
      {children}
    </label>
  )
}

function emptyMaterialRow() {
  return { code: '', description: '', uom: '', qty: '' }
}

function parseMaterialConsumed(value) {
  if (!value || !String(value).trim()) return [emptyMaterialRow()]
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) {
      const rows = parsed.map((row) => ({
        code: String(row?.code || ''),
        description: String(row?.description || ''),
        uom: String(row?.uom || ''),
        qty: row?.qty == null ? '' : String(row.qty),
      }))
      return rows.length ? rows : [emptyMaterialRow()]
    }
  } catch {
    // Legacy free-text values become a single description row.
  }
  return [{ ...emptyMaterialRow(), description: String(value).trim() }]
}

function serializeMaterialConsumed(rows) {
  const filled = (rows || []).filter((row) => (
    String(row.code || '').trim()
    || String(row.description || '').trim()
    || String(row.uom || '').trim()
    || String(row.qty || '').trim()
  )).map((row) => ({
    code: String(row.code || '').trim(),
    description: String(row.description || '').trim(),
    uom: String(row.uom || '').trim(),
    qty: String(row.qty || '').trim(),
  }))
  return filled.length ? JSON.stringify(filled) : ''
}

function parseDosDonts(value) {
  if (!value || !String(value).trim()) return { dos: '', donts: '' }
  try {
    const parsed = JSON.parse(value)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return {
        dos: String(parsed.dos || ''),
        donts: String(parsed.donts || parsed.dont || ''),
      }
    }
  } catch {
    // Legacy free-text values go into Do's.
  }
  return { dos: String(value), donts: '' }
}

function serializeDosDonts(dos, donts) {
  const nextDos = String(dos || '').trim()
  const nextDonts = String(donts || '').trim()
  if (!nextDos && !nextDonts) return ''
  return JSON.stringify({ dos: nextDos, donts: nextDonts })
}

function emptyPermitDetail(type) {
  return { type, number: '', issue_at: '', expiry_at: '' }
}

function parsePermitDetails(detail) {
  const types = Array.isArray(detail?.permit_types) ? detail.permit_types : []
  const raw = Array.isArray(detail?.permit_details) ? detail.permit_details : []
  const byType = new Map()
  const rows = []

  for (const row of raw) {
    const type = String(row?.type || '').trim()
    if (!type || byType.has(type)) continue
    const next = {
      type,
      number: String(row?.number || ''),
      issue_at: row?.issue_at || '',
      expiry_at: row?.expiry_at || '',
    }
    byType.set(type, next)
    rows.push(next)
  }

  if (!rows.length && types.length) {
    const [first, ...rest] = types
    rows.push({
      type: first,
      number: detail?.permit_number || '',
      issue_at: detail?.permit_issue_at || '',
      expiry_at: detail?.permit_expiry_at || '',
    })
    rest.forEach((type) => {
      if (byType.has(type)) return
      const next = emptyPermitDetail(type)
      byType.set(type, next)
      rows.push(next)
    })
  }

  for (const type of types) {
    if (byType.has(type)) continue
    const next = emptyPermitDetail(type)
    byType.set(type, next)
    rows.push(next)
  }

  return rows
}

function initialPermitDetails(detail) {
  const rows = parsePermitDetails(detail)
  if (Boolean(detail?.permit_required) && !rows.length) return [emptyPermitDetail('')]
  return rows
}

function CloseWorkOrderConfirm({ woNumber, statusLabel, saving, onCancel, onConfirm }) {
  const handleBackdropClick = useBackdropClose(saving ? () => {} : onCancel)
  return createPortal(
    <div
      className="company-modal-overlay company-modal-overlay--popup wo-close-confirm-overlay"
      onMouseDown={handleBackdropClick}
      role="presentation"
    >
      <div
        className="company-modal company-modal--popup"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wo-close-confirm-title"
      >
        <div className="company-modal__header">
          <h2 id="wo-close-confirm-title">Close work order</h2>
          <button
            type="button"
            className="company-modal__close"
            onClick={onCancel}
            disabled={saving}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="company-modal__form">
          <p className="company-modal__hint">
            This will mark {woNumber || 'this work order'} as {statusLabel}. Closed work orders cannot be reopened.
          </p>
          <div className="company-modal__actions">
            <button
              type="button"
              className="company-btn company-btn--secondary"
              onClick={onCancel}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="button"
              className="company-btn company-btn--primary"
              onClick={onConfirm}
              disabled={saving}
            >
              {saving ? 'Closing…' : 'Close work order'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function formFromDetail(detail) {
  const dosDonts = parseDosDonts(detail?.dos_and_donts)
  return {
    permit_required: Boolean(detail?.permit_required),
    permit_types: Array.isArray(detail?.permit_types) ? detail.permit_types : [],
    permit_details: initialPermitDetails(detail),
    permit_number: detail?.permit_number || '',
    permit_issue_at: detail?.permit_issue_at || '',
    permit_expiry_at: detail?.permit_expiry_at || '',
    work_start_at: detail?.work_start_at || '',
    work_end_at: detail?.work_end_at || '',
    vendor_id: detail?.vendor_id || '',
    vendor_expense: detail?.vendor_expense ?? '',
    vendor_currency: detail?.vendor_currency || 'USD',
    labour_count: detail?.labour_count ?? '',
    breakdown_start_at: detail?.breakdown_start_at || '',
    breakdown_end_at: detail?.breakdown_end_at || '',
    job_description: detail?.job_description || '',
    root_cause: detail?.root_cause || '',
    action_taken: detail?.action_taken || '',
    material_rows: parseMaterialConsumed(detail?.material_consumed),
    special_tools_used: detail?.special_tools_used || '',
    safety_precautions: detail?.safety_precautions || '',
    dos: dosDonts.dos,
    donts: dosDonts.donts,
    lessons_learned: detail?.lessons_learned || '',
    execution_remarks: detail?.execution_remarks || '',
    verification_remarks: detail?.verification_remarks || '',
    remarks: '',
    checklist_values: detail?.checklist_values && typeof detail.checklist_values === 'object'
      ? detail.checklist_values
      : {},
  }
}

export default function WorkOrderLifecyclePanel({
  detail,
  onUpdated,
  canUpdate = true,
  hideHeader = false,
  hideWorkRequestForm = false,
}) {
  const navigate = useNavigate()
  const { org } = useOrg()
  const { profile, employee } = useProfile()
  const { isOrgAdmin, canUpdate: canUpdateModule, canCreate, session } = usePermissions()
  const { labelByKey: statusLabels } = useOrgStatusOptions('work_order', { includeInactive: true })
  const { maxLength } = useTextFieldLimits()
  const { requestFiles, executionFiles } = splitWorkOrderAttachments(detail?.attachments)
  const [form, setForm] = useState(() => formFromDetail(detail))
  const [pendingFiles, setPendingFiles] = useState([])
  const [removedPaths, setRemovedPaths] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [showMaterialDetails, setShowMaterialDetails] = useState(false)
  const [showFollowUp, setShowFollowUp] = useState(false)
  const [creatingFollowUp, setCreatingFollowUp] = useState(false)
  const [followUpError, setFollowUpError] = useState(null)
  const [followUpSuccess, setFollowUpSuccess] = useState(null)
  const [followUp, setFollowUp] = useState({
    short_description: '',
    problem_description: '',
    priority: 'medium',
  })
  const [showRequestForm, setShowRequestForm] = useState(() => Boolean(detail?.work_request))
  const [confirmClose, setConfirmClose] = useState(false)
  const [activeDayId, setActiveDayId] = useState(null)
  const [todayDraft, setTodayDraft] = useState(null)

  const dayLogs = detail?.daily_logs || []
  const todayKey = todayDateString()
  const todayLog = useMemo(
    () => dayLogs.find((row) => row.log_date === todayKey) || null,
    [dayLogs, todayKey],
  )
  const activeDay = useMemo(
    () => dayLogs.find((row) => row.id === activeDayId) || null,
    [dayLogs, activeDayId],
  )
  const viewingPastDay = Boolean(activeDay && activeDay.log_date !== todayKey)
  const snapshotActive = DAILY_SNAPSHOT_ACTIVE_STATUSES.has(detail?.status)
  const needsBlankToday = Boolean(snapshotActive && !todayLog && dayLogs.length > 0 && !viewingPastDay)

  const hasDailyLogs = dayLogs.length > 0

  const resolveFormForDetail = (nextDetail, preferredDayId = null) => {
    const logs = nextDetail?.daily_logs || []
    const today = todayDateString()
    const todayRow = logs.find((row) => row.log_date === today) || null
    const preferred = preferredDayId
      ? logs.find((row) => row.id === preferredDayId) || null
      : null
    const base = formFromDetail(nextDetail)

    if (preferred && preferred.log_date !== today) {
      return {
        dayId: preferred.id,
        form: {
          ...base,
          ...formPatchFromSnapshot(preferred.field_snapshot || {}, { blankMissing: true }),
        },
        draft: null,
      }
    }
    if (DAILY_SNAPSHOT_ACTIVE_STATUSES.has(nextDetail?.status) && !todayRow && logs.length > 0) {
      return {
        dayId: null,
        form: {
          ...base,
          ...formPatchFromSnapshot({}, { blankMissing: true }),
          material_rows: blankExecutionForm().material_rows,
          checklist_values: {},
        },
        draft: 'blank',
      }
    }
    if (todayRow) {
      return {
        dayId: todayRow.id,
        form: { ...base, ...formPatchFromSnapshot(todayRow.field_snapshot || {}) },
        draft: null,
      }
    }
    return { dayId: null, form: base, draft: null }
  }

  useEffect(() => {
    const resolved = resolveFormForDetail(detail)
    setForm(resolved.form)
    setActiveDayId(resolved.dayId)
    setTodayDraft(resolved.draft)
    setPendingFiles([])
    setRemovedPaths([])
    setError(null)
    setShowFollowUp(false)
    setConfirmClose(false)
  }, [detail?.id, detail?.updated_at, detail?.status, dayLogs.length, todayKey])

  const nextStatuses = useMemo(
    () => detail?.allowed_next_statuses || [],
    [detail?.allowed_next_statuses],
  )

  const isTechnician = useMemo(
    () => (detail?.assignees || []).some((row) => row.id === employee?.id),
    [detail?.assignees, employee?.id],
  )
  const canSupervise = Boolean(
    isOrgAdmin
    || canUpdateModule('work_orders_approve')
    || detail?.created_by === profile?.id
    || detail?.supervisor_id === profile?.id
    || detail?.assignment_actions?.can_reassign_as_location_head,
  )
  const processFormId = workOrderFormIdForSource(detail?.source_type)
  const processStages = lifecycleStagesForStatus(detail?.status)
  const { layout: processLayout } = useWorkOrderProcessLayout(processFormId, processStages)
  const processExtras = useFormFieldValues(processFormId, detail?.id || null)
  const extrasWithNative = useMemo(
    () => hydrateMasterValues(processFormId, processLayout, detail, processExtras.values),
    [processFormId, processLayout, detail, processExtras.values],
  )
  const processActors = resolveFormActors({
    formId: processFormId,
    isOrgAdmin,
    profileId: profile?.id,
    employeeId: employee?.id,
    isDepartmentHead: Boolean(session?.is_department_head || employee?.is_department_head),
    employeeDepartmentId: session?.department_id || employee?.department_id,
    isSupervisor: canSupervise,
    record: {
      created_by: detail?.created_by,
      assigned_department_id: detail?.assigned_department_id,
      order_to_department_id: detail?.assigned_department_id,
      supervisor_id: detail?.supervisor_id,
      assignees: detail?.assignees,
    },
  })
  const visibleStatuses = nextStatuses.filter((status) => {
    if (status === 'accepted') return false
    if (SUPERVISOR_STATUSES.has(status)) return canSupervise
    return isTechnician || canSupervise
  })
  const keptExecutionFiles = executionFiles.filter((file) => !removedPaths.includes(file.path))

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const permitTypeOptions = detail?.permit_type_options || Object.keys(PERMIT_LABELS)
  const permitRows = form.permit_details?.length ? form.permit_details : [emptyPermitDetail('')]

  const syncPermitTypes = (rows) => rows.map((row) => row.type).filter(Boolean)

  const setPermitRequired = (required) => {
    setForm((prev) => {
      if (!required) {
        return {
          ...prev,
          permit_required: false,
          permit_types: [],
          permit_details: [],
        }
      }
      const rows = (prev.permit_details || []).length
        ? prev.permit_details
        : [emptyPermitDetail('')]
      return {
        ...prev,
        permit_required: true,
        permit_details: rows,
        permit_types: syncPermitTypes(rows),
      }
    })
  }

  const addPermit = () => {
    setForm((prev) => {
      const rows = [...(prev.permit_details || []), emptyPermitDetail('')]
      return { ...prev, permit_details: rows, permit_types: syncPermitTypes(rows) }
    })
  }

  const removePermit = (index) => {
    setForm((prev) => {
      const next = (prev.permit_details || []).filter((_, i) => i !== index)
      const rows = next.length ? next : [emptyPermitDetail('')]
      return { ...prev, permit_details: rows, permit_types: syncPermitTypes(rows) }
    })
  }

  const changePermitType = (index, nextType) => {
    setForm((prev) => {
      const rows = (prev.permit_details || []).map((row, i) => (
        i === index ? { ...row, type: nextType } : row
      ))
      return { ...prev, permit_details: rows, permit_types: syncPermitTypes(rows) }
    })
  }

  const updatePermitDetail = (index, key, value) => {
    setForm((prev) => ({
      ...prev,
      permit_details: (prev.permit_details || []).map((row, i) => (
        i === index ? { ...row, [key]: value } : row
      )),
    }))
  }

  const buildPayload = (status) => {
    const filledPermitDetails = (form.permit_details || []).filter((row) => row.type)
    const payload = {
      status,
      permit_required: form.permit_required,
      permit_types: filledPermitDetails.map((row) => row.type),
      permit_details: filledPermitDetails.map((row) => ({
        type: row.type,
        number: String(row.number || '').trim(),
        issue_at: row.issue_at || null,
        expiry_at: row.expiry_at || null,
      })),
      permit_number: String(filledPermitDetails[0]?.number || form.permit_number || '').trim() || null,
      permit_issue_at: filledPermitDetails[0]?.issue_at || form.permit_issue_at || null,
      permit_expiry_at: filledPermitDetails[0]?.expiry_at || form.permit_expiry_at || null,
      work_start_at: form.work_start_at || null,
      work_end_at: form.work_end_at || null,
      vendor_id: form.vendor_id || null,
      vendor_expense: form.vendor_expense === '' ? null : Number(form.vendor_expense),
      vendor_currency: form.vendor_currency || 'USD',
      labour_count: form.labour_count === '' ? null : Number(form.labour_count),
      breakdown_start_at: form.breakdown_start_at || null,
      breakdown_end_at: form.breakdown_end_at || null,
      job_description: form.job_description.trim() || null,
      root_cause: form.root_cause.trim() || null,
      action_taken: form.action_taken.trim() || null,
      material_consumed: serializeMaterialConsumed(form.material_rows) || null,
      special_tools_used: form.special_tools_used.trim() || null,
      safety_precautions: form.safety_precautions.trim() || null,
      dos_and_donts: serializeDosDonts(form.dos, form.donts) || null,
      lessons_learned: form.lessons_learned.trim() || null,
      execution_remarks: form.execution_remarks.trim() || null,
      verification_remarks: form.verification_remarks.trim() || null,
      remarks: form.remarks.trim() || null,
      checklist_values: form.checklist_values || {},
    }
    return payload
  }

  const run = async (status) => {
    setSaving(true)
    setError(null)
    try {
      if (!org?.id) throw new Error('Organization is not available.')
      if (
        ['completed', 'verified', 'closed'].includes(status)
        && detail.checklist_snapshot
        && !isChecklistComplete(detail.checklist_snapshot, form.checklist_values)
      ) {
        throw new Error('Complete the checklist before marking this work order completed.')
      }
      const uploaded = []
      for (const item of pendingFiles) {
        const meta = await uploadWorkOrderFile(org.id, detail.id, 'execution', item.file, 'file')
        uploaded.push({ ...meta, source: 'execution' })
      }
      if (viewingPastDay) {
        throw new Error('Past days are read-only. Select Today to edit and save.')
      }
      const { native } = splitBoundValues(processFormId, processExtras.values, processLayout)
      const payload = {
        ...buildPayload(status),
        execution_attachments: [...keptExecutionFiles, ...uploaded],
        process_extras: processExtras.values || {},
        time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }
      if (native.vendor_id) payload.vendor_id = native.vendor_id
      const updated = await updateWorkOrderLifecycle(detail.id, payload)
      if (Object.keys(processExtras.values || {}).length) {
        await processExtras.save(detail.id)
      }
      pendingFiles.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
      })
      setPendingFiles([])
      setRemovedPaths([])
      setForm((prev) => ({ ...prev, remarks: '' }))
      onUpdated?.(updated)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
      if (status === 'closed') setConfirmClose(false)
    }
  }

  const canCreateManual = canCreate('work_orders_manual') || canCreate('work_orders')

  const openFollowUpForm = () => {
    const woLabel = detail.wo_number || 'PM work order'
    const baseProblem = detail.short_description || detail.problem_description || detail.summary || ''
    setFollowUp({
      short_description: `Follow-up from ${woLabel}`.slice(0, maxLength('short_description') || 200),
      problem_description: [
        `Unusual finding / repair needed from scheduled PM work order ${woLabel}.`,
        baseProblem ? `PM summary: ${baseProblem}` : '',
        form.remarks.trim() ? `Technician remarks: ${form.remarks.trim()}` : '',
      ].filter(Boolean).join('\n\n').slice(0, maxLength('problem_description') || 2000),
      priority: detail.priority || 'medium',
    })
    setFollowUpError(null)
    setFollowUpSuccess(null)
    setShowFollowUp(true)
  }

  const createFollowUpWorkOrder = async () => {
    const shortDescription = String(followUp.short_description || '').trim()
    const problemDescription = String(followUp.problem_description || '').trim()
    if (!shortDescription && !problemDescription) {
      setFollowUpError('Enter a short description or details for the follow-up work order.')
      return
    }
    setCreatingFollowUp(true)
    setFollowUpError(null)
    setFollowUpSuccess(null)
    try {
      // Persist checklist / remarks on the PM work order first when possible
      if (canUpdate) {
        try {
          await run(undefined)
        } catch {
          // still allow follow-up creation
        }
      }
      const created = await createManualWorkOrder({
        status: 'created',
        values: {},
        assignedEmployeeIds: [],
        assignedDepartmentId: detail.assigned_department_id || null,
        assignedLocationId: detail.assigned_location_id || null,
        shortDescription: shortDescription || problemDescription.slice(0, maxLength('short_description') || 200),
        problemDescription: problemDescription || shortDescription,
        priority: followUp.priority || 'medium',
        equipmentId: detail.equipment_id || null,
        workCenter: detail.work_center || null,
      })
      const createdId = created?.id
      const createdNumber = created?.wo_number || 'Work order'
      setFollowUpSuccess(`${createdNumber} created.`)
      setShowFollowUp(false)
      if (org?.slug && createdId) {
        navigate(orgPath(org.slug, `work-orders/manual/${createdId}/edit`))
      }
    } catch (err) {
      setFollowUpError(err.message || 'Failed to create follow-up work order.')
    } finally {
      setCreatingFollowUp(false)
    }
  }

  if (!detail) return null

  const isPmScheduled = detail.source_type === 'preventive_maintenance' || Boolean(detail.pm_plan_id)
  const hasChecklist = (detail.checklist_snapshot?.fields || []).some((field) => field.section_id)

  const fieldsReadOnly = viewingPastDay
    || !canUpdate
    || !canEditFilledBy('technician', processActors)

  const checklistComplete = !hasChecklist
    || isChecklistComplete(detail.checklist_snapshot, form.checklist_values)

  const checklistBlock = hasChecklist && isTechnician ? (
    <ChecklistExecution
      snapshot={detail.checklist_snapshot}
      values={form.checklist_values}
      onChange={(next) => setField('checklist_values', next)}
      disabled={fieldsReadOnly}
      record={detail}
      recordKind="work_order"
    />
  ) : null

  const materialConsumedField = (
    <div className="company-form__field company-form__field--full">
      <div className="wo-material-summary__label-row">
        <span className="company-form__label">
          <span>Material consumed</span>
          <span className="company-form__char-limit">Max {maxLength('material_consumed')}</span>
        </span>
        {hasDailyLogs && (
          <button
            type="button"
            className="company-link"
            onClick={() => setShowMaterialDetails(true)}
          >
            All days
          </button>
        )}
      </div>
      {fieldsReadOnly ? (
        <WorkOrderMaterialRowsTable
          rows={normalizeMaterialRows(form.material_rows)}
          readOnly
          descriptionMaxLength={maxLength('material_consumed')}
        />
      ) : (
        <WorkOrderMaterialRowsTable
          rows={form.material_rows}
          onChange={(next) => setField('material_rows', next)}
          descriptionMaxLength={maxLength('material_consumed')}
        />
      )}
    </div>
  )

  const dosDontsField = (
    <div className="company-form__field company-form__field--full">
      <div className="wo-dos-donts">
        <div className="wo-dos-donts__col">
          <div className="wo-dos-donts__header wo-dos-donts__header--dos">
            Do&apos;s
            <span className="company-form__char-limit">Max {maxLength('dos_and_donts')}</span>
          </div>
          <SpellcheckInput
            multiline
            className="company-form__input company-form__textarea wo-dos-donts__input"
            rows={4}
            value={form.dos}
            onChange={(e) => setField('dos', e.target.value)}
            aria-label="Do's"
            maxLength={maxLength('dos_and_donts')}
          />
        </div>
        <div className="wo-dos-donts__col">
          <div className="wo-dos-donts__header wo-dos-donts__header--donts">
            Don&apos;ts
            <span className="company-form__char-limit">Max {maxLength('dos_and_donts')}</span>
          </div>
          <SpellcheckInput
            multiline
            className="company-form__input company-form__textarea wo-dos-donts__input"
            rows={4}
            value={form.donts}
            onChange={(e) => setField('donts', e.target.value)}
            aria-label="Don'ts"
            maxLength={maxLength('dos_and_donts')}
          />
        </div>
      </div>
    </div>
  )

  const renderLifecycleField = (key, props = {}) => {
    const className = props.className || formFieldClassName(props.field)
    const requiredMark = props.required ? ' *' : ''
    const locked = saving || !canUpdate || Boolean(props.disabled)

    if (key === 'permit_details') {
      return (
        <div key={key} className={[className, 'wo-permit'].filter(Boolean).join(' ')}>
          <div className="company-form__field">
            <span className="company-form__label">Permit required{requiredMark}</span>
            <FilterableSelect
              value={form.permit_required ? 'yes' : 'no'}
              onChange={(next) => setPermitRequired(next === 'yes')}
              options={[
                { value: 'yes', label: 'Yes' },
                { value: 'no', label: 'No' },
              ]}
              getOptionValue={(opt) => opt.value}
              getOptionLabel={(opt) => opt.label}
              allowEmpty={false}
              className="company-form__input--select"
              aria-label="Permit required"
              disabled={locked}
            />
          </div>
          {form.permit_required && (
            <div className="wo-permit__entries">
              {permitRows.map((permitRow, index) => {
                const usedTypes = new Set(
                  permitRows
                    .map((row, rowIndex) => (rowIndex === index ? '' : row.type))
                    .filter(Boolean),
                )
                const typeOptions = permitTypeOptions.filter(
                  (type) => !usedTypes.has(type) || type === permitRow.type,
                )
                return (
                  <div key={`permit-${index}`} className="wo-permit__entry">
                    <div className="wo-permit__row">
                      <div className="wo-permit__cell wo-permit__cell--type">
                        <span className="company-form__label">Permit type</span>
                        <FilterableSelect
                          value={permitRow.type}
                          onChange={(nextType) => changePermitType(index, nextType)}
                          options={typeOptions}
                          getOptionValue={(type) => type}
                          getOptionLabel={(type) => PERMIT_LABELS[type] || type}
                          placeholder="Select permit type"
                          className="company-form__input--select"
                          aria-label={`Permit type ${index + 1}`}
                          disabled={locked}
                        />
                      </div>
                      {Boolean(permitRow.type) && (
                        <>
                          <label className="wo-permit__cell wo-permit__cell--number">
                            <span className="company-form__label">Permit number</span>
                            <input
                              className="company-form__input"
                              value={permitRow.number}
                              onChange={(e) => updatePermitDetail(index, 'number', e.target.value)}
                              placeholder="Enter permit number"
                              disabled={locked}
                            />
                          </label>
                          <label className="wo-permit__cell wo-permit__cell--date">
                            <span className="company-form__label">Date</span>
                            <DateField
                              value={permitRow.issue_at}
                              onChange={(v) => updatePermitDetail(index, 'issue_at', v)}
                              disabled={locked}
                            />
                          </label>
                          <label className="wo-permit__cell wo-permit__cell--date">
                            <span className="company-form__label">Expiry date</span>
                            <DateField
                              value={permitRow.expiry_at}
                              onChange={(v) => updatePermitDetail(index, 'expiry_at', v)}
                              disabled={locked}
                            />
                          </label>
                        </>
                      )}
                      {permitRows.length > 1 && (
                        <div className="wo-permit__cell wo-permit__cell--actions">
                          <button
                            type="button"
                            className="company-btn company-btn--ghost company-btn--compact"
                            onClick={() => removePermit(index)}
                            disabled={locked}
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
              {permitTypeOptions.some((type) => !permitRows.some((row) => row.type === type)) && (
                <button type="button" className="wo-permit__add" onClick={addPermit} disabled={locked}>
                  + Add permit
                </button>
              )}
            </div>
          )}
        </div>
      )
    }

    if (key === 'work_stamps') {
      return (
        <div key={key} className={className} style={{ gridColumn: '1 / -1' }}>
          <div className="company-form__grid">
            <div className="company-form__field">
              <FormLabel>Work start{requiredMark}</FormLabel>
              <DateField
                value={form.work_start_at}
                onChange={(v) => setField('work_start_at', v)}
                withTime
                disabled={locked}
              />
            </div>
            <div className="company-form__field">
              <FormLabel>Work end{requiredMark}</FormLabel>
              <DateField
                value={form.work_end_at}
                onChange={(v) => setField('work_end_at', v)}
                withTime
                disabled={locked}
              />
            </div>
          </div>
        </div>
      )
    }

    if (key === 'labour_count') {
      return (
        <label key={key} className={className}>
          <span className="company-form__label">Labour count{requiredMark}</span>
          <input
            type="number"
            min="0"
            className="company-form__input"
            value={form.labour_count}
            onChange={(e) => setField('labour_count', e.target.value)}
            disabled={locked}
          />
        </label>
      )
    }

    if (key === 'vendor_id') {
      return (
        <label key={key} className={className}>
          <span className="company-form__label">Vendor{requiredMark}</span>
          <MasterPicker
            sourceId="vendors"
            formId={processFormId}
            value={form.vendor_id}
            onChange={(value) => setField('vendor_id', value || '')}
            required={Boolean(props.required)}
            disabled={locked}
          />
        </label>
      )
    }

    if (key === 'vendor_expense') {
      return (
        <label key={key} className={className}>
          <span className="company-form__label">Vendor expense{requiredMark}</span>
          <input
            type="number"
            min="0"
            step="0.01"
            className="company-form__input"
            value={form.vendor_expense}
            onChange={(e) => setField('vendor_expense', e.target.value)}
            disabled={locked}
          />
        </label>
      )
    }

    if (key === 'breakdown_times') {
      return (
        <div key={key} className={className} style={{ gridColumn: '1 / -1' }}>
          <div className="company-form__grid">
            <Field label="Breakdown start">
              <DateField
                value={form.breakdown_start_at}
                onChange={(v) => setField('breakdown_start_at', v)}
                withTime
                disabled={locked}
              />
            </Field>
            <Field label="Breakdown end">
              <DateField
                value={form.breakdown_end_at}
                onChange={(v) => setField('breakdown_end_at', v)}
                withTime
                disabled={locked}
              />
            </Field>
          </div>
        </div>
      )
    }

    if (key === 'daily_logs') return null

    if (key === 'material_consumed') return <div key={key} className={className}>{materialConsumedField}</div>
    if (key === 'dos_and_donts') return <div key={key} className={className}>{dosDontsField}</div>
    if (key === 'checklist_execution') return <div key={key} className={className}>{checklistBlock}</div>

    const textMap = {
      job_description: ['Detailed job description', 'job_description'],
      root_cause: ['Root cause analysis', 'root_cause'],
      action_taken: ['Action taken', 'action_taken'],
      special_tools_used: ['Special tools used', 'special_tools_used'],
      safety_precautions: ['Safety precautions', 'safety_precautions'],
      lessons_learned: ['Lessons learned', 'lessons_learned'],
      execution_remarks: ['Remarks', 'execution_remarks'],
      verification_remarks: ['Verification remarks', 'verification_remarks'],
    }
    if (textMap[key]) {
      const [label, formKey] = textMap[key]
      return (
        <label key={key} className={className}>
          <FormLabel limit={maxLength(formKey)}>{label}{requiredMark}</FormLabel>
          <SpellcheckInput
            multiline
            className="company-form__input company-form__textarea"
            rows={2}
            value={form[formKey]}
            onChange={(e) => setField(formKey, e.target.value)}
            maxLength={maxLength(formKey)}
            disabled={locked}
          />
        </label>
      )
    }

    if (key === 'execution_files') {
      return (
        <div key={key} className={className}>
          <span className="company-form__label">Technician photos &amp; files{requiredMark}</span>
          <p className="wo-permit__hint">
            Assigned technicians can attach images and documents of the work performed.
          </p>
          <WorkOrderAttachmentsField
            files={keptExecutionFiles}
            pendingFiles={pendingFiles}
            disabled={locked}
            onAddPending={(files) => setPendingFiles((prev) => [
              ...prev,
              ...files.map(toPendingFile),
            ])}
            onRemovePending={(index) => setPendingFiles((prev) => {
              const next = [...prev]
              const [removed] = next.splice(index, 1)
              if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl)
              return next
            })}
            onRemoveFile={(file) => {
              if (file?.path) setRemovedPaths((prev) => [...prev, file.path])
            }}
          />
        </div>
      )
    }

    return null
  }

  const openForPickup = !(detail?.assignees || []).length
    && Boolean(detail?.work_request_id)
    && ['assigned', 'accepted'].includes(detail?.status)

  const canEditExecution = canEditFilledBy('technician', processActors)
  const canEditCloseout = canEditFilledBy('supervisor', processActors)
  const canSaveLifecycle = canUpdate && !viewingPastDay && (canEditExecution || canEditCloseout)
  const statusActionsBlock = canSaveLifecycle && !openForPickup ? (
    <section className={`wo-received-detail__section wo-assignment-actions${isPmScheduled ? ' wo-assignment-actions--pm' : ''}`}>
      {!isPmScheduled && (
        <h3>{canSupervise && !isTechnician ? 'Supervisor actions' : 'Status actions'}</h3>
      )}
      {isPmScheduled && (
        <div className="pm-wo-actions__intro">
          <h3>Complete scheduled work</h3>
          <p className="wo-permit__hint">
            Finish the checklist above, record material consumed and Do&apos;s / Don&apos;ts if needed,
            then save or update status. Create a regular work order if you find something unusual
            that needs repair or service.
          </p>
        </div>
      )}
      <Field label={isPmScheduled ? 'Remarks' : 'Action remarks'} full maxLength={maxLength('remarks')}>
        <SpellcheckInput
          multiline
          className="company-form__input company-form__textarea"
          rows={isPmScheduled ? 3 : 2}
          value={form.remarks}
          onChange={(e) => setField('remarks', e.target.value)}
          placeholder={isPmScheduled
            ? 'Notes from this PM visit (findings, observations, issues…)'
            : 'Optional remarks for timeline / audit'}
          maxLength={maxLength('remarks')}
        />
      </Field>
      {error && <div className="wo-alert wo-alert--error" role="alert">{error}</div>}
      {followUpSuccess && (
        <div className="wo-alert wo-alert--success" role="status">{followUpSuccess}</div>
      )}
      <div className="wr-actions" style={{ flexWrap: 'wrap' }}>
        <button
          type="button"
          className="company-btn company-btn--secondary"
          disabled={saving || creatingFollowUp}
          onClick={() => run(undefined)}
        >
          {saving ? 'Saving…' : isPmScheduled ? 'Save checklist' : 'Save details'}
        </button>
        {visibleStatuses.map((status) => {
          const needsChecklist = ['completed', 'verified', 'closed'].includes(status)
          const blockedByChecklist = needsChecklist && hasChecklist && isTechnician && !checklistComplete
          return (
            <button
              key={status}
              type="button"
              className={`company-btn ${status === 'closed' || status === 'verified' || status === 'completed' ? 'company-btn--primary' : 'company-btn--secondary'}`}
              disabled={saving || creatingFollowUp || blockedByChecklist}
              title={blockedByChecklist ? 'Complete the checklist before marking completed' : undefined}
              onClick={() => (status === 'closed' ? setConfirmClose(true) : run(status))}
            >
              {formatStatus(status, statusLabels)}
            </button>
          )
        })}
        {isPmScheduled && canCreateManual && (
          <button
            type="button"
            className="company-btn company-btn--secondary pm-wo-followup-btn"
            disabled={saving || creatingFollowUp}
            onClick={openFollowUpForm}
          >
            Create regular work order
          </button>
        )}
      </div>

      {isPmScheduled && showFollowUp && (
        <div className="pm-wo-followup">
          <h4 className="pm-wo-followup__title">New regular work order</h4>
          <p className="wo-permit__hint">
            Use this for unusual findings that need repair or additional service beyond the PM checklist.
          </p>
          {followUpError && <div className="wo-alert wo-alert--error" role="alert">{followUpError}</div>}
          <div className="company-form__grid company-form__grid--2">
            <label className="company-form__field company-form__field--full">
              <FormLabel limit={maxLength('short_description')}>Short description *</FormLabel>
              <SpellcheckInput
                className="company-form__input"
                value={followUp.short_description}
                onChange={(e) => setFollowUp((prev) => ({ ...prev, short_description: e.target.value }))}
                placeholder="Brief summary of the issue"
                maxLength={maxLength('short_description')}
              />
            </label>
            <label className="company-form__field company-form__field--full">
              <FormLabel limit={maxLength('problem_description')}>Details</FormLabel>
              <SpellcheckInput
                multiline
                className="company-form__input company-form__textarea"
                rows={4}
                value={followUp.problem_description}
                onChange={(e) => setFollowUp((prev) => ({ ...prev, problem_description: e.target.value }))}
                placeholder="Describe the unusual finding and work needed"
                maxLength={maxLength('problem_description')}
              />
            </label>
            <label className="company-form__field">
              <span className="company-form__label">Priority</span>
              <FilterableSelect
                value={followUp.priority}
                onChange={(value) => setFollowUp((prev) => ({ ...prev, priority: value }))}
                options={[
                  { value: 'high', label: 'High' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'low', label: 'Low' },
                ]}
                getOptionValue={(row) => row.value}
                getOptionLabel={(row) => row.label}
                allowEmpty={false}
              />
            </label>
          </div>
          <div className="wr-actions" style={{ flexWrap: 'wrap', marginTop: 12 }}>
            <button
              type="button"
              className="company-btn company-btn--secondary"
              disabled={creatingFollowUp}
              onClick={() => setShowFollowUp(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="company-btn company-btn--primary"
              disabled={creatingFollowUp}
              onClick={createFollowUpWorkOrder}
            >
              {creatingFollowUp ? 'Creating…' : 'Create work order'}
            </button>
          </div>
        </div>
      )}
    </section>
  ) : null

  return (
    <div className="wo-lifecycle">
      {hideHeader ? null : (
      <section className="wo-received-detail__section">
        <h3>Header</h3>
        <dl className="wo-received-detail__fields">
          <div className="wo-received-detail__field">
            <dt>Work order</dt>
            <dd>{detail.wo_number || '—'}</dd>
          </div>
          <div className="wo-received-detail__field">
            <dt>Source</dt>
            <dd>{formatSource(detail.source_type)}</dd>
          </div>
          <div className="wo-received-detail__field">
            <dt>Job nature</dt>
            <dd>{detail.job_nature || '—'}</dd>
          </div>
          <div className="wo-received-detail__field">
            <dt>Priority</dt>
            <dd style={{ textTransform: 'capitalize' }}>{detail.priority || '—'}</dd>
          </div>
          <div className="wo-received-detail__field">
            <dt>Work center</dt>
            <dd>{detail.work_center || '—'}</dd>
          </div>
          <div className="wo-received-detail__field wo-received-detail__field--full">
            <dt>Short description</dt>
            <dd>{detail.short_description || detail.summary || '—'}</dd>
          </div>
          <div className="wo-received-detail__field wo-received-detail__field--full">
            <dt>Problem</dt>
            <dd style={{ whiteSpace: 'pre-wrap' }}>{detail.problem_description || '—'}</dd>
          </div>
        </dl>
      </section>
      )}

      {!hideWorkRequestForm && detail.work_request && (
        <WorkRequestFormSections
          workRequest={detail.work_request}
          onHasSections={setShowRequestForm}
        />
      )}

      {!hideWorkRequestForm && !showRequestForm && hierarchyDisplaySteps(detail.asset_hierarchy).length > 0 && (
        <section className="wo-received-detail__section">
          <h3>Asset information</h3>
          <AssetHierarchySummary steps={detail.asset_hierarchy} />
        </section>
      )}

      {!hideWorkRequestForm && requestFiles.length > 0 && (
        <section className="wo-received-detail__section">
          <h3>Request attachments</h3>
          <WorkOrderAttachmentsField files={requestFiles} readOnly />
        </section>
      )}

      {!openForPickup && hasDailyLogs && (
        <div className="wo-received-detail__section wo-day-tabs-wrap">
          <WorkOrderDayTabs
            logs={dayLogs}
            activeLogId={activeDayId}
            todayLogId={todayLog?.id}
            showNewToday={!todayLog}
            newTodayActive={activeDayId == null && todayDraft === 'blank'}
            onSelect={(logId) => {
              if (logId == null) {
                const resolved = resolveFormForDetail(detail, null)
                setActiveDayId(null)
                setTodayDraft('blank')
                setForm(resolved.form)
                return
              }
              const log = dayLogs.find((row) => row.id === logId)
              if (!log) return
              if (log.log_date === todayKey) {
                const resolved = resolveFormForDetail(detail, log.id)
                setActiveDayId(log.id)
                setTodayDraft(null)
                setForm(resolved.form)
                return
              }
              setActiveDayId(log.id)
              setTodayDraft(null)
              setForm((prev) => {
                const base = formFromDetail(detail)
                const isPast = log.log_date !== todayKey
                return {
                  ...base,
                  ...formPatchFromSnapshot(log.field_snapshot || {}, { blankMissing: isPast }),
                }
              })
            }}
          />
          {needsBlankToday ? (
            <p className="wo-day-tabs__hint">New calendar day — enter today’s work below, then save.</p>
          ) : null}
          {viewingPastDay ? (
            <p className="wo-day-tabs__hint">Viewing a past day (read-only). Select Today to continue work.</p>
          ) : null}
        </div>
      )}

      {!openForPickup && (
        <WorkOrderProcessLayout
          formId={processFormId}
          stages={processStages}
          extrasValues={
            viewingPastDay && activeDay?.field_snapshot?.process_extras
              ? { ...extrasWithNative, ...activeDay.field_snapshot.process_extras }
              : todayDraft === 'blank'
                ? {}
                : extrasWithNative
          }
          onExtraChange={canEditExecution && !viewingPastDay ? (fieldId, value) => {
            processExtras.setFieldValue(fieldId, value)
            const field = (processLayout?.fields || []).find((item) => item.id === fieldId)
            const parsed = parseLayoutId(fieldId)
            if (
              field?.bindKey === 'vendor_id'
              || field?.masterSource === 'vendors'
              || parsed.value === 'vendors'
              || parsed.value === 'vendor_id'
            ) {
              setField('vendor_id', Array.isArray(value) ? (value[0] || '') : (value || ''))
            }
          } : () => {}}
          actors={processActors}
          disabled={saving || viewingPastDay}
          renderField={renderLifecycleField}
        />
      )}

      {!openForPickup && !layoutHasSystemKey(processLayout, 'checklist_execution') && checklistBlock}

      {openForPickup && (
        <p className="wo-permit__hint">
          This work order is unassigned. Pick it in Assignment above to assign yourself and start. After that you can record the job here.
        </p>
      )}

      {statusActionsBlock}


      {!canUpdate && executionFiles.length > 0 && (
        <section className="wo-received-detail__section">
          <h3>Technician photos &amp; files</h3>
          <WorkOrderAttachmentsField files={executionFiles} readOnly />
        </section>
      )}

      {showMaterialDetails && (
        <WorkOrderMaterialDetailsModal
          logs={detail.daily_logs || []}
          onClose={() => setShowMaterialDetails(false)}
        />
      )}

      {confirmClose && (
        <CloseWorkOrderConfirm
          woNumber={detail?.wo_number}
          statusLabel={formatStatus('closed', statusLabels)}
          saving={saving}
          onCancel={() => { if (!saving) setConfirmClose(false) }}
          onConfirm={() => run('closed')}
        />
      )}
    </div>
  )
}

export { formatStatus, STATUS_LABELS }
