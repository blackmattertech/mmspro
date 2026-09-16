import { supabaseAdmin } from '../services/supabase.js'

export const TEXT_FIELD_LIMIT_MIN = 10
export const TEXT_FIELD_LIMIT_MAX = 20000

export const TEXT_FIELD_LIMIT_DEFS = [
  {
    key: 'short_description',
    label: 'Short description',
    description: 'Brief summary on work requests, work orders, follow-ups, and tasks.',
    defaultMaxLength: 200,
  },
  {
    key: 'problem_description',
    label: 'Problem description',
    description: 'Problem / issue details on work requests and work orders.',
    defaultMaxLength: 2000,
  },
  {
    key: 'remarks',
    label: 'Remarks',
    description: 'Remarks on work requests, work orders, daily logs, assignments, and task updates.',
    defaultMaxLength: 1000,
  },
  {
    key: 'job_description',
    label: 'Description of the issue',
    description: 'Detailed job description on work order maintenance documentation.',
    defaultMaxLength: 2000,
  },
  {
    key: 'root_cause',
    label: 'Root cause',
    description: 'Root cause analysis on work order maintenance documentation.',
    defaultMaxLength: 2000,
  },
  {
    key: 'action_taken',
    label: 'Action taken',
    description: 'Action taken on work order maintenance documentation.',
    defaultMaxLength: 2000,
  },
  {
    key: 'material_consumed',
    label: 'Material consumed',
    description: 'Material description on each consumed-material row (work orders, PM, and daily logs).',
    defaultMaxLength: 500,
  },
  {
    key: 'dos_and_donts',
    label: "Do's and Don'ts",
    description: "Each Do's / Don'ts column on work order and PM maintenance documentation.",
    defaultMaxLength: 2000,
  },
  {
    key: 'lessons_learned',
    label: 'Lesson learned',
    description: 'Lessons learned on work order maintenance documentation.',
    defaultMaxLength: 2000,
  },
]

const REMARKS_ALIASES = new Set([
  'remarks',
  'execution_remarks',
  'verification_remarks',
  'assignment_remarks',
  'approval_remarks',
  'follow_up_remarks',
  'completion_remarks',
])

export const DEFAULT_TEXT_FIELD_LIMITS = Object.fromEntries(
  TEXT_FIELD_LIMIT_DEFS.map((row) => [row.key, row.defaultMaxLength]),
)

const KNOWN_KEYS = new Set(TEXT_FIELD_LIMIT_DEFS.map((row) => row.key))

function httpError(message, status = 400) {
  const err = new Error(message)
  err.status = status
  return err
}

export function resolveLimitKey(fieldKey) {
  if (REMARKS_ALIASES.has(fieldKey)) return 'remarks'
  return fieldKey
}

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
  if (KNOWN_KEYS.has(asKey)) return asKey
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

export function clipDynamicFieldValues(limits, schemaOrFields, values) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) return values || {}
  const fields = Array.isArray(schemaOrFields)
    ? schemaOrFields
    : (schemaOrFields?.sections || []).flatMap((section) => section.fields || [])
  const byId = new Map(fields.map((field) => [String(field.id), field]))
  const next = { ...values }
  for (const [id, raw] of Object.entries(next)) {
    if (typeof raw !== 'string') continue
    const key = limitKeyFromField(byId.get(String(id)))
    if (!key) continue
    next[id] = clipToLimit(limits, key, raw)
  }
  return next
}

export function getLimit(limits, fieldKey) {
  const key = resolveLimitKey(fieldKey)
  const value = limits?.[key] ?? DEFAULT_TEXT_FIELD_LIMITS[key]
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? num : null
}

export function clipToLimit(limits, fieldKey, value) {
  if (value == null) return value
  const text = String(value)
  const max = getLimit(limits, fieldKey)
  if (!max || text.length <= max) return text
  return text.slice(0, max)
}

export function clipTrimmedToLimit(limits, fieldKey, value) {
  const text = String(value ?? '').trim()
  if (!text) return null
  return clipToLimit(limits, fieldKey, text)
}

export function clipMaterialDescriptions(limits, rows) {
  const max = getLimit(limits, 'material_consumed')
  const list = Array.isArray(rows) ? rows : []
  if (!max) return list
  return list.map((row) => ({
    ...row,
    description: clipToLimit(limits, 'material_consumed', row?.description ?? ''),
  }))
}

export function clipMaterialConsumedValue(limits, value) {
  if (value == null) return value
  const text = String(value).trim()
  if (!text) return null
  try {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed)) {
      const clipped = clipMaterialDescriptions(limits, parsed)
      return clipped.length ? JSON.stringify(clipped) : null
    }
  } catch {
    // plain text fallback
  }
  return clipToLimit(limits, 'material_consumed', text)
}

