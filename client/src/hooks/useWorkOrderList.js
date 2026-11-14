import { useState, useEffect, useCallback, useRef } from 'react'
import {
  getCachedListResponse,
  isListResponseFresh,
  setCachedListResponse,
  listResponseCacheKey,
} from '../lib/listResponseCache'

export function useWorkOrderList(fetchOrders, {
  cacheKey = null,
  onRows = null,
} = {}) {
  const cached = cacheKey ? getCachedListResponse(cacheKey) : null
  const hasCachedRows = Boolean(cached?.data)
  const [orders, setOrders] = useState(() => cached?.data ?? [])
  const [total, setTotal] = useState(() => cached?.data?.total ?? cached?.data?.length ?? 0)
  const [statusCounts, setStatusCounts] = useState(
    () => (Array.isArray(cached?.data?.status_counts) ? cached.data.status_counts : []),
  )
  const [loading, setLoading] = useState(() => !hasCachedRows)
  const [error, setError] = useState(null)
  const onRowsRef = useRef(onRows)
  onRowsRef.current = onRows

  const applyRows = useCallback((data) => {
    setOrders(data)
    setTotal(data.total ?? data.length)
    setStatusCounts(Array.isArray(data.status_counts) ? data.status_counts : [])
    if (typeof onRowsRef.current === 'function') {
      const rows = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : [])
      onRowsRef.current(rows)
    }
  }, [])

  const load = useCallback(async ({ silent = false } = {}) => {
    const entry = cacheKey ? getCachedListResponse(cacheKey) : null
    const hasAnyCache = Boolean(entry?.data)
    if (!silent && !hasAnyCache) setLoading(true)
    setError(null)
    try {
      const data = await fetchOrders()
      applyRows(data)
      if (cacheKey) setCachedListResponse(cacheKey, data)
    } catch (err) {
      setError(err.message)
      setStatusCounts([])
    } finally {
      if (!silent) setLoading(false)
    }
  }, [fetchOrders, cacheKey, applyRows])

  useEffect(() => {
    if (cacheKey) {
      const entry = getCachedListResponse(cacheKey)
      if (entry?.data) {
        applyRows(entry.data)
        load({ silent: true })
        return
      }
    }
    load()
  }, [load, cacheKey, applyRows])

  return { orders, total, statusCounts, loading, error, reload: load }
}

export { listResponseCacheKey }

export function useWorkOrderDetail(id, fetchDetail) {
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const data = await fetchDetail(id)
      setDetail(data)
    } catch (err) {
      setError(err.message)
      setDetail(null)
    } finally {
      setLoading(false)
    }
  }, [id, fetchDetail])

  useEffect(() => {
    load()
  }, [load])

  return { detail, loading, error, reload: load }
}
