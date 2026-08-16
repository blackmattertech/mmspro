import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { invalidateTasksBootstrapCache } from '../lib/tasksBootstrapCache'

const TaskMetaContext = createContext(null)

const EMPTY_META = {
  statuses: [],
  priorities: [],
  categories: [],
  tags: [],
}

export function TaskMetaProvider({ children }) {
  const [meta, setMeta] = useState(EMPTY_META)
  const [hydrated, setHydrated] = useState(false)

  const hydrate = useCallback((payload = {}) => {
    setMeta({
      statuses: payload.statuses || [],
      priorities: payload.priorities || [],
      categories: payload.categories || [],
      tags: payload.tags || [],
    })
    setHydrated(true)
  }, [])

  const patchMeta = useCallback((patch) => {
    setMeta((prev) => ({ ...prev, ...patch }))
    setHydrated(true)
    invalidateTasksBootstrapCache()
  }, [])

  const reset = useCallback(() => {
    setMeta(EMPTY_META)
    setHydrated(false)
    invalidateTasksBootstrapCache()
  }, [])

  const value = useMemo(() => ({
    ...meta,
    hydrated,
    hydrate,
    patchMeta,
    reset,
    activeStatuses: meta.statuses.filter((row) => row.is_active !== false),
    activePriorities: meta.priorities.filter((row) => row.is_active !== false),
    activeCategories: meta.categories.filter((row) => row.is_active !== false),
    activeTags: meta.tags.filter((row) => row.is_active !== false),
  }), [meta, hydrated, hydrate, patchMeta, reset])

  return (
    <TaskMetaContext.Provider value={value}>
      {children}
    </TaskMetaContext.Provider>
  )
}

export function useTaskMetaContext() {
  return useContext(TaskMetaContext)
}
