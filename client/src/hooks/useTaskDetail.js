import { useCallback, useEffect, useState } from 'react'
import {
  getTask,
  updateTask,
  changeTaskStatus,
  deleteTask,
  addTaskComment,
  updateTaskComment,
  deleteTaskComment,
  addTaskAttachment,
  deleteTaskAttachment,
} from '../lib/api-tasks'

export function useTaskDetail(taskId) {
  const [task, setTask] = useState(null)
  const [loading, setLoading] = useState(Boolean(taskId))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!taskId) return
    if (!silent) setLoading(true)
    setError(null)
    try {
      const data = await getTask(taskId)
      setTask(data)
    } catch (err) {
      setError(err.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [taskId])

  useEffect(() => {
    load()
  }, [load])

  const wrap = async (fn) => {
    setSaving(true)
    setError(null)
    try {
      const data = await fn()
      setTask(data)
      return data
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setSaving(false)
    }
  }

  return {
    task,
    loading,
    saving,
    error,
    reload: load,
    save: (payload) => wrap(() => updateTask(taskId, payload)),
    setStatus: (statusId) => wrap(() => changeTaskStatus(taskId, statusId)),
    remove: () => deleteTask(taskId),
    addComment: async (body) => {
      setSaving(true)
      try {
        await addTaskComment(taskId, body)
        await load({ silent: true })
      } finally {
        setSaving(false)
      }
    },
    editComment: async (commentId, body) => {
      setSaving(true)
      try {
        await updateTaskComment(taskId, commentId, body)
        await load({ silent: true })
      } finally {
        setSaving(false)
      }
    },
    removeComment: async (commentId) => {
      setSaving(true)
      try {
        await deleteTaskComment(taskId, commentId)
        await load({ silent: true })
      } finally {
        setSaving(false)
      }
    },
    uploadAttachment: async (payload) => {
      setSaving(true)
      try {
        await addTaskAttachment(taskId, payload)
        await load({ silent: true })
      } finally {
        setSaving(false)
      }
    },
    removeAttachment: async (attachmentId) => {
      setSaving(true)
      try {
        await deleteTaskAttachment(taskId, attachmentId)
        await load({ silent: true })
      } finally {
        setSaving(false)
      }
    },
  }
}
