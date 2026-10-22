import { useEffect, useRef } from 'react'
import {
  parseLayoutId,
  sortLayoutItems,
  formFieldClassName,
  catalogId,
  normalizeFilledBy,
  layoutGroupsForSection,
} from '../../lib/formLayoutIds'
import WorkOrderFieldInput from '../workorders/WorkOrderFieldInput'
import { getFormDef } from '../../lib/formRegistry'
import { getMasterSource, resolveMasterFilters } from '../../lib/formFieldSources'
import { layoutHasEquipmentMaster } from '../../lib/equipmentLayoutFields'
import { isFieldDependencyMet } from '../../lib/assetFieldDependencies'
import {
  resolveActiveRules,
  fieldEffect,
  isFieldLockedByRules,
  isFieldVisibleByRules,
  copyFromPatches,
  excludeFromClearPatches,
  excludedValuesForField,
  normalizeOptions,
} from '../../lib/formOptionRules'
import {
  canEditFilledBy,
  filledByLabel,
  emptyGroupRow,
  normalizeGroupRows,
} from '../../lib/formFillership'
import MasterPicker from './MasterPicker'

function emptyMasterValue(value) {
  return Array.isArray(value) ? [] : ''
}

function hasMasterValue(value) {
  if (value == null || value === '') return false
  if (Array.isArray(value)) return value.length > 0
  return true
}

function valuesEqual(a, b) {
  if (a === b) return true
  if (!a || !b) return false
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((item, index) => item === b[index])
  }
  return false
}

function shallowEqualRecord(a, b) {
  if (a === b) return true
  if (!a || !b) return false
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  for (const key of aKeys) {
    if (!(key in b)) return false
    const av = a[key]
    const bv = b[key]
    if (av === bv) continue
    if (Array.isArray(av) || Array.isArray(bv)) {
      if (!valuesEqual(av, bv)) return false
      continue
    }
    return false
  }
  return true
}

function shallowEqualRules(a, b) {
  if (a === b) return true
  if (!Array.isArray(a) || !Array.isArray(b)) return false
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i]
    const right = b[i]
    if (left === right) continue
    if (!left || !right) return false
    if (
      left.targetFieldId !== right.targetFieldId
      || left.action !== right.action
      || left.sourceFieldId !== right.sourceFieldId
      || left.parentFieldId !== right.parentFieldId
      || left.optionValue !== right.optionValue
    ) {
      return false
    }
  }
  return true
}

export function FormCatalogField({
  field,
  value,
  onChange,
  disabled,
}) {
  return (
    <WorkOrderFieldInput
      field={{
        ...field,
        id: field.id,
        name: field.name || field.label,
        field_type: field.field_type || field.fieldType || 'text',
        is_required: Boolean(field.is_required),
        dropdown_options: field.dropdown_options || [],
        colSpan: field.colSpan,
      }}
      value={value}
      onChange={onChange}
      disabled={disabled}
    />
  )
}

function buildDependencyValues(catalogValues = {}, masterValues = {}) {
  const values = { ...catalogValues, ...masterValues }
  for (const [key, value] of Object.entries(catalogValues)) {
    const layoutKey = catalogId(key)
    if (layoutKey && values[layoutKey] == null) values[layoutKey] = value
  }
  return values
}

function layoutItemVisible(item, catalogSource, values, activeRules) {
  const effect = fieldEffect(item.id, activeRules)
  const ruleVisibility = isFieldVisibleByRules(effect)
  if (ruleVisibility != null) return ruleVisibility
  if (item.dependsOnFieldId) {
    return isFieldDependencyMet({
      depends_on_parent_id: item.dependsOnFieldId,
      depends_on_option: item.dependsOnOptions,
    }, values)
  }
  if (catalogSource?.depends_on_parent_id) {
    return isFieldDependencyMet(catalogSource, values)
  }
  return true
}

