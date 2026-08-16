import { useCallback, useEffect, useState } from 'react'
import { getTasksList, getTasksKanban } from '../lib/api-tasks'

export function useTasks(filters = {}, { mode = 'list' } = {}) {
  const [items, setItems] = useState([])
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
      } else {
        const data = await getTasksList(filters)
        setItems(data)
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

  return { items, board, loading, error, reload: load }
}

export function useTaskPoll(callback, intervalMs = 30000, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined

    const poll = () => {
      if (document.visibilityState === 'hidden') return
      callback({ silent: true })
    }

    const onFocus = () => poll()
    window.addEventListener('focus', onFocus)

    const timer = window.setInterval(poll, intervalMs)

    return () => {
      window.removeEventListener('focus', onFocus)
      window.clearInterval(timer)
    }
  }, [callback, intervalMs, enabled])
}
