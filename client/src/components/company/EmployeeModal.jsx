import { useMemo, useState, useEffect, useRef } from 'react'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import PageBack from '../shared/PageBack'
import { getOrgAssetSignedUrl, validateLogoFile } from '../../lib/orgAssets'
import CreatableSelect from './CreatableSelect'
import EmployeeSelect from './EmployeeSelect'
import GooToggle from '../ui/GooToggle'
import LocationModal from './LocationModal'
import DepartmentModal from './DepartmentModal'
import PhoneInput from '../shared/PhoneInput'
import FilterableSelect from '../ui/FilterableSelect'
import ImageCropModal from '../shared/ImageCropModal'
import {
  departmentsForEmployeeLocation,
} from '../../lib/departmentLocation'
import { validatePhoneE164 } from '../../lib/validation'
import { isLocationHeadEmployee } from '../../lib/employeeRoles'
import './CompanyShared.css'

const EMPTY = {
  emp_id: '',
  name: '',
  mobile: '',
  email: '',
  additional_emails: [],
  location_id: '',
  department_id: '',
  manager_id: '',
  access_role_id: '',
  login_required: false,
}

function findDefaultUserRole(roles) {
  return (roles || []).find(
    (role) => role.is_active !== false && role.name?.trim().toLowerCase() === 'user',
  ) || null
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function normalizeAdditionalEmails(emails) {
  const seen = new Set()
  const normalized = []
  for (const raw of emails || []) {
    const email = raw?.trim().toLowerCase()
    if (!email || seen.has(email)) continue
    seen.add(email)
    normalized.push(email)
  }
  return normalized
}


export default function EmployeeModal({
  employee,
  employees = [],
  locations,
  departments,
  accessRoles = [],
  saving,
  nestedSaving,
  defaultLocationId = '',
  lockLocation = false,
  onClose,
  onSave,
  onCreateLocation,
  onCreateDepartment,
  onLimitExceeded,
}) {
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState(null)
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [removePhoto, setRemovePhoto] = useState(false)
  const [cropSource, setCropSource] = useState(null)
  const [nested, setNested] = useState(null)
  const photoInputRef = useRef(null)
  const handleBackdropClick = useBackdropClose(onClose)

  const activeLocations = locations.filter((l) => l.is_active !== false)
  const activeDepartments = departments.filter((d) => d.is_active !== false)
  const activeEmployees = employees.filter((e) => e.is_active !== false)
  const managerOptions = activeEmployees.filter((e) =>
    e.id !== employee?.id
    && (!form.location_id || e.location_id === form.location_id)
    && (!form.department_id || e.department_id === form.department_id),
  )

  const departmentsForLocation = useMemo(
    () => departmentsForEmployeeLocation(activeDepartments, form.location_id),
    [activeDepartments, form.location_id],
  )

  const availableAccessRoles = useMemo(
    () => accessRoles.filter((role) => role.is_active !== false),
    [accessRoles],
  )
  const selectedAccessRole = useMemo(
    () => availableAccessRoles.find((role) => role.id === form.access_role_id) || null,
    [availableAccessRoles, form.access_role_id],
  )
  const showLocationHeadPill = isLocationHeadEmployee(employee, {
    accessRoleName: selectedAccessRole?.name,
  })

  useEffect(() => {
    let cancelled = false

    async function hydrate() {
      if (employee) {
        setForm({
          emp_id: employee.emp_id || '',
          name: employee.name || '',
          mobile: employee.mobile || '',
          email: employee.email || '',
          additional_emails: (employee.org_employee_emails || []).map((row) => row.email),
          location_id: employee.location_id || '',
          department_id: employee.department_id || '',
          manager_id: employee.manager_id || '',
          access_role_id: employee.access_role_id || '',
          login_required: employee.login_required === true,
        })
        try {
          const preview = await loadEmployeePhotoPreview(employee)
          if (!cancelled) setPhotoPreview(preview)
        } catch {
          if (!cancelled) setPhotoPreview(null)
        }
      } else {
        const defaultRole = findDefaultUserRole(accessRoles)
        setForm({
          ...EMPTY,
          location_id: defaultLocationId || '',
          access_role_id: defaultRole?.id || '',
        })
        if (!cancelled) setPhotoPreview(null)
      }
      if (!cancelled) {
        setPhotoFile(null)
        setRemovePhoto(false)
      }
    }

    hydrate()
    return () => {
      cancelled = true
    }
  }, [employee, defaultLocationId])

  useEffect(() => {
    // When roles load after opening create modal, default to User if still empty.
    if (employee || form.access_role_id) return
    const defaultRole = findDefaultUserRole(availableAccessRoles)
    if (!defaultRole) return
    setForm((prev) => (prev.access_role_id ? prev : { ...prev, access_role_id: defaultRole.id }))
  }, [employee, availableAccessRoles, form.access_role_id])

  useEffect(() => {
    if (employee || !defaultLocationId) return
    setForm((prev) => (prev.location_id ? prev : { ...prev, location_id: defaultLocationId }))
  }, [employee, defaultLocationId])

  useEffect(() => {
    if (!lockLocation || !defaultLocationId || employee) return
    if (form.location_id === defaultLocationId) return
    setForm((prev) => ({
      ...prev,
      location_id: defaultLocationId,
      department_id: prev.location_id === defaultLocationId ? prev.department_id : '',
      manager_id: prev.location_id === defaultLocationId ? prev.manager_id : '',
    }))
  }, [lockLocation, defaultLocationId, employee, form.location_id])


  useEffect(() => {
    if (!form.department_id) return
    const stillValid = departmentsForLocation.some((d) => d.id === form.department_id)
    if (!stillValid) {
      setForm((prev) => ({
        ...prev,
        department_id: '',
      }))
    }
  }, [departmentsForLocation, form.department_id])


  useEffect(() => {
    if (!form.manager_id) return
    const stillValid = managerOptions.some((e) => e.id === form.manager_id)
    if (!stillValid) {
      setForm((prev) => ({ ...prev, manager_id: '' }))
    }
  }, [managerOptions, form.manager_id])

  useEffect(() => {
    if (!form.access_role_id) return
    const stillValid = availableAccessRoles.some((role) => role.id === form.access_role_id)
    if (!stillValid) {
      setForm((prev) => ({ ...prev, access_role_id: '' }))
    }
  }, [availableAccessRoles, form.access_role_id])

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    const validationError = validateLogoFile(file)
    if (validationError) {
      setError(validationError)
      return
    }

    setError(null)
    setCropSource({
      url: URL.createObjectURL(file),
      fileName: file.name,
      mimeType: file.type,
    })
  }

  const handleCropCancel = () => {
    if (cropSource?.url) URL.revokeObjectURL(cropSource.url)
    setCropSource(null)
  }

  const handleCropComplete = (file) => {
    if (cropSource?.url) URL.revokeObjectURL(cropSource.url)
    setCropSource(null)
    setPhotoFile(file)
    setRemovePhoto(false)
    setPhotoPreview(URL.createObjectURL(file))
  }

  const handleRemovePhoto = () => {
    if (photoPreview?.startsWith('blob:')) URL.revokeObjectURL(photoPreview)
    setPhotoFile(null)
    setPhotoPreview(null)
    setRemovePhoto(Boolean(employee?.photo_url || employee?.photo_signed_url))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    if (!form.emp_id.trim() || !form.name.trim()) {
      setError('Employee ID and name are required')
      return
    }

    if (form.login_required && !form.email.trim()) {
      setError('Primary email is required when login is enabled')
      return
    }

    const primary = form.email.trim().toLowerCase()
    const additionalEmails = normalizeAdditionalEmails(form.additional_emails)

    for (const email of additionalEmails) {
      if (!EMAIL_RE.test(email)) {
        setError(`Invalid email: ${email}`)
        return
      }
      if (primary && email === primary) {
        setError('Additional emails cannot include the primary email')
        return
      }
    }

    const mobileError = validatePhoneE164(form.mobile)
    if (mobileError) {
      setError(mobileError)
      return
    }

    try {
      await onSave({
        emp_id: form.emp_id,
        name: form.name,
        mobile: form.mobile,
        email: form.email,
        additional_emails: additionalEmails,
        location_id: form.location_id || null,
        department_id: form.department_id || null,
        manager_id: form.manager_id || null,
        access_role_id: form.access_role_id || null,
        login_required: form.login_required,
      }, photoFile, { removePhoto })
    } catch (err) {
      setError(err.message)
    }
  }

  const handleNestedLocationSave = async (payload) => {
    try {
      const created = await onCreateLocation(payload)
      setForm((prev) => ({ ...prev, location_id: created.id }))
      setNested(null)
    } catch (err) {
      if (onLimitExceeded?.(err, 'Location')) {
        setNested(null)
        return
      }
      throw err
    }
  }

  const handleNestedDepartmentSave = async (payload) => {
    try {
      const created = await onCreateDepartment(payload)
      setForm((prev) => ({ ...prev, department_id: created.id }))
      setNested(null)
    } catch (err) {
      if (onLimitExceeded?.(err, 'Department')) {
        setNested(null)
        return
      }
      throw err
    }
  }


  const addAdditionalEmail = () => {
    setForm((prev) => ({ ...prev, additional_emails: [...prev.additional_emails, ''] }))
  }

  const updateAdditionalEmail = (index, value) => {
    setForm((prev) => {
      const additional_emails = [...prev.additional_emails]
      additional_emails[index] = value
      return { ...prev, additional_emails }
    })
  }

  const removeAdditionalEmail = (index) => {
    setForm((prev) => ({
      ...prev,
      additional_emails: prev.additional_emails.filter((_, i) => i !== index),
    }))
  }

  const avatarLetter = (form.name[0] || form.emp_id[0] || '?').toUpperCase()

  return (
    <>
      <div
        className="company-modal-overlay company-modal-overlay--popup"
        onMouseDown={handleBackdropClick}
        role="presentation"
      >
        <div
          className="company-modal company-modal--popup company-modal--popup-wide"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="employee-modal-title"
        >
          <div className="company-modal__header">
            <div className="modal__header-main">
              <PageBack onClick={onClose} className="page-back--header" label="Employees" />
              <h2 id="employee-modal-title">{employee ? 'Edit Employee' : 'Add Employee'}</h2>
            </div>
            <button type="button" className="company-modal__close" onClick={onClose} aria-label="Close">×</button>
          </div>
          <form className="company-modal__form" onSubmit={handleSubmit}>
            <div className="company-employee-photo">
              <div className="company-employee-photo__main">
                <div className="company-employee-photo__identity">
                  <div className="company-employee-photo__preview">
                    {photoPreview ? (
                      <img src={photoPreview} alt="" className="company-employee-photo__img" />
                    ) : (
                      <span className="company-employee-photo__placeholder">{avatarLetter}</span>
                    )}
                  </div>
                  {showLocationHeadPill && (
                    <div className="company-employee-photo__pills" aria-label="Employee roles">
                      <span className="company-badge company-badge--location-head">
                        Location Head
                      </span>
                    </div>
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
                  {photoPreview && (
                    <button
                      type="button"
                      className="company-btn company-btn--secondary company-btn--compact"
                      onClick={handleRemovePhoto}
                    >
                      Remove
                    </button>
                  )}
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
                <PhoneInput
                  value={form.mobile}
                  onChange={(mobile) => setForm({ ...form, mobile })}
                  placeholder="Mobile number"
                />
              </label>
              <label className="company-form__field">
                <span className="company-form__label">Primary Email</span>
                <input
                  type="email"
                  className="company-form__input"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="Login & main contact email"
                />
              </label>
            </div>

            <div className="company-employee-emails">
              <div className="company-employee-emails__header">
                <span className="company-form__label">Additional Emails</span>
                <button
                  type="button"
                  className="company-btn company-btn--secondary company-btn--compact"
                  onClick={addAdditionalEmail}
                >
                  + Add Email
                </button>
              </div>
              {form.additional_emails.length === 0 ? (
                <p className="company-employee-emails__empty">No additional emails yet.</p>
              ) : (
                <div className="company-employee-emails__list">
                  {form.additional_emails.map((email, index) => (
                    <div key={index} className="company-employee-emails__row">
                      <input
                        type="email"
                        className="company-form__input"
                        value={email}
                        onChange={(e) => updateAdditionalEmail(index, e.target.value)}
                        placeholder="name@company.com"
                      />
                      <button
                        type="button"
                        className="company-link company-link--danger"
                        onClick={() => removeAdditionalEmail(index)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <CreatableSelect
              label="Location"
              value={form.location_id}
              onChange={(location_id) => setForm({
                ...form,
                location_id,
                department_id: '',
                manager_id: '',
              })}
              options={activeLocations}
              getOptionValue={(loc) => loc.id}
              getOptionLabel={(loc) => (loc.code ? `${loc.code} — ${loc.name}` : loc.name)}
              placeholder="Select location"
              disabled={lockLocation}
              onCreate={onCreateLocation ? () => setNested('location') : undefined}
            />
            {lockLocation && (
              <span className="company-modal__hint">
                Location is limited to your assigned location.
              </span>
            )}

            <CreatableSelect
              label="Department"
              value={form.department_id}
              onChange={(department_id) => setForm({
                ...form,
                department_id,
                manager_id: '',
              })}
              options={departmentsForLocation}
              getOptionValue={(dept) => dept.id}
              getOptionLabel={(dept) => (dept.code ? `${dept.code} — ${dept.name}` : dept.name)}
              placeholder={form.location_id ? 'Select department' : 'Select location first'}
              disabled={!form.location_id}
              onCreate={() => setNested('department')}
            />


            <div className="company-form__row">
            <EmployeeSelect
              label="Manager"
              value={form.manager_id}
              onChange={(manager_id) => setForm({ ...form, manager_id })}
              options={managerOptions}
              placeholder={form.department_id ? 'None' : 'Select department first'}
              disabled={!form.department_id}
            />

            <label className="company-form__field">
              <span className="company-form__label">Access Role</span>
              <FilterableSelect
                className="company-form__input--select"
                value={form.access_role_id}
                onChange={(next) => setForm({ ...form, access_role_id: next })}
                options={availableAccessRoles}
                getOptionValue={(role) => role.id}
                getOptionLabel={(role) => role.name}
                emptyLabel={
                  findDefaultUserRole(availableAccessRoles)
                    ? 'User (default)'
                    : 'No role assigned'
                }
                placeholder={
                  findDefaultUserRole(availableAccessRoles)
                    ? 'User (default)'
                    : 'No role assigned'
                }
              />
              {accessRoles.length === 0 ? (
                <span className="company-modal__hint">
                  No access roles yet. Create them under Configuration → Roles &amp; Access.
                </span>
              ) : (
                <span className="company-modal__hint">
                  If no role is selected, the User role is assigned automatically.
                </span>
              )}
            </label>
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
          nestedSaving={nestedSaving}
          defaultLocationId={form.location_id || defaultLocationId || ''}
          lockLocation={lockLocation}
          onClose={() => setNested(null)}
          onSave={handleNestedDepartmentSave}
          onCreateLocation={lockLocation ? undefined : onCreateLocation}
        />
      )}

      {cropSource && (
        <ImageCropModal
          nested
          imageSrc={cropSource.url}
          fileName={cropSource.fileName}
          mimeType={cropSource.mimeType}
          onCancel={handleCropCancel}
          onComplete={handleCropComplete}
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
