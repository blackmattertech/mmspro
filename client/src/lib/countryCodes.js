import { COUNTRY_DIAL_CODES } from './countryDialCodesData'

export { COUNTRY_DIAL_CODES }

export function countryFlag(iso) {
  if (!iso || iso.length !== 2) return '🏳️'
  return iso
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
}

export function getCountryByIso(iso) {
  return COUNTRY_DIAL_CODES.find((c) => c.iso === iso) || COUNTRY_DIAL_CODES.find((c) => c.iso === 'IN') || COUNTRY_DIAL_CODES[0]
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

export function filterCountries(query) {
  const q = query.trim().toLowerCase()
  if (!q) return COUNTRY_DIAL_CODES

  const dialQuery = q.startsWith('+') ? q : `+${q.replace(/\D/g, '')}`

  return COUNTRY_DIAL_CODES.filter((country) => {
    const name = country.name.toLowerCase()
    const iso = country.iso.toLowerCase()
    const dial = country.dial.toLowerCase()
    return name.includes(q)
      || iso.includes(q)
      || dial.includes(dialQuery)
      || dial.replace('+', '').includes(q.replace(/\D/g, ''))
  })
}
