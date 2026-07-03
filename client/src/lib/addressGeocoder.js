import { geocodeAddress } from './api'

export async function searchIndianAddresses(query) {
  const text = query?.trim()
  if (!text || text.length < 3) return []
  return geocodeAddress(text)
}
