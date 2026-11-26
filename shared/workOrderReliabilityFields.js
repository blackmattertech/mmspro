/**
 * Work Order technician custom fields for reliability hours.
 * These are Form Builder `field:` extras (not system: React compounds).
 * Keep client/server behavior aligned via this shared module.
 */

export const OPERATIONAL_BREAKDOWN_HOURS_FIELD_ID = 'field:wo-operational-breakdown-hours'
export const ACTIVE_REPAIR_HOURS_FIELD_ID = 'field:wo-active-repair-hours'

export const BREAKDOWN_TIMES_FIELD_ID = 'system:breakdown_times'
export const WO_EXECUTION_SECTION_ID = 'system:wo_execution'

/** Max may not exceed calculated breakdown duration (start→end). */
export const MAX_BOUND_BREAKDOWN_DURATION = 'breakdown_duration'
/** Max may not exceed another layout field's numeric value. */
export const MAX_BOUND_FIELD = 'field'

export const RELIABILITY_CUSTOM_FIELDS = [
  {
    id: OPERATIONAL_BREAKDOWN_HOURS_FIELD_ID,
    label: 'Operational Breakdown Hours',
    fieldType: 'number',
    colSpan: 50,
    required: false,
    hint: 'Enter the actual breakdown hours affecting scheduled equipment operation. Applicable to 8-hour, 12-hour and 24-hour operation.',
    maxBound: MAX_BOUND_BREAKDOWN_DURATION,
  },
  {
    id: ACTIVE_REPAIR_HOURS_FIELD_ID,
    label: 'Active Repair Hours',
    fieldType: 'number',
    colSpan: 50,
    required: false,
    hint: 'Hours spent actively repairing. Must not exceed Operational Breakdown Hours (and Breakdown Hours).',
    maxBound: MAX_BOUND_FIELD,
    maxBoundFieldId: OPERATIONAL_BREAKDOWN_HOURS_FIELD_ID,
  },
]

const RELIABILITY_FIELD_IDS = new Set(RELIABILITY_CUSTOM_FIELDS.map((field) => field.id))

export function isWorkOrderProcessFormId(formId) {
  return String(formId || '').startsWith('work_orders.')
}

function hoursBetween(startAt, endAt) {
  if (!startAt || !endAt) return null
  const start = new Date(startAt).getTime()
  const end = new Date(endAt).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null
  return Math.round(((end - start) / 3600000) * 100) / 100
}

function parseNonNegativeNumber(raw) {
  if (raw === '' || raw == null) return { empty: true, value: null }
  const value = typeof raw === 'number' ? raw : Number(String(raw).trim())
  if (!Number.isFinite(value)) return { empty: false, value: null, invalid: true }
  if (value < 0) return { empty: false, value: null, invalid: true }
  return { empty: false, value }
}

function cloneLayoutShallow(layout) {
  return {
    ...layout,
    sections: [...(layout.sections || [])],
    fields: [...(layout.fields || [])],
    groups: [...(layout.groups || [])],
  }
}

function resolveExecutionSectionId(layout) {
  const fields = layout?.fields || []
  const breakdown = fields.find((field) => field.id === BREAKDOWN_TIMES_FIELD_ID)
  if (breakdown?.sectionId) return breakdown.sectionId
  const execution = (layout?.sections || []).find((section) => section.id === WO_EXECUTION_SECTION_ID)
  return execution?.id || null
}

/**
 * Insert Operational Breakdown Hours + Active Repair Hours immediately after
 * Breakdown times on Work Order process layouts. Idempotent by stable field ids.
 */
export function ensureWorkOrderReliabilityFields(layout, formId) {
  if (!layout || !isWorkOrderProcessFormId(formId)) return layout
  const existingIds = new Set((layout.fields || []).map((field) => field.id))
  const missing = RELIABILITY_CUSTOM_FIELDS.filter((field) => !existingIds.has(field.id))
  if (!missing.length) {
    // Refresh metadata for existing platform fields so hint/maxBound stay current.
    let changed = false
    const fields = (layout.fields || []).map((field) => {
      const def = RELIABILITY_CUSTOM_FIELDS.find((item) => item.id === field.id)
      if (!def) return field
      const next = {
        ...field,
        label: field.label || def.label,
        fieldType: field.fieldType || def.fieldType,
        colSpan: field.colSpan || def.colSpan,
        hint: field.hint || def.hint,
        maxBound: field.maxBound || def.maxBound,
        ...(def.maxBoundFieldId && !field.maxBoundFieldId
          ? { maxBoundFieldId: def.maxBoundFieldId }
          : {}),
      }
      if (
        next.label !== field.label
        || next.fieldType !== field.fieldType
        || next.hint !== field.hint
        || next.maxBound !== field.maxBound
        || next.maxBoundFieldId !== field.maxBoundFieldId
      ) {
        changed = true
      }
      return next
    })
    return changed ? { ...layout, fields } : layout
  }

  const sectionId = resolveExecutionSectionId(layout)
  if (!sectionId) return layout

  const next = cloneLayoutShallow(layout)
  const fields = next.fields
  const breakdownIndex = fields.findIndex((field) => field.id === BREAKDOWN_TIMES_FIELD_ID)
  const insertAt = breakdownIndex >= 0 ? breakdownIndex + 1 : fields.length

  const sectionFields = fields
    .filter((field) => field.sectionId === sectionId)
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
  const baseOrder = breakdownIndex >= 0
    ? Number(fields[breakdownIndex].order) || 0
    : (sectionFields.length ? Number(sectionFields[sectionFields.length - 1].order) || 0 : -1)

  const inserted = missing.map((def, index) => ({
    id: def.id,
    sectionId,
    order: baseOrder + index + 1,
    colSpan: def.colSpan,
    required: Boolean(def.required),
    label: def.label,
    fieldType: def.fieldType,
    hint: def.hint,
    maxBound: def.maxBound,
    ...(def.maxBoundFieldId ? { maxBoundFieldId: def.maxBoundFieldId } : {}),
  }))

  fields.splice(insertAt, 0, ...inserted)

  // Keep order contiguous for fields after the insert in the same section.
  let orderCursor = baseOrder + inserted.length
  for (let i = insertAt + inserted.length; i < fields.length; i += 1) {
    if (fields[i].sectionId !== sectionId) continue
    orderCursor += 1
    fields[i] = { ...fields[i], order: orderCursor }
  }

  next.fields = fields
  return next
}

