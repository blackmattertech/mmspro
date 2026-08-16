import { useEffect, useState } from 'react'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import { getNextVendorCode } from '../../lib/api-vendors'
import {
  validateVendorFields,
  firstVendorValidationError,
} from '../../lib/vendorValidation'
import { getStateForCity, parseCityName } from '../../lib/indiaLocations'
import VendorForm, { EMPTY_VENDOR_FORM, vendorToForm } from './VendorForm'
import PageBack from '../shared/PageBack'
import '../shared/PageBack.css'
import '../company/CompanyShared.css'
import './Vendors.css'

export default function VendorModal({
  vendor,
  saving,
  onClose,
  onSave,
  backLabel = 'Vendors',
}) {
  const [form, setForm] = useState(EMPTY_VENDOR_FORM)
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState(null)
  const [nextCodePreview, setNextCodePreview] = useState('')
  const handleBackdropClick = useBackdropClose(onClose)

  const isEdit = Boolean(vendor?.id)

  useEffect(() => {
    setForm(vendorToForm(vendor))
    setFieldErrors({})
    setError(null)
  }, [vendor])

  useEffect(() => {
    if (isEdit) return undefined
    let cancelled = false
    getNextVendorCode()
      .then((data) => {
        if (!cancelled) setNextCodePreview(data.vendor_code || '')
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [isEdit])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    const errors = validateVendorFields(form, {
      requireName: true,
      requireCode: isEdit,
    })
    setFieldErrors(errors)
    const validationError = firstVendorValidationError(errors)
    if (validationError) {
      setError(validationError)
      return
    }

    try {
      const city = parseCityName(form.city)
      const state = form.state || getStateForCity(city)
      const payload = { ...form, city, state }
      if (!isEdit && !payload.vendor_code?.trim()) {
        delete payload.vendor_code
      }
      await onSave(payload)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="company-modal-overlay vendor-modal" onMouseDown={handleBackdropClick}>
      <div className="company-modal" onClick={(e) => e.stopPropagation()}>
        <div className="company-modal__header">
          <div className="modal__header-main">
            <PageBack onClick={onClose} label={backLabel} />
            <h2>{isEdit ? 'Edit Vendor' : 'Add Vendor'}</h2>
          </div>
          <button type="button" className="company-modal__close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form className="company-modal__form" onSubmit={handleSubmit}>
          {error && <div className="company-alert" role="alert">{error}</div>}

          <VendorForm
            form={form}
            onChange={setForm}
            errors={fieldErrors}
            isEdit={isEdit}
            nextCodePreview={nextCodePreview}
          />

          <div className="company-form__actions">
            <button type="button" className="company-btn company-btn--secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="company-btn company-btn--primary" disabled={saving}>
              {saving ? 'Saving…' : (isEdit ? 'Save Changes' : 'Add Vendor')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
