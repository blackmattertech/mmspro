export function validateTaskForm(values, { isEdit = false } = {}) {
  const errors = {}

  if (!String(values.title || '').trim()) {
    errors.title = 'Task title is required'
  }
  if (!values.category_id) {
    errors.category_id = 'Category is required'
  }
  if (!String(values.detailed_description || '').trim()) {
    errors.detailed_description = 'Description is required'
  }
  if (!values.priority_id) {
    errors.priority_id = 'Priority is required'
  }
  if (!values.start_date) {
    errors.start_date = 'Start date is required'
  }
  if (!values.due_date) {
    errors.due_date = 'Due date is required'
  }

  if (values.visibility_type === 'team' && !(values.assignee_employee_ids || []).length) {
    errors.assignee_employee_ids = 'Select at least one team member'
  }
  if (values.visibility_type === 'department' && !values.department_id) {
    errors.department_id = 'Department is required'
  }
  if (values.visibility_type === 'location' && !values.location_id) {
    errors.location_id = 'Location is required'
  }

  if (values.task_type === 'recurring') {
    if (!values.recurrence?.frequency) {
      errors.recurrence = 'Recurrence pattern is required'
    }
    if (!values.recurrence?.never_ends && !values.recurrence?.recurrence_end_date && !isEdit) {
      errors.recurrence_end = 'End date is required unless repeat never ends'
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  }
}

export function buildTaskPayload(values, { isEdit = false } = {}) {
  const payload = {
    title: values.title?.trim(),
    short_description: values.short_description?.trim() || undefined,
    detailed_description: values.detailed_description?.trim(),
    visibility_type: values.visibility_type,
    task_type: values.task_type,
    category_id: values.category_id || undefined,
    priority_id: values.priority_id || undefined,
    vendor_id: values.vendor_id || undefined,
    start_date: values.start_date || undefined,
    start_time: values.start_time || undefined,
    due_date: values.due_date || undefined,
    due_time: values.due_time || undefined,
    department_id: values.department_id || undefined,
    location_id: values.location_id || undefined,
    assignee_employee_ids: values.assignee_employee_ids,
    tag_ids: values.tag_ids || [],
    reminders: values.reminders || [],
    links: values.links,
    references: (values.references || []).filter(
      (ref) => ref.reference_type && (ref.reference_number || ref.reference_entity_id || ref.reference_label),
    ),
    follow_up_remarks: values.follow_up_remarks?.trim() || undefined,
    next_action: values.next_action?.trim() || undefined,
    completion_remarks: values.completion_remarks?.trim() || undefined,
    recurrence: values.task_type === 'recurring' ? values.recurrence : undefined,
  }

  if (!isEdit && values.status_id) {
    payload.status_id = values.status_id
  }

  return payload
}
