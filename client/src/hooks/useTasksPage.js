import { useCallback, useEffect, useState } from 'react'
import { getTasksBootstrap } from '../lib/api-tasks'
import {
  bootstrapCacheKey,
  getCachedBootstrap,
  isBootstrapFresh,
  setCachedBootstrap,
} from '../lib/tasksBootstrapCache'
import { useTaskMetaContext } from '../context/TaskMetaContext'

function applyBootstrapPayload(data, { setStatuses, setPriorities, setCategories, setTags, setBoard, setItems, setTotal, view }) {
  setStatuses(data.statuses || [])
  setPriorities(data.priorities || [])
  setCategories(data.categories || [])
  setTags(data.tags || [])

  if (view === 'kanban') {
    setBoard(data.board || null)
    const tasks = data.board?.columns?.flatMap((col) => col.tasks) || []
    setItems(tasks)
    setTotal(tasks.length)
  } else {
    setBoard(null)
    setItems(data.tasks || [])
    setTotal(data.total ?? data.tasks?.length ?? 0)
  }
}

export function useTasksPage(filters = {}, { mode = 'kanban' } = {}) {
  const taskMeta = useTaskMetaContext()
  const [statuses, setStatuses] = useState([])
  const [priorities, setPriorities] = useState([])
  const [categories, setCategories] = useState([])
  const [tags, setTags] = useState([])
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [board, setBoard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const filterKey = JSON.stringify(filters)
  const view = mode === 'kanban' ? 'kanban' : 'list'
  const cacheKey = bootstrapCacheKey(filters, view)

  const applyData = useCallback((data) => {
    applyBootstrapPayload(data, {
      setStatuses,
      setPriorities,
      setCategories,
      setTags,
      setBoard,
      setItems,
      setTotal,
      view,
    })
    taskMeta?.hydrate?.({
      statuses: data.statuses || [],
      priorities: data.priorities || [],
      categories: data.categories || [],
      tags: data.tags || [],
    })
  }, [taskMeta, view])

  const load = useCallback(async ({ silent = false, force = false } = {}) => {
    if (!force) {
      const cached = getCachedBootstrap(cacheKey)
      if (cached && isBootstrapFresh(cached)) {
        applyData(cached.data)
        setError(null)
        setLoading(false)
        return
      }
    }

    if (!silent) setLoading(true)
    setError(null)
    try {
      const data = await getTasksBootstrap({ ...filters, view })
      setCachedBootstrap(cacheKey, data)
      applyData(data)
    } catch (err) {
      setError(err.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [applyData, cacheKey, filterKey, view])

  useEffect(() => {
    const cached = getCachedBootstrap(cacheKey)
    if (cached) {
      applyData(cached.data)
      setLoading(false)
      if (!isBootstrapFresh(cached)) {
        load({ silent: true, force: true })
      }
      return
    }
    load()
  }, [cacheKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    statuses,
    priorities,
    categories,
    tags,
    activeStatuses: statuses,
    activePriorities: priorities,
    activeCategories: categories,
    activeTags: tags,
    items,
    total,
    board,
    loading,
    error,
    reload: (opts) => load({ ...opts, force: true }),
  }
}

export { useTaskPoll } from './useTasks'
