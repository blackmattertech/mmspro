import { useEffect, useMemo, useRef, useState } from 'react'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import PageBack from '../shared/PageBack'
import { getEquipmentFields } from '../../lib/api-equipment'
import { getDepartments, getLocations } from '../../lib/api'
import { fetchReferenceData, PICKER_LIMIT } from '../../lib/referenceDataCache'
import { seedDateFieldDefaults } from '../../lib/dateInputDefaults'
import { useFormLayout } from '../../hooks/useFormLayout'
import { usePermissions } from '../../hooks/usePermissions'
import { useFormFieldValues } from '../../hooks/useFormFieldValues'
import { buildEquipmentFormSections } from '../../lib/equipmentFormLayout'
import {
  applyHierarchyFieldChange,
  hierarchyLevelRevealed,
  optionsForHierarchyField,
  orderedHierarchyFields,
} from '../../lib/assetHierarchy'
import { layoutWithoutCatalogFields, parseLayoutId } from '../../lib/formLayoutIds'
import OrderedFormLayout from '../forms/OrderedFormLayout'
import { resolveImageMime } from '../../lib/imageFiles'
import { readFileAsDataUrl } from '../../config/warrantyDocuments'
import DateField from '../ui/DateField'
import GooToggle from '../ui/GooToggle'
import FilterableSelect from '../ui/FilterableSelect'
import SpellcheckInput from '../shared/SpellcheckInput'
import EquipmentQrCode from './EquipmentQrCode'
import '../company/CompanyShared.css'

const EQUIPMENT_IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml,.svg'
const EQUIPMENT_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
const EQUIPMENT_IMAGE_MAX_BYTES = 3 * 1024 * 1024

function isImageField(field) {
  const type = String(field?.field_type || '').toLowerCase()
  return type === 'image' || /image/i.test(field?.name || '')
}

function isImageUrl(value) {
  return /^(https?:|data:image\/)/i.test(String(value || '').trim())
}

function departmentLabel(dept) {
  const location = dept?.org_locations?.name
  if (location && !dept.all_locations) return `${dept.name} · ${location}`
  return dept?.name || 'Department'
}

function locationLabel(location) {
  const place = [location?.city, location?.state, location?.country].filter(Boolean).join(', ')
  if (place) return `${location.name} · ${place}`
  return location?.name || 'Location'
}

function keepCurrent(rows, currentId) {
  const active = rows.filter((row) => row.is_active !== false)
  if (!currentId || active.some((row) => row.id === currentId)) return active
  const current = rows.find((row) => row.id === currentId)
  return current ? [current, ...active] : active
}

function PlacementFields({
  locationId,
  departmentId,
  locations,
  departments,
  onLocation,
  onDepartment,
}) {
  return (
    <>
      <MasterSelect
        label="Location"
        value={locationId}
        options={locations}
        onChange={onLocation}
        placeholder="Select location…"
        getLabel={locationLabel}
      />
      <MasterSelect
        label="Department"
        value={departmentId}
        options={departments}
        onChange={onDepartment}
        placeholder="Select department…"
        getLabel={departmentLabel}
      />
    </>
  )
}

function MasterSelect({ label, value, options, onChange, placeholder, getLabel }) {
  return (
    <div className="equipment-field">
      <div className="company-form__field">
        <span className="company-form__label">{label} *</span>
        <FilterableSelect
          value={value}
          onChange={onChange}
          options={options}
          getOptionValue={(row) => row.id}
          getOptionLabel={getLabel}
          placeholder={placeholder}
          className="company-form__input--select"
          aria-label={label}
        />
      </div>
    </div>
  )
}

function ImageUpload({ field, preview, onPick, onRemove, disabled = false }) {
  const inputRef = useRef(null)
  return (
    <div className="equipment-image-upload">
      {preview ? (
        <img className="equipment-image-upload__preview" src={preview} alt="" />
      ) : (
        <div className="equipment-image-upload__placeholder">No image</div>
      )}
      <div className="equipment-image-upload__actions">
        <button
          type="button"
          className="company-btn company-btn--ghost"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
        >
          {preview ? 'Replace image' : 'Upload image'}
        </button>
        {preview && (
          <button
            type="button"
            className="company-btn company-btn--ghost"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onRemove()
            }}
            disabled={disabled}
          >
            Remove
          </button>
        )}
        <span className="equipment-image-upload__hint">PNG, JPG, WebP, or SVG · max 3 MB</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={EQUIPMENT_IMAGE_ACCEPT}
        hidden
        onChange={(event) => onPick(field.id, event)}
      />
    </div>
  )
}

