import { useState, useEffect, useCallback } from 'react'
import { getCompanyDetails } from '../lib/api'
import { isAtOrOverLimit } from '../lib/orgLimits'

export function useOrgLimits() {
  const [limits, setLimits] = useState(null)
  const [usage, setUsage] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getCompanyDetails()
      setLimits(data.limits || null)
      setUsage(data.usage || null)
    } catch {
      setLimits(null)
      setUsage(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const isResourceAtLimit = useCallback((usageKey, limitKey, currentCount) => {
    if (!limits) return false
    const count = currentCount ?? usage?.[usageKey] ?? 0
    return isAtOrOverLimit(count, limits[limitKey])
  }, [limits, usage])

  return { limits, usage, loading, reload: load, isResourceAtLimit }
}
