import { useState } from 'react'
import WorkOrderFieldInput from './WorkOrderFieldInput'
import SectionIcon, { sectionFallbackColor } from './SectionIcon'
import { filterVisibleFields } from '../../lib/assetFieldDependencies'
import './ManualWorkOrder.css'

function WorkOrderSection({ section, color, values, onChange, disabled, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  const visibleFields = filterVisibleFields(section.fields, values)

  return (
    <section className="wo-section">
      <button
        type="button"
        className="wo-section__header"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="wo-section__header-left">
          <SectionIcon iconUrl={section.icon_signed_url} color={color} />
          <div>
            <h2 className="wo-section__title">{section.name}</h2>
            <p className="wo-section__desc">
              {visibleFields.length} field{visibleFields.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>
        <span className={`wo-section__chevron${open ? ' wo-section__chevron--open' : ''}`} aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      {open && (
        <div className="wo-section__body">
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
      )}
    </section>
  )
}

export default function WorkOrderForm({ schema, values, onChange, disabled }) {
  if (!schema?.sections?.length) {
    return (
      <div className="wo-empty">
        <p>No fields are configured for this work order form.</p>
        <p className="wo-empty__hint">
          Add sections and parent fields under Masters → Assets, then use the settings button to choose which fields appear here.
        </p>
      </div>
    )
  }

  return (
    <div className="wo-form">
      {schema.sections.map((section, index) => (
        <WorkOrderSection
          key={section.id}
          section={section}
          color={sectionFallbackColor(index)}
          values={values}
          onChange={onChange}
          disabled={disabled}
        />
      ))}
    </div>
  )
}