export function clipDosDontsValue(limits, value) {
  if (value == null) return value
  const text = String(value).trim()
  if (!text) return null
  try {
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const dos = clipToLimit(limits, 'dos_and_donts', parsed.dos ?? '')
      const donts = clipToLimit(limits, 'dos_and_donts', parsed.donts ?? parsed.dont ?? '')
      const nextDos = String(dos || '').trim()
      const nextDonts = String(donts || '').trim()
      if (!nextDos && !nextDonts) return null
      return JSON.stringify({ dos: nextDos, donts: nextDonts })
    }
  } catch {
    // plain text fallback
  }
  return clipToLimit(limits, 'dos_and_donts', text)
}

export async function ensureTextFieldLimits(orgId) {
  const { data: existing, error } = await supabaseAdmin
    .from('org_text_field_limits')
    .select('field_key')
    .eq('org_id', orgId)

  if (error) throw error
  const have = new Set((existing || []).map((row) => row.field_key))
  const missing = TEXT_FIELD_LIMIT_DEFS.filter((row) => !have.has(row.key))
  if (!missing.length) return

  const { error: insertError } = await supabaseAdmin.from('org_text_field_limits').insert(
    missing.map((row) => ({
      org_id: orgId,
      field_key: row.key,
      max_length: row.defaultMaxLength,
    })),
  )
  if (insertError) throw insertError
}

function rowsToMap(rows) {
  const map = { ...DEFAULT_TEXT_FIELD_LIMITS }
  for (const row of rows || []) {
    if (!KNOWN_KEYS.has(row.field_key)) continue
    const num = Number(row.max_length)
    if (Number.isFinite(num)) map[row.field_key] = num
  }
  return map
}

export async function getTextFieldLimitsMap(orgId) {
  await ensureTextFieldLimits(orgId)
  const { data, error } = await supabaseAdmin
    .from('org_text_field_limits')
    .select('field_key, max_length')
    .eq('org_id', orgId)

  if (error) throw error
  return rowsToMap(data)
}

export async function listTextFieldLimits(orgId) {
  const limits = await getTextFieldLimitsMap(orgId)
  return TEXT_FIELD_LIMIT_DEFS.map((row) => ({
    key: row.key,
    label: row.label,
    description: row.description,
    max_length: limits[row.key],
    default_max_length: row.defaultMaxLength,
  }))
}

function parseMaxLength(value, label) {
  const num = Number(value)
  if (!Number.isInteger(num)) {
    throw httpError(`${label} must be a whole number.`)
  }
  if (num < TEXT_FIELD_LIMIT_MIN || num > TEXT_FIELD_LIMIT_MAX) {
    throw httpError(`${label} must be between ${TEXT_FIELD_LIMIT_MIN} and ${TEXT_FIELD_LIMIT_MAX} characters.`)
  }
  return num
}

export async function updateTextFieldLimits(orgId, body = {}) {
  await ensureTextFieldLimits(orgId)
  const incoming = body?.limits && typeof body.limits === 'object' && !Array.isArray(body.limits)
    ? body.limits
    : null
  const list = Array.isArray(body?.fields)
    ? body.fields
    : incoming
      ? Object.entries(incoming).map(([key, max_length]) => ({ key, max_length }))
      : null

  if (!list?.length) {
    throw httpError('Provide at least one field limit to update.')
  }

  const now = new Date().toISOString()
  const rows = []
  for (const item of list) {
    const key = String(item?.key || item?.field_key || '').trim()
    if (!KNOWN_KEYS.has(key)) {
      throw httpError(`Unknown text field "${key}".`)
    }
    const def = TEXT_FIELD_LIMIT_DEFS.find((row) => row.key === key)
    rows.push({
      org_id: orgId,
      field_key: key,
      max_length: parseMaxLength(item?.max_length, def?.label || key),
      updated_at: now,
    })
  }

  const { error } = await supabaseAdmin
    .from('org_text_field_limits')
    .upsert(rows, { onConflict: 'org_id,field_key' })

  if (error) throw error
  return listTextFieldLimits(orgId)
}

export async function resetTextFieldLimits(orgId) {
  await ensureTextFieldLimits(orgId)
  const now = new Date().toISOString()
  const rows = TEXT_FIELD_LIMIT_DEFS.map((row) => ({
    org_id: orgId,
    field_key: row.key,
    max_length: row.defaultMaxLength,
    updated_at: now,
  }))

  const { error } = await supabaseAdmin
    .from('org_text_field_limits')
    .upsert(rows, { onConflict: 'org_id,field_key' })

  if (error) throw error
  return listTextFieldLimits(orgId)
}
