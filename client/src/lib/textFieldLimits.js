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
