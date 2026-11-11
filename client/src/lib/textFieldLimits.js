export const TEXT_FIELD_LIMIT_MIN = 10
export const TEXT_FIELD_LIMIT_MAX = 20000

export const DEFAULT_TEXT_FIELD_LIMITS = {
  short_description: 200,
  problem_description: 2000,
  remarks: 1000,
  job_description: 2000,
  root_cause: 2000,
  action_taken: 2000,
  material_consumed: 500,
  dos_and_donts: 2000,
  lessons_learned: 2000,
}

export const TEXT_FIELD_LIMIT_LABELS = {
  short_description: 'Short description',
  problem_description: 'Detailed description',
  remarks: 'Remarks',
  job_description: 'Description of the issue',
  root_cause: 'Root cause',
  action_taken: 'Action taken',
  material_consumed: 'Material consumed',
  dos_and_donts: "Do's and Don'ts",
  lessons_learned: 'Lesson learned',
}

export function characterLimitError(value, maxLength) {
  const limit = Number(maxLength)
  if (!Number.isFinite(limit) || limit <= 0) return null
  if (String(value ?? '').length <= limit) return null
  return 'Character exceeds'
}

export function characterLimitMessage(label, value, maxLength) {
  if (!characterLimitError(value, maxLength)) return null
  const name = String(label || '').trim() || 'Field'
  return `${name}: character exceeds`
}

/**
 * @param {Array<{ label?: string, key?: string, value: unknown, limit?: number }>} entries
 * @param {(key: string) => number | undefined} [maxLengthFn]
 */
export function firstCharacterLimitMessage(entries, maxLengthFn) {
  for (const entry of entries || []) {
    const key = entry?.key ? resolveLimitKey(entry.key) : null
    const limit = entry?.limit ?? (key && maxLengthFn ? maxLengthFn(key) : undefined)
    const label = entry?.label || (key && TEXT_FIELD_LIMIT_LABELS[key]) || key || 'Field'
    const message = characterLimitMessage(label, entry?.value, limit)
    if (message) return message
  }
  return null
}

/** Detects visible SpellcheckInput exceed state for button-triggered saves. */
export function findVisibleCharacterLimitError(root) {
  const scope = root && typeof root.querySelector === 'function' ? root : document
  const errorNode = scope.querySelector('.spellcheck-field__error')
  if (!errorNode) return null
  const field = errorNode.closest('label, .company-form__field, .task-form__field, tr, div')
  const labelText = field
    ?.querySelector('.company-form__label-text, .company-form__label, .task-form__label')
    ?.textContent
    ?.replace(/\*/g, '')
    ?.trim()
  return labelText ? `${labelText}: character exceeds` : 'Character exceeds'
}

const REMARKS_ALIASES = new Set([
  'remarks',
  'execution_remarks',
  'verification_remarks',
  'assignment_remarks',
  'approval_remarks',
  'follow_up_remarks',
  'completion_remarks',
])

export function resolveLimitKey(fieldKey) {
  if (REMARKS_ALIASES.has(fieldKey)) return 'remarks'
  return fieldKey
}

const KNOWN_LIMIT_KEYS = new Set(Object.keys(DEFAULT_TEXT_FIELD_LIMITS))

const LABEL_LIMIT_RULES = [
  [/description of (the )?issue/, 'job_description'],
  [/detailed job description/, 'job_description'],
  [/^job description$/, 'job_description'],
  [/root cause/, 'root_cause'],
  [/action taken/, 'action_taken'],
  [/material consumed/, 'material_consumed'],
  [/lessons? learn(?:ed|t)/, 'lessons_learned'],
  [/short description/, 'short_description'],
  [/problem description/, 'problem_description'],
  [/detailed description/, 'problem_description'],
  [/\bremarks\b/, 'remarks'],
  [/\bdo s\b|\bdonts\b|\bdon ts\b/, 'dos_and_donts'],
]

function normalizeLimitText(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function limitKeyFromLabel(name) {
  const text = normalizeLimitText(name)
  if (!text) return null
  const asKey = resolveLimitKey(text.replace(/ /g, '_'))
  if (KNOWN_LIMIT_KEYS.has(asKey)) return asKey
  for (const [pattern, key] of LABEL_LIMIT_RULES) {
    if (pattern.test(text)) return key
  }
  return null
}

export function limitKeyFromField(fieldOrName) {
  const candidates = typeof fieldOrName === 'object' && fieldOrName
    ? [fieldOrName.field_key, fieldOrName.key, fieldOrName.code, fieldOrName.name, fieldOrName.label]
    : [fieldOrName]
  for (const candidate of candidates) {
    const key = limitKeyFromLabel(candidate)
    if (key) return key
  }
  return null
}

export function limitsFromFields(fields) {
  const map = { ...DEFAULT_TEXT_FIELD_LIMITS }
  for (const row of fields || []) {
    const key = row?.key
    const num = Number(row?.max_length)
    if (key && Number.isFinite(num) && num > 0) map[key] = num
  }
  return map
}
