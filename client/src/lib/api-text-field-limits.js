import { apiFetch } from './api'
import { limitsFromFields } from './textFieldLimits'

let cached = null
let inflight = null

export function clearTextFieldLimitsCache() {
  cached = null
  inflight = null
}

export function peekTextFieldLimits() {
  return cached
}

export function getTextFieldLimits() {
  if (cached) return Promise.resolve(cached)
  if (!inflight) {
    inflight = apiFetch('/api/text-field-limits')
      .then((data) => {
        const fields = Array.isArray(data?.fields) ? data.fields : []
        cached = { fields, limits: limitsFromFields(fields) }
        return cached
      })
      .finally(() => {
        inflight = null
      })
  }
  return inflight
}

export function updateTextFieldLimits(limits) {
  return apiFetch('/api/text-field-limits', {
    method: 'PUT',
    body: JSON.stringify({ limits }),
  }).then((data) => {
    const fields = Array.isArray(data?.fields) ? data.fields : []
    cached = { fields, limits: limitsFromFields(fields) }
    return cached
  })
}

export function resetTextFieldLimits() {
  return apiFetch('/api/text-field-limits/reset', {
    method: 'POST',
  }).then((data) => {
    const fields = Array.isArray(data?.fields) ? data.fields : []
    cached = { fields, limits: limitsFromFields(fields) }
    return cached
  })
}