function fieldText(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean).join(', ')
  return String(value ?? '').trim()
}

export default function EquipmentModal({
  equipment,
  saving,
  onClose,
  onSave,
}) {
  const isEdit = Boolean(equipment?.id)
  const [fieldDefs, setFieldDefs] = useState([])
  const [values, setValues] = useState({})
  const [images, setImages] = useState({})
  const [locationId, setLocationId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [readingRequired, setReadingRequired] = useState(false)
  const [locations, setLocations] = useState([])
  const [departments, setDepartments] = useState([])
  const { layout, loading: layoutLoading } = useFormLayout('equipment.create')
  const { session } = usePermissions()
  const extras = useFormFieldValues('equipment.create', equipment?.id || null)
  const sharedLayout = useMemo(() => layoutWithoutCatalogFields(layout), [layout])
  const [error, setError] = useState(null)
  const handleBackdropClick = useBackdropClose(onClose)

  useEffect(() => {
    getEquipmentFields()
      .then((fields) => setFieldDefs((fields || []).filter((f) => f.kind === 'parent' && f.is_active !== false)))
      .catch(() => setFieldDefs([]))
  }, [])

  useEffect(() => {
    if (equipment) {
      const next = {}
      for (const row of equipment.field_values || []) {
        next[row.field_id] = Array.isArray(row.value_json?.values)
          ? row.value_json.values
          : row.value_text ?? ''
      }
      setValues(next)
    } else {
      setValues(seedDateFieldDefaults(fieldDefs, {}))
    }
    setImages({})
    setLocationId(equipment?.location_id || '')
    setDepartmentId(equipment?.department_id || '')
    setReadingRequired(equipment?.reading_required === true)
  }, [equipment, fieldDefs])

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetchReferenceData(
        'locations',
        {
          forAssignment: false,
          search: undefined,
          limit: PICKER_LIMIT,
          offset: 0,
          filters: '{}',
          sort: undefined,
          sortDir: undefined,
        },
        () => getLocations({ limit: PICKER_LIMIT }),
      ),
      fetchReferenceData(
        'departments',
        { locationFilter: '', search: undefined, limit: PICKER_LIMIT, offset: 0, filters: '{}' },
        () => getDepartments(undefined, { limit: PICKER_LIMIT }),
      ),
    ])
      .then(([locationRows, departmentRows]) => {
        if (cancelled) return
        setLocations(locationRows)
        setDepartments(departmentRows)
      })
      .catch(() => {
        if (cancelled) return
        setLocations([])
        setDepartments([])
      })
    return () => { cancelled = true }
  }, [])

  const sections = useMemo(() => {
    const built = buildEquipmentFormSections(fieldDefs, layout)
    const order = new Map(orderedHierarchyFields(fieldDefs).map((field, index) => [field.id, index]))
    return built.map((section) => ({
      ...section,
      items: [...section.items].sort((left, right) => (
        (order.get(left.field.id) ?? 0) - (order.get(right.field.id) ?? 0)
      )),
    }))
  }, [fieldDefs, layout])

  const locationOptions = useMemo(
    () => keepCurrent(locations, locationId),
    [locations, locationId],
  )

  const departmentOptions = useMemo(
    () => keepCurrent(departments, departmentId),
    [departments, departmentId],
  )

  const visibleCatalogFields = useMemo(
    () => sections.flatMap((section) => section.items)
      .filter((item) => item.kind === 'catalog')
      .map((item) => item.field),
    [sections],
  )

  const qrField = useMemo(() => {
    const parsed = parseLayoutId(layout?.qrFieldId)
    if (parsed.kind !== 'catalog') return null
    return visibleCatalogFields.find((field) => field.id === parsed.value) || null
  }, [layout?.qrFieldId, visibleCatalogFields])

  const qrText = qrField ? fieldText(values[qrField.id]) : ''

  const imagePreview = (field) => {
    const picked = images[field.id]
    if (picked?.preview) return picked.preview
    if (picked?.removed) return ''
    const stored = fieldText(values[field.id])
    if (isImageUrl(stored)) return stored
    return equipment?.image_signed_url || ''
  }

  const handleImagePick = async (fieldId, event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const contentType = resolveImageMime(file)
    if (!EQUIPMENT_IMAGE_TYPES.has(contentType)) {
      setError('Image must be PNG, JPG, WebP, or SVG')
      return
    }
    if (file.size > EQUIPMENT_IMAGE_MAX_BYTES) {
      setError('Image must be 3 MB or smaller')
      return
    }
    try {
      const data = await readFileAsDataUrl(file)
      setImages((current) => ({
        ...current,
        [fieldId]: { contentType, data, preview: data },
      }))
      setError(null)
    } catch (err) {
      setError(err.message || 'Could not read the image')
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    const missing = visibleCatalogFields
      .filter((field) => {
        if (!field.is_required) return false
        if (isImageField(field)) return !imagePreview(field)
        return !fieldText(values[field.id])
      })
      .map((field) => field.name)
    if (!departmentId) missing.unshift('Department')
    if (!locationId) missing.unshift('Location')
    if (missing.length) {
      setError(`Fill the mandatory field${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}`)
      return
    }

    const imageField = visibleCatalogFields.find((field) => isImageField(field))
    const pickedImage = imageField ? images[imageField.id] : null
    const payload = {
      values: visibleCatalogFields
        .filter((field) => !isImageField(field))
        .map((field) => {
          const value = values[field.id]
          if (Array.isArray(value)) {
            return {
              field_id: field.id,
              value_text: value.join(', '),
              value_json: { values: value },
            }
          }
          return {
            field_id: field.id,
            value_text: value ?? '',
          }
        }),
    }
    if (pickedImage?.data) {
      payload.image = { contentType: pickedImage.contentType, data: pickedImage.data }
    } else if (pickedImage?.removed && isEdit) {
      payload.remove_image = true
    }
    payload.location_id = locationId
    payload.department_id = departmentId
    payload.reading_required = readingRequired

    try {
      const saved = await onSave(payload)
      if (saved?.id && sharedLayout) await extras.save(saved.id)
    } catch (err) {
      setError(err.message)
    }
  }

  const renderField = (field) => {
    if (!hierarchyLevelRevealed(field, fieldDefs, values)) return null
    const locked = false
    const write = (next) => setValues((current) => applyHierarchyFieldChange(field.id, next, current, fieldDefs))
    const configuredOptions = (field.dropdown_options || []).map((option) => String(option).trim()).filter(Boolean)
    return (
    <div key={field.id} className="equipment-field">
      <div className="company-form__field">
        <span className="company-form__label">{field.is_required ? `${field.name} *` : field.name}</span>
        {isImageField(field) ? (
          <ImageUpload
            field={field}
            preview={imagePreview(field)}
            onPick={handleImagePick}
            onRemove={() => setImages((current) => ({
              ...current,
              [field.id]: { removed: true },
            }))}
            disabled={locked}
          />
        ) : field.field_type === 'textarea' ? (
          <SpellcheckInput
            multiline
            className="company-form__input"
            rows={3}
            value={values[field.id] || ''}
            onChange={(e) => write(e.target.value)}
            disabled={locked}
          />
        ) : (field.field_type === 'dropdown' || field.field_type === 'radio') && !configuredOptions.length ? (
          <SpellcheckInput
            className="company-form__input"
            value={values[field.id] || ''}
            onChange={(e) => write(e.target.value)}
            disabled={locked}
            placeholder="Type a value…"
          />
        ) : field.field_type === 'dropdown' ? (
          <FilterableSelect
            value={values[field.id] || ''}
            onChange={write}
            options={optionsForHierarchyField(field, values)}
            placeholder={`Select ${field.name}`}
            disabled={locked}
            className="company-form__input--select"
          />
        ) : field.field_type === 'radio' ? (
          <div className="asset-field-dependency__options" role="radiogroup" aria-label={field.name}>
            {optionsForHierarchyField(field, values).map((opt) => (
              <label key={opt} className="asset-field-dependency__option">
                <input
                  type="radio"
                  name={`eq-field-${field.id}`}
                  value={opt}
                  checked={values[field.id] === opt}
                  disabled={locked}
                  onChange={() => write(opt)}
                />
                <span>{opt}</span>
              </label>
            ))}
          </div>
        ) : field.field_type === 'checkbox' && field.dropdown_options?.length ? (
          <div className="asset-field-dependency__options" role="group" aria-label={field.name}>
            {(field.dropdown_options || []).map((opt) => {
              const selected = Array.isArray(values[field.id]) ? values[field.id] : []
              const checked = selected.includes(opt)
              return (
                <label key={opt} className="asset-field-dependency__option">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => setValues((v) => {
                      const current = Array.isArray(v[field.id]) ? v[field.id] : []
                      return {
                        ...v,
                        [field.id]: current.includes(opt)
                          ? current.filter((item) => item !== opt)
                          : [...current, opt],
                      }
                    })}
                  />
                  <span>{opt}</span>
                </label>
              )
            })}
          </div>
        ) : field.field_type === 'checkbox' ? (
          <input
            type="checkbox"
            checked={values[field.id] === 'true' || values[field.id] === true}
            disabled={locked}
            onChange={(e) => write(e.target.checked ? 'true' : 'false')}
          />
        ) : field.field_type === 'date' || field.field_type === 'datetime' ? (
          <DateField
            value={values[field.id] || ''}
            onChange={write}
            withTime={field.field_type === 'datetime'}
            disabled={locked}
          />
        ) : field.field_type === 'number' ? (
          <input
            className="company-form__input"
            type="number"
            value={values[field.id] || ''}
            onChange={(e) => write(e.target.value)}
            disabled={locked}
          />
        ) : (
          <SpellcheckInput
            className="company-form__input"
            value={values[field.id] || ''}
            onChange={(e) => write(e.target.value)}
            disabled={locked}
          />
        )}
      </div>
      {qrField?.id === field.id && qrText && (
        <EquipmentQrCode
          value={qrText}
          caption={{ label: field.name, value: qrText }}
          fileName={qrText}
        />
      )}
    </div>
    )
  }

  return (
    <div className="company-modal-overlay" onMouseDown={handleBackdropClick} role="presentation">
      <div className="company-modal company-modal--wide" onClick={(e) => e.stopPropagation()} role="dialog">
        <div className="company-modal__header">
          <div className="modal__header-main">
            <PageBack onClick={onClose} className="page-back--header" label="Assets" />
            <h2>{isEdit ? 'Edit Asset' : 'Add Asset'}</h2>
          </div>
          <button type="button" className="company-modal__close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form className="company-modal__form" onSubmit={handleSubmit}>
          {layoutLoading && <p className="company-empty">Loading form…</p>}
          {!layoutLoading && sections.length === 0 && (
            <p className="company-empty">No asset fields yet. A super admin adds them under Configure → Assets.</p>
          )}
          {!layoutLoading && sections.map((section, sectionIndex) => (
            <div key={section.id} className="equipment-dynamic-section">
              <h3 className="equipment-dynamic-section__title">{section.title}</h3>
              {sectionIndex === 0 && (
                <PlacementFields
                  locationId={locationId}
                  departmentId={departmentId}
                  locations={locationOptions}
                  departments={departmentOptions}
                  onLocation={setLocationId}
                  onDepartment={setDepartmentId}
                />
              )}
              {section.items.map((item) => {
                const node = renderField(item.field)
                if (!node) return null
                return <div key={item.field.id}>{node}</div>
              })}
            </div>
          ))}

          {sharedLayout && (
            <OrderedFormLayout
              formId="equipment.create"
              layout={sharedLayout}
              catalogValues={extras.values}
              onCatalogChange={extras.setFieldValue}
              masterValues={extras.values}
              onMasterChange={extras.setFieldValue}
              disabled={saving}
              currentEmployeeId={!isEdit ? (session?.employee_id || null) : null}
              omitField={(item) => {
                const parsed = parseLayoutId(item?.id)
                return (parsed.kind === 'master' && parsed.value === 'areas')
                  || item?.masterSource === 'areas'
                  || (parsed.kind === 'system' && parsed.value === 'area_id')
                  || item?.bindKey === 'area_id'
              }}
              renderField={() => null}
            />
          )}

          <div className="company-form__field">
            <span className="company-form__label">Reading required</span>
            <GooToggle
              checked={readingRequired}
              onChange={setReadingRequired}
              ariaLabel="Reading required"
            />
            <p className="company-form__hint">
              When this is on, the asset appears in Meter reading so readings can be recorded.
            </p>
          </div>

          {error && <div className="company-alert">{error}</div>}
          <div className="company-modal__actions">
            <button type="button" className="company-btn company-btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="company-btn company-btn--primary" disabled={saving || layoutLoading || sections.length === 0}>
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create asset'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
