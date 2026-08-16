import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useOrg } from '../../hooks/useOrg'
import { usePermissions } from '../../hooks/usePermissions'
import { useTaskMeta } from '../../hooks/useTaskMeta'
import { useDepartments } from '../../hooks/useDepartments'
import { useLocations } from '../../hooks/useLocations'
import { useEmployees } from '../../hooks/useEmployees'
import { useVendors } from '../../hooks/useVendors'
import { useAuth } from '../../hooks/useAuth'
import { useProfile, profileDisplayName } from '../../hooks/useProfile'
import { orgPath } from '../../config/navigation'
import { createTask, getTask, updateTask } from '../../lib/api-tasks'
import { syncTaskAttachments, attachmentsFromTask } from '../../lib/taskAttachmentSync'
import { validateTaskForm, buildTaskPayload } from '../../lib/taskFormSchema'
import PageBack from '../../components/shared/PageBack'
import TaskForm, { EMPTY_TASK_FORM } from '../../components/tasks/TaskForm'
import '../../components/company/CompanyShared.css'
import '../../components/tasks/Tasks.css'

function taskToForm(task) {
  if (!task) return { ...EMPTY_TASK_FORM }
  return {
    task_number: task.task_number || '',
    title: task.title || '',
    short_description: task.short_description || '',
    detailed_description: task.detailed_description || '',
    visibility_type: task.visibility_type || 'self',
    task_type: task.task_type || 'one_time',
    status_id: task.status_id || '',
    priority_id: task.priority_id || '',
    category_id: task.category_id || '',
    vendor_id: task.vendor_id || '',
    start_date: task.start_date || '',
    start_time: task.start_time || '',
    due_date: task.due_date || '',
    due_time: task.due_time || '',
    department_id: task.department_id || '',
    location_id: task.location_id || '',
    assignee_employee_ids: (task.assignees || []).map((a) => a.id),
    tag_ids: (task.tags_list || []).map((t) => t.id),
    reminders: task.task_reminders || [],
    links: (task.task_links || []).length
      ? task.task_links.map((link) => ({ title: link.title, url: link.url }))
      : [{ title: '', url: '' }],
    references: (task.task_references || []).length
      ? task.task_references.map((ref) => ({
        reference_type: ref.reference_type,
        reference_number: ref.reference_number || '',
        reference_label: ref.reference_label || '',
        reference_entity_id: ref.reference_entity_id || '',
      }))
      : EMPTY_TASK_FORM.references,
    follow_up_remarks: task.follow_up_remarks || '',
    next_action: task.next_action || '',
    completion_remarks: task.completion_remarks || '',
    recurrence: task.recurrence || EMPTY_TASK_FORM.recurrence,
    attachments: attachmentsFromTask(task),
    removedAttachmentIds: [],
  }
}

export default function TaskFormPage() {
  const { taskId } = useParams()
  const isEdit = Boolean(taskId)
  const navigate = useNavigate()
  const { org } = useOrg()
  const { user } = useAuth()
  const { employee: profileEmployee, avatarUrl, displayName } = useProfile()
  const { canCreate, canUpdate } = usePermissions()
  const canSave = isEdit ? canUpdate('tasks_followups') : canCreate('tasks_followups')
  const {
    activeStatuses,
    activePriorities,
    activeCategories,
    activeTags,
    createTag,
  } = useTaskMeta()
  const { departments } = useDepartments('')
  const { locations } = useLocations()
  const { employees } = useEmployees()
  const { items: vendors } = useVendors()

  const [values, setValues] = useState(() => ({ ...EMPTY_TASK_FORM }))
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!isEdit || !taskId) return undefined
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const task = await getTask(taskId)
        if (!cancelled) setValues(taskToForm(task))
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [isEdit, taskId])

  const currentEmployee = useMemo(() => {
    const fromList = employees.find((e) => e.profile_id === user?.id)
    const base = profileEmployee || fromList
    if (!base) return null

    return {
      ...fromList,
      ...base,
      name: displayName || base.name || fromList?.name,
      photo_signed_url: avatarUrl || base.photo_signed_url || fromList?.photo_signed_url || null,
    }
  }, [employees, user?.id, profileEmployee, avatarUrl, displayName])

  const currentUserName = useMemo(() => {
    if (displayName) return displayName
    if (currentEmployee?.name) return currentEmployee.name
    return profileDisplayName(null, user, currentEmployee)
  }, [displayName, currentEmployee, user])

  const teamMembers = useMemo(() => {
    if (!currentEmployee?.department_id) return employees.filter((e) => e.is_active !== false)
    return employees.filter((e) => (
      e.is_active !== false && e.department_id === currentEmployee.department_id
    ))
  }, [employees, currentEmployee])

  const goBack = () => {
    if (!org?.slug) return
    if (isEdit && taskId) navigate(orgPath(org.slug, `tasks-and-followups/${taskId}`))
    else navigate(orgPath(org.slug, 'tasks-and-followups'))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!canSave) return

    const validation = validateTaskForm(values, { isEdit })
    if (!validation.valid) {
      setError(Object.values(validation.errors)[0])
      return
    }

    setSaving(true)
    setError(null)
    try {
      const {
        attachments,
        removedAttachmentIds,
        ...formValues
      } = values

      const taskPayload = buildTaskPayload(formValues, { isEdit })

      let task
      if (isEdit) {
        task = await updateTask(taskId, taskPayload)
      } else {
        task = await createTask(taskPayload)
      }

      await syncTaskAttachments(task.id, attachments, removedAttachmentIds)
      navigate(orgPath(org.slug, `tasks-and-followups/${task.id}`))
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="company-loading">Loading task…</div>
  }

  return (
    <div className="company-page task-form-page">
      <header className="company-page__header">
        <PageBack onClick={goBack} label="Tasks & Follow-ups" />
        <h1 className="company-page__title">{isEdit ? 'Edit Task' : 'Create Task'}</h1>
        <p className="company-page__subtitle">
          {isEdit
            ? 'Update task details per the Tasks & Follow-ups specification.'
            : 'Create a task with category, assignment, schedule, references, and attachments.'}
        </p>
      </header>
      <div className="company-page__content task-form-page__content">
        <div className="company-panel task-form-page__panel">
          {error && <div className="company-alert" role="alert">{error}</div>}
          <TaskForm
            values={values}
            onChange={setValues}
            statuses={activeStatuses}
            priorities={activePriorities}
            categories={activeCategories}
            tags={activeTags}
            vendors={vendors}
            departments={departments}
            locations={locations}
            teamMembers={teamMembers}
            currentEmployee={currentEmployee}
            currentUserName={currentUserName}
            currentUserAvatar={avatarUrl}
            isEdit={isEdit}
            saving={saving}
            onSubmit={handleSubmit}
            submitLabel={isEdit ? 'Save Changes' : 'Create Task'}
            onCreateTag={createTag}
          />
        </div>
      </div>
    </div>
  )
}
