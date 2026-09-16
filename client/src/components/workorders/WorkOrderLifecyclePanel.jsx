import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createManualWorkOrder, updateWorkOrderLifecycle } from '../../lib/api-work-orders'
import { uploadWorkOrderFile } from '../../lib/workOrderAssets'
import { useOrg } from '../../hooks/useOrg'
import { useProfile } from '../../hooks/useProfile'
import { usePermissions } from '../../hooks/usePermissions'
import { useOrgStatusOptions } from '../../hooks/useOrgStatusOptions'
import { useTextFieldLimits } from '../../hooks/useTextFieldLimits'
import { orgPath } from '../../config/navigation'
import DateField from '../ui/DateField'
import FilterableSelect from '../ui/FilterableSelect'
import WorkOrderAttachmentsField from './WorkOrderAttachmentsField'
import WorkOrderDailyLogSection from './WorkOrderDailyLogSection'
import WorkOrderMaterialDetailsModal from './WorkOrderMaterialDetailsModal'
import WorkOrderMaterialRowsTable, { normalizeMaterialRows } from './WorkOrderMaterialRowsTable'
import ChecklistExecution from '../pm/ChecklistExecution'
import SpellcheckInput from '../shared/SpellcheckInput'
import FormLabel from '../shared/FormLabel'
import { progressPercentForStatus } from '../../lib/statusProgress'
import './ManualWorkOrder.css'
import '../shared/StatusCountBar.css'

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
  assigned: 'Assigned',
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

function formatStatus(status, labelByKey = null) {
  if (labelByKey?.[status]) return labelByKey[status]
  return STATUS_LABELS[status] || String(status || '').replace(/_/g, ' ')
}

function formatSource(sourceType) {
  if (!sourceType) return '—'
  return SOURCE_LABELS[sourceType] || String(sourceType).replace(/_/g, ' ')
}

function isBreakdownJobNature(detail) {
  const nature = String(detail?.job_nature || '').trim().toLowerCase()
  if (nature) return nature === 'breakdown'
  return Boolean(detail?.is_breakdown)
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

  for (const row of raw) {
    const type = String(row?.type || '').trim()
    if (!type || byType.has(type)) continue
    byType.set(type, {
      type,
      number: String(row?.number || ''),
      issue_at: row?.issue_at || '',
      expiry_at: row?.expiry_at || '',
    })
  }

  if (!byType.size && types.length) {
    const [first, ...rest] = types
    byType.set(first, {
      type: first,
      number: detail?.permit_number || '',
      issue_at: detail?.permit_issue_at || '',
      expiry_at: detail?.permit_expiry_at || '',
    })
    rest.forEach((type) => byType.set(type, emptyPermitDetail(type)))
  }

  return types.map((type) => byType.get(type) || emptyPermitDetail(type))
}

function initialPermitDetails(detail) {
  const rows = parsePermitDetails(detail)
  if (Boolean(detail?.permit_required) && !rows.length) return [emptyPermitDetail('')]
  return rows.slice(0, 1)
}

