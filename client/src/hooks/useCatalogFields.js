import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/api'
import { fetchReferenceData, peekReferenceData } from '../lib/referenceDataCache'

export function useCatalogFields() {
  const cached = peekReferenceData('catalog-fields', {})
  const [fields, setFields] = useState(() => cached?.fields || [])

  useEffect(() => {
    let cancelled = false
    fetchReferenceData('catalog-fields', {}, () => apiFetch('/api/form-layouts/catalog-fields'))
      .then((data) => {
        if (!cancelled) setFields(data?.fields || [])
      })
      .catch(() => {
        if (!cancelled) setFields([])
      })
    return () => { cancelled = true }
  }, [])

  return fields
}
