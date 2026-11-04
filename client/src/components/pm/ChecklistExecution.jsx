import { useEffect, useMemo, useState } from 'react'
import DateField from '../ui/DateField'
import TimeField from '../ui/TimeField'
import FilterableSelect from '../ui/FilterableSelect'
import SpellcheckInput from '../shared/SpellcheckInput'
import PersonChip from '../shared/PersonChip'
import { useOrg } from '../../hooks/useOrg'
import { useProfile } from '../../hooks/useProfile'
import { getOrgAssetSignedUrl } from '../../lib/orgAssets'
import './Pm.css'

export function isFieldComplete(field, value) {
  if (field.field_type === 'checkbox') return value === true
  if (value == null) return false
  return String(value).trim() !== ''
}

export function checklistVisibleFields(snapshot) {
  const fields = Array.isArray(snapshot?.fields) ? snapshot.fields : []
  return fields.filter((field) => field.section_id)
}

export function isChecklistComplete(snapshot, values) {
  const fields = checklistVisibleFields(snapshot)
  if (!fields.length) return true
  return fields.every((field) => isFieldComplete(field, values?.[field.id]))
}

function formatStamp(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function peopleRecords(list) {
  return (list || [])
    .map((row) => row?.employee || row)
    .filter((row) => row?.name || row?.full_name || row?.display_name || row?.email)
}

function peopleNames(list) {
  return peopleRecords(list)
    .map((row) => row.name || row.full_name || row.display_name || row.email)
    .filter(Boolean)
}

function technicianChips(list) {
  const people = peopleRecords(list)
  if (!people.length) return '—'
  return (
    <span className="company-employee-ref-list">
      {people.map((person, index) => (
        <PersonChip key={person.id || person.employee_id || index} person={person} />
      ))}
    </span>
  )
}

function equipmentLabel(record) {
  const equipment = record?.equipment
  if (equipment) {
    return [equipment.name, equipment.code].filter(Boolean).join(' · ') || '—'
  }
  const steps = record?.asset_hierarchy || []
  const last = steps[steps.length - 1]
  if (last?.value_label || last?.value) return last.value_label || last.value
  return '—'
}

function buildChecklistMeta(record, recordKind, capturedAt) {
  if (!record) {
    return [{ label: 'Date / time', value: formatStamp(capturedAt) }]
  }
  const technicianList = record.assignees
    || record.assigned_technicians
    || record.work_request?.assigned_technicians
  const rows = []
  const number = recordKind === 'work_request'
    ? (record.request_number || record.wr_number || record.number)
    : (record.wo_number || record.work_order_number || record.number)
  if (number) {
    rows.push({
      label: recordKind === 'work_request' ? 'Request #' : 'Work order',
      value: number,
    })
  }
  const linkedWo = record.linked_work_order?.wo_number || record.work_order?.wo_number
  if (recordKind === 'work_request' && linkedWo) {
    rows.push({ label: 'Work order', value: linkedWo })
  }
  rows.push({
    label: 'Date / time',
    value: formatStamp(capturedAt),
  })
  const location = record.assigned_location?.name
    || record.location?.name
    || record.order_from?.location_name
    || record.order_to?.location_name
  if (location) rows.push({ label: 'Location', value: location })
  const department = record.assigned_department?.name
    || record.order_to?.name
    || record.department?.name
  if (department) rows.push({ label: 'Department', value: department })
  const asset = equipmentLabel(record)
  if (asset && asset !== '—') rows.push({ label: 'Asset', value: asset })
  if (record.priority) {
    rows.push({
      label: 'Priority',
      value: String(record.priority).replace(/_/g, ' '),
    })
  }
  const jobNature = record.job_nature_label || record.job_nature || record.work_request?.job_nature_label
  if (jobNature) rows.push({ label: 'Job nature', value: jobNature })
  rows.push({
    label: 'Technician(s)',
    value: technicianChips(technicianList),
  })
  return rows
}

function ChecklistAnswer({ field, value, disabled, onChange }) {
  const id = `pm-cl-${field.id}`

  if (field.field_type === 'checkbox') {
    return (
      <label className={`pm-checklist-table__check${value ? ' is-done' : ''}`}>
        <input
          type="checkbox"
          checked={Boolean(value)}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{value ? 'Done' : 'Mark done'}</span>
      </label>
    )
  }

  if (field.field_type === 'dropdown') {
    return (
      <FilterableSelect
        value={value}
        onChange={onChange}
        options={field.options || []}
        disabled={disabled}
        placeholder="Select"
      />
    )
  }

  if (field.field_type === 'radio') {
    return (
      <div className="pm-checklist-options" role="radiogroup" aria-label={field.name}>
        {(field.options || []).map((option) => {
          const selected = value === option
          const tone = /^(yes|ok|pass|done)$/i.test(String(option).trim())
            ? 'is-yes'
            : /^(no|fail|failing)$/i.test(String(option).trim())
              ? 'is-no'
              : /^(na|n\/a|not applicable)$/i.test(String(option).trim())
                ? 'is-na'
                : ''
          return (
            <label
              key={option}
              className={`pm-checklist-option ${tone}${selected ? ' is-selected' : ''}`.trim()}
            >
              <input
                type="radio"
                name={id}
                checked={selected}
                disabled={disabled}
                onChange={() => onChange(option)}
              />
              <span>{option}</span>
            </label>
          )
        })}
      </div>
    )
  }

  if (field.field_type === 'multiline') {
    return (
      <SpellcheckInput
        multiline
        className="company-form__input company-form__textarea"
        rows={2}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  }

  if (field.field_type === 'date') {
    return <DateField value={value} onChange={onChange} disabled={disabled} />
  }

  if (field.field_type === 'time') {
    return <TimeField value={value} onChange={onChange} disabled={disabled} />
  }

  const inputType = field.field_type === 'numeric' || field.field_type === 'decimal'
    ? 'number'
    : 'text'
  const placeholder = field.field_type === 'qr'
    ? 'Scan or enter QR value'
    : field.field_type === 'barcode'
      ? 'Scan or enter barcode'
      : field.field_type === 'signature'
        ? 'Technician name / signature'
        : field.field_type === 'image'
          ? 'Image note or reference'
          : ''
  const isIdentifier = field.field_type === 'qr' || field.field_type === 'barcode'
  const Control = inputType === 'number' || isIdentifier ? 'input' : SpellcheckInput

  return (
    <Control
      id={id}
      className="company-form__input"
      type={inputType}
      step={field.field_type === 'decimal' ? '0.01' : field.field_type === 'numeric' ? '1' : undefined}
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

export default function ChecklistExecution({
  snapshot,
  values,
  onChange,
  disabled = false,
  record = null,
  recordKind = 'work_order',
  defaultOpen = false,
  embedded = false,
  onSave = null,
  saving = false,
  saveLabel = 'Save checklist',
}) {
  const { org } = useOrg()
  const { employee, profile, avatarUrl } = useProfile()
  const [logoUrl, setLogoUrl] = useState(null)
  const [open, setOpen] = useState(defaultOpen)
  const [capturedAt, setCapturedAt] = useState(null)
  const fields = Array.isArray(snapshot?.fields) ? snapshot.fields : []
  const sections = Array.isArray(snapshot?.sections) ? snapshot.sections : []

  useEffect(() => {
    if (defaultOpen) setOpen(true)
  }, [defaultOpen])

  useEffect(() => {
    let cancelled = false
    async function loadLogo() {
      if (!org?.logo_url) {
        setLogoUrl(null)
        return
      }
      try {
        const url = await getOrgAssetSignedUrl(org.logo_url)
        if (!cancelled) setLogoUrl(url)
      } catch {
        if (!cancelled) setLogoUrl(null)
      }
    }
    loadLogo()
    return () => { cancelled = true }
  }, [org?.logo_url])

  const groups = useMemo(() => {
    if (!fields.length) return []
    const bySection = new Map()
    for (const field of fields) {
      if (!field.section_id) continue
      const list = bySection.get(field.section_id) || []
      list.push(field)
      bySection.set(field.section_id, list)
    }

    const grouped = sections
      .slice()
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map((section) => ({
        id: section.id,
        name: section.name,
        fields: (bySection.get(section.id) || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
      }))
      .filter((group) => group.fields.length > 0)

    if (!grouped.length) {
      return [{
        id: 'all',
        name: 'Inspection items',
        fields: fields
          .filter((field) => field.section_id)
          .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
      }].filter((group) => group.fields.length > 0)
    }

    return grouped
  }, [fields, sections])

  const visibleFields = useMemo(
    () => groups.flatMap((group) => group.fields),
    [groups],
  )

  const progress = useMemo(() => {
    const total = visibleFields.length
    const done = visibleFields.filter((field) => isFieldComplete(field, values?.[field.id])).length
    const required = visibleFields.filter((field) => field.is_required)
    const requiredDone = required.filter((field) => isFieldComplete(field, values?.[field.id])).length
    return {
      total,
      done,
      requiredTotal: required.length,
      requiredDone,
      percent: total ? Math.round((done / total) * 100) : 0,
      complete: total > 0 && done === total,
    }
  }, [visibleFields, values])

  useEffect(() => {
    if (progress.complete) {
      setCapturedAt((prev) => prev || new Date())
      return
    }
    setCapturedAt(null)
  }, [progress.complete])

  const metaRows = useMemo(() => {
    const rows = buildChecklistMeta(record, recordKind, capturedAt || new Date())
    if (progress.complete && capturedAt) return rows
    return rows.filter((row) => row.label !== 'Date / time')
  }, [record, recordKind, capturedAt, progress.complete])

  if (!visibleFields.length) return null

  const setValue = (fieldId, value) => {
    onChange({ ...(values || {}), [fieldId]: value })
  }

  const companyName = org?.name || 'Company'
  const logoLetter = (companyName[0] || 'C').toUpperCase()
  const checklistName = snapshot?.name || 'Checklist'
  const techName = employee?.name
    || profile?.full_name
    || profile?.display_name
    || peopleNames(record?.assignees || record?.assigned_technicians)[0]
    || '—'
  let itemIndex = 0

  const canSave = typeof onSave === 'function' && !disabled
  const Wrapper = embedded ? 'div' : 'section'
  const wrapperClass = embedded
    ? 'pm-checklist-wrap pm-checklist-wrap--embedded'
    : 'wo-received-detail__section pm-checklist-wrap'

  return (
    <Wrapper className={wrapperClass}>
      <div className="pm-checklist-toggle">
        <div className="pm-checklist-toggle__copy">
          <h3 className="pm-checklist-toggle__title">{checklistName}</h3>
          <p className="pm-checklist-toggle__meta">
            {progress.done}/{progress.total} complete
            {snapshot?.version ? ` · v${snapshot.version}` : ''}
            {progress.complete ? ' · Ready' : ' · Required before Completed'}
          </p>
        </div>
        <div className="pm-checklist-toggle__actions">
          {canSave ? (
            <button
              type="button"
              className="company-btn company-btn--primary company-btn--compact"
              disabled={saving}
              onClick={onSave}
            >
              {saving ? 'Saving…' : saveLabel}
            </button>
          ) : null}
          <button
            type="button"
            className={`company-btn company-btn--compact ${open ? 'company-btn--secondary' : 'company-btn--secondary company-btn--outline'}`}
            onClick={() => setOpen((prev) => !prev)}
            aria-expanded={open}
          >
            {open ? 'Hide checklist' : 'View checklist'}
          </button>
        </div>
      </div>

      {open ? (
        <div className="pm-checklist-sheet">
          <header className="pm-checklist-sheet__letterhead">
            <div className="pm-checklist-sheet__brand">
              <div className="pm-checklist-sheet__logo" aria-hidden={!logoUrl}>
                {logoUrl ? (
                  <img src={logoUrl} alt="" className="pm-checklist-sheet__logo-img" />
                ) : (
                  <span className="pm-checklist-sheet__logo-fallback">{logoLetter}</span>
                )}
              </div>
              <div className="pm-checklist-sheet__brand-text">
                <p className="pm-checklist-sheet__company">{companyName}</p>
                <p className="pm-checklist-sheet__doc-type">{checklistName}</p>
              </div>
            </div>
            <div className="pm-checklist-sheet__progress" aria-label={`${progress.done} of ${progress.total} complete`}>
              <span className="pm-checklist-sheet__progress-count">{progress.done}/{progress.total}</span>
              <span className="pm-checklist-sheet__progress-label">complete</span>
            </div>
          </header>

          <div className="pm-checklist-sheet__title-block">
            {snapshot?.version ? (
              <span className="pm-checklist-sheet__version">Version {snapshot.version}</span>
            ) : null}
            {progress.complete && capturedAt ? (
              <span className="pm-checklist-sheet__captured">
                Captured {formatStamp(capturedAt)}
              </span>
            ) : null}
          </div>

          {metaRows.length > 0 && (
            <dl className="pm-checklist-sheet__meta">
              {metaRows.map((row) => (
                <div key={row.label} className="pm-checklist-sheet__meta-item">
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          )}

          <div className="pm-checklist-sheet__bar" aria-hidden="true">
            <span style={{ width: `${progress.percent}%` }} />
          </div>

          {progress.requiredTotal > 0 && (
            <p className="pm-checklist-sheet__hint">
              Required items: {progress.requiredDone}/{progress.requiredTotal}
              {disabled ? ' · View only' : ' · Fill each row below'}
            </p>
          )}

          <div className="pm-checklist-exec">
            {groups.map((group) => (
              <div key={group.id} className="pm-checklist-table-wrap">
                <table className="pm-checklist-table">
                  <thead>
                    <tr>
                      <th colSpan={3} className="pm-checklist-table__section">{group.name}</th>
                    </tr>
                    <tr>
                      <th className="pm-checklist-table__col-no">#</th>
                      <th className="pm-checklist-table__col-q">Question / item</th>
                      <th className="pm-checklist-table__col-a">Response</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.fields.map((field) => {
                      itemIndex += 1
                      const answer = values?.[field.id] ?? (field.field_type === 'checkbox' ? false : '')
                      const done = isFieldComplete(field, answer)
                      return (
                        <tr key={field.id} className={done ? 'is-done' : undefined}>
                          <td className="pm-checklist-table__col-no">{itemIndex}</td>
                          <td className="pm-checklist-table__col-q">
                            <span className="pm-checklist-table__question">
                              {field.name}
                              {field.is_required ? <span className="pm-checklist-item__required">*</span> : null}
                            </span>
                          </td>
                          <td className="pm-checklist-table__col-a">
                            <ChecklistAnswer
                              field={field}
                              value={answer}
                              disabled={disabled}
                              onChange={(next) => setValue(field.id, next)}
                            />
                            {done && field.field_type !== 'checkbox' ? (
                              <span className="pm-checklist-table__selected">
                                Selected: {String(answer)}
                              </span>
                            ) : null}
                            {done && field.field_type === 'checkbox' ? (
                              <span className="pm-checklist-table__selected">Selected: Done</span>
                            ) : null}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>

          {progress.complete ? (
            <footer className="pm-checklist-sheet__footer">
              <div className="pm-checklist-sheet__sign">
                <span className="pm-checklist-sheet__sign-label">Technician acknowledgement</span>
                <span className="pm-checklist-sheet__sign-value">
                  {techName ? (
                    <PersonChip
                      person={{
                        ...(employee || {}),
                        name: techName,
                        photo_signed_url: employee?.photo_signed_url || avatarUrl || null,
                        avatar_url: avatarUrl || null,
                      }}
                    />
                  ) : '—'}
                </span>
              </div>
              <div className="pm-checklist-sheet__sign">
                <span className="pm-checklist-sheet__sign-label">Date / time</span>
                <span className="pm-checklist-sheet__sign-value">
                  {capturedAt ? formatStamp(capturedAt) : '—'}
                </span>
              </div>
            </footer>
          ) : null}

          {canSave ? (
            <div className="pm-checklist-sheet__actions">
              <button
                type="button"
                className="company-btn company-btn--primary"
                disabled={saving}
                onClick={onSave}
              >
                {saving ? 'Saving…' : saveLabel}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </Wrapper>
  )
}
