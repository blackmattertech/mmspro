import { lazy, Suspense, useMemo, useState } from 'react'
import DateField from '../ui/DateField'
import FilterableSelect from '../ui/FilterableSelect'
import VendorModal from '../vendors/VendorModal'
import WarrantyDocumentsSection from './WarrantyDocumentsSection'
import FormLabel from '../shared/FormLabel'
import SpellcheckInput from '../shared/SpellcheckInput'
import { useTextFieldLimits } from '../../hooks/useTextFieldLimits'
import { masterFieldLimit } from '../../lib/textFieldLimits'
import { useFormLayout } from '../../hooks/useFormLayout'
import { usePermissions } from '../../hooks/usePermissions'
import { useAuth } from '../../hooks/useAuth'
import { useDepartments } from '../../hooks/useDepartments'
import OrderedFormLayout from '../forms/OrderedFormLayout'
import { resolveFormActors } from '../../lib/formFillership'
import { warrantyDocumentLabelText } from '../../config/warrantyDocuments'
import { getEquipment } from '../../lib/api-equipment'
import { getFormLayout } from '../../lib/api-form-layouts'
import {
  displayWarrantyLinkedSteps,
  warrantyLinkedAssetSteps,
} from '../../lib/warrantyLinkedAsset'
import { WEEKDAY_OPTIONS } from '../../config/tasks'
import EquipmentQrCode from '../equipment/EquipmentQrCode'
import './WarrantyManager.css'

const REMINDER_MODE_OPTIONS = [
  { value: 'one_time', label: 'One-time' },
  { value: 'recurring', label: 'Recurring until expiry' },
]

const REMINDER_FREQUENCY_OPTIONS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'custom', label: 'Custom' },
]

const REMINDER_UNIT_OPTIONS = [
  { value: 'days', label: 'Days' },
  { value: 'weeks', label: 'Weeks' },
  { value: 'months', label: 'Months' },
]

const AssetPickerField = lazy(() => import('../forms/AssetPickerField'))

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
    equipment_id: '',
    asset_hierarchy: [],
    equipment_qr: '',
    reminder_mode: 'one_time',
    reminder_frequency: 'weekly',
    reminder_interval: 1,
    reminder_unit: 'days',
    reminder_weekdays: [],
    reminder_last_sent_on: '',
    reminder_next_at: '',
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
  const reminderMode = String(item.reminder_mode || 'one_time').toLowerCase() === 'recurring'
    ? 'recurring'
    : 'one_time'
  const reminderFrequency = ['daily', 'weekly', 'monthly', 'custom'].includes(String(item.reminder_frequency || '').toLowerCase())
    ? String(item.reminder_frequency).toLowerCase()
    : 'weekly'
  const reminderWeekdays = Array.isArray(item.reminder_weekdays)
    ? item.reminder_weekdays.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    : []
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
    equipment_id: item.equipment_id || '',
    asset_hierarchy: Array.isArray(item.asset_hierarchy) ? item.asset_hierarchy : [],
    equipment_qr: item.equipment_qr
      || item.qr_code
      || displayWarrantyLinkedSteps(item.asset_hierarchy).find((step) => step.field_id === 'qr' || step.field_id === 'code')?.value
      || '',
    reminder_mode: reminderMode,
    reminder_frequency: reminderFrequency,
    reminder_interval: item.reminder_interval ?? 1,
    reminder_unit: ['days', 'weeks', 'months'].includes(String(item.reminder_unit || '').toLowerCase())
      ? String(item.reminder_unit).toLowerCase()
      : 'days',
    reminder_weekdays: reminderWeekdays,
    reminder_last_sent_on: item.reminder_last_sent_on || '',
    reminder_next_at: item.reminder_next_at || '',
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

function RequiredMark() {
  return <span className="warranty-create__required" aria-hidden="true">*</span>
}

function FieldLabel({ children, required = false }) {
  return (
    <span className="company-form__label">
      <span className="company-form__label-text">
        {children}
        {required ? <RequiredMark /> : null}
      </span>
    </span>
  )
}

