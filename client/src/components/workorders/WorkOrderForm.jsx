import WorkOrderFieldInput from './WorkOrderFieldInput'
import { filterVisibleFields } from '../../lib/assetFieldDependencies'
import '../workrequests/WorkRequests.css'
import './ManualWorkOrder.css'

function WorkOrderSection({ section, values, onChange, disabled }) {
  const visibleFields = filterVisibleFields(section.fields, values)

  return (
    <section className="wr-form-section">
      <header className="wr-form-section__head">
        <h3 className="wr-form-section__title">{section.name}</h3>
      </header>
      <div className="wr-form-section__body">
        <div className="company-form__grid">
          {visibleFields.map((field) => (
            <WorkOrderFieldInput
              key={field.id}
              field={field}
              value={values[field.id]}
              onChange={(val) => onChange(field.id, val)}
              disabled={disabled}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

export default function WorkOrderForm({ schema, values, onChange, disabled, renderSection }) {
  if (!schema?.sections?.length) {
    return (
      <div className="wo-empty">
        <p>No fields are configured for this work order form.</p>
      </div>
    )
  }

  return (
    <div className="wo-form wr-create-form">
      {schema.sections.map((section) => {
        const custom = renderSection?.(section)
        if (custom != null) return custom
        return (
          <WorkOrderSection
            key={section.id}
            section={section}
            values={values}
            onChange={onChange}
            disabled={disabled}
          />
        )
      })}
    </div>
  )
}
