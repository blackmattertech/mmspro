import { useEffect, useMemo, useRef, useState } from 'react'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import { useLocations } from '../../hooks/useLocations'
import { useDepartments } from '../../hooks/useDepartments'
import { useAreas } from '../../hooks/useAreas'
import { getEquipmentFields } from '../../lib/api-equipment'
import { seedDateFieldDefaults } from '../../lib/dateInputDefaults'
import DateField from '../ui/DateField'
import FilterableSelect from '../ui/FilterableSelect'
import '../company/CompanyShared.css'

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const IMAGE_MAX_BYTES = 3 * 1024 * 1024

const EMPTY_PLACEMENT = {
  location_id: '',
  department_id: '',
  area_id: '',
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Could not read the file'))
    reader.readAsDataURL(file)
  })
}

export default function EquipmentModal({ equipment, saving, onClose, onSave }) {
  const isEdit = Boolean(equipment?.id)
  const { locations } = useLocations()
  const [placement, setPlacement] = useState(EMPTY_PLACEMENT)
  const [fieldDefs, setFieldDefs] = useState([])
  const [values, setValues] = useState({})
  const [imageFile, setImageFile] = useState(null)
  const [imageRemoved, setImageRemoved] = useState(false)
  const [error, setError] = useState(null)
  const fileInputRef = useRef(null)
  const handleBackdropClick = useBackdropClose(onClose)

  const { departments } = useDepartments(placement.location_id || '')
  const { areas } = useAreas({
    locationId: placement.location_id || undefined,
    departmentId: placement.department_id || undefined,
  })

  useEffect(() => {
    getEquipmentFields()
      .then((fields) => setFieldDefs((fields || []).filter((f) => f.kind === 'parent' && f.is_active !== false)))
      .catch(() => setFieldDefs([]))
  }, [])

  useEffect(() => {
    if (equipment) {
      setPlacement({
        location_id: equipment.location_id || '',
        department_id: equipment.department_id || '',
        area_id: equipment.area_id || '',
      })
      const next = {}
      for (const row of equipment.field_values || []) {
        next[row.field_id] = Array.isArray(row.value_json?.values)
          ? row.value_json.values
          : row.value_text ?? ''
      }
      setValues(next)
    } else {
      setPlacement(EMPTY_PLACEMENT)
      setValues(seedDateFieldDefaults(fieldDefs, {}))
    }
    setImageFile(null)
    setImageRemoved(false)
  }, [equipment, fieldDefs])

  const activeLocations = useMemo(
    () => (locations || []).filter((l) => l.is_active !== false),
    [locations],
  )
  const activeDepartments = useMemo(
    () => (departments || []).filter((d) => d.is_active !== false),
    [departments],
  )
  const activeAreas = useMemo(
    () => (areas || []).filter((a) => a.is_active !== false),
    [areas],
  )

  const sections = useMemo(() => {
    const map = new Map()
    for (const field of fieldDefs) {
      const key = field.section_id || 'other'
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          name: field.section_name || 'Details',
          fields: [],
        })
      }
      map.get(key).fields.push(field)
    }
    return [...map.values()]
  }, [fieldDefs])

  const imagePreview = imageFile?.preview
    || (!imageRemoved ? equipment?.image_signed_url : null)

  const handleImageChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!IMAGE_TYPES.includes(file.type)) {
      setError('Image must be PNG, JPG, or WebP')
      return
    }
    if (file.size > IMAGE_MAX_BYTES) {
      setError('Image must be 3 MB or smaller')
      return
    }
    setError(null)
    try {
      const dataUrl = await readFileAsDataUrl(file)
      setImageFile({ contentType: file.type, data: dataUrl, preview: dataUrl })
      setImageRemoved(false)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleRemoveImage = () => {
    setImageFile(null)
    setImageRemoved(true)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    if (!placement.location_id || !placement.department_id || !placement.area_id) {
      setError('Location, department, and area are required')
      return
    }

    const missing = fieldDefs
      .filter((field) => {
        if (!field.is_required) return false
        const value = values[field.id]
        if (Array.isArray(value)) return value.length === 0
        return !String(value ?? '').trim()
      })
      .map((field) => field.name)
    if (missing.length) {
      setError(`Fill the mandatory field${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}`)
      return
    }

    const payload = {
      location_id: placement.location_id,
      department_id: placement.department_id,
      area_id: placement.area_id,
      values: fieldDefs.map((field) => {
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

    if (imageFile) {
      payload.image = { contentType: imageFile.contentType, data: imageFile.data }
    } else if (imageRemoved && isEdit) {
      payload.remove_image = true
    }

    try {
      await onSave(payload)
    } catch (err) {
      setError(err.message)
    }
  }

  const renderField = (field) => (
    <label key={field.id} className="company-form__field">
      <span className="company-form__label">{field.is_required ? `${field.name} *` : field.name}</span>
      {field.field_type === 'textarea' ? (
        <textarea
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
      ) : (
        <input
          className="company-form__input"
          type={field.field_type === 'number' ? 'number' : 'text'}
          value={values[field.id] || ''}
          onChange={(e) => setValues((v) => ({ ...v, [field.id]: e.target.value }))}
        />
      )}
    </label>
  )

  return (
    <div className="company-modal-overlay" onMouseDown={handleBackdropClick} role="presentation">
      <div className="company-modal company-modal--wide" onClick={(e) => e.stopPropagation()} role="dialog">
        <div className="company-modal__header">
          <h2>{isEdit ? 'Edit Equipment' : 'Add Equipment'}</h2>
          <button type="button" className="company-modal__close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form className="company-modal__form" onSubmit={handleSubmit}>
          {sections.map((section) => (
            <div key={section.id} className="equipment-dynamic-section">
              <h3 className="equipment-dynamic-section__title">{section.name}</h3>
              {section.fields.map((field) => renderField(field))}
            </div>
          ))}

          <div className="equipment-dynamic-section">
            <h3 className="equipment-dynamic-section__title">Image</h3>
            <div className="equipment-image-upload">
              {imagePreview ? (
                <img className="equipment-image-upload__preview" src={imagePreview} alt="Equipment" />
              ) : (
                <div className="equipment-image-upload__placeholder">No image</div>
              )}
              <div className="equipment-image-upload__actions">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="equipment-image-upload__input"
                  onChange={handleImageChange}
                />
                {imagePreview && (
                  <button
                    type="button"
                    className="company-btn company-btn--ghost company-btn--compact"
                    onClick={handleRemoveImage}
                  >
                    Remove image
                  </button>
                )}
                <span className="equipment-image-upload__hint">PNG, JPG, or WebP · up to 3 MB</span>
              </div>
            </div>
          </div>

          <div className="equipment-dynamic-section">
            <h3 className="equipment-dynamic-section__title">Placement</h3>
            <label className="company-form__field">
              <span className="company-form__label">Location *</span>
              <FilterableSelect
                value={placement.location_id}
                onChange={(location_id) => setPlacement((f) => ({
                  ...f,
                  location_id,
                  department_id: '',
                  area_id: '',
                }))}
                options={activeLocations}
                getOptionValue={(loc) => loc.id}
                getOptionLabel={(loc) => loc.name}
                placeholder="Select location…"
                required
                className="company-form__input--select"
              />
            </label>
            <label className="company-form__field">
              <span className="company-form__label">Department *</span>
              <FilterableSelect
                value={placement.department_id}
                onChange={(department_id) => setPlacement((f) => ({
                  ...f,
                  department_id,
                  area_id: '',
                }))}
                options={activeDepartments}
                getOptionValue={(dept) => dept.id}
                getOptionLabel={(dept) => dept.name}
                placeholder="Select department…"
                required
                disabled={!placement.location_id}
                className="company-form__input--select"
              />
            </label>
            <label className="company-form__field">
              <span className="company-form__label">Area *</span>
              <FilterableSelect
                value={placement.area_id}
                onChange={(area_id) => setPlacement((f) => ({ ...f, area_id }))}
                options={activeAreas}
                getOptionValue={(area) => area.id}
                getOptionLabel={(area) => area.name}
                placeholder="Select area…"
                required
                disabled={!placement.department_id}
                className="company-form__input--select"
              />
            </label>
          </div>

          {error && <div className="company-alert">{error}</div>}
          <div className="company-modal__actions">
            <button type="button" className="company-btn company-btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="company-btn company-btn--primary" disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create equipment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