function formFromDetail(detail) {
  const dosDonts = parseDosDonts(detail?.dos_and_donts)
  return {
    permit_required: Boolean(detail?.permit_required),
    permit_types: Array.isArray(detail?.permit_types) ? detail.permit_types.slice(0, 1) : [],
    permit_details: initialPermitDetails(detail),
    permit_number: detail?.permit_number || '',
    permit_issue_at: detail?.permit_issue_at || '',
    permit_expiry_at: detail?.permit_expiry_at || '',
    work_start_at: detail?.work_start_at || '',
    work_end_at: detail?.work_end_at || '',
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

export default function WorkOrderLifecyclePanel({ detail, onUpdated, canUpdate = true }) {
  const navigate = useNavigate()
  const { org } = useOrg()
  const { profile, employee } = useProfile()
  const { isOrgAdmin, canUpdate: canUpdateModule, canCreate } = usePermissions()
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

  const hasDailyLogs = (detail?.daily_logs || []).length > 0
  const materialSummaryRows = useMemo(() => {
    if (Array.isArray(detail?.material_summary) && detail.material_summary.length) {
      return normalizeMaterialRows(detail.material_summary)
    }
    return parseMaterialConsumed(detail?.material_consumed).filter((row) => (
      row.code || row.description || row.uom || row.qty
    ))
  }, [detail?.material_summary, detail?.material_consumed])

  useEffect(() => {
    setForm(formFromDetail(detail))
    setPendingFiles([])
    setRemovedPaths([])
    setError(null)
    setShowFollowUp(false)
  }, [detail?.id])

  useEffect(() => {
    if (!hasDailyLogs) return
    setForm((prev) => ({
      ...prev,
      material_rows: materialSummaryRows.length
        ? materialSummaryRows
        : [{ code: '', description: '', uom: '', qty: '' }],
      work_start_at: detail?.work_start_at || prev.work_start_at,
      work_end_at: detail?.work_end_at || prev.work_end_at,
    }))
  }, [
    hasDailyLogs,
    detail?.updated_at,
    detail?.work_start_at,
    detail?.work_end_at,
    materialSummaryRows,
  ])

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
  const visibleStatuses = nextStatuses.filter((status) => {
    if (SUPERVISOR_STATUSES.has(status)) return canSupervise
    return isTechnician || canSupervise
  })
  const keptExecutionFiles = executionFiles.filter((file) => !removedPaths.includes(file.path))

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const permitTypeOptions = detail?.permit_type_options || Object.keys(PERMIT_LABELS)
  const permitRow = (form.permit_details || [])[0] || emptyPermitDetail('')

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
      const current = (prev.permit_details || [])[0]
      const row = current || emptyPermitDetail('')
      return {
        ...prev,
        permit_required: true,
        permit_details: [row],
        permit_types: row.type ? [row.type] : [],
      }
    })
  }

  const changePermitType = (nextType) => {
    setForm((prev) => {
      const current = (prev.permit_details || [])[0] || emptyPermitDetail('')
      const permit_details = [{ ...current, type: nextType }]
      return {
        ...prev,
        permit_details,
        permit_types: nextType ? [nextType] : [],
      }
    })
  }

  const updatePermitDetail = (key, value) => {
    setForm((prev) => {
      const current = (prev.permit_details || [])[0] || emptyPermitDetail('')
      return {
        ...prev,
        permit_details: [{ ...current, [key]: value }],
      }
    })
  }

  const buildPayload = (status) => {
    const filledPermitDetails = (form.permit_details || []).filter((row) => row.type).slice(0, 1)
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
      const requiredFields = (detail.checklist_snapshot?.fields || []).filter(
        (field) => field.is_required && field.section_id,
      )
      if (['completed', 'verified', 'closed'].includes(status) && requiredFields.length) {
        const missing = requiredFields.filter((field) => {
          const value = form.checklist_values?.[field.id]
          if (field.field_type === 'checkbox') return value !== true
          return value == null || String(value).trim() === ''
        })
        if (missing.length) {
          throw new Error(`Complete required checklist fields: ${missing.map((field) => field.name).join(', ')}.`)
        }
      }
      const uploaded = []
      for (const item of pendingFiles) {
        const meta = await uploadWorkOrderFile(org.id, detail.id, 'execution', item.file, 'file')
        uploaded.push({ ...meta, source: 'execution' })
      }
      const payload = {
        ...buildPayload(status),
        execution_attachments: [...keptExecutionFiles, ...uploaded],
      }
      const updated = await updateWorkOrderLifecycle(detail.id, payload)
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
  const showLifecycleForms = canUpdate && !isPmScheduled

  const checklistBlock = hasChecklist ? (
    <ChecklistExecution
      snapshot={detail.checklist_snapshot}
      values={form.checklist_values}
      onChange={(next) => setField('checklist_values', next)}
      disabled={!canUpdate}
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
            View details
          </button>
        )}
      </div>
      {hasDailyLogs ? (
        <>
          <p className="wo-permit__hint">
            Summary across all daily logs. Open View details for day-wise consumables.
          </p>
          {materialSummaryRows.length ? (
            <WorkOrderMaterialRowsTable rows={materialSummaryRows} readOnly />
          ) : (
            <p className="wo-permit__hint">No materials logged yet.</p>
          )}
        </>
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

  const statusActionsBlock = canUpdate ? (
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
        {visibleStatuses.map((status) => (
          <button
            key={status}
            type="button"
            className={`company-btn ${status === 'closed' || status === 'verified' ? 'company-btn--primary' : 'company-btn--secondary'}`}
            disabled={saving || creatingFollowUp}
            onClick={() => run(status)}
          >
            {formatStatus(status, statusLabels)}
          </button>
        ))}
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
            <dt>Progress %</dt>
            <dd>
              <div className="wo-progress" title={`${progressPercentForStatus(detail.status)}%`}>
                <div className="wo-progress__track">
                  <span
                    className="wo-progress__fill"
                    style={{ width: `${progressPercentForStatus(detail.status)}%` }}
                  />
                </div>
                <span className="wo-progress__value">{progressPercentForStatus(detail.status)}%</span>
              </div>
            </dd>
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

      {Array.isArray(detail.asset_hierarchy) && detail.asset_hierarchy.length > 0 && (
        <section className="wo-received-detail__section">
          <h3>Asset information</h3>
          <dl className="wo-received-detail__fields">
            {detail.asset_hierarchy
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

      {requestFiles.length > 0 && (
        <section className="wo-received-detail__section">
          <h3>Request attachments</h3>
          <WorkOrderAttachmentsField files={requestFiles} readOnly />
        </section>
      )}

      {showLifecycleForms && (
        <>
          <section className="wo-received-detail__section">
            <h3>Permit details</h3>
            <div className="wo-permit">
              <div className="company-form__field">
                <span className="company-form__label">Permit required</span>
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
                />
              </div>
              {form.permit_required && (
                <div className="wo-permit__entries">
                  <div className="wo-permit__entry">
                    <div className="wo-permit__row">
                      <div className="wo-permit__cell wo-permit__cell--type">
                        <span className="company-form__label">Permit type</span>
                        <FilterableSelect
                          value={permitRow.type}
                          onChange={changePermitType}
                          options={permitTypeOptions}
                          getOptionValue={(type) => type}
                          getOptionLabel={(type) => PERMIT_LABELS[type] || type}
                          placeholder="Select permit type"
                          className="company-form__input--select"
                          aria-label="Permit type"
                        />
                      </div>
                      {Boolean(permitRow.type) && (
                        <>
                          <label className="wo-permit__cell wo-permit__cell--number">
                            <span className="company-form__label">Permit number</span>
                            <input
                              className="company-form__input"
                              value={permitRow.number}
                              onChange={(e) => updatePermitDetail('number', e.target.value)}
                              placeholder="Enter permit number"
                              aria-label={`${PERMIT_LABELS[permitRow.type] || permitRow.type} permit number`}
                            />
                          </label>
                          <label className="wo-permit__cell wo-permit__cell--date">
                            <span className="company-form__label">Date</span>
                            <DateField
                              value={permitRow.issue_at}
                              onChange={(v) => updatePermitDetail('issue_at', v)}
                            />
                          </label>
                          <label className="wo-permit__cell wo-permit__cell--date">
                            <span className="company-form__label">Expiry date</span>
                            <DateField
                              value={permitRow.expiry_at}
                              onChange={(v) => updatePermitDetail('expiry_at', v)}
                            />
                          </label>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="wo-received-detail__section">
            <h3>Work execution</h3>
            <div className="company-form__grid">
              <Field label="Work start">
                <DateField
                  value={form.work_start_at}
                  onChange={(v) => setField('work_start_at', v)}
                  withTime
                />
              </Field>
              <Field label="Work end">
                <DateField
                  value={form.work_end_at}
                  onChange={(v) => setField('work_end_at', v)}
                  withTime
                />
              </Field>
              <Field label="Labour count">
                <input
                  type="number"
                  min="0"
                  className="company-form__input"
                  value={form.labour_count}
                  onChange={(e) => setField('labour_count', e.target.value)}
                />
              </Field>
              <Field label="Vendor expense">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="company-form__input"
                  value={form.vendor_expense}
                  onChange={(e) => setField('vendor_expense', e.target.value)}
                />
              </Field>
              {isBreakdownJobNature(detail) && (
                <>
                  <Field label="Breakdown start">
                    <DateField
                      value={form.breakdown_start_at}
                      onChange={(v) => setField('breakdown_start_at', v)}
                      withTime
                    />
                  </Field>
                  <Field label="Breakdown end">
                    <DateField
                      value={form.breakdown_end_at}
                      onChange={(v) => setField('breakdown_end_at', v)}
                      withTime
                    />
                  </Field>
                </>
              )}
            </div>
          </section>

          {(detail.daily_log_visible || (detail.daily_logs || []).length > 0 || detail.daily_log_can_edit) && (
            <WorkOrderDailyLogSection detail={detail} onUpdated={onUpdated} />
          )}

          {MAINTENANCE_DOC_STATUSES.has(detail.status) && (
          <section className="wo-received-detail__section">
            <h3>Maintenance documentation</h3>
            <div className="company-form__grid">
              {[
                ['job_description', 'Detailed job description'],
                ['root_cause', 'Root cause analysis'],
                ['action_taken', 'Action taken'],
              ].map(([key, label]) => (
                <Field key={key} label={label} full maxLength={maxLength(key)}>
                  <SpellcheckInput
                    multiline
                    className="company-form__input company-form__textarea"
                    rows={2}
                    value={form[key]}
                    onChange={(e) => setField(key, e.target.value)}
                    maxLength={maxLength(key)}
                  />
                </Field>
              ))}

              {materialConsumedField}

              {[
                ['special_tools_used', 'Special tools used'],
                ['safety_precautions', 'Safety precautions'],
              ].map(([key, label]) => (
                <Field key={key} label={label} full maxLength={maxLength(key)}>
                  <SpellcheckInput
                    multiline
                    className="company-form__input company-form__textarea"
                    rows={2}
                    value={form[key]}
                    onChange={(e) => setField(key, e.target.value)}
                  />
                </Field>
              ))}

              {dosDontsField}

              {[
                ['lessons_learned', 'Lessons learned'],
                ['execution_remarks', 'Remarks'],
              ].map(([key, label]) => (
                <Field key={key} label={label} full maxLength={maxLength(key)}>
                  <SpellcheckInput
                    multiline
                    className="company-form__input company-form__textarea"
                    rows={2}
                    value={form[key]}
                    onChange={(e) => setField(key, e.target.value)}
                    maxLength={maxLength(key)}
                  />
                </Field>
              ))}
              <div className="company-form__field company-form__field--full">
                <span className="company-form__label">Technician photos &amp; files</span>
                <p className="wo-permit__hint">
                  Assigned technicians can attach images and documents of the work performed.
                </p>
                <WorkOrderAttachmentsField
                  files={keptExecutionFiles}
                  pendingFiles={pendingFiles}
                  disabled={saving}
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
            </div>
          </section>
          )}

          {['completed', 'verified'].includes(detail.status) && (
            <section className="wo-received-detail__section">
              <h3>Supervisor verification</h3>
              <Field label="Verification remarks" full maxLength={maxLength('verification_remarks')}>
                <SpellcheckInput
                  multiline
                  className="company-form__input company-form__textarea"
                  rows={2}
                  value={form.verification_remarks}
                  onChange={(e) => setField('verification_remarks', e.target.value)}
                  maxLength={maxLength('verification_remarks')}
                />
              </Field>
            </section>
          )}
        </>
      )}

      {checklistBlock}

      {isPmScheduled && canUpdate && (
        <section className="wo-received-detail__section">
          <h3>Material consumed &amp; Do&apos;s / Don&apos;ts</h3>
          <div className="company-form__grid">
            {materialConsumedField}
            {dosDontsField}
          </div>
        </section>
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
    </div>
  )
}

export { formatStatus, STATUS_LABELS }
