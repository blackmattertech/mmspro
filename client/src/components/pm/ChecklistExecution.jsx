import { useMemo } from 'react'
import DateField from '../ui/DateField'
import TimeField from '../ui/TimeField'
import FilterableSelect from '../ui/FilterableSelect'
import './Pm.css'

function FieldLabel({ field }) {
  return (
    <span className="pm-checklist-item__label">
      {field.name}
      {field.is_required ? <span className="pm-checklist-item__required">*</span> : null}
    </span>
  )
}

function isFieldComplete(field, value) {
  if (field.field_type === 'checkbox') return value === true
  if (value == null) return false
  return String(value).trim() !== ''
}

function ChecklistField({ field, value, disabled, onChange }) {
  const id = `pm-cl-${field.id}`

  if (field.field_type === 'checkbox') {
    return (
      <label className={`pm-checklist-item pm-checklist-item--check${value ? ' is-done' : ''}`}>
        <input
          type="checkbox"
          checked={Boolean(value)}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="pm-checklist-item__body">
          <FieldLabel field={field} />
        </span>
      </label>
    )
  }

  if (field.field_type === 'dropdown') {
    return (
      <div className="pm-checklist-item">
        <FieldLabel field={field} />
        <FilterableSelect
          value={value}
          onChange={onChange}
          options={field.options || []}
          disabled={disabled}
          placeholder="Select"
        />
      </div>
    )
  }

  if (field.field_type === 'radio') {
    return (
      <div className="pm-checklist-item">
        <FieldLabel field={field} />
        <div className="pm-checklist-options" role="radiogroup" aria-label={field.name}>
          {(field.options || []).map((option) => {
            const selected = value === option
            return (
              <label
                key={option}
                className={`pm-checklist-option${selected ? ' is-selected' : ''}`}
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
      </div>
    )
  }

  if (field.field_type === 'multiline') {
    return (
      <label className="pm-checklist-item">
        <FieldLabel field={field} />
        <textarea
          className="company-form__input company-form__textarea"
          rows={3}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    )
  }

  if (field.field_type === 'date') {
    return (
      <label className="pm-checklist-item">
        <FieldLabel field={field} />
        <DateField value={value} onChange={onChange} disabled={disabled} />
      </label>
    )
  }

  if (field.field_type === 'time') {
    return (
      <label className="pm-checklist-item">
        <FieldLabel field={field} />
        <TimeField value={value} onChange={onChange} disabled={disabled} />
      </label>
    )
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

  return (
    <label className="pm-checklist-item">
      <FieldLabel field={field} />
      <input
        id={id}
        className="company-form__input"
        type={inputType}
        step={field.field_type === 'decimal' ? '0.01' : field.field_type === 'numeric' ? '1' : undefined}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}

export default function ChecklistExecution({ snapshot, values, onChange, disabled = false }) {
  const fields = Array.isArray(snapshot?.fields) ? snapshot.fields : []
  const sections = Array.isArray(snapshot?.sections) ? snapshot.sections : []

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

    // Only show fields that belong to a checklist section.
    // Unsectioned / orphan template fields are omitted from execution.
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
    }
  }, [visibleFields, values])

  if (!visibleFields.length) return null

  const setValue = (fieldId, value) => {
    onChange({ ...(values || {}), [fieldId]: value })
  }

  return (
    <section className="wo-received-detail__section pm-checklist-panel">
      <div className="pm-checklist-panel__header">
        <div className="pm-checklist-panel__titles">
          <h3>Checklist</h3>
          {(snapshot?.name || snapshot?.version) && (
            <p className="pm-checklist-panel__meta">
              {snapshot?.name || 'Inspection checklist'}
              {snapshot?.version ? ` · v${snapshot.version}` : ''}
            </p>
          )}
        </div>
        <div className="pm-checklist-panel__progress" aria-label={`${progress.done} of ${progress.total} complete`}>
          <span className="pm-checklist-panel__progress-count">
            {progress.done}/{progress.total}
          </span>
          <span className="pm-checklist-panel__progress-label">complete</span>
        </div>
      </div>

      <div className="pm-checklist-panel__bar" aria-hidden="true">
        <span style={{ width: `${progress.percent}%` }} />
      </div>

      {progress.requiredTotal > 0 && (
        <p className="pm-checklist-panel__hint">
          Required items: {progress.requiredDone}/{progress.requiredTotal}
          {disabled ? ' · View only' : ''}
        </p>
      )}

      <div className="pm-checklist-exec">
        {groups.map((group) => (
          <div key={group.id} className="pm-checklist-group">
            <h4 className="pm-checklist-group__title">{group.name}</h4>
            <div className="pm-checklist-group__fields">
              {group.fields.map((field) => (
                <ChecklistField
                  key={field.id}
                  field={field}
                  value={values?.[field.id] ?? (field.field_type === 'checkbox' ? false : '')}
                  disabled={disabled}
                  onChange={(next) => setValue(field.id, next)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
