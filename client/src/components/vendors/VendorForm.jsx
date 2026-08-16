import { useMemo } from 'react'
import FilterableSelect from '../ui/FilterableSelect'
import { getAllIndianCities, getStateForCity, formatCityDisplay } from '../../lib/indiaLocations'
import { panFromGstin } from '../../lib/vendorValidation'
import './Vendors.css'

export const EMPTY_VENDOR_FORM = {
  vendor_code: '',
  name: '',
  contact_person: '',
  mobile: '',
  email: '',
  address_line1: '',
  address_line2: '',
  pincode: '',
  city: '',
  state: '',
  gstin: '',
  pan: '',
  bank_account_number: '',
  bank_name: '',
  account_name: '',
  ifsc_code: '',
  branch: '',
}

export function vendorToForm(vendor) {
  if (!vendor) {
    return { ...EMPTY_VENDOR_FORM }
  }
  return {
    vendor_code: vendor.vendor_code || '',
    name: vendor.name || '',
    contact_person: vendor.contact_person || '',
    mobile: vendor.mobile || '',
    email: vendor.email || '',
    address_line1: vendor.address_line1 || '',
    address_line2: vendor.address_line2 || '',
    pincode: vendor.pincode || '',
    city: vendor.city || '',
    state: vendor.state || '',
    gstin: vendor.gstin || '',
    pan: vendor.pan || '',
    bank_account_number: vendor.bank_account_number || '',
    bank_name: vendor.bank_name || '',
    account_name: vendor.account_name || '',
    ifsc_code: vendor.ifsc_code || '',
    branch: vendor.branch || '',
  }
}

function Section({ title, children }) {
  return (
    <section className="vendor-form__section">
      <h3 className="vendor-form__section-title">{title}</h3>
      <div className="company-form__grid">
        {children}
      </div>
    </section>
  )
}

function Field({
  label,
  required = false,
  error,
  className = '',
  children,
}) {
  return (
    <label className={`company-form__field ${className}`.trim()}>
      <span className="company-form__label">
        {label}
        {required ? ' *' : ''}
      </span>
      {children}
      {error && <span className="vendor-form__field-error" role="alert">{error}</span>}
    </label>
  )
}

export default function VendorForm({
  form,
  onChange,
  errors = {},
  isEdit = false,
  nextCodePreview = '',
}) {
  const cityOptions = useMemo(() => getAllIndianCities(), [])

  const setField = (key, value) => {
    onChange({ ...form, [key]: value })
  }

  const setGstin = (value) => {
    const gstin = value.toUpperCase().replace(/\s/g, '').slice(0, 15)
    const next = { ...form, gstin }
    if (gstin.length >= 12) {
      next.pan = panFromGstin(gstin)
    }
    onChange(next)
  }

  return (
    <div className="vendor-form">
      <Section title="Contact Details">
        <Field label="Vendor ID" error={errors.vendor_code}>
          <input
            className="company-form__input"
            value={form.vendor_code}
            onChange={(e) => setField('vendor_code', e.target.value)}
            placeholder={isEdit ? 'Ven-0001' : (nextCodePreview || 'Auto-generated if left blank')}
            disabled={isEdit}
          />
          {!isEdit && (
            <p className="vendor-form__hint">
              Leave blank to auto-generate{nextCodePreview ? ` (next: ${nextCodePreview})` : ''}.
            </p>
          )}
        </Field>

        <Field label="Vendor Name" required error={errors.name}>
          <input
            className="company-form__input"
            value={form.name}
            onChange={(e) => setField('name', e.target.value)}
            required
          />
        </Field>

        <Field label="Contact Person" error={errors.contact_person}>
          <input
            className="company-form__input"
            value={form.contact_person}
            onChange={(e) => setField('contact_person', e.target.value)}
          />
        </Field>

        <Field label="Mobile" error={errors.mobile}>
          <input
            type="tel"
            className="company-form__input"
            value={form.mobile}
            onChange={(e) => setField('mobile', e.target.value)}
            placeholder="10-digit mobile or +91…"
          />
        </Field>

        <Field label="Email" className="company-form__field--full" error={errors.email}>
          <input
            type="email"
            className="company-form__input"
            value={form.email}
            onChange={(e) => setField('email', e.target.value)}
          />
        </Field>
      </Section>

      <Section title="Address">
        <Field label="Address Line 1" className="company-form__field--full" error={errors.address_line1}>
          <textarea
            className="company-form__input company-form__textarea"
            rows={2}
            value={form.address_line1}
            onChange={(e) => setField('address_line1', e.target.value)}
          />
        </Field>

        <Field label="Address Line 2" className="company-form__field--full" error={errors.address_line2}>
          <textarea
            className="company-form__input company-form__textarea"
            rows={2}
            value={form.address_line2}
            onChange={(e) => setField('address_line2', e.target.value)}
          />
        </Field>

        <Field label="Pincode" error={errors.pincode}>
          <input
            className="company-form__input"
            value={form.pincode}
            onChange={(e) => setField('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            maxLength={6}
            placeholder="6 digits"
          />
        </Field>

        <Field label="City" error={errors.city}>
          <FilterableSelect
            value={form.city}
            onChange={(value) => {
              const state = getStateForCity(value)
              onChange({ ...form, city: value, state })
            }}
            options={cityOptions}
            getOptionValue={(opt) => opt.city}
            getOptionLabel={(opt) => formatCityDisplay(opt.city, opt.state)}
            placeholder="Search city…"
            inputClassName="company-form__input company-form__input--select"
          />
        </Field>

        <Field label="State" error={errors.state}>
          <input
            className="company-form__input"
            value={form.state}
            readOnly
            disabled
            placeholder="Auto-selected from city"
          />
        </Field>
      </Section>

      <Section title="Taxation">
        <Field label="GSTIN" error={errors.gstin}>
          <input
            className="company-form__input"
            value={form.gstin}
            onChange={(e) => setGstin(e.target.value)}
            maxLength={15}
            placeholder="15-character GSTIN"
          />
        </Field>

        <Field label="PAN" error={errors.pan}>
          <input
            className="company-form__input"
            value={form.pan}
            onChange={(e) => setField('pan', e.target.value.toUpperCase().replace(/\s/g, '').slice(0, 10))}
            maxLength={10}
            placeholder="Auto from GSTIN"
          />
        </Field>
      </Section>

      <Section title="Bank Details">
        <Field label="Bank A/c Number" error={errors.bank_account_number}>
          <input
            className="company-form__input"
            value={form.bank_account_number}
            onChange={(e) => setField('bank_account_number', e.target.value)}
            inputMode="numeric"
          />
        </Field>

        <Field label="Bank Name" error={errors.bank_name}>
          <input
            className="company-form__input"
            value={form.bank_name}
            onChange={(e) => setField('bank_name', e.target.value)}
          />
        </Field>

        <Field label="Account Name" error={errors.account_name}>
          <input
            className="company-form__input"
            value={form.account_name}
            onChange={(e) => setField('account_name', e.target.value)}
          />
        </Field>

        <Field label="IFSC Code" error={errors.ifsc_code}>
          <input
            className="company-form__input"
            value={form.ifsc_code}
            onChange={(e) => setField('ifsc_code', e.target.value.toUpperCase().replace(/\s/g, '').slice(0, 11))}
            maxLength={11}
          />
        </Field>

        <Field label="Branch" className="company-form__field--full" error={errors.branch}>
          <input
            className="company-form__input"
            value={form.branch}
            onChange={(e) => setField('branch', e.target.value)}
          />
        </Field>
      </Section>
    </div>
  )
}
