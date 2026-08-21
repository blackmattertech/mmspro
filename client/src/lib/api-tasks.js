import { apiFetch } from './api'
import { asListArray } from './listResponse'

function qs(params = {}) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value))
    }
  })
  const suffix = search.toString()
  return suffix ? `?${suffix}` : ''
}

export async function getTasksList(params = {}) {
  const data = await apiFetch(`/api/tasks${qs(params)}`)
  return asListArray(data)
}

export function getTasksKanban(params = {}) {
  return apiFetch(`/api/tasks/kanban${qs(params)}`)
}

export function getTasksBootstrap(params = {}) {
  return apiFetch(`/api/tasks/bootstrap${qs(params)}`)
}

export function getTask(id) {
  return apiFetch(`/api/tasks/${id}`)
}

export function getUpcomingTaskReminders() {
  return apiFetch('/api/tasks/reminders/upcoming')
}

export function createTask(data) {
  return apiFetch('/api/tasks', { method: 'POST', body: JSON.stringify(data) })
}

export function updateTask(id, data) {
  return apiFetch(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export function changeTaskStatus(id, statusId) {
  return apiFetch(`/api/tasks/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status_id: statusId }),
  })
}

export function deleteTask(id) {
  return apiFetch(`/api/tasks/${id}`, { method: 'DELETE' })
}

export function bulkUpdateTasks(payload) {
  return apiFetch('/api/tasks/bulk', { method: 'PATCH', body: JSON.stringify(payload) })
}

export function bulkDeleteTasks(taskIds) {
  return apiFetch('/api/tasks/bulk', {
    method: 'DELETE',
    body: JSON.stringify({ task_ids: taskIds }),
  })
}

export function getTaskStatuses(params = {}) {
  return apiFetch(`/api/tasks/statuses${qs(params)}`)
}

export function getTaskPriorities(params = {}) {
  return apiFetch(`/api/tasks/priorities${qs(params)}`)
}

export function createTaskStatus(data) {
  return apiFetch('/api/tasks/statuses', { method: 'POST', body: JSON.stringify(data) })
}

export function updateTaskStatus(id, data) {
  return apiFetch(`/api/tasks/statuses/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export function deleteTaskStatus(id) {
  return apiFetch(`/api/tasks/statuses/${id}`, { method: 'DELETE' })
}

export function reorderTaskStatuses(orderedIds) {
  return apiFetch('/api/tasks/statuses/reorder', {
    method: 'PATCH',
    body: JSON.stringify({ ordered_ids: orderedIds }),
  })
}

export function resetTaskStatuses() {
  return apiFetch('/api/tasks/statuses/reset', { method: 'POST' })
}

export function createTaskPriority(data) {
  return apiFetch('/api/tasks/priorities', { method: 'POST', body: JSON.stringify(data) })
}

export function updateTaskPriority(id, data) {
  return apiFetch(`/api/tasks/priorities/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export function deleteTaskPriority(id) {
  return apiFetch(`/api/tasks/priorities/${id}`, { method: 'DELETE' })
}

export function reorderTaskPriorities(orderedIds) {
  return apiFetch('/api/tasks/priorities/reorder', {
    method: 'PATCH',
    body: JSON.stringify({ ordered_ids: orderedIds }),
  })
}

export function resetTaskPriorities() {
  return apiFetch('/api/tasks/priorities/reset', { method: 'POST' })
}

export function getTaskCategories(params = {}) {
  return apiFetch(`/api/tasks/categories${qs(params)}`)
}

export function createTaskCategory(data) {
  return apiFetch('/api/tasks/categories', { method: 'POST', body: JSON.stringify(data) })
}

export function updateTaskCategory(id, data) {
  return apiFetch(`/api/tasks/categories/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export function deleteTaskCategory(id) {
  return apiFetch(`/api/tasks/categories/${id}`, { method: 'DELETE' })
}

export function reorderTaskCategories(orderedIds) {
  return apiFetch('/api/tasks/categories/reorder', {
    method: 'PATCH',
    body: JSON.stringify({ ordered_ids: orderedIds }),
  })
}

export function resetTaskCategories() {
  return apiFetch('/api/tasks/categories/reset', { method: 'POST' })
}

export function getTaskTags(params = {}) {
  return apiFetch(`/api/tasks/tags${qs(params)}`)
}

export function createTaskTag(data) {
  return apiFetch('/api/tasks/tags', { method: 'POST', body: JSON.stringify(data) })
}

export function updateTaskTag(id, data) {
  return apiFetch(`/api/tasks/tags/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export function deleteTaskTag(id) {
  return apiFetch(`/api/tasks/tags/${id}`, { method: 'DELETE' })
}

export function reorderTaskTags(orderedIds) {
  return apiFetch('/api/tasks/tags/reorder', {
    method: 'PATCH',
    body: JSON.stringify({ ordered_ids: orderedIds }),
  })
}

export function resetTaskTags() {
  return apiFetch('/api/tasks/tags/reset', { method: 'POST' })
}

export function searchTaskReferences(q, type) {
  return apiFetch(`/api/tasks/references/search${qs({ q, type })}`)
}

export function addTaskComment(taskId, data) {
  return apiFetch(`/api/tasks/${taskId}/comments`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateTaskComment(taskId, commentId, data) {
  return apiFetch(`/api/tasks/${taskId}/comments/${commentId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export function deleteTaskComment(taskId, commentId) {
  return apiFetch(`/api/tasks/${taskId}/comments/${commentId}`, { method: 'DELETE' })
}

export function addTaskAttachment(taskId, data) {
  return apiFetch(`/api/tasks/${taskId}/attachments`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function deleteTaskAttachment(taskId, attachmentId) {
  return apiFetch(`/api/tasks/${taskId}/attachments/${attachmentId}`, { method: 'DELETE' })
}
