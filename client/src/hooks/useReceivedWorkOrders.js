import { useState, useEffect, useCallback } from 'react'
import { getReceivedWorkOrders, getReceivedWorkOrder } from '../lib/api-work-orders'

export function useReceivedWorkOrders() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const data = await getReceivedWorkOrders()
      setOrders(data)
    } catch (err) {
      setError(err.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { orders, loading, error, reload: load }
}

export function useReceivedWorkOrderDetail(id) {
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const data = await getReceivedWorkOrder(id)
      setDetail(data)
    } catch (err) {
      setError(err.message)
      setDetail(null)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  return { detail, loading, error, reload: load }
}
