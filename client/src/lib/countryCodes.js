export const COUNTRY_DIAL_CODES = [
  { iso: 'IN', name: 'India', dial: '+91' },
  { iso: 'US', name: 'United States', dial: '+1' },
  { iso: 'GB', name: 'United Kingdom', dial: '+44' },
  { iso: 'AE', name: 'United Arab Emirates', dial: '+971' },
  { iso: 'AU', name: 'Australia', dial: '+61' },
  { iso: 'CA', name: 'Canada', dial: '+1' },
  { iso: 'SG', name: 'Singapore', dial: '+65' },
  { iso: 'DE', name: 'Germany', dial: '+49' },
  { iso: 'FR', name: 'France', dial: '+33' },
  { iso: 'JP', name: 'Japan', dial: '+81' },
  { iso: 'CN', name: 'China', dial: '+86' },
  { iso: 'SA', name: 'Saudi Arabia', dial: '+966' },
  { iso: 'QA', name: 'Qatar', dial: '+974' },
  { iso: 'MY', name: 'Malaysia', dial: '+60' },
  { iso: 'NZ', name: 'New Zealand', dial: '+64' },
]

export function countryFlag(iso) {
  if (!iso || iso.length !== 2) return '🏳️'
  return iso
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
}

export function getCountryByIso(iso) {
  return COUNTRY_DIAL_CODES.find((c) => c.iso === iso) || COUNTRY_DIAL_CODES[0]
}

export function parsePhoneE164(phone, defaultIso = 'IN') {
  if (!phone?.trim()) return { iso: defaultIso, national: '' }

  const normalized = phone.replace(/[\s()-]/g, '')
  if (!normalized.startsWith('+')) {
    return { iso: defaultIso, national: normalized.replace(/\D/g, '') }
  }

  const sorted = [...COUNTRY_DIAL_CODES].sort((a, b) => b.dial.length - a.dial.length)
  for (const country of sorted) {
    if (normalized.startsWith(country.dial)) {
      return {
        iso: country.iso,
        national: normalized.slice(country.dial.length).replace(/\D/g, ''),
      }
    }
  }

  return { iso: defaultIso, national: normalized.slice(1).replace(/\D/g, '') }
}

export function formatPhoneE164(iso, national) {
  const country = getCountryByIso(iso)
  const digits = String(national || '').replace(/\D/g, '')
  if (!digits) return ''
  return `${country.dial}${digits}`
}
