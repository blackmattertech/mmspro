import { useCallback, useEffect, useState } from 'react'
import {
  getTaskStatuses,
  getTaskPriorities,
  getTaskCategories,
  getTaskTags,
  createTaskStatus,
  updateTaskStatus,
  deleteTaskStatus,
  reorderTaskStatuses,
  createTaskPriority,
  updateTaskPriority,
  deleteTaskPriority,
  reorderTaskPriorities,
  resetTaskStatuses,
  resetTaskPriorities,
  createTaskCategory,
  updateTaskCategory,
  deleteTaskCategory,
  reorderTaskCategories,
  resetTaskCategories,
  createTaskTag,
  updateTaskTag,
  deleteTaskTag,
  reorderTaskTags,
  resetTaskTags,
} from '../lib/api-tasks'
import { useTaskMetaContext } from '../context/TaskMetaContext'

function sortMetaRows(rows) {
  return [...rows].sort((a, b) => {
    const orderDiff = (a.sort_order ?? 0) - (b.sort_order ?? 0)
    if (orderDiff !== 0) return orderDiff
    return String(a.name || '').localeCompare(String(b.name || ''))
  })
}

export function useTaskMeta({ includeInactive = false } = {}) {
  const taskMeta = useTaskMetaContext()
  const canUseShared = !includeInactive && taskMeta?.hydrated

  const [statuses, setStatuses] = useState(() => (canUseShared ? taskMeta.statuses : []))
  const [priorities, setPriorities] = useState(() => (canUseShared ? taskMeta.priorities : []))
  const [categories, setCategories] = useState(() => (canUseShared ? taskMeta.categories : []))
  const [tags, setTags] = useState(() => (canUseShared ? taskMeta.tags : []))
  const [loading, setLoading] = useState(!canUseShared)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const syncShared = useCallback((patch) => {
    if (!includeInactive) {
      taskMeta?.patchMeta?.(patch)
    }
  }, [includeInactive, taskMeta])

  useEffect(() => {
    if (!includeInactive && taskMeta?.hydrated) {
      setStatuses(taskMeta.statuses)
      setPriorities(taskMeta.priorities)
      setCategories(taskMeta.categories)
      setTags(taskMeta.tags)
      setLoading(false)
    }
  }, [
    includeInactive,
    taskMeta?.hydrated,
    taskMeta?.statuses,
    taskMeta?.priorities,
    taskMeta?.categories,
    taskMeta?.tags,
  ])

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!includeInactive && taskMeta?.hydrated) {
      setStatuses(taskMeta.statuses)
      setPriorities(taskMeta.priorities)
      setCategories(taskMeta.categories)
      setTags(taskMeta.tags)
      if (!silent) setLoading(false)
      return
    }

    if (!silent) setLoading(true)
    setError(null)
    try {
      const inactiveParams = includeInactive ? { include_inactive: 'true' } : {}
      const [statusRows, priorityRows, categoryRows, tagRows] = await Promise.all([
        getTaskStatuses(inactiveParams),
        getTaskPriorities(inactiveParams),
        getTaskCategories(inactiveParams),
        getTaskTags(inactiveParams),
      ])
      setStatuses(statusRows)
      setPriorities(priorityRows)
      setCategories(categoryRows)
      setTags(tagRows)
      if (!includeInactive) {
        syncShared({
          statuses: statusRows,
          priorities: priorityRows,
          categories: categoryRows,
          tags: tagRows,
        })
      }
    } catch (err) {
      setError(err.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [includeInactive, syncShared, taskMeta])

  useEffect(() => {
    if (!includeInactive && taskMeta?.hydrated) return
    load()
  }, [load, includeInactive, taskMeta?.hydrated])

  const wrapSave = async (fn) => {
    setSaving(true)
    setError(null)
    try {
      return await fn()
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setSaving(false)
    }
  }

  return {
    statuses,
    priorities,
    categories,
    tags,
    activeStatuses: statuses.filter((s) => s.is_active),
    activePriorities: priorities.filter((p) => p.is_active),
    activeCategories: categories.filter((c) => c.is_active),
    activeTags: tags.filter((t) => t.is_active),
    loading,
    error,
    saving,
    reload: load,
    createStatus: (data) => wrapSave(async () => {
      const row = await createTaskStatus(data)
      setStatuses((prev) => {
        const next = sortMetaRows([...prev, row])
        syncShared({ statuses: next })
        return next
      })
      return row
    }),
    updateStatus: (id, data) => wrapSave(async () => {
      const row = await updateTaskStatus(id, data)
      setStatuses((prev) => {
        const next = sortMetaRows(prev.map((item) => (item.id === id ? row : item)))
        syncShared({ statuses: next })
        return next
      })
      return row
    }),
    deleteStatus: (id) => wrapSave(async () => {
      await deleteTaskStatus(id)
      setStatuses((prev) => {
        const next = prev.filter((row) => row.id !== id)
        syncShared({ statuses: next })
        return next
      })
      return { ok: true }
    }),
    reorderStatuses: (ids) => wrapSave(async () => {
      const rows = await reorderTaskStatuses(ids)
      setStatuses(rows)
      syncShared({ statuses: rows })
      return rows
    }),
    createPriority: (data) => wrapSave(async () => {
      const row = await createTaskPriority(data)
      setPriorities((prev) => {
        const next = sortMetaRows([...prev, row])
        syncShared({ priorities: next })
        return next
      })
      return row
    }),
    updatePriority: (id, data) => wrapSave(async () => {
      const row = await updateTaskPriority(id, data)
      setPriorities((prev) => {
        const next = sortMetaRows(prev.map((item) => (item.id === id ? row : item)))
        syncShared({ priorities: next })
        return next
      })
      return row
    }),
    deletePriority: (id) => wrapSave(async () => {
      await deleteTaskPriority(id)
      setPriorities((prev) => {
        const next = prev.filter((row) => row.id !== id)
        syncShared({ priorities: next })
        return next
      })
      return { ok: true }
    }),
    reorderPriorities: (ids) => wrapSave(async () => {
      const rows = await reorderTaskPriorities(ids)
      setPriorities(rows)
      syncShared({ priorities: rows })
      return rows
    }),
    createCategory: (data) => wrapSave(async () => {
      const row = await createTaskCategory(data)
      setCategories((prev) => {
        const next = sortMetaRows([...prev, row])
        syncShared({ categories: next })
        return next
      })
      return row
    }),
    updateCategory: (id, data) => wrapSave(async () => {
      const row = await updateTaskCategory(id, data)
      setCategories((prev) => {
        const next = sortMetaRows(prev.map((item) => (item.id === id ? row : item)))
        syncShared({ categories: next })
        return next
      })
      return row
    }),
    deleteCategory: (id) => wrapSave(async () => {
      await deleteTaskCategory(id)
      setCategories((prev) => {
        const next = prev.filter((row) => row.id !== id)
        syncShared({ categories: next })
        return next
      })
      return { ok: true }
    }),
    reorderCategories: (ids) => wrapSave(async () => {
      const rows = await reorderTaskCategories(ids)
      setCategories(rows)
      syncShared({ categories: rows })
      return rows
    }),
    createTag: (data) => wrapSave(async () => {
      const row = await createTaskTag(data)
      setTags((prev) => {
        const next = sortMetaRows([...prev, row])
        syncShared({ tags: next })
        return next
      })
      return row
    }),
    updateTag: (id, data) => wrapSave(async () => {
      const row = await updateTaskTag(id, data)
      setTags((prev) => {
        const next = sortMetaRows(prev.map((item) => (item.id === id ? row : item)))
        syncShared({ tags: next })
        return next
      })
      return row
    }),
    deleteTag: (id) => wrapSave(async () => {
      await deleteTaskTag(id)
      setTags((prev) => {
        const next = prev.filter((row) => row.id !== id)
        syncShared({ tags: next })
        return next
      })
      return { ok: true }
    }),
    reorderTags: (ids) => wrapSave(async () => {
      const rows = await reorderTaskTags(ids)
      setTags(rows)
      syncShared({ tags: rows })
      return rows
    }),
    resetStatuses: () => wrapSave(async () => {
      const rows = await resetTaskStatuses()
      setStatuses(rows)
      syncShared({ statuses: rows })
      return rows
    }),
    resetPriorities: () => wrapSave(async () => {
      const rows = await resetTaskPriorities()
      setPriorities(rows)
      syncShared({ priorities: rows })
      return rows
    }),
    resetCategories: () => wrapSave(async () => {
      const rows = await resetTaskCategories()
      setCategories(rows)
      syncShared({ categories: rows })
      return rows
    }),
    resetTags: () => wrapSave(async () => {
      const rows = await resetTaskTags()
      setTags(rows)
      syncShared({ tags: rows })
      return rows
    }),
    resetAll: () => wrapSave(async () => {
      const [statusRows, priorityRows, categoryRows, tagRows] = await Promise.all([
        resetTaskStatuses(),
        resetTaskPriorities(),
        resetTaskCategories(),
        resetTaskTags(),
      ])
      setStatuses(statusRows)
      setPriorities(priorityRows)
      setCategories(categoryRows)
      setTags(tagRows)
      syncShared({
        statuses: statusRows,
        priorities: priorityRows,
        categories: categoryRows,
        tags: tagRows,
      })
      return { statuses: statusRows, priorities: priorityRows, categories: categoryRows, tags: tagRows }
    }),
  }
}
