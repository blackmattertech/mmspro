import { useMemo, useState } from 'react'
import { updateWorkOrderLifecycle } from '../../lib/api-work-orders'
import DateField from '../ui/DateField'

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

function formatStatus(status) {
  return STATUS_LABELS[status] || String(status || '').replace(/_/g, ' ')
}

function Text({ label, children, full = false }) {
  return (
    <label className={`company-form__field${full ? ' company-form__field--full' : ''}`}>
      <span className="company-form__label">{label}</span>
      {children}
    </label>
  )
}

export default function WorkOrderLifecyclePanel({ detail, onUpdated, canUpdate = true }) {
  const [form, setForm] = useState(() => ({
    permit_required: Boolean(detail?.permit_required),
    permit_types: Array.isArray(detail?.permit_types) ? detail.permit_types : [],
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
    material_consumed: detail?.material_consumed || '',
    special_tools_used: detail?.special_tools_used || '',
    safety_precautions: detail?.safety_precautions || '',
    dos_and_donts: detail?.dos_and_donts || '',
    lessons_learned: detail?.lessons_learned || '',
    execution_remarks: detail?.execution_remarks || '',
    verification_remarks: detail?.verification_remarks || '',
    remarks: '',
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const nextStatuses = useMemo(
    () => detail?.allowed_next_statuses || [],
    [detail?.allowed_next_statuses],
  )

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const togglePermitType = (type) => {
    setForm((prev) => {
      const has = prev.permit_types.includes(type)
      return {
        ...prev,
        permit_types: has
          ? prev.permit_types.filter((t) => t !== type)
          : [...prev.permit_types, type],
      }
    })
  }

  const buildPayload = (status) => {
    const payload = {
      status,
      permit_required: form.permit_required,
      permit_types: form.permit_types,
      permit_number: form.permit_number.trim() || null,
      permit_issue_at: form.permit_issue_at || null,
      permit_expiry_at: form.permit_expiry_at || null,
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
      material_consumed: form.material_consumed.trim() || null,
      special_tools_used: form.special_tools_used.trim() || null,
      safety_precautions: form.safety_precautions.trim() || null,
      dos_and_donts: form.dos_and_donts.trim() || null,
      lessons_learned: form.lessons_learned.trim() || null,
      execution_remarks: form.execution_remarks.trim() || null,
      verification_remarks: form.verification_remarks.trim() || null,
      remarks: form.remarks.trim() || null,
    }
    return payload
  }

  const run = async (status) => {
    setSaving(true)
    setError(null)
    try {
      const updated = await updateWorkOrderLifecycle(detail.id, buildPayload(status))
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
            <dd>{(detail.source_type || '—').replace(/_/g, ' ')}</dd>
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
            <dt>Problem</dt>
            <dd style={{ whiteSpace: 'pre-wrap' }}>{detail.problem_description || detail.summary || '—'}</dd>
          </div>
        </dl>
      </section>

      {Array.isArray(detail.asset_hierarchy) && detail.asset_hierarchy.length > 0 && (
        <section className="wo-received-detail__section">
          <h3>Asset information</h3>
          <dl className="wo-received-detail__fields">
            {detail.asset_hierarchy.map((step, i) => (
              <div key={`${step.field_id}-${i}`} className="wo-received-detail__field">
                <dt>{step.field_name}</dt>
                <dd>{step.value || '—'}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {canUpdate && (
        <>
          <section className="wo-received-detail__section">
            <h3>Permit details</h3>
            <div className="company-form__grid">
              <div className="company-form__field">
                <span className="company-form__label">Permit required</span>
                <div className="wr-radio-options" role="radiogroup">
                  <label className="asset-field-dependency__option">
                    <input
                      type="radio"
                      checked={form.permit_required === true}
                      onChange={() => setField('permit_required', true)}
                    />
                    <span>Yes</span>
                  </label>
                  <label className="asset-field-dependency__option">
                    <input
                      type="radio"
                      checked={form.permit_required === false}
                      onChange={() => setField('permit_required', false)}
                    />
                    <span>No</span>
                  </label>
                </div>
              </div>
              {form.permit_required && (
                <>
                  <div className="company-form__field company-form__field--full">
                    <span className="company-form__label">Permit type</span>
                    <div className="wr-assign-block__technicians">
                      {(detail.permit_type_options || Object.keys(PERMIT_LABELS)).map((type) => (
                        <label key={type} className="wr-assign-block__technician">
                          <input
                            type="checkbox"
                            checked={form.permit_types.includes(type)}
                            onChange={() => togglePermitType(type)}
                          />
                          <span>{PERMIT_LABELS[type] || type}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <Field label="Permit number">
                    <input
                      className="company-form__input"
                      value={form.permit_number}
                      onChange={(e) => setField('permit_number', e.target.value)}
                    />
                  </Field>
                  <Field label="Permit issue date">
                    <DateField
                      value={form.permit_issue_at}
                      onChange={(v) => setField('permit_issue_at', v)}
                      withTime
                    />
                  </Field>
                  <Field label="Permit expiry">
                    <DateField
                      value={form.permit_expiry_at}
                      onChange={(v) => setField('permit_expiry_at', v)}
                      withTime
                    />
                  </Field>
                </>
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
              {detail.is_breakdown && (
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

          <section className="wo-received-detail__section">
            <h3>Maintenance documentation</h3>
            <div className="company-form__grid">
              {[
                ['job_description', 'Detailed job description'],
                ['root_cause', 'Root cause analysis'],
                ['action_taken', 'Action taken'],
                ['material_consumed', 'Material consumed'],
                ['special_tools_used', 'Special tools used'],
                ['safety_precautions', 'Safety precautions'],
                ['dos_and_donts', "Do's and don'ts"],
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
            </div>
          </section>

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
            <h3>Status actions</h3>
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
              {nextStatuses.map((status) => (
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

      {Array.isArray(detail.timeline) && detail.timeline.length > 0 && (
        <section className="wo-received-detail__section">
          <h3>Timeline</h3>
          <ul className="wr-timeline">
            {detail.timeline.map((ev) => (
              <li key={ev.id}>
                <span className="wr-timeline__event">
                  {(ev.event_type || '').replace(/_/g, ' ')}
                </span>
                <p className="wr-timeline__message">{ev.message}</p>
                <time className="wr-timeline__time" dateTime={ev.created_at}>
                  {ev.created_at ? new Date(ev.created_at).toLocaleString() : ''}
                </time>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

export { formatStatus, STATUS_LABELS }
