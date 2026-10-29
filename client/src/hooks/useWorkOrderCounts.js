import { useState, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { getWorkOrderCounts } from '../lib/api-work-orders'
import { peekReferenceData, seedReferenceData } from '../lib/referenceDataCache'
import { TAB_COUNTS_EVENT } from '../lib/tabCountEvents'

const EMPTY_COUNTS = {
  received: 0,
  assigned: 0,
  scheduled: 0,
  manual: 0,
}

function normalizeWorkOrderCounts(data) {
  return {
    received: Number(data?.received) || 0,
    assigned: Number(data?.assigned) || 0,
    scheduled: Number(data?.scheduled) || 0,
    manual: Number(data?.manual) || 0,
  }
}

export function useWorkOrderCounts() {
  const location = useLocation()
  const cached = peekReferenceData('tab-counts', { module: 'work_orders' })
  const [counts, setCounts] = useState(cached || EMPTY_COUNTS)
  const [loading, setLoading] = useState(!cached)

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent && !peekReferenceData('tab-counts', { module: 'work_orders' })) setLoading(true)
    try {
      const data = await getWorkOrderCounts()
      const next = normalizeWorkOrderCounts(data)
      setCounts(next)
      seedReferenceData('tab-counts', { module: 'work_orders' }, next)
    } catch {
      setCounts(EMPTY_COUNTS)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    load({ silent: true })
    const onChange = (event) => {
      if (event.detail?.module && event.detail.module !== 'work_orders') return
      load({ silent: true })
    }
    window.addEventListener(TAB_COUNTS_EVENT, onChange)
    return () => window.removeEventListener(TAB_COUNTS_EVENT, onChange)
  }, [load, location.pathname])

  return { counts, loading, reload: load }
}
