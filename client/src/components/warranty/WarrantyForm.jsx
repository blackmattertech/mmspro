import { useMemo, useState } from 'react'
import DateField from '../ui/DateField'
import FilterableSelect from '../ui/FilterableSelect'
import VendorModal from '../vendors/VendorModal'
import WarrantyDocumentsSection from './WarrantyDocumentsSection'
import SpellcheckInput from '../shared/SpellcheckInput'
import { useTextFieldLimits } from '../../hooks/useTextFieldLimits'
import { useFormLayout } from '../../hooks/useFormLayout'
import { usePermissions } from '../../hooks/usePermissions'
import { useAuth } from '../../hooks/useAuth'
import OrderedFormLayout from '../forms/OrderedFormLayout'
import { resolveFormActors } from '../../lib/formFillership'
import { warrantyDocumentLabelText } from '../../config/warrantyDocuments'
import './WarrantyManager.css'

function emptyWarrantyItem() {
  return {
    product_name: '',
    model_part_no: '',
    value: '',
    remarks: '',
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
    documents: [],
    removedDocumentIds: [],
  }
}

export const EMPTY_WARRANTY_FORM = {
  vendor_id: '',
  vendor: '',
  contact_name: '',
  contact_phone: '',
  contact_email: '',
  items: [emptyWarrantyItem()],
  documents: [],
  removedDocumentIds: [],
}

function formDocument(doc) {
  return {
    id: doc.id,
    label: warrantyDocumentLabelText(doc.label),
    originalLabel: warrantyDocumentLabelText(doc.label),
    file_name: doc.file_name,
    content_type: doc.content_type,
    signed_url: doc.signed_url,
    line_number: doc.line_number ?? null,
    originalLineNumber: doc.line_number ?? null,
    isPending: false,
  }
}

function mapItemToForm(item = {}, headerFallback = {}) {
  return {
    product_name: item.product_name || '',
    model_part_no: item.model_part_no || '',
    value: item.value ?? '',
    remarks: item.remarks || '',
    purchase_date: item.purchase_date || headerFallback.purchase_date || '',
    make: item.make || headerFallback.make || '',
    po_number: item.po_number || headerFallback.po_number || '',
    po_date: item.po_date || headerFallback.po_date || '',
    invoice_number: item.invoice_number || headerFallback.invoice_number || '',
    invoice_date: item.invoice_date || headerFallback.invoice_date || '',
    warranty_start: item.warranty_start || headerFallback.warranty_start || '',
    warranty_end: item.warranty_end || headerFallback.warranty_end || '',
    warranty_period_months: computeWarrantyPeriodMonths(
      item.warranty_start || headerFallback.warranty_start,
      item.warranty_end || headerFallback.warranty_end,
    )
      || (item.warranty_period_months ?? headerFallback.warranty_period_months ?? ''),
    expiry_notification_days: item.expiry_notification_days
      ?? headerFallback.expiry_notification_days
      ?? '',
    documents: [],
    removedDocumentIds: [],
  }
}

