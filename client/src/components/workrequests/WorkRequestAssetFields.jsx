import { useCallback, useMemo, useEffect, useRef, useState } from 'react'
import DateField from '../ui/DateField'
import { dependencyLabel } from '../../lib/assetFieldDependencies'
import {
  fieldValuesFromEquipment,
  filterEquipmentByValues,
  flattenAssetSections,
} from '../../lib/workRequestAssetPicker'
import {
  applyHierarchyFieldChange,
  fillUniqueHierarchyValues,
  hierarchyDisplaySteps,
  hierarchyLevelRevealed,
  orderedHierarchyFields,
  pickerOptionsForLevel,
} from '../../lib/assetHierarchy'
import FilterableSelect from '../ui/FilterableSelect'
import SpellcheckInput from '../shared/SpellcheckInput'
import FormLabel from '../shared/FormLabel'
import EquipmentQrCode from '../equipment/EquipmentQrCode'
import { getEquipment } from '../../lib/api-equipment'
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

  const configuredChoices = (field.dropdown_options || []).some((opt) => String(opt ?? '').trim())
  if (options.length === 1) {
    const text = String(value || options[0] || '').trim()
    return (
      <div className="company-form__field wr-asset-static">
        <span className="company-form__label">{label}</span>
        {hint && (
          <span className="wo-manual__intro" style={{ margin: '0 0 6px', fontSize: 12 }}>{hint}</span>
        )}
        <span className="wr-asset-static__value">{text || '—'}</span>
      </div>
    )
  }
  if (forceSelect || (
    (field.field_type === 'dropdown' || (configuredChoices && field.field_type !== 'radio'))
    && (field.field_type !== 'dropdown' || configuredChoices)
  )) {
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
          placeholder={`Select ${field.name}`}
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

  if (field.field_type === 'radio' && (configuredChoices || options.length)) {
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

function isMediaField(field) {
  return field?.field_type === 'image' || field?.field_type === 'file' || /image/i.test(field?.name || '')
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
  const seededEquipmentRef = useRef('')
  const qrLoadRef = useRef('')
  const [fetchedQr, setFetchedQr] = useState('')
  const hierarchyFields = useMemo(() => orderedHierarchyFields(allFields), [allFields])
  const selected = useMemo(
    () => (equipment || []).find((item) => item.id === equipmentId) || null,
    [equipment, equipmentId],
  )

  const syncEquipmentFromValues = useCallback((nextValues) => {
    const levelValues = {}
    for (const level of orderedHierarchyFields(allFields)) {
      if (isMediaField(level)) continue
      const value = nextValues[level.id]
      if (value == null || value === '' || (Array.isArray(value) && !value.length)) continue
      levelValues[level.id] = value
    }
    const matches = filterEquipmentByValues(equipment, levelValues, { allFields })
    const filled = Object.keys(levelValues).length > 0
    const nextId = filled && matches.length === 1 ? matches[0].id : ''
    if (nextId !== (equipmentId || '')) onEquipmentIdChange(nextId)
  }, [allFields, equipment, equipmentId, onEquipmentIdChange])

  const handleFieldChange = (field, nextValue) => {
    const nextValues = fillUniqueHierarchyValues(
      applyHierarchyFieldChange(field.id, nextValue, fieldValues, allFields),
      equipment,
      allFields,
    )
    onFieldValuesChange(nextValues)
    syncEquipmentFromValues(nextValues)
  }

  useEffect(() => {
    if (loading || disabled || !equipment?.length || equipmentId) return
    const nextValues = fillUniqueHierarchyValues(fieldValues, equipment, allFields)
    if (nextValues !== fieldValues) onFieldValuesChange(nextValues)
    syncEquipmentFromValues(nextValues)
  }, [loading, disabled, equipment, allFields, fieldValues, equipmentId, onFieldValuesChange, syncEquipmentFromValues])

  useEffect(() => {
    if (!equipmentId) {
      seededEquipmentRef.current = ''
      return
    }
    if (seededEquipmentRef.current === equipmentId) return
    const hasValues = Object.values(fieldValues || {}).some((value) => {
      if (Array.isArray(value)) return value.length > 0
      return String(value ?? '').trim() !== ''
    })
    if (hasValues) {
      seededEquipmentRef.current = equipmentId
      return
    }
    const row = (equipment || []).find((item) => item.id === equipmentId)
    if (!row) return
    seededEquipmentRef.current = equipmentId
    onFieldValuesChange(fieldValuesFromEquipment(row, allFields))
  }, [equipmentId, equipment, allFields, fieldValues, onFieldValuesChange])

  useEffect(() => {
    if (!equipmentId || loading) return
    const row = (equipment || []).find((item) => item.id === equipmentId)
    if (!row) onEquipmentIdChange('')
  }, [equipment, equipmentId, onEquipmentIdChange, loading])

  useEffect(() => {
    if (!equipmentId || !selected) {
      qrLoadRef.current = ''
      setFetchedQr('')
      return undefined
    }
    if (selected.qr_code) {
      setFetchedQr(selected.qr_code)
      return undefined
    }
    if (qrLoadRef.current === equipmentId) return undefined
    qrLoadRef.current = equipmentId
    let cancelled = false
    getEquipment(equipmentId)
      .then((detail) => {
        if (!cancelled && detail?.qr_code) setFetchedQr(detail.qr_code)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [equipmentId, selected])

  const revealedFields = hierarchyFields.filter((field) => {
    if (!hierarchyLevelRevealed(field, allFields, fieldValues)) return false
    if (isMediaField(field)) {
      const raw = fieldValues[field.id]
      const value = Array.isArray(raw) ? raw.join('') : raw
      return Boolean(String(value ?? '').trim())
    }
    return true
  })

  if (!hierarchyFields.length) {
    return (
      <p className="wo-manual__intro" style={{ margin: 0 }}>
        No asset hierarchy fields yet. Add them under Configure → Assets.
      </p>
    )
  }

  const qrValue = fetchedQr || selected?.qr_code || selected?.code || ''

  return (
    <div className={`wr-asset-sections${qrValue ? ' wr-asset-with-qr' : ''}`}>
      <div className="company-form__grid wr-asset-grid">
        {revealedFields.map((field) => {
          const rawValue = fieldValues[field.id]
          const value = Array.isArray(rawValue) ? rawValue : (rawValue ?? '')
          const media = isMediaField(field)
          return (
            <AssetFieldInput
              key={field.id}
              field={field}
              value={value}
              options={media ? [] : pickerOptionsForLevel(field, equipment, fieldValues, allFields, { includeCurrent: false })}
              disabled={disabled || loading}
              forceSelect={!media}
              readOnly={media}
              onChange={(next) => handleFieldChange(field, next)}
            />
          )
        })}
      </div>
      {qrValue ? (
        <EquipmentQrCode
          value={qrValue}
          caption={{ label: 'QR code', value: selected?.code || selected?.name || qrValue }}
          fileName={selected?.code || selected?.name || 'asset-qr'}
        />
      ) : null}
    </div>
  )
}

export function AssetHierarchySummary({ steps }) {
  const rows = hierarchyDisplaySteps(steps)
  if (!rows.length) return null
  return (
    <dl className="wo-received-detail__fields">
      {rows.map((step) => (
        <div key={step.field_id} className="wo-received-detail__field">
          <dt>{step.field_name}</dt>
          <dd>{step.value}</dd>
        </div>
      ))}
    </dl>
  )
}
