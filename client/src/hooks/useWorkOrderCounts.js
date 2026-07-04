import { useState, useEffect, useCallback } from 'react'
import { getWorkOrderCounts } from '../lib/api-work-orders'

export function useWorkOrderCounts() {
  const [counts, setCounts] = useState({
    received: 0,
    assigned: 0,
    scheduled: 0,
    manual: 0,
  })
  const [loading, setLoading] = useState(true)

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    try {
      const data = await getWorkOrderCounts()
      setCounts(data)
    } catch {
      setCounts({ received: 0, assigned: 0, scheduled: 0, manual: 0 })
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { counts, loading, reload: load }
}
