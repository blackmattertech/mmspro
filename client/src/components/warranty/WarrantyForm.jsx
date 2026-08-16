import { useMemo, useState } from 'react'
import DateField from '../ui/DateField'
import FilterableSelect from '../ui/FilterableSelect'
import VendorModal from '../vendors/VendorModal'
import WarrantyDocumentsSection from './WarrantyDocumentsSection'
import { warrantyDocumentLabelText } from '../../config/warrantyDocuments'
import './WarrantyManager.css'

const EMPTY_ITEM = {
  product_name: '',
  model_part_no: '',
  value: '',
  remarks: '',
}

export const EMPTY_WARRANTY_FORM = {
  purchase_date: '',
  make: '',
  po_number: '',
  po_date: '',
  invoice_number: '',
  invoice_date: '',
  warranty_start: '',
  warranty_end: '',
  warranty_period_months: '',
  expiry_notification_days: '',
  vendor_id: '',
  vendor: '',
  contact_name: '',
  contact_phone: '',
  contact_email: '',
  items: [{ ...EMPTY_ITEM }, { ...EMPTY_ITEM }, { ...EMPTY_ITEM }],
  documents: [],
  removedDocumentIds: [],
}

export function warrantyToForm(record, vendors = []) {
  if (!record) return { ...EMPTY_WARRANTY_FORM, items: EMPTY_WARRANTY_FORM.items.map((row) => ({ ...row })) }

  const items = (record.items || []).length
    ? record.items.map((item) => ({
      product_name: item.product_name || '',
      model_part_no: item.model_part_no || '',
      value: item.value ?? '',
      remarks: item.remarks || '',
    }))
    : [{ ...EMPTY_ITEM }]

  let vendorId = record.vendor_id || record.vendor_record?.id || ''
  if (!vendorId && record.vendor) {
    const needle = record.vendor.trim().toLowerCase()
    const match = vendors.find((vendor) => (
      vendor.name?.trim().toLowerCase() === needle
      || vendor.vendor_code?.trim().toLowerCase() === needle
    ))
    if (match) vendorId = match.id
  }

  const vendorRecord = record.vendor_record
    || vendors.find((vendor) => vendor.id === vendorId)
    || null

  return {
    purchase_date: record.purchase_date || '',
    make: record.make || '',
    po_number: record.po_number || '',
    po_date: record.po_date || '',
    invoice_number: record.invoice_number || '',
    invoice_date: record.invoice_date || '',
    warranty_start: record.warranty_start || '',
    warranty_end: record.warranty_end || '',
    warranty_period_months: computeWarrantyPeriodMonths(record.warranty_start, record.warranty_end)
      || (record.warranty_period_months ?? ''),
    expiry_notification_days: record.expiry_notification_days ?? '',
    vendor_id: vendorId,
    vendor: vendorRecord?.name || record.vendor || '',
    contact_name: record.contact_name || vendorRecord?.contact_person || '',
    contact_phone: record.contact_phone || vendorRecord?.mobile || '',
    contact_email: record.contact_email || vendorRecord?.email || '',
    items,
    documents: (record.documents || []).map((doc) => ({
      id: doc.id,
      label: warrantyDocumentLabelText(doc.label),
      originalLabel: warrantyDocumentLabelText(doc.label),
      file_name: doc.file_name,
      content_type: doc.content_type,
      signed_url: doc.signed_url,
      isPending: false,
    })),
    removedDocumentIds: [],
  }
}

function vendorLabel(vendor) {
  if (!vendor) return ''
  const code = vendor.vendor_code ? ` (${vendor.vendor_code})` : ''
  return `${vendor.name}${code}`
}

export function computeWarrantyPeriodMonths(warrantyStart, warrantyEnd) {
  if (!warrantyStart || !warrantyEnd) return ''

  const startDate = new Date(`${warrantyStart}T00:00:00`)
  const endDate = new Date(`${warrantyEnd}T00:00:00`)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return ''
  if (endDate < startDate) return ''

  let months = (endDate.getFullYear() - startDate.getFullYear()) * 12
    + (endDate.getMonth() - startDate.getMonth())

  if (endDate.getDate() < startDate.getDate()) {
    months -= 1
  }

  return months >= 0 ? String(months) : ''
}

