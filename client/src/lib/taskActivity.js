import { VISIBILITY_OPTIONS } from '../config/tasks'

const FIELD_LABELS = {
  status_id: 'Status',
  priority_id: 'Priority',
  visibility_type: 'Visibility',
  title: 'Title',
  short_description: 'Short description',
  detailed_description: 'Detailed description',
  start_date: 'Start date',
  start_time: 'Start time',
  due_date: 'Due date',
  due_time: 'Due time',
}

function visibilityLabel(value) {
  return VISIBILITY_OPTIONS.find((opt) => opt.value === value)?.label || value
}

export function formatTaskActivityFieldLabel(fieldName) {
  return FIELD_LABELS[fieldName] || fieldName?.replace(/_/g, ' ')
}

export function formatTaskActivityValue(value, fieldName, { statuses = [], priorities = [] } = {}) {
  if (value == null || value === '') return '—'

  if (fieldName === 'status_id') {
    return statuses.find((status) => status.id === value)?.name || String(value)
  }

  if (fieldName === 'priority_id') {
    return priorities.find((priority) => priority.id === value)?.name || String(value)
  }

  if (fieldName === 'visibility_type') {
    return visibilityLabel(value)
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  if (Array.isArray(value)) {
    return value.length ? value.join(', ') : '—'
  }

  if (typeof value === 'object') {
    if (value.title) return value.title
    if (value.file_name) return value.file_name
    if (value.name) return value.name
    return null
  }

  return String(value)
}
