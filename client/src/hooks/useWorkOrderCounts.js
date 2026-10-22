import { useState, useEffect, useCallback } from 'react'
import { getWorkOrderCounts } from '../lib/api-work-orders'
import { peekReferenceData, seedReferenceData } from '../lib/referenceDataCache'

const EMPTY_COUNTS = {
  received: 0,
  assigned: 0,
  scheduled: 0,
  manual: 0,
}

export function useWorkOrderCounts() {
  const cached = peekReferenceData('tab-counts', { module: 'work_orders' })
  const [counts, setCounts] = useState(cached || EMPTY_COUNTS)
  const [loading, setLoading] = useState(!cached)

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent && !peekReferenceData('tab-counts', { module: 'work_orders' })) setLoading(true)
    try {
      const data = await getWorkOrderCounts()
      setCounts(data)
      seedReferenceData('tab-counts', { module: 'work_orders' }, data)
    } catch {
      setCounts(EMPTY_COUNTS)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { counts, loading, reload: load }
}
