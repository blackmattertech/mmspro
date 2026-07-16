import { useEffect, useMemo, useState } from 'react'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import { useLocations } from '../../hooks/useLocations'
import { useDepartments } from '../../hooks/useDepartments'
import { useAreas } from '../../hooks/useAreas'
import { getEquipmentFields } from '../../lib/api-equipment'
import '../company/CompanyShared.css'

const EMPTY = {
  name: '',
  code: '',
  qr_code: '',
  location_id: '',
  department_id: '',
  area_id: '',
}

export default function EquipmentModal({ equipment, saving, onClose, onSave }) {
  const isEdit = Boolean(equipment?.id)
  const { locations } = useLocations()
  const [form, setForm] = useState(EMPTY)
  const [fieldDefs, setFieldDefs] = useState([])
  const [values, setValues] = useState({})
  const [error, setError] = useState(null)
  const handleBackdropClick = useBackdropClose(onClose)

  const { departments } = useDepartments(form.location_id || '')
  const { areas } = useAreas({
    locationId: form.location_id || undefined,
    departmentId: form.department_id || undefined,
  })

  useEffect(() => {
    getEquipmentFields()
      .then((fields) => setFieldDefs((fields || []).filter((f) => f.kind === 'parent' && f.is_active !== false)))
      .catch(() => setFieldDefs([]))
  }, [])

  useEffect(() => {
    if (equipment) {
      setForm({
        name: equipment.name || '',
        code: equipment.code || '',
        qr_code: equipment.qr_code || '',
        location_id: equipment.location_id || '',
        department_id: equipment.department_id || '',
        area_id: equipment.area_id || '',
      })
      const next = {}
      for (const row of equipment.field_values || []) {
        next[row.field_id] = row.value_text ?? ''
      }
      setValues(next)
    } else {
      setForm(EMPTY)
      setValues({})
    }
  }, [equipment])

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
        map.set(key, { id: key, name: field.section_name || 'Details', fields: [] })
      }
      map.get(key).fields.push(field)
    }
    return [...map.values()]
  }, [fieldDefs])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    if (!form.name.trim() || !form.code.trim()) {
      setError('Name and code are required')
      return
    }
    if (!form.location_id || !form.department_id || !form.area_id) {
      setError('Location, department, and area are required')
      return
    }

    const payload = {
      name: form.name.trim(),
      code: form.code.trim(),
      qr_code: form.qr_code.trim() || null,
      location_id: form.location_id,
      department_id: form.department_id,
      area_id: form.area_id,
      values: fieldDefs.map((field) => ({
        field_id: field.id,
        value_text: values[field.id] ?? '',
      })),
    }

    try {
      await onSave(payload)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="company-modal-overlay" onMouseDown={handleBackdropClick} role="presentation">
      <div className="company-modal company-modal--wide" onClick={(e) => e.stopPropagation()} role="dialog">
        <div className="company-modal__header">
          <h2>{isEdit ? 'Edit Equipment' : 'Add Equipment'}</h2>
          <button type="button" className="company-modal__close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form className="company-modal__form" onSubmit={handleSubmit}>
          <label className="company-form__field">
            <span className="company-form__label">Name *</span>
            <input
              className="company-form__input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </label>
          <div className="company-form__row">
            <label className="company-form__field">
              <span className="company-form__label">Code *</span>
              <input
                className="company-form__input"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                required
              />
            </label>
            <label className="company-form__field">
              <span className="company-form__label">QR code</span>
              <input
                className="company-form__input"
                value={form.qr_code}
                onChange={(e) => setForm((f) => ({ ...f, qr_code: e.target.value }))}
              />
            </label>
          </div>

          <label className="company-form__field">
            <span className="company-form__label">Location *</span>
            <select
              className="company-form__input company-form__input--select"
              value={form.location_id}
              onChange={(e) => setForm((f) => ({
                ...f,
                location_id: e.target.value,
                department_id: '',
                area_id: '',
              }))}
              required
            >
              <option value="">Select location…</option>
              {activeLocations.map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
          </label>
          <label className="company-form__field">
            <span className="company-form__label">Department *</span>
            <select
              className="company-form__input company-form__input--select"
              value={form.department_id}
              onChange={(e) => setForm((f) => ({
                ...f,
                department_id: e.target.value,
                area_id: '',
              }))}
              required
              disabled={!form.location_id}
            >
              <option value="">Select department…</option>
              {activeDepartments.map((dept) => (
                <option key={dept.id} value={dept.id}>{dept.name}</option>
              ))}
            </select>
          </label>
          <label className="company-form__field">
            <span className="company-form__label">Area *</span>
            <select
              className="company-form__input company-form__input--select"
              value={form.area_id}
              onChange={(e) => setForm((f) => ({ ...f, area_id: e.target.value }))}
              required
              disabled={!form.department_id}
            >
              <option value="">Select area…</option>
              {activeAreas.map((area) => (
                <option key={area.id} value={area.id}>{area.name}</option>
              ))}
            </select>
          </label>

          {sections.map((section) => (
            <div key={section.id} className="equipment-dynamic-section">
              <h3 className="equipment-dynamic-section__title">{section.name}</h3>
              {section.fields.map((field) => (
                <label key={field.id} className="company-form__field">
                  <span className="company-form__label">{field.name}</span>
                  {field.field_type === 'textarea' ? (
                    <textarea
                      className="company-form__input"
                      rows={3}
                      value={values[field.id] || ''}
                      onChange={(e) => setValues((v) => ({ ...v, [field.id]: e.target.value }))}
                    />
                  ) : field.field_type === 'dropdown' ? (
                    <select
                      className="company-form__input company-form__input--select"
                      value={values[field.id] || ''}
                      onChange={(e) => setValues((v) => ({ ...v, [field.id]: e.target.value }))}
                    >
                      <option value="">Select…</option>
                      {(field.dropdown_options || []).map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : field.field_type === 'checkbox' ? (
                    <input
                      type="checkbox"
                      checked={values[field.id] === 'true' || values[field.id] === true}
                      onChange={(e) => setValues((v) => ({
                        ...v,
                        [field.id]: e.target.checked ? 'true' : 'false',
                      }))}
                    />
                  ) : (
                    <input
                      className="company-form__input"
                      type={field.field_type === 'number' ? 'number' : field.field_type === 'date' ? 'date' : field.field_type === 'datetime' ? 'datetime-local' : 'text'}
                      value={values[field.id] || ''}
                      onChange={(e) => setValues((v) => ({ ...v, [field.id]: e.target.value }))}
                    />
                  )}
                </label>
              ))}
            </div>
          ))}

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
