/** Shared copy and helpers for required-field validation UX. */

export function formatMandatoryFieldsAlert(labels = []) {
  const unique = [...new Set(
    (labels || [])
      .map((label) => String(label || '').trim())
      .filter(Boolean),
  )]
  const singular = unique.length <= 1
  return {
    title: singular ? 'Mandatory field missing' : 'Mandatory fields missing',
    message: singular
      ? 'Fill the highlighted mandatory field.'
      : 'Fill the highlighted mandatory fields.',
    details: unique,
  }
}

export function scrollToMandatoryField(fieldId) {
  if (!fieldId || typeof document === 'undefined') return
  const escaped = typeof CSS !== 'undefined' && CSS.escape
    ? CSS.escape(String(fieldId))
    : String(fieldId).replace(/"/g, '\\"')
  const node = document.querySelector(`[data-field-id="${escaped}"]`)
    || document.getElementById(`wo-field-${fieldId}`)
    || document.getElementById(String(fieldId))
  node?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
}

export function clearMandatoryFieldId(ids, fieldId) {
  if (!fieldId) return ids || []
  const next = (ids || []).filter((id) => id !== fieldId)
  return next.length === (ids || []).length ? ids : next
}
