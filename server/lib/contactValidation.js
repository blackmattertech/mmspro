const GENERIC_POSTAL_RE = /^[A-Z0-9][A-Z0-9\s-]{2,11}$/i
const E164_RE = /^\+[1-9]\d{6,14}$/

function normalizeCountry(country = '') {
  return country.trim().toLowerCase()
}

export function validatePostalCode(postalCode, country = '') {
  const code = postalCode?.trim()
  if (!code) return null

  const c = normalizeCountry(country)

  if (['india', 'in', 'भारत'].includes(c)) {
    if (!/^\d{6}$/.test(code)) return 'PIN code must be exactly 6 digits'
    return null
  }

  if (['united states', 'usa', 'us', 'united states of america'].includes(c)) {
    if (!/^\d{5}(-\d{4})?$/.test(code)) return 'ZIP code must be 5 or 9 digits'
    return null
  }

  if (['united kingdom', 'uk', 'gb', 'great britain'].includes(c)) {
    if (!/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(code)) return 'Invalid UK postcode'
    return null
  }

  if (!GENERIC_POSTAL_RE.test(code)) {
    return 'Postal code must be 3–12 letters or digits'
  }

  return null
}

export function validatePhoneE164(phone, { required = false } = {}) {
  const normalized = phone?.replace(/[\s()-]/g, '') || ''
  if (!normalized) {
    return required ? 'Mobile number is required' : null
  }
  if (!E164_RE.test(normalized)) {
    return 'Enter a valid mobile number with country code'
  }
  return null
}

export function normalizePhoneE164(phone) {
  if (!phone?.trim()) return null
  return phone.replace(/[\s()-]/g, '')
}
