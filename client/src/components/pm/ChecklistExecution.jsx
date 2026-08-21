import DateField from '../ui/DateField'
import TimeField from '../ui/TimeField'
import FilterableSelect from '../ui/FilterableSelect'
import './Pm.css'

function FieldLabel({ field }) {
  return (
    <span className="company-form__label">
      {field.is_required ? `${field.name} *` : field.name}
    </span>
  )
}

export default function ChecklistExecution({ snapshot, values, onChange, disabled = false }) {
  const fields = Array.isArray(snapshot?.fields) ? snapshot.fields : []
  if (!fields.length) return null

  const setValue = (fieldId, value) => {
    onChange({ ...(values || {}), [fieldId]: value })
  }

  return (
    <section className="wo-received-detail__section">
      <h3>Checklist{snapshot?.name ? ` — ${snapshot.name}` : ''}{snapshot?.version ? ` (v${snapshot.version})` : ''}</h3>
      <div className="pm-checklist-exec">
        {fields.map((field) => {
          const value = values?.[field.id] ?? ''
          const id = `pm-cl-${field.id}`

          if (field.field_type === 'checkbox') {
            return (
              <label key={field.id} className="company-form__field">
                <span className="pm-radio">
                  <input
                    type="checkbox"
                    checked={Boolean(value)}
                    disabled={disabled}
                    onChange={(e) => setValue(field.id, e.target.checked)}
                  />
                  {field.is_required ? `${field.name} *` : field.name}
                </span>
              </label>
            )
          }

          if (field.field_type === 'dropdown') {
            return (
              <label key={field.id} className="company-form__field">
                <FieldLabel field={field} />
                <FilterableSelect
                  value={value}
                  onChange={(next) => setValue(field.id, next)}
                  options={field.options || []}
                  disabled={disabled}
                  placeholder="Select"
                />
              </label>
            )
          }

          if (field.field_type === 'radio') {
            return (
              <div key={field.id} className="company-form__field">
                <FieldLabel field={field} />
                <div className="pm-radio-row">
                  {(field.options || []).map((option) => (
                    <label key={option} className="pm-radio">
                      <input
                        type="radio"
                        name={id}
                        checked={value === option}
                        disabled={disabled}
                        onChange={() => setValue(field.id, option)}
                      />
                      {option}
                    </label>
                  ))}
                </div>
              </div>
            )
          }

          if (field.field_type === 'multiline') {
            return (
              <label key={field.id} className="company-form__field">
                <FieldLabel field={field} />
                <textarea
                  className="company-form__input company-form__textarea"
                  rows={3}
                  value={value}
                  disabled={disabled}
                  onChange={(e) => setValue(field.id, e.target.value)}
                />
              </label>
            )
          }

          if (field.field_type === 'date') {
            return (
              <label key={field.id} className="company-form__field">
                <FieldLabel field={field} />
                <DateField value={value} onChange={(next) => setValue(field.id, next)} disabled={disabled} />
              </label>
            )
          }

          if (field.field_type === 'time') {
            return (
              <label key={field.id} className="company-form__field">
                <FieldLabel field={field} />
                <TimeField value={value} onChange={(next) => setValue(field.id, next)} disabled={disabled} />
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
            <label key={field.id} className="company-form__field">
              <FieldLabel field={field} />
              <input
                id={id}
                className="company-form__input"
                type={inputType}
                step={field.field_type === 'decimal' ? '0.01' : field.field_type === 'numeric' ? '1' : undefined}
                value={value}
                disabled={disabled}
                placeholder={placeholder}
                onChange={(e) => setValue(field.id, e.target.value)}
              />
            </label>
          )
        })}
      </div>
    </section>
  )
}