function formatDateYMD(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function addMonthsToWarrantyDate(warrantyStart, months) {
  if (!warrantyStart || months === '' || months == null) return ''

  const numMonths = Number(months)
  if (!Number.isFinite(numMonths) || numMonths < 0) return ''

  const startDate = new Date(`${warrantyStart}T00:00:00`)
  if (Number.isNaN(startDate.getTime())) return ''

  const endDate = new Date(startDate)
  endDate.setMonth(endDate.getMonth() + numMonths)
  return formatDateYMD(endDate)
}

function FieldRow({ label, children }) {
  return (
    <div className="warranty-form__row">
      <span className="warranty-form__label">{label}</span>
      {children}
    </div>
  )
}

function PairFieldRow({ leftLabel, left, rightLabel, right }) {
  return (
    <div className="warranty-form__row warranty-form__row--pair">
      <span className="warranty-form__label">{leftLabel}</span>
      {left}
      <span className="warranty-form__label--sub">{rightLabel}</span>
      {right}
    </div>
  )
}

function SplitFieldRow({ label, leftLabel, left, rightLabel, right }) {
  return (
    <div className="warranty-form__row warranty-form__row--split">
      <span className="warranty-form__label">{label}</span>
      {left}
      <span className="warranty-form__label--sub">{leftLabel}</span>
      {rightLabel ? (
        <>
          <span className="warranty-form__label--sub">{rightLabel}</span>
          {right}
        </>
      ) : right}
    </div>
  )
}

export default function WarrantyForm({
  formId = 'warranty-form',
  serialNumber = null,
  values,
  onChange,
  onSubmit,
  saving = false,
  canSave = true,
  showActions = true,
  onClear,
  onAddSimilar,
  vendors = [],
  vendorsLoading = false,
  onCreateVendor,
  vendorCreateSaving = false,
}) {
  const [vendorDraft, setVendorDraft] = useState(null)

  const setField = (key, value) => {
    onChange({ ...values, [key]: value })
  }

  const handleWarrantyStartChange = (value) => {
    const next = { ...values, warranty_start: value }

    if (!value) {
      onChange(next)
      return
    }

    if (values.warranty_period_months !== '') {
      next.warranty_end = addMonthsToWarrantyDate(value, values.warranty_period_months)
    } else if (values.warranty_end) {
      next.warranty_period_months = computeWarrantyPeriodMonths(value, values.warranty_end)
    }

    onChange(next)
  }

  const handleWarrantyEndChange = (value) => {
    onChange({
      ...values,
      warranty_end: value,
      warranty_period_months: value && values.warranty_start
        ? computeWarrantyPeriodMonths(values.warranty_start, value)
        : values.warranty_period_months,
    })
  }

  const handleWarrantyPeriodChange = (value) => {
    const next = { ...values, warranty_period_months: value }

    if (values.warranty_start && value !== '') {
      next.warranty_end = addMonthsToWarrantyDate(values.warranty_start, value)
    }

    onChange(next)
  }

  const vendorOptions = useMemo(
    () => vendors.filter((vendor) => vendor.is_active !== false),
    [vendors],
  )

  const applyVendor = (selected) => {
    if (!selected) {
      onChange({
        ...values,
        vendor_id: '',
        vendor: '',
      })
      return
    }

    onChange({
      ...values,
      vendor_id: selected.id,
      vendor: selected.name || '',
      contact_name: selected.contact_person || '',
      contact_phone: selected.mobile || '',
      contact_email: selected.email || '',
    })
  }

  const handleVendorChange = (vendorId) => {
    const selected = vendorOptions.find((vendor) => vendor.id === vendorId)
    applyVendor(selected)
  }

  const handleCreateVendorRequest = (name) => {
    if (!onCreateVendor) return
    setVendorDraft({ name: name || '' })
  }

  const handleVendorSave = async (payload) => {
    if (!onCreateVendor) return
    const created = await onCreateVendor(payload)
    applyVendor(created)
    setVendorDraft(null)
  }

  const setItemField = (index, key, value) => {
    const items = values.items.map((row, i) => (
      i === index ? { ...row, [key]: value } : row
    ))
    onChange({ ...values, items })
  }

  const addItemRow = () => {
    onChange({ ...values, items: [...values.items, { ...EMPTY_ITEM }] })
  }

  const removeItemRow = (index) => {
    if (values.items.length <= 1) return
    onChange({ ...values, items: values.items.filter((_, i) => i !== index) })
  }

  const totalValue = useMemo(
    () => values.items.reduce((sum, item) => {
      const num = Number(item.value)
      return sum + (Number.isFinite(num) ? num : 0)
    }, 0),
    [values.items],
  )

  return (
    <>
    <form id={formId} className="warranty-form" onSubmit={onSubmit}>
      <h2 className="warranty-form__title">Warranty Manager</h2>

      <div className="warranty-form__section">
        <PairFieldRow
          leftLabel="S.No"
          left={(
            <span className="warranty-form__serial">
              {serialNumber != null ? serialNumber : 'Auto-assigned on save'}
            </span>
          )}
          rightLabel="Date of purchase"
          right={(
            <DateField
              value={values.purchase_date}
              onChange={(value) => setField('purchase_date', value)}
            />
          )}
        />

        <FieldRow label="Make">
          <input
            type="text"
            className="company-form__input"
            value={values.make}
            onChange={(e) => setField('make', e.target.value)}
          />
        </FieldRow>

        <SplitFieldRow
          label="PO Number"
          leftLabel="Date"
          left={(
            <input
              type="text"
              className="company-form__input"
              value={values.po_number}
              onChange={(e) => setField('po_number', e.target.value)}
            />
          )}
          rightLabel=""
          right={(
            <DateField
              value={values.po_date}
              onChange={(value) => setField('po_date', value)}
            />
          )}
        />

        <SplitFieldRow
          label="Invoice Number"
          leftLabel="Date"
          left={(
            <input
              type="text"
              className="company-form__input"
              value={values.invoice_number}
              onChange={(e) => setField('invoice_number', e.target.value)}
            />
          )}
          rightLabel=""
          right={(
            <DateField
              value={values.invoice_date}
              onChange={(value) => setField('invoice_date', value)}
            />
          )}
        />

        <SplitFieldRow
          label="Warranty Start"
          leftLabel="Warranty End"
          left={(
            <DateField
              value={values.warranty_start}
              onChange={handleWarrantyStartChange}
            />
          )}
          rightLabel=""
          right={(
            <DateField
              value={values.warranty_end}
              onChange={handleWarrantyEndChange}
            />
          )}
        />

        <PairFieldRow
          leftLabel="Warranty Period"
          left={(
            <div className="warranty-form__period">
              <input
                type="number"
                min="0"
                className="company-form__input"
                value={values.warranty_period_months}
                onChange={(e) => handleWarrantyPeriodChange(e.target.value)}
                placeholder="—"
              />
              {values.warranty_period_months !== '' && (
                <span className="warranty-form__period-suffix">Months</span>
              )}
            </div>
          )}
          rightLabel="Expiry Notification"
          right={(
            <div className="warranty-form__period">
              <input
                type="number"
                min="0"
                className="company-form__input"
                value={values.expiry_notification_days}
                onChange={(e) => setField('expiry_notification_days', e.target.value)}
                placeholder="—"
              />
              {values.expiry_notification_days !== '' && (
                <span className="warranty-form__period-suffix">Days</span>
              )}
            </div>
          )}
        />

        <PairFieldRow
          leftLabel="Vendor / Supplier"
          left={(
            <FilterableSelect
              value={values.vendor_id}
              onChange={handleVendorChange}
              options={vendorOptions}
              getOptionValue={(vendor) => vendor.id}
              getOptionLabel={vendorLabel}
              placeholder={vendorsLoading ? 'Loading vendors…' : 'Select vendor from master…'}
              disabled={vendorsLoading}
              inputClassName="company-form__input company-form__input--select"
              emptyLabel="Select vendor…"
              onCreate={onCreateVendor ? handleCreateVendorRequest : undefined}
              createLabel="Create Vendor"
            />
          )}
          rightLabel="Contact Name"
          right={(
            <input
              type="text"
              className="company-form__input"
              value={values.contact_name}
              onChange={(e) => setField('contact_name', e.target.value)}
            />
          )}
        />

        <PairFieldRow
          leftLabel="Contact number"
          left={(
            <input
              type="tel"
              className="company-form__input"
              value={values.contact_phone}
              onChange={(e) => setField('contact_phone', e.target.value)}
            />
          )}
          rightLabel="Contact E-mail"
          right={(
            <input
              type="email"
              className="company-form__input"
              value={values.contact_email}
              onChange={(e) => setField('contact_email', e.target.value)}
            />
          )}
        />
      </div>

      <div className="warranty-form__items">
        <div className="warranty-form__items-header">
          <h3 className="warranty-form__items-title">
            Products / Materials
            {totalValue > 0 && (
              <span style={{ fontWeight: 400, color: 'var(--color-gray-blue)', marginLeft: 8 }}>
                Total: {totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            )}
          </h3>
          <button type="button" className="company-btn company-btn--secondary company-btn--compact" onClick={addItemRow}>
            + Add row
          </button>
        </div>

        <div className="warranty-form__items-table-wrap">
          <table className="warranty-form__items-table">
            <thead>
              <tr>
                <th>S.No</th>
                <th>Product / Material Name</th>
                <th>Model / P.No</th>
                <th>Value</th>
                <th>Remarks</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {values.items.map((item, index) => (
                <tr key={index}>
                  <td className="warranty-form__line-no">{index + 1}</td>
                  <td>
                    <input
                      type="text"
                      className="company-form__input"
                      value={item.product_name}
                      onChange={(e) => setItemField(index, 'product_name', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      className="company-form__input"
                      value={item.model_part_no}
                      onChange={(e) => setItemField(index, 'model_part_no', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="company-form__input"
                      value={item.value}
                      onChange={(e) => setItemField(index, 'value', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      className="company-form__input"
                      value={item.remarks}
                      onChange={(e) => setItemField(index, 'remarks', e.target.value)}
                    />
                  </td>
                  <td>
                    {values.items.length > 1 && (
                      <button
                        type="button"
                        className="warranty-form__remove-row"
                        onClick={() => removeItemRow(index)}
                        aria-label={`Remove row ${index + 1}`}
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <WarrantyDocumentsSection
        documents={values.documents || []}
        removedDocumentIds={values.removedDocumentIds || []}
        disabled={saving || !canSave}
        onChange={({ documents, removedDocumentIds }) => {
          onChange({ ...values, documents, removedDocumentIds })
        }}
      />

      {showActions && (
        <div className="warranty-form__actions">
          <button type="submit" className="company-btn company-btn--primary" disabled={saving || !canSave}>
            {saving ? 'Saving…' : 'Submit'}
          </button>
          {onAddSimilar && (
            <button
              type="button"
              className="company-btn company-btn--secondary"
              onClick={onAddSimilar}
              disabled={saving}
            >
              Add Similar
            </button>
          )}
          {onClear && (
            <button
              type="button"
              className="company-btn company-btn--secondary"
              onClick={onClear}
              disabled={saving}
            >
              Clear
            </button>
          )}
        </div>
      )}
    </form>
    {vendorDraft && onCreateVendor && (
      <VendorModal
        vendor={vendorDraft}
        saving={vendorCreateSaving}
        backLabel="Warranty"
        onClose={() => setVendorDraft(null)}
        onSave={handleVendorSave}
      />
    )}
    </>
  )
}
