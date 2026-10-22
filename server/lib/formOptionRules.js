/**
 * Parent-option field rules for Form Builder layouts.
 * Keep in sync with client/src/lib/formOptionRules.js.
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

export function optionLabels(list) {
  return normalizeOptions(list).map((item) => item.label)
}

export function countOptionRules(list) {
  return normalizeOptions(list).reduce((sum, item) => sum + (item.rules?.length || 0), 0)
}

function valuesMatch(selected, option) {
  if (selected == null || selected === '') return false
  const needle = String(selected).trim().toLowerCase()
  const value = optionValue(option).toLowerCase()
  const label = optionLabel(option).toLowerCase()
  return needle === value || needle === label
}

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

export function fieldEffect(fieldId, activeRules = []) {
  if (!fieldId) return null
  return activeRules.find((rule) => rule.targetFieldId === fieldId) || null
}

export function isFieldHiddenByRules(fieldId, activeRules = []) {
  const effect = fieldEffect(fieldId, activeRules)
  return effect?.action === 'hide'
}

export function layoutHasOptionRules(layout) {
  return (layout?.fields || []).some((field) => countOptionRules(field.options) > 0)
}
