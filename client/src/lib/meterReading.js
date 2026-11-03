import { orderedHierarchyFields } from './assetHierarchy'
import { canonicalLabel, formatPickerValue } from './pickerFields'

const MEDIA_FIELD_TYPES = new Set(['image', 'file'])

/** Active asset levels the Superadmin configured for this company, in hierarchy order. */
export function meterIdentityColumns(assetFields) {
  const fields = orderedHierarchyFields(assetFields).filter((field) => (
    field?.id
    && field?.name
    && !MEDIA_FIELD_TYPES.has(field.field_type)
  ))
  if (!fields.length) {
    return [
      { id: 'name', label: 'Asset' },
      { id: 'code', label: 'Code' },
    ]
  }
  return fields.map((field) => ({
    id: `field:${field.id}`,
    label: field.name,
    fieldId: field.id,
    fieldName: field.name,
    fieldType: field.field_type,
  }))
}

export function meterListColumns(assetFields) {
  const identity = meterIdentityColumns(assetFields)
  const used = new Set(identity.map((column) => canonicalLabel(column.label)))
  const placement = [
    { id: 'location', label: 'Location' },
    { id: 'department', label: 'Department' },
  ].filter((column) => !used.has(canonicalLabel(column.label)))
  return [
    ...identity,
    ...placement,
    { id: 'last_reading', label: 'Last reading' },
    { id: 'date', label: 'Date' },
    { id: 'time', label: 'Time' },
    { id: 'logged_by', label: 'Logged by' },
    { id: 'actions', label: 'Actions' },
  ]
}

export function meterFieldText(row, column) {
  if (!column || column.id === 'actions') return ''
  if (column.id === 'location') return row?.location_name || ''
  if (column.id === 'department') return row?.department_name || ''
  if (column.id === 'name') return row?.name || ''
  if (column.id === 'code') return row?.code || ''
  if (String(column.id).startsWith('field:')) {
    const text = formatPickerValue(row, column)
    return text === '—' ? '' : text
  }
  return ''
}

/** Readable asset identity from configured fields, then the stored name and code. */
export function meterAssetLabel(row, assetFields) {
  const parts = meterIdentityColumns(assetFields)
    .map((column) => meterFieldText(row, column))
    .filter(Boolean)
  if (parts.length) return parts.join(' · ')
  return [row?.name, row?.code].map((part) => String(part || '').trim()).filter(Boolean).join(' · ')
}

function parseStamp(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatMeterValue(value) {
  if (value == null || value === '') return '—'
  const reading = Number(value)
  if (!Number.isFinite(reading)) return '—'
  return reading.toLocaleString(undefined, { maximumFractionDigits: 4 })
}

export function formatMeterStamp(value) {
  const date = parseStamp(value)
  if (!date) return ''
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatMeterDate(value) {
  const date = parseStamp(value)
  if (!date) return '—'
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatMeterLogger(row) {
  return [
    row?.logged_by_name,
    row?.logged_by_department,
    row?.logged_by_designation,
  ].map((part) => String(part || '').trim()).filter(Boolean).join(' · ')
}

export function formatMeterTime(value) {
  const date = parseStamp(value)
  if (!date) return '—'
  return date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}
