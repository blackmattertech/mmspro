import { supabaseAdmin } from '../services/supabase.js'
import { createTtlCache } from './ttlCache.js'

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const USER_AGENT = 'MMSPro/1.0 (address-autocomplete)'
const geocodeCache = createTtlCache({ ttlMs: 10 * 60_000, maxEntries: 500 })

function buildAddressLine1(address, fallbackName = '') {
  const road = address.road || address.street || address.pedestrian || address.residential || ''
  const house = address.house_number || ''
  const locality = address.neighbourhood || address.suburb || address.quarter || ''

  if (house && road) return `${house}, ${road}`
  if (road) return road
  if (locality) return locality
  return fallbackName
}

function buildCity(address) {
  return (
    address.city
    || address.town
    || address.village
    || address.hamlet
    || address.municipality
    || address.county
    || address.state_district
    || ''
  )
}

function normalizeResult(item) {
  const address = item.address || {}
  const address_line1 = buildAddressLine1(address, item.name)
  const city = buildCity(address)
  const state = address.state || ''
  const postal_code = address.postcode || ''
  const country = address.country || 'India'

  return {
    id: String(item.place_id),
    label: item.display_name,
    shortLabel: [address_line1, city, state].filter(Boolean).join(', '),
    address_line1,
    address_line2: address.suburb && address.suburb !== city ? address.suburb : '',
    city,
    state,
    postal_code,
    country,
    coords: item.lon && item.lat ? [parseFloat(item.lon), parseFloat(item.lat)] : null,
  }
}

export async function searchIndianAddresses(query) {
  const text = query?.trim()
  if (!text || text.length < 3) return []

  const cacheKey = text.toLowerCase()
  const cached = geocodeCache.get(cacheKey)
  if (cached) return cached

  const url = new URL(NOMINATIM_URL)
  url.searchParams.set('q', text)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('countrycodes', 'in')
  url.searchParams.set('limit', '6')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)

  try {
    const res = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
      },
      signal: controller.signal,
    })

    if (!res.ok) throw new Error('Address search failed')

    const data = await res.json()
    const results = (Array.isArray(data) ? data : []).map(normalizeResult)
    geocodeCache.set(cacheKey, results)
    return results
  } finally {
    clearTimeout(timeout)
  }
}
