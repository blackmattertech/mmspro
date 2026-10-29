/**
 * Parent-option field rules for Form Builder layouts.
 * Keep in sync with server/lib/formOptionRules.js.
 */

export const OPTION_RULE_ACTIONS = ['show', 'hide', 'copyFrom', 'excludeFrom']

const ACTIONS_NEEDING_SOURCE = new Set(['copyFrom', 'excludeFrom'])

function slugValue(label) {
  return String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function optionLabel(option) {
  if (option == null) return ''
  if (typeof option === 'string' || typeof option === 'number') return String(option).trim()
  return String(option.label ?? option.value ?? '').trim()
}

export function optionValue(option) {
  if (option == null) return ''
  if (typeof option === 'string' || typeof option === 'number') return String(option).trim()
  const value = String(option.value ?? '').trim()
  if (value) return value
  return optionLabel(option)
}

export function sanitizeOptionRule(raw) {
  if (!raw || typeof raw !== 'object') return null
  const action = String(raw.action || '').trim()
  if (!OPTION_RULE_ACTIONS.includes(action)) return null
  const targetFieldId = String(raw.targetFieldId || '').trim()
  if (!targetFieldId) return null
  const sourceFieldId = String(raw.sourceFieldId || '').trim()
  if (ACTIONS_NEEDING_SOURCE.has(action) && !sourceFieldId) return null
  return {
    targetFieldId,
    action,
    ...(ACTIONS_NEEDING_SOURCE.has(action) ? { sourceFieldId } : {}),
  }
}

export function normalizeOptionEntry(raw) {
  if (raw == null) return null
  if (typeof raw === 'string' || typeof raw === 'number') {
    const label = String(raw).trim()
    if (!label) return null
    return { label, value: label, rules: [] }
  }
  if (typeof raw !== 'object') return null
  const label = optionLabel(raw)
  if (!label) return null
  const value = optionValue(raw) || slugValue(label) || label
  const rules = Array.isArray(raw.rules)
    ? raw.rules.map(sanitizeOptionRule).filter(Boolean)
    : []
  return { label, value, ...(rules.length ? { rules } : { rules: [] }) }
}

/** Normalize options to [{ label, value, rules }]. Accepts legacy string lists. */
export function normalizeOptions(list) {
  if (!Array.isArray(list)) return []
  const out = []
  const seen = new Set()
  for (const item of list) {
    const entry = normalizeOptionEntry(item)
    if (!entry) continue
    const key = entry.value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(entry)
  }
  return out
}

/** Labels only — for FilterableSelect / simple displays. */
export function optionLabels(list) {
  return normalizeOptions(list).map((item) => item.label)
}

/** Values for matching selected state. */
export function optionValues(list) {
  return normalizeOptions(list).map((item) => item.value)
}

export function countOptionRules(list) {
  return normalizeOptions(list).reduce((sum, item) => sum + (item.rules?.length || 0), 0)
}

function valuesMatch(selected, option) {
  if (selected == null || selected === '') return false
  const needle = String(selected).trim().toLowerCase()
  const value = optionValue(option).toLowerCase()
  const label = optionLabel(option).toLowerCase()
  if (needle === value || needle === label) return true
  const needleSlug = slugValue(selected)
  return Boolean(
    needleSlug
    && (needleSlug === slugValue(optionValue(option)) || needleSlug === slugValue(optionLabel(option))),
  )
}

export function isInterDepartmentRequestType(value) {
  const slug = slugValue(value)
  if (!slug) return false
  return slug === 'inter_department' || slug === 'inter' || slug.startsWith('inter_')
}

/** Intra / User Self — Order To mirrors Order From. */
export function isSameDepartmentRequestType(value) {
  const slug = slugValue(value)
  if (!slug) return false
  if (slug === 'intra_department' || slug === 'intra' || slug.startsWith('intra_')) return true
  if (slug === 'user_self' || slug === 'user_self_request' || slug.includes('user_self')) return true
  if (slug.includes('self_request') || slug === 'self') return true
  return false
}

/**
 * Collect active rules from all option-bearing fields given current values.
 * Later rules for the same targetFieldId overwrite earlier ones (layout field order).
 */
export function collectActiveRules(layout, values = {}) {
  const byTarget = new Map()
  for (const field of layout?.fields || []) {
    const options = normalizeOptions(field.options)
    if (!options.length) continue
    const selected = values[field.id]
    const matched = options.find((option) => valuesMatch(selected, option))
    if (!matched?.rules?.length) continue
    for (const rule of matched.rules) {
      byTarget.set(rule.targetFieldId, {
        ...rule,
        parentFieldId: field.id,
      })
    }
  }
  return [...byTarget.values()]
}

function findRequestRoutingFields(layout) {
  const fields = layout?.fields || []
  const byBind = new Map()
  for (const field of fields) {
    if (field.bindKey) byBind.set(field.bindKey, field)
  }

  const requestType = byBind.get('request_type')
    || byBind.get('order_type')
    || fields.find((field) => {
      const id = String(field.id || '')
      if (id === 'system:request_type' || id === 'system:order_type') return true
      const label = String(field.label || '')
      return /request\s*type/i.test(label) || /order\s*type/i.test(label)
    })
  const orderFrom = byBind.get('order_from_department_id')
    || fields.find((field) => (
      /order\s*from/i.test(field.label || '')
      && (field.masterSource === 'departments' || String(field.id || '').includes('departments'))
    ))
  const orderTo = byBind.get('order_to_department_id')
    || fields.find((field) => (
      /order\s*to/i.test(field.label || '')
      && (field.masterSource === 'departments' || String(field.id || '').includes('departments'))
    ))

  return { requestType, orderFrom, orderTo }
}

/**
 * Work Request routing fallbacks when Form Builder rules are missing:
 * - Inter → exclude Order From from Order To list
 * - Intra / User Self → copy Order From into Order To (visible, locked)
 */
export function inferBindKeyRules(layout, values = {}) {
  const { requestType, orderFrom, orderTo } = findRequestRoutingFields(layout)
  if (!requestType || !orderFrom || !orderTo) return []
  const selected = values[requestType.id] ?? values.request_type
  if (isInterDepartmentRequestType(selected)) {
    return [{
      targetFieldId: orderTo.id,
      action: 'excludeFrom',
      sourceFieldId: orderFrom.id,
      parentFieldId: requestType.id,
    }]
  }
  if (isSameDepartmentRequestType(selected)) {
    return [{
      targetFieldId: orderTo.id,
      action: 'copyFrom',
      sourceFieldId: orderFrom.id,
      parentFieldId: requestType.id,
    }]
  }
  return []
}

/** Merge option rules with bind-key inferences (Intra copy / Inter exclude win over plain show). */
export function resolveActiveRules(layout, values = {}) {
  const byTarget = new Map()
  for (const rule of collectActiveRules(layout, values)) {
    byTarget.set(rule.targetFieldId, rule)
  }
  for (const rule of inferBindKeyRules(layout, values)) {
    const existing = byTarget.get(rule.targetFieldId)
    if (rule.action === 'copyFrom') {
      byTarget.set(rule.targetFieldId, rule)
      continue
    }
    if (existing?.action === 'copyFrom') continue
    byTarget.set(rule.targetFieldId, rule)
  }
  return [...byTarget.values()]
}

export function fieldEffect(fieldId, activeRules = []) {
  if (!fieldId) return null
  return activeRules.find((rule) => rule.targetFieldId === fieldId) || null
}

export function isFieldHiddenByRules(fieldId, activeRules = []) {
  const effect = fieldEffect(fieldId, activeRules)
  return effect?.action === 'hide'
}

export function isFieldVisibleByRules(effect) {
  if (!effect) return null
  if (effect.action === 'hide') return false
  return true
}

export function isFieldLockedByRules(fieldId, activeRules = []) {
  const effect = fieldEffect(fieldId, activeRules)
  return effect?.action === 'copyFrom'
}

export function layoutHasOptionRules(layout) {
  return (layout?.fields || []).some((field) => countOptionRules(field.options) > 0)
}

/** Values to omit from a field's option list (excludeFrom rules). */
export function excludedValuesForField(fieldId, activeRules = [], values = {}) {
  const effect = fieldEffect(fieldId, activeRules)
  if (effect?.action !== 'excludeFrom' || !effect.sourceFieldId) return []
  const sourceValue = values[effect.sourceFieldId]
  if (sourceValue == null || sourceValue === '') return []
  return [String(sourceValue)]
}

/**
 * Apply copyFrom effects: returns { fieldId: value } patches to write.
 */
export function copyFromPatches(activeRules = [], values = {}) {
  const patches = {}
  for (const rule of activeRules) {
    if (rule.action !== 'copyFrom' || !rule.sourceFieldId) continue
    const sourceValue = values[rule.sourceFieldId]
    patches[rule.targetFieldId] = sourceValue ?? ''
  }
  return patches
}

/** Clear target values that are no longer allowed under excludeFrom. */
export function excludeFromClearPatches(activeRules = [], values = {}) {
  const patches = {}
  for (const rule of activeRules) {
    if (rule.action !== 'excludeFrom' || !rule.sourceFieldId) continue
    const excluded = values[rule.sourceFieldId]
    if (excluded == null || excluded === '') continue
    if (String(values[rule.targetFieldId] ?? '') === String(excluded)) {
      patches[rule.targetFieldId] = ''
    }
  }
  return patches
}
