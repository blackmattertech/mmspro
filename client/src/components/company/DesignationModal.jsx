import { useState, useEffect } from 'react'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import './CompanyShared.css'

const EMPTY = {
  name: '',
  description: '',
  all_departments: true,
  department_ids: [],
}

export function formatDesignationDepartments(designation) {
  if (designation.all_departments) return 'All departments'
  if (designation.departments?.length) {
    return designation.departments.map((dept) => dept.name).join(', ')
  }
  return '—'
}

export default function DesignationModal({ designation, departments, saving, onClose, onSave, nested = false }) {
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState(null)
  const handleBackdropClick = useBackdropClose(onClose)

  const activeDepartments = departments.filter((d) => d.is_active !== false)

  useEffect(() => {
    if (designation) {
      setForm({
        name: designation.name || '',
        description: designation.description || '',
        all_departments: designation.all_departments !== false,
        department_ids: designation.departments?.map((dept) => dept.id) || [],
      })
    } else {
      setForm(EMPTY)
    }
  }, [designation])

  const toggleDepartment = (departmentId) => {
    setForm((prev) => {
      const selected = new Set(prev.department_ids)
      if (selected.has(departmentId)) selected.delete(departmentId)
      else selected.add(departmentId)
      return { ...prev, department_ids: [...selected] }
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    if (!form.name.trim()) {
      setError('Name is required')
      return
    }
    if (!form.all_departments && form.department_ids.length === 0) {
      setError('Select at least one department or choose all departments')
      return
    }
    try {
      await onSave({
        name: form.name,
        description: form.description,
        all_departments: form.all_departments,
        department_ids: form.all_departments ? [] : form.department_ids,
      })
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className={`company-modal-overlay ${nested ? 'company-modal-overlay--nested' : ''}`} onMouseDown={handleBackdropClick}>
      <div className="company-modal" onClick={(e) => e.stopPropagation()}>
        <div className="company-modal__header">
          <h2>{designation ? 'Edit Designation' : 'Add Designation'}</h2>
          <button type="button" className="company-modal__close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form className="company-modal__form" onSubmit={handleSubmit}>
          <label className="company-form__field">
            <span className="company-form__label">Name *</span>
            <input
              className="company-form__input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              placeholder="e.g. Manager, Technician"
            />
          </label>
          <label className="company-form__field">
            <span className="company-form__label">Description</span>
            <textarea
              className="company-form__input company-form__textarea"
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>
          <div className="company-form__field">
            <span className="company-form__label">Departments</span>
            <label className="company-checkbox">
              <input
                type="checkbox"
                checked={form.all_departments}
                onChange={(e) => setForm({
                  ...form,
                  all_departments: e.target.checked,
                  department_ids: e.target.checked ? [] : form.department_ids,
                })}
              />
              <span>All departments</span>
            </label>
            {!form.all_departments && (
              <div className="company-checkbox-list">
                {activeDepartments.length === 0 ? (
                  <p className="company-modal__hint">No departments available. Create departments first.</p>
                ) : (
                  activeDepartments.map((dept) => (
                    <label key={dept.id} className="company-checkbox">
                      <input
                        type="checkbox"
                        checked={form.department_ids.includes(dept.id)}
                        onChange={() => toggleDepartment(dept.id)}
                      />
                      <span>{dept.name}</span>
                    </label>
                  ))
                )}
              </div>
            )}
          </div>
          {error && <p className="company-alert">{error}</p>}
          <div className="company-modal__actions">
            <button type="button" className="company-btn company-btn--secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="company-btn company-btn--primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
