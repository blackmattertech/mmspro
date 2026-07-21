import { useMemo, useEffect, useState } from 'react'
import DateField from '../ui/DateField'
import { dependencyLabel } from '../../lib/assetFieldDependencies'
import {
  applyAssetFieldChange,
  capacityOptionsForSelection,
  distinctAreasFromEquipment,
  distinctFieldValues,
  equipmentFieldValue,
  fieldValuesFromEquipment,
  fieldsForWorkRequestSection,
  filterEquipmentByArea,
  filterEquipmentByValues,
  flattenAssetSections,
  getEquipmentFieldRole,
  isEquipmentCascadeRole,
  optionsForAssetField,
  resolveUniqueEquipmentId,
  visibleAssetSections,
} from '../../lib/workRequestAssetPicker'
import FilterableSelect from '../ui/FilterableSelect'
import '../assets/AssetsFields.css'
import '../company/CompanyShared.css'

function formatEquipmentLabel(row) {
  const parts = [row.name, row.code].filter(Boolean)
  return parts.join(' · ') || row.id
}

function AssetFieldInput({
  field,
  value,
  options,
  disabled,
  onChange,
  forceSelect = false,
  readOnly = false,
  errorMessage = null,
}) {
  const label = field.is_required ? `${field.name} *` : field.name
  const hint = dependencyLabel(field)

  if (readOnly) {
    return (
      <label className="company-form__field">
        <span className="company-form__label">{label}</span>
        <input className="company-form__input" type="text" value={value || '—'} readOnly disabled />
      </label>
    )
  }

  if (field.field_type === 'textarea') {
    return (
      <label className="company-form__field company-form__field--full">
        <span className="company-form__label">{label}</span>
        {hint && (
          <span className="wo-manual__intro" style={{ margin: '0 0 6px', fontSize: 12 }}>{hint}</span>
        )}
        <textarea
          className="company-form__input company-form__textarea"
          rows={3}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      </label>
    )
  }

  if (
    forceSelect
    || field.field_type === 'dropdown'
    || (field.dropdown_options?.length && field.field_type !== 'radio')
  ) {
    return (
      <label className="company-form__field">
        <span className="company-form__label">{label}</span>
        {hint && (
          <span className="wo-manual__intro" style={{ margin: '0 0 6px', fontSize: 12 }}>{hint}</span>
        )}
        <FilterableSelect
          value={value || ''}
          onChange={onChange}
          options={options}
          placeholder="Select…"
          disabled={disabled || (!options.length && !errorMessage)}
          required={field.is_required && !errorMessage}
          className="company-form__input--select"
        />
        {errorMessage ? (
          <span className="wr-field-error" role="alert">
            {errorMessage}
          </span>
        ) : null}
      </label>
    )
  }

  if (field.field_type === 'radio') {
    return (
      <div className="company-form__field company-form__field--full">
        <span className="company-form__label">{label}</span>
        {hint && (
          <span className="wo-manual__intro" style={{ margin: '0 0 6px', fontSize: 12 }}>{hint}</span>
        )}
        <div className="wr-radio-options" role="radiogroup" aria-label={field.name}>
          {(options.length ? options : field.dropdown_options || []).map((opt) => (
            <label key={opt} className="asset-field-dependency__option">
              <input
                type="radio"
                name={`wr-asset-${field.id}`}
                value={opt}
                checked={value === opt}
                onChange={() => onChange(opt)}
                disabled={disabled}
              />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      </div>
    )
  }

  if (field.field_type === 'checkbox' && field.dropdown_options?.length) {
    const selected = Array.isArray(value) ? value : []
    return (
      <div className="company-form__field company-form__field--full">
        <span className="company-form__label">{label}</span>
        <div className="asset-field-dependency__options" role="group" aria-label={field.name}>
          {field.dropdown_options.map((opt) => (
            <label key={opt} className="asset-field-dependency__option">
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                disabled={disabled}
                onChange={() => {
                  const next = selected.includes(opt)
                    ? selected.filter((item) => item !== opt)
                    : [...selected, opt]
                  onChange(next)
                }}
              />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      </div>
    )
  }

  if (field.field_type === 'date' || field.field_type === 'datetime') {
    return (
      <label className="company-form__field">
        <span className="company-form__label">{label}</span>
        <DateField
          className="company-form__input"
          value={value || ''}
          onChange={onChange}
          withTime={field.field_type === 'datetime'}
          disabled={disabled}
        />
      </label>
    )
  }

  return (
    <label className="company-form__field">
      <span className="company-form__label">{label}</span>
      <input
        className="company-form__input"
        type={field.field_type === 'number' ? 'number' : 'text'}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </label>
  )
}

function clearCascadeAfter(fieldValues, allFields, fromRole) {
  const order = ['equipmentType', 'equipmentName', 'equipmentTag', 'equipmentCode', 'capacity']
  const start = order.indexOf(fromRole)
  if (start < 0) return fieldValues
  const next = { ...fieldValues }
  for (const field of allFields) {
    const role = getEquipmentFieldRole(field)
    const idx = order.indexOf(role)
    if (idx > start) delete next[field.id]
  }
  return next
}

export default function WorkRequestAssetFields({
  sections,
  equipment,
  fieldValues,
  onFieldValuesChange,
  equipmentId,
  onEquipmentIdChange,
  loading,
  disabled,
}) {
  const allFields = useMemo(() => flattenAssetSections(sections), [sections])
  const capacityField = useMemo(
    () => allFields.find((f) => getEquipmentFieldRole(f) === 'capacity') || null,
    [allFields],
  )
  const codeField = useMemo(
    () => allFields.find((f) => getEquipmentFieldRole(f) === 'equipmentCode') || null,
    [allFields],
  )

  const areas = useMemo(() => distinctAreasFromEquipment(equipment), [equipment])
  const [areaId, setAreaId] = useState('')

  const scopedEquipment = useMemo(
    () => filterEquipmentByArea(equipment, areaId),
    [equipment, areaId],
  )

  const visibleSections = useMemo(
    () => visibleAssetSections(sections, fieldValues),
    [sections, fieldValues],
  )

  const handleAreaChange = (nextAreaId) => {
    setAreaId(nextAreaId)
    onFieldValuesChange({})
    onEquipmentIdChange('')
  }

  const handleFieldChange = (field, nextValue) => {
    const role = getEquipmentFieldRole(field)
    let nextValues = applyAssetFieldChange(field.id, nextValue, fieldValues, allFields)
    nextValues = clearCascadeAfter(nextValues, allFields, role)
    onFieldValuesChange(nextValues)
    const resolved = resolveUniqueEquipmentId(scopedEquipment, nextValues, allFields)
    onEquipmentIdChange(resolved || '')
  }

  useEffect(() => {
    if (!equipment.length) setAreaId('')
  }, [equipment])

  useEffect(() => {
    if (!capacityField || !areaId) return
    const tagField = allFields.find((f) => getEquipmentFieldRole(f) === 'equipmentTag')
    if (tagField && !fieldValues[tagField.id]) return

    const caps = capacityOptionsForSelection(
      scopedEquipment,
      fieldValues,
      allFields,
      capacityField,
    )
    if (caps.length !== 1) return
    if (fieldValues[capacityField.id] === caps[0]) {
      const resolved = resolveUniqueEquipmentId(scopedEquipment, fieldValues, allFields)
      if (resolved && resolved !== equipmentId) onEquipmentIdChange(resolved)
      return
    }
    const nextValues = { ...fieldValues, [capacityField.id]: caps[0] }
    onFieldValuesChange(nextValues)
    onEquipmentIdChange(resolveUniqueEquipmentId(scopedEquipment, nextValues, allFields) || '')
  }, [
    capacityField,
    areaId,
    scopedEquipment,
    fieldValues,
    allFields,
    equipmentId,
    onFieldValuesChange,
    onEquipmentIdChange,
  ])

  useEffect(() => {
    if (!codeField || !areaId) return
    const typeField = allFields.find((f) => getEquipmentFieldRole(f) === 'equipmentType')
    const nameField = allFields.find((f) => getEquipmentFieldRole(f) === 'equipmentName')
    const tagField = allFields.find((f) => getEquipmentFieldRole(f) === 'equipmentTag')
    if (tagField && !fieldValues[tagField.id]) return
    if (!tagField && nameField && !fieldValues[nameField.id]) return
    if (!tagField && !nameField && typeField && !fieldValues[typeField.id]) return

    const matches = filterEquipmentByValues(scopedEquipment, fieldValues, { allFields })
    const codes = distinctFieldValues(matches, codeField.id, allFields)
    if (codes.length !== 1) return
    if (fieldValues[codeField.id] === codes[0]) {
      const resolved = resolveUniqueEquipmentId(scopedEquipment, fieldValues, allFields)
      if (resolved && resolved !== equipmentId) onEquipmentIdChange(resolved)
      return
    }
    const nextValues = { ...fieldValues, [codeField.id]: codes[0] }
    onFieldValuesChange(nextValues)
    onEquipmentIdChange(resolveUniqueEquipmentId(scopedEquipment, nextValues, allFields) || '')
  }, [
    codeField,
    areaId,
    scopedEquipment,
    fieldValues,
    allFields,
    equipmentId,
    onFieldValuesChange,
    onEquipmentIdChange,
  ])

  useEffect(() => {
    if (!equipmentId || !allFields.length) return
    const row = scopedEquipment.find((r) => r.id === equipmentId)
      || equipment.find((r) => r.id === equipmentId)
    if (!row) return
    const fromRow = fieldValuesFromEquipment(row, allFields)
    const next = { ...fieldValues }
    let changed = false
    for (const [fieldId, value] of Object.entries(fromRow)) {
      if (!value) continue
      const field = allFields.find((f) => f.id === fieldId)
      if (!field) continue
      const role = getEquipmentFieldRole(field)
      if (role === 'equipmentCode' && next[fieldId] !== value) {
        next[fieldId] = value
        changed = true
      }
    }
    if (changed) onFieldValuesChange(next)
  }, [
    equipmentId,
    scopedEquipment,
    equipment,
    allFields,
    fieldValues,
    onFieldValuesChange,
  ])

  useEffect(() => {
    if (!equipmentId) return
    const row = scopedEquipment.find((r) => r.id === equipmentId)
      || equipment.find((r) => r.id === equipmentId)
    if (!row) {
      onEquipmentIdChange('')
    }
  }, [areaId, scopedEquipment, equipment, equipmentId, onEquipmentIdChange])

  useEffect(() => {
    if (!areaId || !allFields.length) return

    let next = { ...fieldValues }
    let changed = false

    for (const field of allFields) {
      const role = getEquipmentFieldRole(field)
      if (!isEquipmentCascadeRole(role)) continue

      const raw = next[field.id]
      const current = Array.isArray(raw) ? '' : String(raw ?? '').trim()
      if (!current) continue

      const opts = optionsForAssetField(field, scopedEquipment, next, allFields)
      const allowed = opts.some((opt) => String(opt).trim().toLowerCase() === current.toLowerCase())
      if (!opts.length || !allowed) {
        next = clearCascadeAfter(next, allFields, role)
        delete next[field.id]
        changed = true
      }
    }

    if (!changed) return
    onFieldValuesChange(next)
    onEquipmentIdChange(resolveUniqueEquipmentId(scopedEquipment, next, allFields) || '')
  }, [
    areaId,
    scopedEquipment,
    allFields,
    fieldValues,
    onFieldValuesChange,
    onEquipmentIdChange,
  ])

  const renderField = (field) => {
    const role = getEquipmentFieldRole(field)
    if (role === 'redundant' || role === 'area') return null

    const typeField = allFields.find((f) => getEquipmentFieldRole(f) === 'equipmentType')
    const nameField = allFields.find((f) => getEquipmentFieldRole(f) === 'equipmentName')
    const tagField = allFields.find((f) => getEquipmentFieldRole(f) === 'equipmentTag')

    if (role === 'equipmentType' && !areaId) return null
    if (role === 'equipmentName' && (!areaId || scopedEquipment.length === 0 || !typeField || !fieldValues[typeField.id])) return null
    if (role === 'equipmentTag' && (!areaId || scopedEquipment.length === 0 || !nameField || !fieldValues[nameField.id])) return null
    if (role === 'equipmentCode') {
      if (!areaId || scopedEquipment.length === 0) return null
      if (tagField && !fieldValues[tagField.id]) return null
      if (!tagField && nameField && !fieldValues[nameField.id]) return null
      if (!tagField && !nameField && typeField && !fieldValues[typeField.id]) return null
    }
    if (role === 'capacity' && (!areaId || scopedEquipment.length === 0 || !tagField || !fieldValues[tagField.id])) return null

    const options = optionsForAssetField(field, scopedEquipment, fieldValues, allFields)

    const noEquipmentTypeInArea = role === 'equipmentType' && areaId && !options.length

    const rawValue = fieldValues[field.id]
    let value = Array.isArray(rawValue) ? rawValue : (rawValue ?? '')

    if (isEquipmentCascadeRole(role) && value) {
      const optionList = options.map((opt) => String(opt).trim().toLowerCase())
      const current = String(value).trim().toLowerCase()
      if (!optionList.length || !optionList.includes(current)) {
        value = ''
      }
    }

    let forceSelect = false
    let readOnly = false

    if (role === 'equipmentName' || role === 'equipmentTag') {
      forceSelect = true
    }

    if (role === 'equipmentCode' && codeField?.id === field.id) {
      const matches = filterEquipmentByValues(scopedEquipment, fieldValues, {
        excludeFieldId: field.id,
        allFields,
      })
      const codeOptions = distinctFieldValues(matches, field.id, allFields)
      if (codeOptions.length === 1) {
        value = codeOptions[0]
        readOnly = true
      } else if (codeOptions.length > 1) {
        forceSelect = true
      } else {
        const resolvedRow = equipmentId
          ? (scopedEquipment.find((r) => r.id === equipmentId)
            || equipment.find((r) => r.id === equipmentId))
          : null
        if (resolvedRow) {
          value = equipmentFieldValue(resolvedRow, field)
          if (value) readOnly = true
        }
      }
    }

    if (role === 'capacity' && capacityField?.id === field.id) {
      const capOptions = capacityOptionsForSelection(
        scopedEquipment,
        fieldValues,
        allFields,
        capacityField,
      )
      if (capOptions.length === 1) {
        value = capOptions[0]
        readOnly = true
      } else if (capOptions.length > 1) {
        forceSelect = true
      }
    }

    if (noEquipmentTypeInArea) {
      forceSelect = true
    }

    const fieldDisabled = disabled || loading || noEquipmentTypeInArea
      || (role === 'equipmentType' && !areaId)
      || (role === 'equipmentName' && typeField && !fieldValues[typeField.id])
      || (role === 'equipmentTag' && nameField && !fieldValues[nameField.id])

    return (
      <AssetFieldInput
        key={field.id}
        field={field}
        value={noEquipmentTypeInArea ? '' : value}
        errorMessage={noEquipmentTypeInArea ? 'No equipment type in this area.' : null}
        options={forceSelect ? (role === 'capacity'
          ? capacityOptionsForSelection(scopedEquipment, fieldValues, allFields, field)
          : role === 'equipmentCode'
            ? distinctFieldValues(
              filterEquipmentByValues(scopedEquipment, fieldValues, {
                excludeFieldId: field.id,
                allFields,
              }),
              field.id,
              allFields,
            )
            : options) : options}
        disabled={fieldDisabled}
        forceSelect={forceSelect}
        readOnly={readOnly}
        onChange={(next) => handleFieldChange(field, next)}
      />
    )
  }

  const showAreaSelect = areas.length > 0
  const equipmentTypeField = useMemo(
    () => allFields.find((f) => getEquipmentFieldRole(f) === 'equipmentType') || null,
    [allFields],
  )
  const showEquipmentTypeGap = Boolean(
    areaId
    && equipmentTypeField
    && !optionsForAssetField(equipmentTypeField, scopedEquipment, fieldValues, allFields).length,
  )

  return (
    <div className="wr-asset-sections">
      {visibleSections.map((section, sectionIndex) => {
        const orderedFields = fieldsForWorkRequestSection(section.fields)
        return (
          <div key={section.id} className="equipment-dynamic-section">
            <h3 className="equipment-dynamic-section__title">{section.name}</h3>
            <div className="company-form__grid">
              {showAreaSelect && sectionIndex === 0 && (
                <label className="company-form__field">
                  <span className="company-form__label">Area *</span>
                  <FilterableSelect
                    value={areaId}
                    onChange={handleAreaChange}
                    options={areas}
                    getOptionValue={(area) => area.id}
                    getOptionLabel={(area) => area.name}
                    placeholder="Select area…"
                    disabled={disabled || loading}
                    required
                    className="company-form__input--select"
                  />
                </label>
              )}
              {orderedFields.map((field) => renderField(field))}
            </div>
          </div>
        )
      })}

      {areaId && scopedEquipment.length === 0 && !loading && !showEquipmentTypeGap && (
        <p className="wo-manual__intro" style={{ marginTop: 0 }}>
          No equipment in this area for the selected department.
        </p>
      )}

      {areaId && scopedEquipment.length > 0 && !equipmentId && !loading && !showEquipmentTypeGap && (
        <p className="wo-manual__intro" style={{ marginTop: 0 }}>
          Complete Area, Equipment Type, Name, Tag, Code, and Capacity to select equipment.
        </p>
      )}

      {equipmentId && (
        <p className="wr-selected-asset">
          <strong>Selected equipment:</strong>{' '}
          {formatEquipmentLabel(
            scopedEquipment.find((r) => r.id === equipmentId)
            || equipment.find((r) => r.id === equipmentId),
          )}
        </p>
      )}
    </div>
  )
}
