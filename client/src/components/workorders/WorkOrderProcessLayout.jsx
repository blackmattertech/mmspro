import OrderedFormLayout from '../forms/OrderedFormLayout'
import { useFormLayout } from '../../hooks/useFormLayout'
import { layoutForStages } from '../../lib/workOrderForms'
import { isCloseoutSection } from '../../lib/formSkips'

export default function WorkOrderProcessLayout({
  formId,
  stages,
  extrasValues = {},
  onExtraChange,
  actors,
  currentEmployeeId = null,
  disabled = false,
  renderField,
  omitField,
}) {
  const { layout, catalogFields, hasLayout, loading } = useFormLayout(formId, { fallbackToDefault: true })
  const staged = layoutForStages(layout, stages, { includeUnstaged: false })

  if (loading) {
    return <p className="wo-permit__hint">Loading form…</p>
  }
  if (!hasLayout || !staged?.sections?.length) return null

  return (
    <OrderedFormLayout
      formId={formId}
      layout={staged}
      catalogLookup={catalogFields}
      catalogValues={extrasValues}
      onCatalogChange={onExtraChange}
      masterValues={extrasValues}
      onMasterChange={onExtraChange}
      disabled={disabled}
      actors={actors}
      currentEmployeeId={currentEmployeeId}
      renderField={renderField}
      omitField={omitField}
      renderSection={(id, children, section) => {
        const rest = (children || []).filter(Boolean)
        if (!rest.length && !isCloseoutSection(id)) return null
        return (
          <section key={id} className="wr-form-section" aria-labelledby={`${id}-title`}>
            {section.label ? (
              <header className="wr-form-section__head" id={`${id}-title`}>
                <h3 className="wr-form-section__title">{section.label}</h3>
                {section.badge}
              </header>
            ) : null}
            <div className="wr-form-section__body">
              <div className="company-form__grid company-form__grid--12">{rest}</div>
            </div>
          </section>
        )
      }}
    />
  )
}

export function useWorkOrderProcessLayout(formId, stages) {
  const hook = useFormLayout(formId, { fallbackToDefault: true })
  return {
    ...hook,
    layout: layoutForStages(hook.layout, stages, { includeUnstaged: false }),
  }
}