function selectOptionsForField(item) {
  return normalizeOptions(item.options).map((opt) => ({
    value: opt.value,
    label: opt.label,
  }))
}

function resolveActiveRulesForFields(fields, values) {
  return resolveActiveRules({ fields: fields || [], sections: [] }, values)
}

function RepeatableGroup({
  group,
  value,
  onChange,
  disabled = false,
}) {
  const childFields = sortLayoutItems(group.childFields || [])
  const minRows = Number(group.minRows) || 0
  const maxRows = Math.max(1, Number(group.maxRows) || 20)
  const rows = normalizeGroupRows(value, childFields, { minRows })

  const setRows = (next) => {
    onChange?.(next)
  }

  const updateCell = (rowIndex, fieldId, cellValue) => {
    const next = rows.map((row, index) => (
      index === rowIndex ? { ...row, [fieldId]: cellValue } : row
    ))
    setRows(next)
  }

  const addRow = () => {
    if (disabled || rows.length >= maxRows) return
    setRows([...rows, emptyGroupRow(childFields)])
  }

  const removeRow = (rowIndex) => {
    if (disabled || rows.length <= minRows) return
    setRows(rows.filter((_, index) => index !== rowIndex))
  }

  return (
    <div className="company-form__repeatable">
      <div className="company-form__repeatable-head">
        <strong>{group.label || 'Items'}</strong>
        {!disabled && rows.length < maxRows && (
          <button type="button" className="company-btn company-btn--ghost" onClick={addRow}>
            Add {group.label || 'item'}
          </button>
        )}
      </div>
      {!rows.length && (
        <p className="company-form__hint">
          {disabled ? 'No rows yet.' : `Click Add ${group.label || 'item'} to start.`}
        </p>
      )}
      {rows.map((row, rowIndex) => {
        const rowRules = resolveActiveRulesForFields(childFields, row)
        return (
          <div key={`row-${rowIndex}`} className="company-form__repeatable-row">
            <div className="company-form__repeatable-row-head">
              <span>{group.label || 'Item'} {rowIndex + 1}</span>
              {!disabled && rows.length > minRows && (
                <button
                  type="button"
                  className="company-btn company-btn--ghost"
                  onClick={() => removeRow(rowIndex)}
                >
                  Remove
                </button>
              )}
            </div>
            <div className="company-form__grid company-form__grid--12">
              {childFields.map((item) => {
                if (!layoutItemVisible(item, null, row, rowRules)) return null
                const locked = isFieldLockedByRules(item.id, rowRules) || disabled
                const required = Boolean(item.required)
                const excludeIds = excludedValuesForField(item.id, rowRules, row)
                return (
                  <FormCatalogField
                    key={`${rowIndex}-${item.id}`}
                    field={{
                      id: item.id,
                      name: item.label || 'Field',
                      field_type: item.fieldType || 'text',
                      colSpan: item.colSpan,
                      is_required: required,
                      dropdown_options: selectOptionsForField(item).filter(
                        (opt) => !excludeIds.includes(String(opt.value ?? '')),
                      ),
                    }}
                    value={row[item.id]}
                    onChange={(val) => updateCell(rowIndex, item.id, val)}
                    disabled={locked}
                  />
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function OrderedFormLayout({
  formId,
  layout,
  loading = false,
  fallback,
  renderField,
  renderSection,
  catalogLookup = [],
  catalogValues = {},
  onCatalogChange,
  masterValues = {},
  onMasterChange,
  disabled = false,
  actors = null,
}) {
  const formDef = formId ? getFormDef(formId) : null
  const dependencyValues = buildDependencyValues(catalogValues, masterValues)
  const activeRules = resolveActiveRules(layout, dependencyValues)
  const lastCopyKey = useRef('')
  const prevFilterParents = useRef({})
  const lastValuesRef = useRef(null)
  const lastRulesRef = useRef(null)
  const equipmentMasterOnLayout = layoutHasEquipmentMaster(layout)

  useEffect(() => {
    if (!layout || !onMasterChange) return
    const valuesUnchanged = shallowEqualRecord(lastValuesRef.current, dependencyValues)
    const rulesUnchanged = shallowEqualRules(lastRulesRef.current, activeRules)
    if (valuesUnchanged && rulesUnchanged) return
    lastValuesRef.current = dependencyValues
    lastRulesRef.current = activeRules

    const patches = {
      ...copyFromPatches(activeRules, dependencyValues),
      ...excludeFromClearPatches(activeRules, dependencyValues),
    }
    const key = Object.keys(patches).sort().map((fieldId) => `${fieldId}:${JSON.stringify(patches[fieldId])}`).join('|')
    if (key === lastCopyKey.current) return
    lastCopyKey.current = key
    for (const [fieldId, value] of Object.entries(patches)) {
      if (dependencyValues[fieldId] === value) continue
      onMasterChange(fieldId, value)
    }
  }, [layout, dependencyValues, activeRules, onMasterChange])

  useEffect(() => {
    if (!layout || !onMasterChange) return
    const parentIds = new Set(
      (layout.fields || [])
        .map((field) => field.filterByFieldId)
        .filter(Boolean),
    )
    for (const field of layout.fields || []) {
      if (!field.filterByFieldId) continue
      const parentId = field.filterByFieldId
      const parentVal = dependencyValues[parentId] ?? ''
      const prev = prevFilterParents.current[parentId]
      if (prev === undefined) continue
      if (String(prev) === String(parentVal)) continue
      if (!hasMasterValue(dependencyValues[field.id])) continue
      onMasterChange(field.id, emptyMasterValue(dependencyValues[field.id]))
    }
    const next = { ...prevFilterParents.current }
    for (const parentId of parentIds) {
      next[parentId] = dependencyValues[parentId] ?? ''
    }
    prevFilterParents.current = next
  }, [layout, dependencyValues, onMasterChange])

  if (loading || !layout) return fallback

  const sections = sortLayoutItems(layout.sections || [])
  const fields = sortLayoutItems(layout.fields || [])
  const catalogById = new Map((catalogLookup || []).map((row) => [String(row.id), row]))
  const systemByKey = new Map((formDef?.systemFields || []).map((item) => [item.key, item]))

  return sections.map((section) => {
    const filledBy = normalizeFilledBy(section.filledBy)
    const sectionEditable = actors ? canEditFilledBy(filledBy, actors) : true
    const sectionDisabled = disabled || !sectionEditable
    const sectionFields = fields.filter((field) => field.sectionId === section.id)
    const sectionGroups = layoutGroupsForSection(layout, section.id)

    const children = sectionFields.map((item) => {
      const parsed = parseLayoutId(item.id)
      const className = formFieldClassName(item)
      const required = Boolean(item.required)
      const catalogSource = parsed.kind === 'catalog' ? catalogById.get(parsed.value) : null
      const locked = isFieldLockedByRules(item.id, activeRules) || sectionDisabled
      const excludeIds = excludedValuesForField(item.id, activeRules, dependencyValues)

      if (!layoutItemVisible(item, catalogSource, dependencyValues, activeRules)) return null

      if (parsed.kind === 'catalog') {
        if (!catalogSource) return null
        const dropdownOptions = Array.isArray(catalogSource.dropdown_options)
          ? catalogSource.dropdown_options.filter((opt) => {
            const val = String(opt?.value ?? opt?.label ?? opt ?? '')
            return !excludeIds.includes(val)
          })
          : catalogSource.dropdown_options
        const fromEquipment = Boolean(item.autoFromEquipment)
          || (equipmentMasterOnLayout && catalogSource.field_source === 'equipment')
        const catalogValue = catalogValues[catalogSource.id] ?? catalogValues[item.id]
        if (fromEquipment) {
          return (
            <label key={item.id} className={className}>
              <span className="company-form__label">{catalogSource.name || catalogSource.label}</span>
              <input
                className="company-form__input"
                type="text"
                value={catalogValue || '—'}
                readOnly
                disabled
              />
            </label>
          )
        }
        return (
          <FormCatalogField
            key={item.id}
            field={{
              ...catalogSource,
              colSpan: item.colSpan,
              is_required: required || catalogSource.is_required,
              dropdown_options: dropdownOptions,
            }}
            value={catalogValue}
            onChange={(val) => onCatalogChange?.(catalogSource.id, val)}
            disabled={locked}
          />
        )
      }

      if (parsed.kind === 'master' || parsed.kind === 'field') {
        const sourceId = item.masterSource || (parsed.kind === 'master' ? parsed.value : '')
        const master = getMasterSource(sourceId)
        const label = item.label || master?.label || 'Field'
        if (sourceId) {
          const filters = resolveMasterFilters(item, layout, dependencyValues)
          return (
            <label key={item.id} className={className}>
              <span className="company-form__label">
                {label}
                {required ? ' *' : ''}
              </span>
              <MasterPicker
                sourceId={sourceId}
                formId={formId}
                value={masterValues[item.id]}
                onChange={(val) => onMasterChange?.(item.id, val)}
                required={required}
                disabled={locked}
                excludeIds={excludeIds}
                filters={filters}
              />
            </label>
          )
        }
        return (
          <FormCatalogField
            key={item.id}
            field={{
              id: item.id,
              name: label,
              field_type: item.fieldType || 'text',
              colSpan: item.colSpan,
              is_required: required,
              dropdown_options: selectOptionsForField(item).filter(
                (opt) => !excludeIds.includes(String(opt.value ?? '')),
              ),
            }}
            value={catalogValues[item.id] ?? masterValues[item.id]}
            onChange={(val) => (onMasterChange || onCatalogChange)?.(item.id, val)}
            disabled={locked}
          />
        )
      }

      if (parsed.kind === 'system') {
        return renderField?.(parsed.value, {
          className,
          colSpan: item.colSpan,
          field: systemByKey.get(parsed.value),
          required,
          disabled: locked,
        }) || null
      }

      return null
    }).filter(Boolean)

    const groupNodes = sectionGroups.map((group) => (
      <div key={group.id} className="company-form__field company-form__field--w-100">
        <RepeatableGroup
          group={group}
          value={catalogValues[group.id]}
          onChange={(rows) => onCatalogChange?.(group.id, rows)}
          disabled={sectionDisabled}
        />
      </div>
    ))

    const allChildren = [...children, ...groupNodes]
    if (!allChildren.length) return null

    const badge = filledBy !== 'any' ? (
      <span className="company-form__fillership-badge">
        {sectionEditable
          ? `Filled by you (${filledByLabel(filledBy)})`
          : actors?.isCreate && filledBy !== 'creator'
            ? `Filled later by ${filledByLabel(filledBy)}`
            : `Filled by ${filledByLabel(filledBy)} · read-only`}
      </span>
    ) : null

    if (renderSection) {
      return renderSection(section.id, allChildren, { ...section, filledBy, sectionEditable, badge })
    }

    return (
      <section
        key={section.id}
        data-section-id={section.id}
        className={`company-form__layout-section wo-section ${sectionDisabled && filledBy !== 'any' ? 'is-fillership-locked' : ''}`}
      >
        {section.label || badge ? (
          <div className="wo-section__header company-form__layout-section-head">
            {section.label ? <h3 className="wo-section__title">{section.label}</h3> : null}
            {badge}
          </div>
        ) : null}
        <div className={`wo-section__body company-form__layout-section-body ${section.label || badge ? '' : 'company-form__layout-section-body--flush'}`.trim()}>
          <div className="company-form__grid company-form__grid--12">{allChildren}</div>
        </div>
      </section>
    )
  })
}