function fieldLabel(field) {
  return String(field?.label || 'This field').trim() || 'This field'
}

function resolveMaxForField(field, values, breakdownHours, fieldsById) {
  if (field.maxBound === MAX_BOUND_BREAKDOWN_DURATION) {
    return {
      max: breakdownHours,
      maxLabel: 'Breakdown Hours',
      needsBreakdown: true,
    }
  }
  if (field.maxBound === MAX_BOUND_FIELD && field.maxBoundFieldId) {
    const other = fieldsById.get(field.maxBoundFieldId)
    const parsed = parseNonNegativeNumber(values?.[field.maxBoundFieldId])
    if (!parsed.empty && parsed.value != null) {
      return {
        max: parsed.value,
        maxLabel: fieldLabel(other) || 'the related field',
        needsBreakdown: false,
      }
    }
    // Sibling empty: fall back to calendar breakdown so Active Repair still has a ceiling.
    if (breakdownHours != null) {
      return {
        max: breakdownHours,
        maxLabel: 'Breakdown Hours',
        needsBreakdown: false,
      }
    }
    return { max: null, maxLabel: fieldLabel(other) || 'the related field', needsBreakdown: true }
  }
  return { max: null, maxLabel: '', needsBreakdown: false }
}

/**
 * Validate number fields that declare maxBound against breakdown duration
 * and/or another field. Returns an error message or null.
 */
export function validateLayoutNumberMaxBounds({
  layout,
  values = {},
  breakdownStartAt = null,
  breakdownEndAt = null,
  breakdownDurationHours = null,
} = {}) {
  const fields = (layout?.fields || []).filter((field) => (
    field
    && !field.skipped
    && String(field.fieldType || '').toLowerCase() === 'number'
    && field.maxBound
  ))
  if (!fields.length) return null

  const breakdownHours = breakdownDurationHours != null && Number.isFinite(Number(breakdownDurationHours))
    ? Number(breakdownDurationHours)
    : hoursBetween(breakdownStartAt, breakdownEndAt)

  const fieldsById = new Map((layout?.fields || []).map((field) => [field.id, field]))

  for (const field of fields) {
    const parsed = parseNonNegativeNumber(values?.[field.id])
    if (parsed.empty) continue
    if (parsed.invalid) {
      return `${fieldLabel(field)} must be a non-negative number.`
    }

    const bound = resolveMaxForField(field, values, breakdownHours, fieldsById)
    if (bound.needsBreakdown && breakdownHours == null) {
      return `Set Breakdown start and end before entering ${fieldLabel(field)}.`
    }
    if (bound.max != null && parsed.value > bound.max) {
      return `${fieldLabel(field)} (${parsed.value}) cannot exceed ${bound.maxLabel} (${bound.max}).`
    }
  }

  // Extra reliability rule: Active Repair Hours also cannot exceed Operational
  // when both are present, even if Active's maxBound was changed in Form Builder.
  const operational = parseNonNegativeNumber(values?.[OPERATIONAL_BREAKDOWN_HOURS_FIELD_ID])
  const active = parseNonNegativeNumber(values?.[ACTIVE_REPAIR_HOURS_FIELD_ID])
  if (
    !operational.empty
    && operational.value != null
    && !active.empty
    && active.value != null
    && active.value > operational.value
  ) {
    return `Active Repair Hours (${active.value}) cannot exceed Operational Breakdown Hours (${operational.value}).`
  }

  return null
}

export function isReliabilityCustomFieldId(fieldId) {
  return RELIABILITY_FIELD_IDS.has(String(fieldId || ''))
}

const BREAKDOWN_COMPLETION_STATUSES = new Set(['completed', 'verified', 'closed'])

/**
 * Breakdown work orders must have Operational Breakdown Hours and Active Repair
 * Hours before complete / verified / closed.
 * Returns an error message or null.
 */
export function validateBreakdownReliabilityHoursRequired({
  isBreakdown = false,
  status = null,
  values = {},
} = {}) {
  if (!isBreakdown) return null
  if (!BREAKDOWN_COMPLETION_STATUSES.has(String(status || ''))) return null

  const missing = []
  const operational = parseNonNegativeNumber(values?.[OPERATIONAL_BREAKDOWN_HOURS_FIELD_ID])
  const active = parseNonNegativeNumber(values?.[ACTIVE_REPAIR_HOURS_FIELD_ID])

  if (operational.empty || operational.invalid || operational.value == null) {
    missing.push('Operational Breakdown Hours')
  }
  if (active.empty || active.invalid || active.value == null) {
    missing.push('Active Repair Hours')
  }
  if (!missing.length) return null
  return `Complete required fields before marking completed: ${missing.join(', ')}.`
}
