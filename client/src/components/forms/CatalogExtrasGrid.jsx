import { catalogId, parseLayoutId } from '../../lib/formLayoutIds'
import { isFieldDependencyMet } from '../../lib/assetFieldDependencies'
import { resolveActiveRules, isFieldHiddenByRules } from '../../lib/formOptionRules'
import { FormCatalogField } from './OrderedFormLayout'

export default function CatalogExtrasGrid({ layout, catalogFields = [], values = {}, onChange, disabled }) {
  if (!layout) return null
  const lookup = new Map((catalogFields || []).map((row) => [String(row.id), row]))
  const dependencyValues = { ...values }
  for (const [key, value] of Object.entries(values)) {
    const layoutKey = catalogId(key)
    if (layoutKey && dependencyValues[layoutKey] == null) dependencyValues[layoutKey] = value
  }
  const activeRules = resolveActiveRules(layout, dependencyValues)
  const extras = (layout.fields || []).filter((field) => parseLayoutId(field.id).kind === 'catalog')
  if (!extras.length) return null
  return extras.map((item) => {
    const parsed = parseLayoutId(item.id)
    const source = lookup.get(parsed.value)
    if (!source) return null
    if (isFieldHiddenByRules(item.id, activeRules)) return null
    if (item.dependsOnFieldId) {
      if (!isFieldDependencyMet({
        depends_on_parent_id: item.dependsOnFieldId,
        depends_on_option: item.dependsOnOptions,
      }, dependencyValues)) return null
    } else if (source.depends_on_parent_id && !isFieldDependencyMet(source, dependencyValues)) {
      return null
    }
    return (
      <FormCatalogField
        key={item.id}
        field={{ ...source, colSpan: item.colSpan }}
        value={values[source.id]}
        onChange={(val) => onChange?.(source.id, val)}
        disabled={disabled}
      />
    )
  })
}
