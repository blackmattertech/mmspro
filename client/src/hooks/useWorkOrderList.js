import { useState, useEffect, useCallback } from 'react'

export function useWorkOrderList(fetchOrders) {
  const [orders, setOrders] = useState([])
  const [total, setTotal] = useState(0)
  const [statusCounts, setStatusCounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const data = await fetchOrders()
      setOrders(data)
      setTotal(data.total ?? data.length)
      setStatusCounts(Array.isArray(data.status_counts) ? data.status_counts : [])
    } catch (err) {
      setError(err.message)
      setStatusCounts([])
    } finally {
      if (!silent) setLoading(false)
    }
  }, [fetchOrders])

  useEffect(() => {
    load()
  }, [load])

  return { orders, total, statusCounts, loading, error, reload: load }
}

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
