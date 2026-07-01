import { useMemo, useState, useEffect, useRef } from 'react'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import { getOrgAssetSignedUrl, validateLogoFile } from '../../lib/orgAssets'
import CreatableSelect from './CreatableSelect'
import GooToggle from '../ui/GooToggle'
import LocationModal from './LocationModal'
import DepartmentModal from './DepartmentModal'
import DesignationModal from './DesignationModal'
import './CompanyShared.css'

const EMPTY = {
  emp_id: '',
  name: '',
  mobile: '',
  email: '',
  location_id: '',
  department_id: '',
  designation_id: '',
  login_required: false,
}

function filterDesignationsForDepartment(designations, departmentId) {
  const active = designations.filter((d) => d.is_active !== false)
  if (!departmentId) return active
  return active.filter((d) =>
    d.all_departments || d.departments?.some((dept) => dept.id === departmentId),
  )
}

export default function EmployeeModal({
  employee,
  locations,
  departments,
  designations,
  saving,
  nestedSaving,
  onClose,
  onSave,
  onCreateLocation,
  onCreateDepartment,
  onCreateDesignation,
}) {
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState(null)
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [nested, setNested] = useState(null)
  const photoInputRef = useRef(null)
  const handleBackdropClick = useBackdropClose(onClose)

  const activeLocations = locations.filter((l) => l.is_active !== false)
  const activeDepartments = departments.filter((d) => d.is_active !== false)

  const availableDesignations = useMemo(
    () => filterDesignationsForDepartment(designations, form.department_id),
    [designations, form.department_id],
  )

  useEffect(() => {
    if (employee) {
      setForm({
        emp_id: employee.emp_id || '',
        name: employee.name || '',
        mobile: employee.mobile || '',
        email: employee.email || '',
        location_id: employee.location_id || '',
        department_id: employee.department_id || '',
        designation_id: employee.designation_id || '',
        login_required: employee.login_required === true,
      })
      setPhotoPreview(employee.photo_signed_url || null)
    } else {
      setForm(EMPTY)
      setPhotoPreview(null)
    }
    setPhotoFile(null)
  }, [employee])

  useEffect(() => {
    if (!form.designation_id) return
    const stillValid = availableDesignations.some((d) => d.id === form.designation_id)
    if (!stillValid) {
      setForm((prev) => ({ ...prev, designation_id: '' }))
    }
  }, [availableDesignations, form.designation_id])

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    const validationError = validateLogoFile(file)
    if (validationError) {
      setError(validationError)
      return
    }

    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
    setError(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    if (!form.emp_id.trim() || !form.name.trim()) {
      setError('Employee ID and name are required')
      return
    }

    if (form.login_required && !form.email.trim()) {
      setError('Email is required when login is enabled')
      return
    }

    try {
      await onSave({
        emp_id: form.emp_id,
        name: form.name,
        mobile: form.mobile,
        email: form.email,
        location_id: form.location_id || null,
        department_id: form.department_id || null,
        designation_id: form.designation_id || null,
        login_required: form.login_required,
      }, photoFile)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleNestedLocationSave = async (payload) => {
    const created = await onCreateLocation(payload)
    setForm((prev) => ({ ...prev, location_id: created.id }))
    setNested(null)
  }

  const handleNestedDepartmentSave = async (payload) => {
    const created = await onCreateDepartment(payload)
    setForm((prev) => ({ ...prev, department_id: created.id }))
    setNested(null)
  }

  const handleNestedDesignationSave = async (payload) => {
    const created = await onCreateDesignation(payload)
    setForm((prev) => ({ ...prev, designation_id: created.id }))
    setNested(null)
  }

  const avatarLetter = (form.name[0] || form.emp_id[0] || '?').toUpperCase()

  return (
    <>
      <div className="company-modal-overlay" onMouseDown={handleBackdropClick}>
        <div className="company-modal company-modal--wide" onClick={(e) => e.stopPropagation()}>
          <div className="company-modal__header">
            <h2>{employee ? 'Edit Employee' : 'Add Employee'}</h2>
            <button type="button" className="company-modal__close" onClick={onClose} aria-label="Close">×</button>
          </div>
          <form className="company-modal__form" onSubmit={handleSubmit}>
            <div className="company-employee-photo">
              <div className="company-employee-photo__main">
                <div className="company-employee-photo__preview">
                  {photoPreview ? (
                    <img src={photoPreview} alt="" className="company-employee-photo__img" />
                  ) : (
                    <span className="company-employee-photo__placeholder">{avatarLetter}</span>
                  )}
                </div>
                <div className="company-employee-photo__actions">
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="company-logo__input"
                    onChange={handlePhotoChange}
                  />
                  <button
                    type="button"
                    className="company-btn company-btn--secondary company-btn--compact"
                    onClick={() => photoInputRef.current?.click()}
                  >
                    {photoPreview ? 'Change Photo' : 'Upload Photo'}
                  </button>
                  <p className="company-logo__hint">JPEG, PNG, WebP or GIF. Max 5 MB.</p>
                </div>
              </div>
              <div className="company-employee-photo__login">
                <span className="company-employee-photo__login-label">Login Required</span>
                <GooToggle
                  checked={form.login_required}
                  onChange={(checked) => setForm({ ...form, login_required: checked })}
                  ariaLabel="Login required"
                />
                <p
                  className={`company-employee-photo__login-hint${
                    form.login_required ? '' : ' company-employee-photo__login-hint--enable'
                  }`}
                >
                  {form.login_required
                    ? 'A password setup email will be sent when you save.'
                    : 'Enable to allow this employee to sign in.'}
                </p>
              </div>
            </div>

            <div className="company-form__grid company-form__grid--2">
              <label className="company-form__field">
                <span className="company-form__label">Emp ID *</span>
                <input
                  className="company-form__input"
                  value={form.emp_id}
                  onChange={(e) => setForm({ ...form, emp_id: e.target.value })}
                  required
                  placeholder="e.g. EMP001"
                />
              </label>
              <label className="company-form__field">
                <span className="company-form__label">Employee Name *</span>
                <input
                  className="company-form__input"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </label>
            </div>

            <div className="company-form__grid company-form__grid--2">
              <label className="company-form__field">
                <span className="company-form__label">Mobile</span>
                <input
                  className="company-form__input"
                  value={form.mobile}
                  onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                  placeholder="+91..."
                />
              </label>
              <label className="company-form__field">
                <span className="company-form__label">Email</span>
                <input
                  type="email"
                  className="company-form__input"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </label>
            </div>

            <CreatableSelect
              label="Location"
              value={form.location_id}
              onChange={(location_id) => setForm({ ...form, location_id })}
              options={activeLocations}
              getOptionValue={(loc) => loc.id}
              getOptionLabel={(loc) => loc.name}
              placeholder="Select location"
              onCreate={() => setNested('location')}
            />

            <CreatableSelect
              label="Department"
              value={form.department_id}
              onChange={(department_id) => setForm({ ...form, department_id, designation_id: '' })}
              options={activeDepartments}
              getOptionValue={(dept) => dept.id}
              getOptionLabel={(dept) => dept.name}
              placeholder="Select department"
              onCreate={() => setNested('department')}
            />

            <CreatableSelect
              label="Designation"
              value={form.designation_id}
              onChange={(designation_id) => setForm({ ...form, designation_id })}
              options={availableDesignations}
              getOptionValue={(des) => des.id}
              getOptionLabel={(des) => des.name}
              placeholder={form.department_id ? 'Select designation' : 'Select department first (optional)'}
              onCreate={() => setNested('designation')}
            />

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

      {nested === 'location' && (
        <LocationModal
          nested
          location={null}
          saving={nestedSaving}
          onClose={() => setNested(null)}
          onSave={handleNestedLocationSave}
        />
      )}

      {nested === 'department' && (
        <DepartmentModal
          nested
          department={null}
          locations={activeLocations}
          departments={activeDepartments}
          saving={nestedSaving}
          onClose={() => setNested(null)}
          onSave={handleNestedDepartmentSave}
        />
      )}

      {nested === 'designation' && (
        <DesignationModal
          nested
          designation={null}
          departments={activeDepartments}
          saving={nestedSaving}
          onClose={() => setNested(null)}
          onSave={handleNestedDesignationSave}
        />
      )}
    </>
  )
}

export async function loadEmployeePhotoPreview(employee) {
  if (employee?.photo_signed_url) return employee.photo_signed_url
  if (employee?.photo_url) return getOrgAssetSignedUrl(employee.photo_url)
  return null
}
