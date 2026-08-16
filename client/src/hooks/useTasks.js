import { useCallback, useEffect, useRef, useState } from 'react'
import { getTasksList, getTasksKanban } from '../lib/api-tasks'

export function useTasks(filters = {}, { mode = 'list' } = {}) {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [board, setBoard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const filterKey = JSON.stringify(filters)

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      if (mode === 'kanban') {
        const data = await getTasksKanban(filters)
        setBoard(data)
        setItems(data.columns?.flatMap((col) => col.tasks) || [])
        setTotal(data.columns?.reduce((sum, col) => sum + (col.tasks?.length || 0), 0) || 0)
      } else {
        const data = await getTasksList(filters)
        setItems(data)
        setTotal(data.total ?? data.length)
        setBoard(null)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [filterKey, mode])

  useEffect(() => {
    load()
  }, [load])

  return { items, total, board, loading, error, reload: load }
}

export function useTaskPoll(callback, intervalMs = 30000, enabled = true) {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    if (!enabled) return undefined

    const poll = () => {
      if (document.visibilityState === 'hidden') return
      callbackRef.current({ silent: true })
    }

    const onFocus = () => poll()
    window.addEventListener('focus', onFocus)

    const timer = window.setInterval(poll, intervalMs)

    return () => {
      window.removeEventListener('focus', onFocus)
      window.clearInterval(timer)
    }
  }, [intervalMs, enabled])
}
