import { useEffect, useMemo, useRef, useState } from 'react'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import PageBack from '../shared/PageBack'
import { getEquipmentFields } from '../../lib/api-equipment'
import { getDepartments, getLocations } from '../../lib/api'
import { fetchReferenceData, PICKER_LIMIT } from '../../lib/referenceDataCache'
import { seedDateFieldDefaults } from '../../lib/dateInputDefaults'
import { useFormLayout } from '../../hooks/useFormLayout'
import { buildEquipmentFormSections } from '../../lib/equipmentFormLayout'
import { parseLayoutId } from '../../lib/formLayoutIds'
import { resolveImageMime } from '../../lib/imageFiles'
import { readFileAsDataUrl } from '../../config/warrantyDocuments'
import DateField from '../ui/DateField'
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

function isAreaCatalogField(field) {
  const name = String(field?.name || '').trim().toLowerCase()
  return name === 'area' || name === 'equipment area'
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

function ImageUpload({ field, preview, onPick, onRemove }) {
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
  const [locations, setLocations] = useState([])
  const [departments, setDepartments] = useState([])
  const { layout, loading: layoutLoading } = useFormLayout('equipment.create')
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

  const sections = useMemo(
    () => buildEquipmentFormSections(fieldDefs, layout),
    [fieldDefs, layout],
  )

  const areaFieldId = useMemo(() => {
    const match = sections
      .flatMap((section) => section.items)
      .find((item) => isAreaCatalogField(item.field))
    return match?.field.id || null
  }, [sections])

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

    try {
      await onSave(payload)
    } catch (err) {
      setError(err.message)
    }
  }

  const renderField = (field) => (
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
          />
        ) : field.field_type === 'textarea' ? (
          <SpellcheckInput
            multiline
            className="company-form__input"
            rows={3}
            value={values[field.id] || ''}
            onChange={(e) => setValues((v) => ({ ...v, [field.id]: e.target.value }))}
          />
        ) : field.field_type === 'dropdown' ? (
          <FilterableSelect
            value={values[field.id] || ''}
            onChange={(next) => setValues((v) => ({ ...v, [field.id]: next }))}
            options={field.dropdown_options || []}
            placeholder="Select…"
            className="company-form__input--select"
          />
        ) : field.field_type === 'radio' ? (
          <div className="asset-field-dependency__options" role="radiogroup" aria-label={field.name}>
            {(field.dropdown_options || []).map((opt) => (
              <label key={opt} className="asset-field-dependency__option">
                <input
                  type="radio"
                  name={`eq-field-${field.id}`}
                  value={opt}
                  checked={values[field.id] === opt}
                  onChange={() => setValues((v) => ({ ...v, [field.id]: opt }))}
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
            onChange={(e) => setValues((v) => ({
              ...v,
              [field.id]: e.target.checked ? 'true' : 'false',
            }))}
          />
        ) : field.field_type === 'date' || field.field_type === 'datetime' ? (
          <DateField
            value={values[field.id] || ''}
            onChange={(val) => setValues((v) => ({ ...v, [field.id]: val }))}
            withTime={field.field_type === 'datetime'}
          />
        ) : field.field_type === 'number' ? (
          <input
            className="company-form__input"
            type="number"
            value={values[field.id] || ''}
            onChange={(e) => setValues((v) => ({ ...v, [field.id]: e.target.value }))}
          />
        ) : (
          <SpellcheckInput
            className="company-form__input"
            value={values[field.id] || ''}
            onChange={(e) => setValues((v) => ({ ...v, [field.id]: e.target.value }))}
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

  return (
    <div className="company-modal-overlay" onMouseDown={handleBackdropClick} role="presentation">
      <div className="company-modal company-modal--wide" onClick={(e) => e.stopPropagation()} role="dialog">
        <div className="company-modal__header">
          <div className="modal__header-main">
            <PageBack onClick={onClose} className="page-back--header" label="Equipment" />
            <h2>{isEdit ? 'Edit Equipment' : 'Add Equipment'}</h2>
          </div>
          <button type="button" className="company-modal__close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form className="company-modal__form" onSubmit={handleSubmit}>
          {layoutLoading && <p className="company-empty">Loading form…</p>}
          {!layoutLoading && sections.length === 0 && (
            <p className="company-empty">No equipment fields yet. A super admin adds them under Configure → Equipment.</p>
          )}
          {!layoutLoading && sections.map((section, sectionIndex) => (
            <div key={section.id} className="equipment-dynamic-section">
              <h3 className="equipment-dynamic-section__title">{section.title}</h3>
              {sectionIndex === 0 && !areaFieldId && (
                <PlacementFields
                  locationId={locationId}
                  departmentId={departmentId}
                  locations={locationOptions}
                  departments={departmentOptions}
                  onLocation={setLocationId}
                  onDepartment={setDepartmentId}
                />
              )}
              {section.items.map((item) => (
                <div key={item.field.id}>
                  {item.field.id === areaFieldId && (
                    <PlacementFields
                      locationId={locationId}
                      departmentId={departmentId}
                      locations={locationOptions}
                      departments={departmentOptions}
                      onLocation={setLocationId}
                      onDepartment={setDepartmentId}
                    />
                  )}
                  {renderField(item.field)}
                </div>
              ))}
            </div>
          ))}

          {error && <div className="company-alert">{error}</div>}
          <div className="company-modal__actions">
            <button type="button" className="company-btn company-btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="company-btn company-btn--primary" disabled={saving || layoutLoading || sections.length === 0}>
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create equipment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