export function warrantyToForm(record, vendors = []) {
  if (!record) return { ...EMPTY_WARRANTY_FORM, items: [emptyWarrantyItem()] }

  const headerFallback = {
    purchase_date: record.purchase_date || '',
    make: record.make || '',
    po_number: record.po_number || '',
    po_date: record.po_date || '',
    invoice_number: record.invoice_number || '',
    invoice_date: record.invoice_date || '',
    warranty_start: record.warranty_start || '',
    warranty_end: record.warranty_end || '',
    warranty_period_months: record.warranty_period_months ?? '',
    expiry_notification_days: record.expiry_notification_days ?? '',
  }

  const allDocuments = (record.documents || []).map(formDocument)
  const usedDocumentIds = new Set()
  const items = (record.items || []).length
    ? record.items.map((item) => {
      const line = Number(item.line_number)
      const documents = allDocuments.filter((doc) => Number(doc.line_number) === line)
      documents.forEach((doc) => usedDocumentIds.add(doc.id))
      return { ...mapItemToForm(item, headerFallback), documents }
    })
    : [emptyWarrantyItem()]
  const unassigned = allDocuments.filter((doc) => !usedDocumentIds.has(doc.id))
  if (unassigned.length) {
    items[0] = {
      ...items[0],
      documents: [...unassigned, ...(items[0].documents || [])],
    }
  }

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
    vendor_id: vendorId,
    vendor: vendorRecord?.name || record.vendor || '',
    contact_name: record.contact_name || vendorRecord?.contact_person || '',
    contact_phone: record.contact_phone || vendorRecord?.mobile || '',
    contact_email: record.contact_email || vendorRecord?.email || '',
    items,
    documents: [],
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

function scrollToSection(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M5 7h14M9 7V5h6v2M8 7l.8 12h6.4L16 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
  onCancel,
  onAddSimilar,
  vendors = [],
  vendorsLoading = false,
  onCreateVendor,
  vendorCreateSaving = false,
  extraValues = {},
  onExtraChange,
}) {
  const [vendorDraft, setVendorDraft] = useState(null)
  const { maxLength } = useTextFieldLimits()
  const { layout, catalogFields, isVisible, hasLayout } = useFormLayout('warranty.warranty')
  const { isOrgAdmin, session, canUpdate } = usePermissions()
  const { user } = useAuth()
  const formActors = useMemo(() => resolveFormActors({
    formId: 'warranty.warranty',
    isOrgAdmin,
    profileId: user?.id,
    employeeId: session?.employee_id,
    isDepartmentHead: session?.is_department_head,
    employeeDepartmentId: session?.department_id,
    canApproveIncoming: canUpdate('work_request_approve') || canUpdate('work_request_incoming'),
    isCreate: serialNumber == null && !values?.id,
    record: values?.id || values?.created_by ? {
      created_by: values.created_by,
      id: values.id,
    } : null,
  }), [
    isOrgAdmin,
    user?.id,
    session?.employee_id,
    session?.is_department_head,
    session?.department_id,
    canUpdate,
    serialNumber,
    values?.id,
    values?.created_by,
  ])

  const setField = (key, value) => {
    onChange({ ...values, [key]: value })
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
    const items = values.items.map((row, i) => {
      if (i !== index) return row
      const next = { ...row, [key]: value }
      if (key === 'warranty_start') {
        if (value && next.warranty_period_months !== '') {
          next.warranty_end = addMonthsToWarrantyDate(value, next.warranty_period_months)
        } else if (value && next.warranty_end) {
          next.warranty_period_months = computeWarrantyPeriodMonths(value, next.warranty_end)
        }
      } else if (key === 'warranty_end' && value && next.warranty_start) {
        next.warranty_period_months = computeWarrantyPeriodMonths(next.warranty_start, value)
      } else if (key === 'warranty_period_months' && next.warranty_start && value !== '') {
        next.warranty_end = addMonthsToWarrantyDate(next.warranty_start, value)
      }
      return next
    })
    onChange({ ...values, items })
  }

  const addItemRow = () => {
    onChange({ ...values, items: [...values.items, emptyWarrantyItem()] })
  }

  const duplicateItemRow = (index) => {
    const source = values.items[index]
    if (!source) return
    const copy = {
      ...emptyWarrantyItem(),
      ...source,
      documents: [],
      removedDocumentIds: [],
    }
    const items = [...values.items]
    items.splice(index + 1, 0, copy)
    onChange({ ...values, items })
  }

  const removeItemRow = (index) => {
    if (values.items.length <= 1) return
    const removed = values.items[index]
    const removedIds = [
      ...(values.removedDocumentIds || []),
      ...(removed?.removedDocumentIds || []),
      ...(removed?.documents || []).filter((doc) => doc.id && !doc.isPending).map((doc) => doc.id),
    ]
    onChange({
      ...values,
      removedDocumentIds: removedIds,
      items: values.items.filter((_, i) => i !== index),
    })
  }

  const setItemDocuments = (index, { documents, removedDocumentIds }) => {
    const items = values.items.map((row, i) => (
      i === index ? { ...row, documents, removedDocumentIds } : row
    ))
    onChange({ ...values, items })
  }

  const remarksLimit = maxLength('remarks')
  const vendorDone = Boolean(String(values.vendor_id || values.vendor || '').trim())
  const productDone = values.items.some((item) => (
    item.product_name?.trim() && item.warranty_start && item.warranty_end
  ))
  const showVendorCard = isVisible('vendor_id') || isVisible('contact_name')
    || isVisible('contact_phone') || isVisible('contact_email') || isVisible('serial_number')
  const steps = [
    { id: 'warranty-vendor', label: 'Vendor details', done: vendorDone },
    { id: 'warranty-products', label: 'Product & warranty', done: productDone },
  ]
  const currentStep = vendorDone ? 1 : 0

  const itemsEditor = (
    <div className="warranty-create__items">
      {values.items.map((item, index) => (
        <article key={index} className="warranty-create__item">
          <div className="warranty-create__item-head">
            <div className="warranty-create__item-title">
              <span className="warranty-create__item-index">{String(index + 1).padStart(2, '0')}</span>
              <strong>Item details</strong>
            </div>
            <div className="warranty-create__item-tools">
              <button type="button" onClick={() => duplicateItemRow(index)} disabled={!canSave}>
                Duplicate item
              </button>
              {values.items.length > 1 && (
                <button
                  type="button"
                  className="warranty-create__icon-btn"
                  onClick={() => removeItemRow(index)}
                  disabled={!canSave}
                  aria-label={`Remove item ${index + 1}`}
                >
                  <TrashIcon />
                </button>
              )}
            </div>
          </div>
          <div className="warranty-create__item-grid">
              <label className="company-form__field">
                <span className="company-form__label">Product / Material Name</span>
                <SpellcheckInput
                  className="company-form__input"
                  value={item.product_name}
                  placeholder="Enter product / material name"
                  disabled={!canSave}
                  onChange={(e) => setItemField(index, 'product_name', e.target.value)}
                />
              </label>
              <label className="company-form__field">
                <span className="company-form__label">Model / P.No</span>
                <input
                  type="text"
                  className="company-form__input"
                  value={item.model_part_no}
                  placeholder="Enter model or part number"
                  disabled={!canSave}
                  onChange={(e) => setItemField(index, 'model_part_no', e.target.value)}
                />
              </label>
              <label className="company-form__field">
                <span className="company-form__label">Value</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="company-form__input"
                  value={item.value}
                  placeholder="Enter value"
                  disabled={!canSave}
                  onChange={(e) => setItemField(index, 'value', e.target.value)}
                />
              </label>
              <label className="company-form__field">
                <span className="company-form__label">Make</span>
                <SpellcheckInput
                  className="company-form__input"
                  value={item.make}
                  placeholder="Enter make"
                  disabled={!canSave}
                  onChange={(e) => setItemField(index, 'make', e.target.value)}
                />
              </label>
              <label className="company-form__field">
                <span className="company-form__label">Date of purchase</span>
                <DateField
                  value={item.purchase_date}
                  disabled={!canSave}
                  onChange={(value) => setItemField(index, 'purchase_date', value)}
                />
              </label>
              <label className="company-form__field">
                <span className="company-form__label">PO Number</span>
                <input
                  type="text"
                  className="company-form__input"
                  value={item.po_number}
                  placeholder="Enter PO number"
                  disabled={!canSave}
                  onChange={(e) => setItemField(index, 'po_number', e.target.value)}
                />
              </label>
              <label className="company-form__field">
                <span className="company-form__label">PO Date</span>
                <DateField
                  value={item.po_date}
                  disabled={!canSave}
                  onChange={(value) => setItemField(index, 'po_date', value)}
                />
              </label>
              <label className="company-form__field">
                <span className="company-form__label">Invoice Number</span>
                <input
                  type="text"
                  className="company-form__input"
                  value={item.invoice_number}
                  placeholder="Enter invoice number"
                  disabled={!canSave}
                  onChange={(e) => setItemField(index, 'invoice_number', e.target.value)}
                />
              </label>
              <label className="company-form__field">
                <span className="company-form__label">Invoice Date</span>
                <DateField
                  value={item.invoice_date}
                  disabled={!canSave}
                  onChange={(value) => setItemField(index, 'invoice_date', value)}
                />
              </label>
              <label className="company-form__field">
                <span className="company-form__label">Warranty Start</span>
                <DateField
                  value={item.warranty_start}
                  disabled={!canSave}
                  onChange={(value) => setItemField(index, 'warranty_start', value)}
                />
              </label>
              <label className="company-form__field">
                <span className="company-form__label">Warranty End</span>
                <DateField
                  value={item.warranty_end}
                  disabled={!canSave}
                  onChange={(value) => setItemField(index, 'warranty_end', value)}
                />
              </label>
              <label className="company-form__field">
                <span className="company-form__label">Period (months)</span>
                <input
                  type="number"
                  min="0"
                  className="company-form__input"
                  placeholder="Auto"
                  disabled={!canSave}
                  value={item.warranty_period_months}
                  onChange={(e) => setItemField(index, 'warranty_period_months', e.target.value)}
                />
              </label>
              <label className="company-form__field">
                <span className="company-form__label">Expiry notification (days)</span>
                <input
                  type="number"
                  min="0"
                  className="company-form__input"
                  placeholder="30"
                  disabled={!canSave}
                  value={item.expiry_notification_days}
                  onChange={(e) => setItemField(index, 'expiry_notification_days', e.target.value)}
                />
              </label>
            </div>
            <div className="warranty-create__item-foot">
              <label className="company-form__field">
                <span className="company-form__label">
                  <span>Remarks{remarksLimit ? ` (max ${remarksLimit})` : ''}</span>
                  {remarksLimit ? (
                    <span className="warranty-create__count">{(item.remarks || '').length} / {remarksLimit}</span>
                  ) : null}
                </span>
                <SpellcheckInput
                  multiline
                  rows={4}
                  className="company-form__input company-form__textarea"
                  value={item.remarks}
                  placeholder="Enter additional notes, terms or remarks…"
                  disabled={!canSave}
                  onChange={(e) => setItemField(index, 'remarks', e.target.value)}
                  maxLength={remarksLimit}
                />
              </label>
              {isVisible('documents') && (
                <WarrantyDocumentsSection
                  compact
                  title="Images / documents"
                  documents={item.documents || []}
                  removedDocumentIds={item.removedDocumentIds || []}
                  disabled={saving || !canSave}
                  onChange={(next) => setItemDocuments(index, next)}
                />
              )}
            </div>
          </article>
        ))}
    </div>
  )

  return (
    <>
    <form id={formId} className="warranty-create" onSubmit={onSubmit}>
      <ol className="warranty-steps" aria-label="Warranty sections">
        {steps.map((step, index) => {
          const state = step.done ? 'is-done' : index === currentStep ? 'is-current' : ''
          return (
            <li key={step.id} className={state}>
              <button type="button" onClick={() => scrollToSection(step.id)}>
                <span className="warranty-steps__num">{index + 1}</span>
                {step.label}
              </button>
            </li>
          )
        })}
      </ol>

      <div className="warranty-create__body">
      <div className="warranty-create__main">
      {showVendorCard && (
        <section id="warranty-vendor" className="warranty-create__card">
          <header className="warranty-create__card-head">
            <div>
              <h2>Vendor details</h2>
              <p>Select the vendor and add contact information.</p>
            </div>
            {isVisible('serial_number') && (
              <span className="warranty-create__serial">
                {serialNumber != null ? `S.No ${serialNumber}` : 'S.No on save'}
              </span>
            )}
          </header>
          {isVisible('vendor_id') && (
            <div className="warranty-create__vendor-row">
              <label className="company-form__field">
                <span className="company-form__label">Vendor</span>
                <FilterableSelect
                  value={values.vendor_id}
                  onChange={handleVendorChange}
                  options={vendorOptions}
                  getOptionValue={(vendor) => vendor.id}
                  getOptionLabel={vendorLabel}
                  placeholder={vendorsLoading ? 'Loading vendors…' : 'Select vendor from master…'}
                  disabled={vendorsLoading || !canSave}
                  inputClassName="company-form__input company-form__input--select"
                  emptyLabel="Select vendor…"
                  onCreate={onCreateVendor ? handleCreateVendorRequest : undefined}
                  createLabel="Create Vendor"
                />
              </label>
              {onCreateVendor && (
                <button
                  type="button"
                  className="warranty-create__add-vendor"
                  onClick={() => handleCreateVendorRequest('')}
                  disabled={!canSave}
                >
                  + Add vendor
                </button>
              )}
            </div>
          )}
          <div className="warranty-create__contacts">
            {isVisible('contact_name') && (
              <label className="company-form__field">
                <span className="company-form__label">Contact name</span>
                <SpellcheckInput
                  className="company-form__input"
                  value={values.contact_name}
                  placeholder="Enter contact name"
                  disabled={!canSave}
                  onChange={(e) => setField('contact_name', e.target.value)}
                />
              </label>
            )}
            {isVisible('contact_phone') && (
              <label className="company-form__field">
                <span className="company-form__label">Contact phone</span>
                <input
                  type="tel"
                  className="company-form__input"
                  value={values.contact_phone}
                  placeholder="Enter phone number"
                  disabled={!canSave}
                  onChange={(e) => setField('contact_phone', e.target.value)}
                />
              </label>
            )}
            {isVisible('contact_email') && (
              <label className="company-form__field">
                <span className="company-form__label">Contact e-mail</span>
                <input
                  type="email"
                  className="company-form__input"
                  value={values.contact_email}
                  placeholder="Enter email address"
                  disabled={!canSave}
                  onChange={(e) => setField('contact_email', e.target.value)}
                />
              </label>
            )}
          </div>
        </section>
      )}

      {isVisible('items') && (
        <section id="warranty-products" className="warranty-create__card warranty-create__products">
          <header className="warranty-create__card-head warranty-create__card-head--split">
            <div>
              <h2>Products & materials</h2>
              <p>Each product keeps its own purchase, PO, invoice, and warranty details, plus its own files.</p>
            </div>
            <button
              type="button"
              className="company-btn company-btn--primary company-btn--compact"
              onClick={addItemRow}
              disabled={!canSave}
            >
              + Add item
            </button>
          </header>
          {itemsEditor}
        </section>
      )}

      {hasLayout && (
        <div className="warranty-create__card warranty-create__extras">
          <OrderedFormLayout
            formId="warranty.warranty"
            layout={layout}
            catalogLookup={catalogFields}
            catalogValues={extraValues}
            onCatalogChange={onExtraChange}
            masterValues={extraValues}
            onMasterChange={(id, value) => {
              onExtraChange?.(id, value)
              if (String(id).includes('vendors')) {
                const selected = vendorOptions.find((vendor) => vendor.id === value)
                if (selected) applyVendor(selected)
              }
            }}
            disabled={saving || !canSave}
            actors={formActors}
            renderField={() => null}
          />
        </div>
      )}

      {showActions && (
        <div className="warranty-create__actions">
          {onAddSimilar && (
            <button type="button" className="warranty-create__text-btn" onClick={onAddSimilar} disabled={saving || !canSave}>
              Add similar
            </button>
          )}
          {onClear && (
            <button type="button" className="company-btn company-btn--secondary" onClick={onClear} disabled={saving}>
              Clear
            </button>
          )}
          {onCancel && (
            <button type="button" className="company-btn company-btn--secondary" onClick={onCancel} disabled={saving}>
              Cancel
            </button>
          )}
          <button type="submit" className="company-btn company-btn--primary" disabled={saving || !canSave}>
            {saving ? 'Saving…' : 'Save warranty'}
          </button>
        </div>
      )}
      </div>
      </div>
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