function SectionCard({ id, number, title, children, actions = null }) {
  return (
    <section id={id} className="warranty-create__card" aria-labelledby={id ? `${id}-title` : undefined}>
      <header className="warranty-create__card-head">
        <div className="warranty-create__card-title">
          <span className="warranty-create__section-num" aria-hidden="true">{number}</span>
          <h2 id={id ? `${id}-title` : undefined}>{title}</h2>
        </div>
        {actions}
      </header>
      <div className="warranty-create__card-body">
        {children}
      </div>
    </section>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M5 7h14M9 7V5h6v2M8 7l.8 12h6.4L16 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const REMINDER_DAY_OPTIONS = [
  { value: '7', label: '7 days' },
  { value: '15', label: '15 days' },
  { value: '30', label: '30 days' },
  { value: '45', label: '45 days' },
  { value: '60', label: '60 days' },
  { value: '90', label: '90 days' },
]

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
  const [linkAssetIndex, setLinkAssetIndex] = useState(null)
  const [linkAssetDraftId, setLinkAssetDraftId] = useState('')
  const [linkAssetDepartmentId, setLinkAssetDepartmentId] = useState('')
  const [linkAssetFieldValues, setLinkAssetFieldValues] = useState({})
  const [linkAssetConfirming, setLinkAssetConfirming] = useState(false)
  const [linkAssetError, setLinkAssetError] = useState(null)
  const { maxLength } = useTextFieldLimits()
  const { layout, catalogFields, isVisible, hasLayout } = useFormLayout('warranty.warranty')
  const { layout: equipmentLayout } = useFormLayout(linkAssetIndex != null ? 'equipment.create' : null)
  const { isOrgAdmin, session, canUpdate } = usePermissions()
  const { user } = useAuth()
  const { departments: linkAssetDepartments, loading: linkAssetDepartmentsLoading } = useDepartments('', {
    limit: 200,
    enabled: linkAssetIndex != null,
  })
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

  const setItemFields = (index, patch) => {
    const items = values.items.map((row, i) => (i === index ? { ...row, ...patch } : row))
    onChange({ ...values, items })
  }

  const openLinkAsset = async (index) => {
    const item = values.items[index]
    setLinkAssetIndex(index)
    setLinkAssetDraftId(item?.equipment_id || '')
    setLinkAssetFieldValues({})
    setLinkAssetError(null)
    let departmentId = session?.department_id || ''
    if (item?.equipment_id) {
      try {
        const equipment = await getEquipment(item.equipment_id)
        if (equipment?.department_id) departmentId = equipment.department_id
      } catch {
        // keep session department fallback
      }
    }
    setLinkAssetDepartmentId(departmentId)
  }

  const closeLinkAsset = () => {
    setLinkAssetIndex(null)
    setLinkAssetDraftId('')
    setLinkAssetDepartmentId('')
    setLinkAssetFieldValues({})
    setLinkAssetConfirming(false)
    setLinkAssetError(null)
  }

  const handleLinkAssetDepartmentChange = (departmentId) => {
    setLinkAssetDepartmentId(departmentId || '')
    setLinkAssetDraftId('')
    setLinkAssetFieldValues({})
    setLinkAssetError(null)
  }

  const confirmLinkAsset = async () => {
    if (linkAssetIndex == null || !linkAssetDraftId || !linkAssetDepartmentId) return
    setLinkAssetConfirming(true)
    setLinkAssetError(null)
    try {
      const [equipment, layoutPayload] = await Promise.all([
        getEquipment(linkAssetDraftId),
        equipmentLayout ? Promise.resolve({ layout: equipmentLayout }) : getFormLayout('equipment.create').catch(() => null),
      ])
      if (equipment?.department_id && String(equipment.department_id) !== String(linkAssetDepartmentId)) {
        throw new Error('That asset belongs to a different department. Pick one from the selected department.')
      }
      const hierarchy = warrantyLinkedAssetSteps(equipment, layoutPayload?.layout || equipmentLayout)
      const qrCaption = hierarchy.find((step) => step.field_id === 'qr' || step.field_id === 'code')
      setItemFields(linkAssetIndex, {
        equipment_id: linkAssetDraftId,
        asset_hierarchy: hierarchy,
        equipment_qr: equipment.qr_code || equipment.code || qrCaption?.value || '',
      })
      closeLinkAsset()
    } catch (err) {
      setLinkAssetError(err.message || 'Could not link this asset.')
      setLinkAssetConfirming(false)
    }
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
  const purchaseDone = values.items.some((item) => (
    item.po_number?.trim() || item.invoice_number?.trim() || item.purchase_date
  ))
  const productDone = values.items.some((item) => item.product_name?.trim())
  const warrantyDone = values.items.some((item) => item.warranty_start && item.warranty_end)
  const documentsDone = values.items.some((item) => (item.documents || []).length > 0)
  const showVendorCard = isVisible('vendor_id') || isVisible('contact_name')
    || isVisible('contact_phone') || isVisible('contact_email') || isVisible('serial_number')
  const showItems = isVisible('items')
  const multiItem = values.items.length > 1

  const steps = [
    showVendorCard && { id: 'warranty-vendor', label: 'Vendor Information', done: vendorDone },
    showItems && { id: 'warranty-purchase', label: 'Purchase Information', done: purchaseDone },
    showItems && { id: 'warranty-product', label: 'Product Information', done: productDone },
    showItems && { id: 'warranty-dates', label: 'Warranty Information', done: warrantyDone },
    showItems && isVisible('documents') && {
      id: 'warranty-documents',
      label: 'Documents & Evidence',
      done: documentsDone,
    },
  ].filter(Boolean)
  const currentStep = Math.max(0, steps.findIndex((step) => !step.done))

  const reminderOptionsFor = (item) => {
    const current = String(item.expiry_notification_days ?? '').trim()
    if (!current || REMINDER_DAY_OPTIONS.some((opt) => opt.value === current)) {
      return REMINDER_DAY_OPTIONS
    }
    return [...REMINDER_DAY_OPTIONS, { value: current, label: `${current} days` }]
  }

  const renderItemSections = (item, index) => {
    const purchaseId = index === 0 ? 'warranty-purchase' : `warranty-purchase-${index}`
    const productId = index === 0 ? 'warranty-product' : `warranty-product-${index}`
    const warrantyId = index === 0 ? 'warranty-dates' : `warranty-dates-${index}`
    const documentsId = index === 0 ? 'warranty-documents' : `warranty-documents-${index}`
    const reminderValue = String(item.expiry_notification_days ?? '')
    const periodDisplay = item.warranty_period_months === '' || item.warranty_period_months == null
      ? ''
      : String(item.warranty_period_months)

    return (
      <div key={index} className={`warranty-create__item-stack${multiItem ? ' is-multi' : ''}`}>
        {multiItem && (
          <div className="warranty-create__item-head">
            <div className="warranty-create__item-title">
              <span className="warranty-create__item-index">{String(index + 1).padStart(2, '0')}</span>
              <strong>{item.product_name?.trim() || `Item ${index + 1}`}</strong>
            </div>
            <div className="warranty-create__item-tools">
              <button type="button" onClick={() => duplicateItemRow(index)} disabled={!canSave}>
                Duplicate item
              </button>
              <button
                type="button"
                className="warranty-create__icon-btn"
                onClick={() => removeItemRow(index)}
                disabled={!canSave}
                aria-label={`Remove item ${index + 1}`}
              >
                <TrashIcon />
              </button>
            </div>
          </div>
        )}

        <SectionCard id={purchaseId} number="2" title="Purchase Information">
          <div className="warranty-create__grid warranty-create__grid--2">
            <label className="company-form__field">
              <FieldLabel>PO Number</FieldLabel>
              <input
                type="text"
                className="company-form__input"
                value={item.po_number}
                placeholder="PO Number"
                disabled={!canSave}
                onChange={(e) => setItemField(index, 'po_number', e.target.value)}
              />
            </label>
            <label className="company-form__field">
              <FieldLabel>PO Date</FieldLabel>
              <DateField
                value={item.po_date}
                placeholder="Select date"
                disabled={!canSave}
                onChange={(value) => setItemField(index, 'po_date', value)}
              />
            </label>
          </div>
          <div className="warranty-create__grid warranty-create__grid--3">
            <label className="company-form__field">
              <FieldLabel>Invoice Number</FieldLabel>
              <input
                type="text"
                className="company-form__input"
                value={item.invoice_number}
                placeholder="Invoice Number"
                disabled={!canSave}
                onChange={(e) => setItemField(index, 'invoice_number', e.target.value)}
              />
            </label>
            <label className="company-form__field">
              <FieldLabel>Invoice Date</FieldLabel>
              <DateField
                value={item.invoice_date}
                placeholder="Select date"
                disabled={!canSave}
                onChange={(value) => setItemField(index, 'invoice_date', value)}
              />
            </label>
            <label className="company-form__field">
              <FieldLabel>Date of purchase</FieldLabel>
              <DateField
                value={item.purchase_date}
                placeholder="Select date"
                disabled={!canSave}
                onChange={(value) => setItemField(index, 'purchase_date', value)}
              />
            </label>
          </div>
        </SectionCard>

        <SectionCard
          id={productId}
          number="3"
          title="Product Information"
          actions={(
            !multiItem ? (
              <button
                type="button"
                className="company-btn company-btn--primary company-btn--compact"
                onClick={addItemRow}
                disabled={!canSave}
              >
                + Add item
              </button>
            ) : null
          )}
        >
          <div className="warranty-create__grid">
            <label className="company-form__field warranty-create__field--full">
              <FormLabel fieldType="text" limit={masterFieldLimit('name')}>
                Product / Material Name
                <RequiredMark />
              </FormLabel>
              <SpellcheckInput
                className="company-form__input"
                value={item.product_name}
                placeholder="Enter product or material name"
                disabled={!canSave}
                onChange={(e) => setItemField(index, 'product_name', e.target.value)}
                maxLength={masterFieldLimit('name')}
              />
            </label>
          </div>
          <div className="warranty-create__grid warranty-create__grid--3">
            <label className="company-form__field">
              <FormLabel fieldType="text" limit={masterFieldLimit('name')}>Make / Brand</FormLabel>
              <SpellcheckInput
                className="company-form__input"
                value={item.make}
                placeholder="Manufacturer / Brand"
                disabled={!canSave}
                onChange={(e) => setItemField(index, 'make', e.target.value)}
                maxLength={masterFieldLimit('name')}
              />
            </label>
            <label className="company-form__field">
              <FormLabel fieldType="text" limit={masterFieldLimit('code')}>Model / Part Number</FormLabel>
              <SpellcheckInput
                className="company-form__input"
                value={item.model_part_no}
                placeholder="Model or part number"
                disabled={!canSave}
                onChange={(e) => setItemField(index, 'model_part_no', e.target.value)}
                maxLength={masterFieldLimit('code')}
              />
            </label>
            <label className="company-form__field">
              <FieldLabel>Value</FieldLabel>
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
          </div>
          <div className="warranty-create__linked-asset">
            <div className="warranty-create__linked-asset-head">
              <FieldLabel>Linked Asset</FieldLabel>
              <div className="warranty-create__linked-asset-actions">
                {item.equipment_id ? (
                  <button
                    type="button"
                    className="company-btn company-btn--ghost company-btn--compact"
                    disabled={!canSave}
                    onClick={() => {
                      setItemFields(index, { equipment_id: '', asset_hierarchy: [], equipment_qr: '' })
                    }}
                  >
                    Unlink
                  </button>
                ) : null}
                <button
                  type="button"
                  className="company-btn company-btn--primary company-btn--compact"
                  disabled={!canSave}
                  onClick={() => openLinkAsset(index)}
                >
                  {item.equipment_id ? 'Change Asset' : 'Link Asset'}
                </button>
              </div>
            </div>
            {item.equipment_id ? (
              <div className="warranty-create__linked-asset-summary">
                {(() => {
                  const steps = displayWarrantyLinkedSteps(item.asset_hierarchy)
                  const qrValue = item.equipment_qr
                    || steps.find((step) => step.field_id === 'qr' || step.field_id === 'code')?.value
                    || ''
                  const qrCaption = steps.find((step) => step.field_id === 'qr' || step.field_id === 'code')
                  return (
                    <div className={`warranty-create__linked-asset-body${qrValue ? ' has-qr' : ''}`}>
                      {steps.length ? (
                        <dl className="warranty-create__linked-asset-fields">
                          {steps.map((step) => (
                            <div key={`${step.field_id}:${step.value}`} className="warranty-create__linked-asset-row">
                              <dt>{step.field_name}</dt>
                              <dd>{step.value}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : (
                        <p className="warranty-create__linked-asset-id">Asset linked</p>
                      )}
                      {qrValue ? (
                        <EquipmentQrCode
                          value={qrValue}
                          caption={{
                            label: qrCaption?.field_name || 'QR code',
                            value: qrCaption?.value || qrValue,
                          }}
                          fileName={qrCaption?.value || 'asset-qr'}
                        />
                      ) : null}
                    </div>
                  )
                })()}
              </div>
            ) : (
              <p className="warranty-create__linked-asset-hint">
                Select a department, then link an asset from that department (Name + QR field).
              </p>
            )}
          </div>
        </SectionCard>

        <SectionCard id={warrantyId} number="4" title="Warranty Information">
          <div className="warranty-create__grid warranty-create__grid--2">
            <label className="company-form__field">
              <FieldLabel required>Warranty Start</FieldLabel>
              <DateField
                value={item.warranty_start}
                placeholder="Start date"
                disabled={!canSave}
                onChange={(value) => setItemField(index, 'warranty_start', value)}
              />
            </label>
            <label className="company-form__field">
              <FieldLabel required>Warranty End</FieldLabel>
              <DateField
                value={item.warranty_end}
                placeholder="End date"
                disabled={!canSave}
                onChange={(value) => setItemField(index, 'warranty_end', value)}
              />
            </label>
            <label className="company-form__field">
              <FieldLabel>Warranty Period</FieldLabel>
              <div className="warranty-create__period">
                <input
                  type="number"
                  min="0"
                  className="company-form__input"
                  placeholder="Auto-calculated"
                  disabled={!canSave}
                  value={periodDisplay}
                  onChange={(e) => setItemField(index, 'warranty_period_months', e.target.value)}
                />
                <span className="warranty-create__period-suffix">months</span>
              </div>
            </label>
            <label className="company-form__field">
              <FieldLabel>Reminder mode</FieldLabel>
              <FilterableSelect
                value={item.reminder_mode || 'one_time'}
                options={REMINDER_MODE_OPTIONS}
                getOptionValue={(opt) => opt.value}
                getOptionLabel={(opt) => opt.label}
                allowEmpty={false}
                disabled={!canSave}
                onChange={(value) => setItemField(index, 'reminder_mode', value || 'one_time')}
              />
            </label>
            <label className="company-form__field">
              <FieldLabel>First alert (days before expiry)</FieldLabel>
              <FilterableSelect
                value={reminderValue}
                options={reminderOptionsFor(item)}
                getOptionValue={(opt) => opt.value}
                getOptionLabel={(opt) => opt.label}
                placeholder="Select days"
                disabled={!canSave}
                onChange={(value) => setItemField(index, 'expiry_notification_days', value || '')}
              />
            </label>
            {(item.reminder_mode || 'one_time') === 'recurring' ? (
              <>
                <label className="company-form__field">
                  <FieldLabel>Recurrence</FieldLabel>
                  <FilterableSelect
                    value={item.reminder_frequency || 'weekly'}
                    options={REMINDER_FREQUENCY_OPTIONS}
                    getOptionValue={(opt) => opt.value}
                    getOptionLabel={(opt) => opt.label}
                    allowEmpty={false}
                    disabled={!canSave}
                    onChange={(value) => setItemField(index, 'reminder_frequency', value || 'weekly')}
                  />
                </label>
                {(item.reminder_frequency || 'weekly') === 'custom' ? (
                  <>
                    <label className="company-form__field">
                      <FieldLabel>Every</FieldLabel>
                      <input
                        type="number"
                        min="1"
                        max="365"
                        className="company-form__input"
                        disabled={!canSave}
                        value={item.reminder_interval ?? 1}
                        onChange={(e) => setItemField(index, 'reminder_interval', e.target.value)}
                      />
                    </label>
                    <label className="company-form__field">
                      <FieldLabel>Unit</FieldLabel>
                      <FilterableSelect
                        value={item.reminder_unit || 'days'}
                        options={REMINDER_UNIT_OPTIONS}
                        getOptionValue={(opt) => opt.value}
                        getOptionLabel={(opt) => opt.label}
                        allowEmpty={false}
                        disabled={!canSave}
                        onChange={(value) => setItemField(index, 'reminder_unit', value || 'days')}
                      />
                    </label>
                  </>
                ) : null}
                {(item.reminder_frequency || 'weekly') === 'weekly' ? (
                  <div className="company-form__field warranty-create__field--full">
                    <FieldLabel>Repeat on</FieldLabel>
                    <div className="warranty-weekday-picker" role="group" aria-label="Weekdays">
                      {WEEKDAY_OPTIONS.map((day) => {
                        const selected = (item.reminder_weekdays || []).map(Number).includes(day.value)
                        return (
                          <button
                            key={day.value}
                            type="button"
                            className={`warranty-weekday-picker__chip${selected ? ' is-selected' : ''}`}
                            disabled={!canSave}
                            aria-pressed={selected}
                            onClick={() => {
                              const current = new Set((item.reminder_weekdays || []).map(Number))
                              if (current.has(day.value)) current.delete(day.value)
                              else current.add(day.value)
                              setItemField(index, 'reminder_weekdays', [...current].sort((a, b) => a - b))
                            }}
                          >
                            {day.label}
                          </button>
                        )
                      })}
                    </div>
                    <p className="warranty-create__linked-asset-hint">
                      Leave empty to repeat every 7 days from the first alert. Pick days for “every Monday”, etc.
                    </p>
                  </div>
                ) : null}
              </>
            ) : null}
            <label className="company-form__field warranty-create__field--full">
              <FormLabel fieldType="textarea" limit={remarksLimit}>Remarks</FormLabel>
              <SpellcheckInput
                richText
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
          </div>
        </SectionCard>

        {isVisible('documents') && (
          <SectionCard id={documentsId} number="5" title="Documents & Evidence">
            <WarrantyDocumentsSection
              compact
              showHeader={false}
              title="Documents & Evidence"
              description="Upload product photos and supporting warranty documents."
              documents={item.documents || []}
              removedDocumentIds={item.removedDocumentIds || []}
              disabled={saving || !canSave}
              onChange={(next) => setItemDocuments(index, next)}
            />
          </SectionCard>
        )}
      </div>
    )
  }

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
        <SectionCard
          id="warranty-vendor"
          number="1"
          title="Vendor Information"
          actions={isVisible('serial_number') ? (
            <span className="warranty-create__serial">
              {serialNumber != null ? `S.No ${serialNumber}` : 'S.No on save'}
            </span>
          ) : null}
        >
          {isVisible('vendor_id') && (
            <div className="warranty-create__vendor-row">
              <label className="company-form__field">
                <FieldLabel required>Vendor</FieldLabel>
                <FilterableSelect
                  value={values.vendor_id}
                  onChange={handleVendorChange}
                  options={vendorOptions}
                  getOptionValue={(vendor) => vendor.id}
                  getOptionLabel={vendorLabel}
                  placeholder={vendorsLoading ? 'Loading vendors…' : 'Select Vendor'}
                  disabled={vendorsLoading || !canSave}
                  inputClassName="company-form__input company-form__input--select"
                  emptyLabel="Select Vendor"
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
          <div className="warranty-create__grid warranty-create__grid--2">
            {isVisible('contact_name') && (
              <label className="company-form__field">
                <FormLabel fieldType="text" limit={masterFieldLimit('name')}>Contact Name</FormLabel>
                <SpellcheckInput
                  className="company-form__input"
                  value={values.contact_name}
                  placeholder="Contact name"
                  disabled={!canSave}
                  onChange={(e) => setField('contact_name', e.target.value)}
                  maxLength={masterFieldLimit('name')}
                />
              </label>
            )}
            {isVisible('contact_phone') && (
              <label className="company-form__field">
                <FieldLabel>Contact Phone</FieldLabel>
                <input
                  type="tel"
                  className="company-form__input"
                  value={values.contact_phone}
                  placeholder="Phone number"
                  disabled={!canSave}
                  onChange={(e) => setField('contact_phone', e.target.value)}
                />
              </label>
            )}
            {isVisible('contact_email') && (
              <label className="company-form__field warranty-create__field--full">
                <FieldLabel>Contact Email</FieldLabel>
                <input
                  type="email"
                  className="company-form__input"
                  value={values.contact_email}
                  placeholder="name@company.com"
                  disabled={!canSave}
                  onChange={(e) => setField('contact_email', e.target.value)}
                />
              </label>
            )}
          </div>
        </SectionCard>
      )}

      {showItems && (
        <div className="warranty-create__items">
          {multiItem && (
            <div className="warranty-create__items-toolbar">
              <p>Each product keeps its own purchase, warranty, and documents.</p>
              <button
                type="button"
                className="company-btn company-btn--primary company-btn--compact"
                onClick={addItemRow}
                disabled={!canSave}
              >
                + Add item
              </button>
            </div>
          )}
          {values.items.map((item, index) => renderItemSections(item, index))}
        </div>
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
            currentEmployeeId={(serialNumber == null && !values?.id) ? (session?.employee_id || null) : null}
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
    {linkAssetIndex != null ? (
      <div className="warranty-link-asset" role="dialog" aria-modal="true" aria-labelledby="warranty-link-asset-title">
        <button type="button" className="warranty-link-asset__backdrop" aria-label="Close" onClick={closeLinkAsset} />
        <div className="warranty-link-asset__panel">
          <header className="warranty-link-asset__head">
            <h3 id="warranty-link-asset-title">Link Asset</h3>
            <button type="button" className="company-btn company-btn--ghost company-btn--compact" onClick={closeLinkAsset}>
              Close
            </button>
          </header>
          <div className="warranty-link-asset__body">
            <label className="company-form__field warranty-link-asset__department">
              <FieldLabel required>Department</FieldLabel>
              <FilterableSelect
                value={linkAssetDepartmentId}
                options={linkAssetDepartments
                  .filter((row) => row.is_active !== false)
                  .map((row) => ({
                    value: row.id,
                    label: row.name || row.code || row.id,
                  }))}
                placeholder={linkAssetDepartmentsLoading ? 'Loading departments…' : 'Select department first'}
                disabled={!canSave || linkAssetDepartmentsLoading || linkAssetConfirming}
                onChange={handleLinkAssetDepartmentChange}
              />
            </label>
            <p className="warranty-create__linked-asset-hint">
              {linkAssetDepartmentId
                ? 'Only assets in this department are listed. Confirm stores Name and the QR-mapped field.'
                : 'Choose a department to load its assets.'}
            </p>
            {linkAssetError ? (
              <div className="wo-alert wo-alert--error" role="alert">{linkAssetError}</div>
            ) : null}
            <Suspense fallback={<p className="warranty-create__linked-asset-hint">Loading asset picker…</p>}>
              <AssetPickerField
                key={`warranty-link-asset:${linkAssetDepartmentId}`}
                departmentId={linkAssetDepartmentId}
                equipmentId={linkAssetDraftId}
                onEquipmentIdChange={setLinkAssetDraftId}
                fieldValues={linkAssetFieldValues}
                onFieldValuesChange={setLinkAssetFieldValues}
                requireDepartment
                disabled={!canSave || !linkAssetDepartmentId || linkAssetConfirming}
                emptyDepartmentMessage="Select a department to see assets for that department."
              />
            </Suspense>
          </div>
          <footer className="warranty-link-asset__foot">
            <button type="button" className="company-btn company-btn--secondary" onClick={closeLinkAsset} disabled={linkAssetConfirming}>
              Cancel
            </button>
            <button
              type="button"
              className="company-btn company-btn--primary"
              disabled={!canSave || !linkAssetDepartmentId || !linkAssetDraftId || linkAssetConfirming}
              onClick={confirmLinkAsset}
            >
              {linkAssetConfirming ? 'Linking…' : 'Confirm link'}
            </button>
          </footer>
        </div>
      </div>
    ) : null}
    </>
  )
}
