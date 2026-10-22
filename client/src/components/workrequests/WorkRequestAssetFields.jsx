import { useMemo, useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import DateField from '../ui/DateField'
import { dependencyLabel } from '../../lib/assetFieldDependencies'
import {
  applyAssetFieldChange,
  capacityOptionsForSelection,
  distinctAreasFromEquipment,
  distinctFieldValues,
  BLANK_EQUIPMENT_TYPE,
  equipmentFieldValue,
  equipmentMatchingSelectors,
  equipmentTypeChoices,
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
import SpellcheckInput from '../shared/SpellcheckInput'
import FormLabel from '../shared/FormLabel'
import { useTextFieldLimits } from '../../hooks/useTextFieldLimits'
import '../assets/AssetsFields.css'
import '../company/CompanyShared.css'

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
  const { maxLengthForField } = useTextFieldLimits()
  const limit = maxLengthForField(field)

  if (readOnly) {
    const text = value || ''
    const showImage = (field.field_type === 'image' || /image/i.test(field.name || ''))
      && /^(https?:|data:image\/)/i.test(text)
    if (showImage) {
      return (
        <div className="company-form__field">
          <span className="company-form__label">{field.name}</span>
          <img className="wr-asset-image" src={text} alt={field.name || ''} />
        </div>
      )
    }
    return (
      <label className="company-form__field">
        <span className="company-form__label">{field.name}</span>
        <input className="company-form__input" type="text" value={text || '—'} readOnly disabled />
      </label>
    )
  }

  if (field.field_type === 'textarea') {
    return (
      <label className="company-form__field company-form__field--full">
        <FormLabel limit={limit}>{label}</FormLabel>
        {hint && (
          <span className="wo-manual__intro" style={{ margin: '0 0 6px', fontSize: 12 }}>{hint}</span>
        )}
        <SpellcheckInput
          multiline
          className="company-form__input company-form__textarea"
          rows={3}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          maxLength={limit}
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

  if (field.field_type === 'number') {
    return (
      <label className="company-form__field">
        <span className="company-form__label">{label}</span>
        <input
          className="company-form__input"
          type="number"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      </label>
    )
  }

  return (
    <label className="company-form__field">
      <FormLabel limit={limit}>{label}</FormLabel>
      <SpellcheckInput
        className="company-form__input"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        maxLength={limit}
      />
    </label>
  )
}

function EquipmentQrThumb({ value }) {
  const [src, setSrc] = useState('')

  useEffect(() => {
    if (!value) {
      setSrc('')
      return undefined
    }
    let cancelled = false
    QRCode.toDataURL(String(value), { width: 160, margin: 1, errorCorrectionLevel: 'M' })
      .then((url) => {
        if (!cancelled) setSrc(url)
      })
      .catch(() => {
        if (!cancelled) setSrc('')
      })
    return () => { cancelled = true }
  }, [value])

  if (!src) return null
  return <img className="wr-asset-qr" src={src} alt="Equipment QR code" />
}

function isImageValue(value) {
  return /^(https?:|data:image\/)/i.test(String(value || ''))
}

function equipmentMasterFacts(row, allFields) {
  if (!row) return []
  const facts = []
  if (row.code) facts.push({ key: 'code', label: 'Code', value: row.code })
  if (row.location_name) facts.push({ key: 'location', label: 'Location', value: row.location_name })
  if (row.image_signed_url) facts.push({ key: 'image', label: 'Image', image: row.image_signed_url })
  if (row.qr_code) facts.push({ key: 'qr', label: 'QR code', qr: row.qr_code })

  const skip = new Set(['area', 'equipmentName', 'equipmentType', 'equipmentCode', 'redundant'])
  for (const field of allFields) {
    const role = getEquipmentFieldRole(field)
    if (skip.has(role)) continue
    const value = equipmentFieldValue(row, field)
    if (!value) continue
    const image = field.field_type === 'image' || /image/i.test(field.name || '')
    if (image) {
      if (!isImageValue(value) || value === row.image_signed_url) continue
      facts.push({ key: field.id, label: field.name, image: value })
      continue
    }
    facts.push({ key: field.id, label: field.name, value })
  }
  return facts
}

function equipmentChoiceLabel(row, nameField) {
  const name = (nameField && equipmentFieldValue(row, nameField)) || row?.name || row?.code || 'Equipment'
  if (row?.code && name !== row.code) return `${name} (${row.code})`
  return name
}

function optionValue(option) {
  if (option && typeof option === 'object') return option.value ?? ''
  return option ?? ''
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
  seedAreaId = '',
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
  const [areaId, setAreaId] = useState(seedAreaId || '')
  const seededAreaRef = useRef(Boolean(seedAreaId))

  useEffect(() => {
    if (!seedAreaId || seededAreaRef.current) return
    seededAreaRef.current = true
    setAreaId(seedAreaId)
  }, [seedAreaId])

  useEffect(() => {
    if (!areaId || !areas.length) return
    const match = areas.find((area) => area.id === areaId || area.ids?.includes(areaId))
    if (match && match.id !== areaId) setAreaId(match.id)
  }, [areas, areaId])

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
    if (!equipment.length && !seedAreaId) setAreaId('')
  }, [equipment, seedAreaId])

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
    const typeField = allFields.find((field) => getEquipmentFieldRole(field) === 'equipmentType')
    if (typeField && !fromRow[typeField.id]) fromRow[typeField.id] = BLANK_EQUIPMENT_TYPE
    for (const field of allFields) {
      const isImage = field.field_type === 'image' || /image/i.test(field.name || '')
      if (isImage && !fromRow[field.id] && row.image_signed_url) {
        fromRow[field.id] = row.image_signed_url
      }
    }
    const next = { ...fieldValues }
    let changed = false
    for (const [fieldId, value] of Object.entries(fromRow)) {
      if (!value || next[fieldId] === value) continue
      next[fieldId] = value
      changed = true
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
    if (!equipmentId || loading) return
    const row = scopedEquipment.find((r) => r.id === equipmentId)
      || equipment.find((r) => r.id === equipmentId)
    if (!row) {
      onEquipmentIdChange('')
    }
  }, [areaId, scopedEquipment, equipment, equipmentId, onEquipmentIdChange, loading])

  useEffect(() => {
    if (!areaId || !allFields.length || loading) return

    let next = { ...fieldValues }
    let changed = false
    const selected = equipment.find((row) => row.id === equipmentId) || null

    for (const field of allFields) {
      const role = getEquipmentFieldRole(field)
      if (!isEquipmentCascadeRole(role)) continue

      const raw = next[field.id]
      const current = Array.isArray(raw) ? '' : String(raw ?? '').trim()
      if (!current) continue

      if (role === 'equipmentType' && current === BLANK_EQUIPMENT_TYPE) continue

      const fromSelected = equipmentFieldValue(selected, field)
      if (fromSelected && fromSelected.trim().toLowerCase() === current.toLowerCase()) continue
      if (role === 'equipmentType' && selected && !fromSelected && current === BLANK_EQUIPMENT_TYPE) continue

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
    equipment,
    equipmentId,
    allFields,
    fieldValues,
    onFieldValuesChange,
    onEquipmentIdChange,
    loading,
  ])

  const equipmentTypeField = useMemo(
    () => allFields.find((f) => getEquipmentFieldRole(f) === 'equipmentType') || null,
    [allFields],
  )
  const equipmentNameField = useMemo(
    () => allFields.find((f) => getEquipmentFieldRole(f) === 'equipmentName') || null,
    [allFields],
  )
  const typeOptions = useMemo(
    () => (areaId ? equipmentTypeChoices(scopedEquipment, equipmentTypeField, allFields) : []),
    [areaId, equipmentTypeField, scopedEquipment, allFields],
  )
  const typeUnavailable = !equipmentTypeField
  const nameChoices = useMemo(() => {
    if (!areaId) return []
    return equipmentMatchingSelectors(scopedEquipment, fieldValues, allFields, equipmentNameField?.id)
  }, [areaId, scopedEquipment, fieldValues, allFields, equipmentNameField])

  const renderField = (field) => {
    const role = getEquipmentFieldRole(field)
    if (role === 'redundant' || role === 'area' || role === 'equipmentCode') return null

    const nameField = equipmentNameField
    const tagField = allFields.find((f) => getEquipmentFieldRole(f) === 'equipmentTag')

    if (role === 'equipmentType' && (!areaId || typeUnavailable || scopedEquipment.length === 0)) return null
    if (role === 'equipmentName' && (!areaId || scopedEquipment.length === 0)) return null
    if (role === 'equipmentTag' && (!areaId || scopedEquipment.length === 0 || !nameField || !fieldValues[nameField.id])) return null
    if (role === 'capacity' && (!areaId || scopedEquipment.length === 0 || !tagField || !fieldValues[tagField.id])) return null

    const isMedia = field.field_type === 'image' || field.field_type === 'file' || /image/i.test(field.name || '')
    if (role === 'other' || isMedia) return null

    const options = role === 'equipmentType'
      ? typeOptions
      : optionsForAssetField(field, scopedEquipment, fieldValues, allFields)

    const rawValue = fieldValues[field.id]
    let value = Array.isArray(rawValue) ? rawValue : (rawValue ?? '')

    if (isEquipmentCascadeRole(role) && value && role !== 'equipmentType') {
      const optionList = options.map((opt) => String(optionValue(opt)).trim().toLowerCase())
      const current = String(value).trim().toLowerCase()
      if (!optionList.length || !optionList.includes(current)) {
        value = ''
      }
    }

    let forceSelect = false
    let readOnly = false

    if (role === 'equipmentType' || role === 'equipmentName' || role === 'equipmentTag') {
      forceSelect = true
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

    const fieldDisabled = disabled || loading
      || (role === 'equipmentType' && !areaId)
      || (role === 'equipmentTag' && nameField && !fieldValues[nameField.id])

    return (
      <AssetFieldInput
        key={field.id}
        field={field}
        value={value}
        options={forceSelect && role === 'capacity'
          ? capacityOptionsForSelection(scopedEquipment, fieldValues, allFields, field)
          : options}
        disabled={fieldDisabled}
        forceSelect={forceSelect}
        readOnly={readOnly}
        onChange={(next) => handleFieldChange(field, next)}
      />
    )
  }

  const selectedEquipment = useMemo(
    () => equipment.find((row) => row.id === equipmentId) || null,
    [equipment, equipmentId],
  )
  const masterFacts = useMemo(
    () => equipmentMasterFacts(selectedEquipment, allFields),
    [selectedEquipment, allFields],
  )
  const showAreaSelect = areas.length > 0
  const showNameFallback = typeUnavailable && !equipmentNameField

  const selectEquipmentByName = (nextId) => {
    onEquipmentIdChange(nextId || '')
    const row = scopedEquipment.find((item) => item.id === nextId)
    onFieldValuesChange(row ? fieldValuesFromEquipment(row, allFields) : {})
  }

  return (
    <div className="wr-asset-sections">
      {visibleSections.map((section, sectionIndex) => {
        const orderedFields = fieldsForWorkRequestSection(section.fields)
        return (
          <div key={section.id} className="equipment-dynamic-section">
            <h3 className="equipment-dynamic-section__title">{section.name}</h3>
            <div className="company-form__grid wr-asset-grid">
              {showAreaSelect && sectionIndex === 0 && (
                <label className="company-form__field">
                  <span className="company-form__label">Area</span>
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
              {showNameFallback && sectionIndex === 0 && (
                <label className="company-form__field">
                  <span className="company-form__label">Equipment name *</span>
                  <FilterableSelect
                    value={equipmentId}
                    onChange={selectEquipmentByName}
                    options={scopedEquipment}
                    getOptionValue={(row) => row.id}
                    getOptionLabel={(row) => row.name || row.code || 'Equipment'}
                    placeholder="Select equipment name…"
                    disabled={disabled || loading}
                    required
                    className="company-form__input--select"
                  />
                </label>
              )}
              {orderedFields.map((field) => {
                if (showAreaSelect && getEquipmentFieldRole(field) === 'area') return null
                if (getEquipmentFieldRole(field) === 'equipmentName') {
                  return (
                    <label key={field.id} className="company-form__field">
                      <span className="company-form__label">
                        {field.is_required ? `${field.name} *` : field.name}
                      </span>
                      <FilterableSelect
                        value={equipmentId}
                        onChange={selectEquipmentByName}
                        options={nameChoices}
                        getOptionValue={(row) => row.id}
                        getOptionLabel={(row) => equipmentChoiceLabel(row, field)}
                        placeholder="Select…"
                        disabled={disabled || loading || nameChoices.length === 0}
                        required={field.is_required}
                        className="company-form__input--select"
                      />
                    </label>
                  )
                }
                return renderField(field)
              })}
              {sectionIndex === 0 && masterFacts.length > 0 && (
                <dl className="wr-asset-facts">
                  {masterFacts.map((fact) => (
                    <div key={fact.key} className="wr-asset-facts__item">
                      <dt>{fact.label}</dt>
                      <dd>
                        {fact.qr ? <EquipmentQrThumb value={fact.qr} /> : null}
                        {fact.image ? <img className="wr-asset-image" src={fact.image} alt={fact.label} /> : null}
                        {fact.value ? <span>{fact.value}</span> : null}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </div>
        )
      })}

      {areaId && scopedEquipment.length === 0 && !loading && (
        <p className="wo-manual__intro" style={{ marginTop: 0 }}>
          No equipment in this area for the selected department.
        </p>
      )}
    </div>
  )
}
