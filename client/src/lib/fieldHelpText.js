import { limitKeyFromField, resolveLimitKey } from './textFieldLimits.js'

/**
 * Example copy for free-text fields: placeholder + hint under the control.
 * Keys match DEFAULT_TEXT_FIELD_LIMITS / Forms Master limit keys.
 */
export const FIELD_HELP_TEXT = {
  short_description: {
    placeholder: 'e.g. AHU-3 making unusual noise',
    hint: 'One-line summary for lists and notifications. Example: “Cooling tower pump seal leak”.',
  },
  problem_description: {
    placeholder: 'e.g. When it started, symptoms, impact, safety notes',
    hint: 'Describe what is wrong, when it started, operational impact, and any safety concerns. Example: “Rattling from fan section since 09:00; vibration on casing; unit still running.”',
  },
  remarks: {
    placeholder: 'Optional notes for reviewers',
    hint: 'Optional context that is not the main description.',
  },
  job_description: {
    placeholder: 'e.g. Work performed and findings',
    hint: 'Describe the work done or the issue found during execution.',
  },
  root_cause: {
    placeholder: 'e.g. Worn bearing on drive motor',
    hint: 'Explain the underlying cause once known.',
  },
  action_taken: {
    placeholder: 'e.g. Replaced bearing and realigned coupling',
    hint: 'List corrective actions completed.',
  },
  special_tools_used: {
    placeholder: 'e.g. Laser alignment kit',
    hint: 'Note any special tools or equipment used.',
  },
  safety_precautions: {
    placeholder: 'e.g. LOTO completed; area barricaded',
    hint: 'Record safety steps taken before and during the work.',
  },
  title: {
    placeholder: 'e.g. Inspect cooling tower fan',
    hint: 'Short task title shown in lists and reminders.',
  },
}

export function fieldHelpForKey(key) {
  const resolved = resolveLimitKey(key)
  return FIELD_HELP_TEXT[resolved] || null
}

/** Resolve help from a field object, bind key, or label. */
export function fieldHelpFor(fieldOrName) {
  if (fieldOrName && typeof fieldOrName === 'object') {
    const fromKey = fieldHelpForKey(
      fieldOrName.field_key
      || fieldOrName.key
      || fieldOrName.bindKey
      || fieldOrName.code,
    )
    if (fromKey) return fromKey
  }
  const limitKey = limitKeyFromField(fieldOrName)
  return limitKey ? fieldHelpForKey(limitKey) : null
}
