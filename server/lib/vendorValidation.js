import { getStateForCity, isKnownIndianCity, parseCityName } from './indiaLocations.js'

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/
const VENDOR_CODE_RE = /^Ven-\d{4,}$/i
const INDIAN_MOBILE_RE = /^(\+91)?[6-9]\d{9}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function trimOrNull(value) {
  const text = String(value ?? '').trim()
  return text || null
}

export function panFromGstin(gstin) {
  const normalized = String(gstin || '').trim().toUpperCase()
  if (normalized.length < 12) return ''
  return normalized.slice(2, 12)
}

export function validateVendorFields(input, { requireName = true, requireCode = false } = {}) {
  const errors = {}
  const vendor_code = trimOrNull(input.vendor_code)
  const name = trimOrNull(input.name)
  const mobile = trimOrNull(input.mobile)?.replace(/[\s()-]/g, '') || null
  const email = trimOrNull(input.email)
  const pincode = trimOrNull(input.pincode)
  const city = parseCityName(input.city)
  const state = trimOrNull(input.state)
  const pan = trimOrNull(input.pan)?.toUpperCase() || null
  const ifsc_code = trimOrNull(input.ifsc_code)?.toUpperCase() || null

  if (requireCode && !vendor_code) {
    errors.vendor_code = 'Vendor ID is required'
  } else if (vendor_code && !VENDOR_CODE_RE.test(vendor_code)) {
    errors.vendor_code = 'Vendor ID must be in Ven-0001 format'
  }

  if (requireName && !name) {
    errors.name = 'Vendor name is required'
  }

  if (mobile && !INDIAN_MOBILE_RE.test(mobile)) {
    errors.mobile = 'Enter a valid 10-digit Indian mobile number'
  }

  if (email && !EMAIL_RE.test(email)) {
    errors.email = 'Enter a valid email address'
  }

  if (pincode && !/^\d{6}$/.test(pincode)) {
    errors.pincode = 'Pincode must be exactly 6 digits'
  }

  if (city && !isKnownIndianCity(city)) {
    errors.city = 'Select a city from the list'
  }

  if (city) {
    const expectedState = getStateForCity(city)
    if (state && expectedState && state !== expectedState) {
      errors.state = 'State does not match the selected city'
    }
  }

  if (pan && !PAN_RE.test(pan)) {
    errors.pan = 'PAN must be 10 characters (e.g. ABCDE1234F)'
  }

  if (ifsc_code && !IFSC_RE.test(ifsc_code)) {
    errors.ifsc_code = 'Enter a valid 11-character IFSC code'
  }

  return errors
}

export function firstVendorValidationError(errors) {
  return Object.values(errors).find(Boolean) || null
}
