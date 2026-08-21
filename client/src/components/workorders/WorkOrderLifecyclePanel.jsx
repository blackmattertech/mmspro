import { useEffect, useMemo, useState } from 'react'
import { updateWorkOrderLifecycle } from '../../lib/api-work-orders'
import { uploadWorkOrderFile } from '../../lib/workOrderAssets'
import { useOrg } from '../../hooks/useOrg'
import { useProfile } from '../../hooks/useProfile'
import { usePermissions } from '../../hooks/usePermissions'
import DateField from '../ui/DateField'
import WorkOrderAttachmentsField from './WorkOrderAttachmentsField'
import WorkOrderDailyLogSection from './WorkOrderDailyLogSection'
import WorkOrderMaterialDetailsModal from './WorkOrderMaterialDetailsModal'
import WorkOrderMaterialRowsTable, { normalizeMaterialRows } from './WorkOrderMaterialRowsTable'
import ChecklistExecution from '../pm/ChecklistExecution'
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

function formatStatus(status) {
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

function Field({ label, children, full = false }) {
  return (
    <label className={`company-form__field${full ? ' company-form__field--full' : ''}`}>
      <span className="company-form__label">{label}</span>
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

export default function WorkOrderLifecyclePanel({ detail, onUpdated, canUpdate = true }) {
  const { org } = useOrg()
  const { profile, employee } = useProfile()
  const { isOrgAdmin, canUpdate: canUpdateModule } = usePermissions()
  const { requestFiles, executionFiles } = splitWorkOrderAttachments(detail?.attachments)
  const [form, setForm] = useState(() => {
    const dosDonts = parseDosDonts(detail?.dos_and_donts)
    return {
      permit_required: Boolean(detail?.permit_required),
      permit_types: Array.isArray(detail?.permit_types) ? detail.permit_types : [],
      permit_details: parsePermitDetails(detail),
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
  })
  const [pendingFiles, setPendingFiles] = useState([])
  const [removedPaths, setRemovedPaths] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [showMaterialDetails, setShowMaterialDetails] = useState(false)

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

  const togglePermitType = (type) => {
    setForm((prev) => {
      const has = prev.permit_types.includes(type)
      const permit_types = has
        ? prev.permit_types.filter((t) => t !== type)
        : [...prev.permit_types, type]
      const existing = new Map((prev.permit_details || []).map((row) => [row.type, row]))
      const permit_details = permit_types.map((t) => existing.get(t) || emptyPermitDetail(t))
      return { ...prev, permit_types, permit_details }
    })
  }

  const updatePermitDetail = (type, key, value) => {
    setForm((prev) => ({
      ...prev,
      permit_details: (prev.permit_details || []).map((row) => (
        row.type === type ? { ...row, [key]: value } : row
      )),
    }))
  }

  const buildPayload = (status) => {
    const payload = {
      status,
      permit_required: form.permit_required,
      permit_types: form.permit_types,
      permit_details: (form.permit_details || []).map((row) => ({
        type: row.type,
        number: String(row.number || '').trim(),
        issue_at: row.issue_at || null,
        expiry_at: row.expiry_at || null,
      })),
      permit_number: String(form.permit_details?.[0]?.number || form.permit_number || '').trim() || null,
      permit_issue_at: form.permit_details?.[0]?.issue_at || form.permit_issue_at || null,
      permit_expiry_at: form.permit_details?.[0]?.expiry_at || form.permit_expiry_at || null,
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
      const requiredFields = (detail.checklist_snapshot?.fields || []).filter((field) => field.is_required)
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

  if (!detail) return null

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

      {detail.checklist_snapshot?.fields?.length > 0 && (
        <ChecklistExecution
          snapshot={detail.checklist_snapshot}
          values={form.checklist_values}
          onChange={(next) => setField('checklist_values', next)}
          disabled={!canUpdate}
        />
      )}

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

      {canUpdate && (
        <>
          <section className="wo-received-detail__section">
            <h3>Permit details</h3>
            <div className="wo-permit">
              <div className="company-form__field">
                <span className="company-form__label">Permit required</span>
                <div className="wo-permit__toggle" role="radiogroup" aria-label="Permit required">
                  <label className={`wo-permit__choice${form.permit_required ? ' wo-permit__choice--on' : ''}`}>
                    <input
                      type="radio"
                      name="permit_required"
                      checked={form.permit_required === true}
                      onChange={() => setField('permit_required', true)}
                    />
                    <span>Yes</span>
                  </label>
                  <label className={`wo-permit__choice${!form.permit_required ? ' wo-permit__choice--on' : ''}`}>
                    <input
                      type="radio"
                      name="permit_required"
                      checked={form.permit_required === false}
                      onChange={() => setField('permit_required', false)}
                    />
                    <span>No</span>
                  </label>
                </div>
              </div>
              {form.permit_required && (
                <div className="company-form__grid wo-permit__fields">
                  <div className="company-form__field company-form__field--full">
                    <span className="company-form__label">Permit type</span>
                    <p className="wo-permit__hint">Select all that apply</p>
                    <div className="wo-permit__types">
                      {(detail.permit_type_options || Object.keys(PERMIT_LABELS)).map((type) => {
                        const selected = form.permit_types.includes(type)
                        return (
                          <label
                            key={type}
                            className={`wo-permit__type${selected ? ' wo-permit__type--on' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => togglePermitType(type)}
                            />
                            <span>{PERMIT_LABELS[type] || type}</span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                  {form.permit_types.length > 0 && (
                    <div className="company-form__field company-form__field--full">
                      <span className="company-form__label">Permit details by type</span>
                      <div className="wo-permit-table-wrap">
                        <table className="wo-permit-table">
                          <thead>
                            <tr>
                              <th>Permit type</th>
                              <th>Permit number</th>
                              <th>Date</th>
                              <th>Expiry date</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(form.permit_details || []).map((row) => (
                              <tr key={row.type}>
                                <td className="wo-permit-table__type">
                                  {PERMIT_LABELS[row.type] || row.type}
                                </td>
                                <td>
                                  <input
                                    className="company-form__input"
                                    value={row.number}
                                    onChange={(e) => updatePermitDetail(row.type, 'number', e.target.value)}
                                    placeholder="Enter permit number"
                                    aria-label={`${PERMIT_LABELS[row.type] || row.type} permit number`}
                                  />
                                </td>
                                <td>
                                  <DateField
                                    value={row.issue_at}
                                    onChange={(v) => updatePermitDetail(row.type, 'issue_at', v)}
                                    withTime
                                  />
                                </td>
                                <td>
                                  <DateField
                                    value={row.expiry_at}
                                    onChange={(v) => updatePermitDetail(row.type, 'expiry_at', v)}
                                    withTime
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
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
                <Field key={key} label={label} full>
                  <textarea
                    className="company-form__input company-form__textarea"
                    rows={2}
                    value={form[key]}
                    onChange={(e) => setField(key, e.target.value)}
                  />
                </Field>
              ))}

              <div className="company-form__field company-form__field--full">
                <div className="wo-material-summary__label-row">
                  <span className="company-form__label">Material consumed</span>
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
                  />
                )}
              </div>

              {[
                ['special_tools_used', 'Special tools used'],
                ['safety_precautions', 'Safety precautions'],
              ].map(([key, label]) => (
                <Field key={key} label={label} full>
                  <textarea
                    className="company-form__input company-form__textarea"
                    rows={2}
                    value={form[key]}
                    onChange={(e) => setField(key, e.target.value)}
                  />
                </Field>
              ))}

              <div className="company-form__field company-form__field--full">
                <div className="wo-dos-donts">
                  <div className="wo-dos-donts__col">
                    <div className="wo-dos-donts__header wo-dos-donts__header--dos">Do&apos;s</div>
                    <textarea
                      className="company-form__input company-form__textarea wo-dos-donts__input"
                      rows={4}
                      value={form.dos}
                      onChange={(e) => setField('dos', e.target.value)}
                      aria-label="Do's"
                    />
                  </div>
                  <div className="wo-dos-donts__col">
                    <div className="wo-dos-donts__header wo-dos-donts__header--donts">Don&apos;ts</div>
                    <textarea
                      className="company-form__input company-form__textarea wo-dos-donts__input"
                      rows={4}
                      value={form.donts}
                      onChange={(e) => setField('donts', e.target.value)}
                      aria-label="Don'ts"
                    />
                  </div>
                </div>
              </div>

              {[
                ['lessons_learned', 'Lessons learned'],
                ['execution_remarks', 'Remarks'],
              ].map(([key, label]) => (
                <Field key={key} label={label} full>
                  <textarea
                    className="company-form__input company-form__textarea"
                    rows={2}
                    value={form[key]}
                    onChange={(e) => setField(key, e.target.value)}
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
              <Field label="Verification remarks" full>
                <textarea
                  className="company-form__input company-form__textarea"
                  rows={2}
                  value={form.verification_remarks}
                  onChange={(e) => setField('verification_remarks', e.target.value)}
                />
              </Field>
            </section>
          )}

          <section className="wo-received-detail__section wo-assignment-actions">
            <h3>{canSupervise && !isTechnician ? 'Supervisor actions' : 'Status actions'}</h3>
            <Field label="Action remarks" full>
              <textarea
                className="company-form__input company-form__textarea"
                rows={2}
                value={form.remarks}
                onChange={(e) => setField('remarks', e.target.value)}
                placeholder="Optional remarks for timeline / audit"
              />
            </Field>
            {error && <div className="wo-alert wo-alert--error" role="alert">{error}</div>}
            <div className="wr-actions" style={{ flexWrap: 'wrap' }}>
              <button
                type="button"
                className="company-btn company-btn--secondary"
                disabled={saving}
                onClick={() => run(undefined)}
              >
                {saving ? 'Saving…' : 'Save details'}
              </button>
              {visibleStatuses.map((status) => (
                <button
                  key={status}
                  type="button"
                  className={`company-btn ${status === 'closed' || status === 'verified' ? 'company-btn--primary' : 'company-btn--secondary'}`}
                  disabled={saving}
                  onClick={() => run(status)}
                >
                  {formatStatus(status)}
                </button>
              ))}
            </div>
          </section>
        </>
      )}

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
