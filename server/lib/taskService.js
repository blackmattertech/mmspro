import { supabaseAdmin } from '../services/supabase.js'
import { notifyUser } from '../services/notifications.js'
import { getEmployeeByProfile } from './workRequestService.js'
import { ensureTaskMetaForOrg, listTaskStatuses, listTaskPriorities } from './taskMetaService.js'
import { ensureTaskCategoriesForOrg } from './taskCategoryService.js'
import { syncTaskTagAssignments, loadTagsForTasks } from './taskTagService.js'
import { ensureTaskTagsForOrg } from './taskTagService.js'
import { syncTaskReferences, loadReferencesForTasks } from './taskReferenceService.js'
import { nextTaskNumber } from './taskNumberService.js'
import {
  getTaskActorContext,
  assertTaskVisible,
  loadAssigneeIdsForTasks,
  taskAssignedToActor,
} from './taskVisibility.js'
import { computeRemindAt, computeDueStatus } from './taskDateUtils.js'
import { computeNextOccurrence, normalizeRecurrencePayload } from './taskRecurrence.js'
import {
  uploadTaskAttachment,
  getTaskAttachmentSignedUrl,
  deleteTaskAttachmentFile,
} from './taskAttachmentStorage.js'
import { getSignedUrl, getSignedUrls } from './signedUrlCache.js'
import { applyTaskVisibilityFilter } from './taskListQuery.js'
import {
  ensureOrgTaskDefaultsCached,
  getCachedActiveTaskMeta,
  setCachedActiveTaskMeta,
} from './taskOrgCache.js'

const USER_ASSETS_BUCKET = 'user-assets'
const ORG_ASSETS_BUCKET = 'org-assets'

const TASK_LIST_SELECT = `
  id, org_id, task_number, title, short_description, visibility_type, task_type,
  status_id, priority_id, category_id, vendor_id,
  start_date, start_time, due_date, due_time,
  department_id, location_id, recurrence_series_id, parent_recurring_id,
  is_recurrence_template, completed_at, tags,
  follow_up_remarks, next_action, completion_remarks,
  created_by_profile_id, updated_by_profile_id, created_at, updated_at,
  status:status_id (id, name, color, sort_order, is_terminal),
  priority:priority_id (id, name, icon, color, sort_order),
  category:category_id (id, name, sort_order),
  vendor:vendor_id (id, vendor_code, name),
  department:department_id (id, name, code),
  location:location_id (id, name, code),
  creator:created_by_profile_id (id, email, full_name, avatar_url),
  task_assignees (
    employee_id,
    assigned_by_profile_id,
    employee:employee_id (id, name, emp_id, photo_url, email, mobile),
    assigned_by:assigned_by_profile_id (id, email, full_name)
  )
`

const KANBAN_TASK_SELECT = `
  id, org_id, task_number, title, short_description, visibility_type, task_type,
  status_id, priority_id, category_id,
  due_date, due_time,
  department_id, location_id, parent_recurring_id,
  is_recurrence_template,
  created_by_profile_id, updated_at,
  status:status_id (id, name, color, sort_order, is_terminal),
  priority:priority_id (id, name, icon, color, sort_order),
  category:category_id (id, name, sort_order),
  department:department_id (id, name, code),
  location:location_id (id, name, code),
  creator:created_by_profile_id (id, full_name, avatar_url),
  task_assignees (
    employee_id,
    employee:employee_id (id, name, emp_id, photo_url)
  )
`

function assigneeIdsFromRow(task) {
  return (task.task_assignees || [])
    .map((item) => item.employee_id)
    .filter(Boolean)
}

async function fetchActiveTaskMeta(orgId) {
  const [statuses, priorities, categories, tags] = await Promise.all([
    supabaseAdmin
      .from('task_statuses')
      .select('*')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    supabaseAdmin
      .from('task_priorities')
      .select('*')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    supabaseAdmin
      .from('task_categories')
      .select('*')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    supabaseAdmin
      .from('task_tags')
      .select('*')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
  ])

  if (statuses.error) throw statuses.error
  if (priorities.error) throw priorities.error
  if (categories.error) throw categories.error
  if (tags.error) throw tags.error

  return {
    statuses: statuses.data || [],
    priorities: priorities.data || [],
    categories: categories.data || [],
    tags: tags.data || [],
  }
}

async function queryActiveTaskMeta(orgId) {
  const cached = getCachedActiveTaskMeta(orgId)
  if (cached) return cached

  const meta = await fetchActiveTaskMeta(orgId)
  setCachedActiveTaskMeta(orgId, meta)
  return meta
}

async function ensureOrgTaskDefaults(orgId) {
  await ensureOrgTaskDefaultsCached(orgId, async () => {
    await Promise.all([
      ensureTaskMetaForOrg(orgId),
      ensureTaskCategoriesForOrg(orgId),
      ensureTaskTagsForOrg(orgId),
    ])
  })
}

function trimOrNull(value) {
  const text = String(value ?? '').trim()
  return text || null
}

async function addActivity(orgId, taskId, actorProfileId, actionType, {
  fieldName = null,
  oldValue = null,
  newValue = null,
  metadata = {},
} = {}) {
  const { error } = await supabaseAdmin.from('task_activities').insert({
    org_id: orgId,
    task_id: taskId,
    actor_profile_id: actorProfileId,
    action_type: actionType,
    field_name: fieldName,
    old_value: oldValue,
    new_value: newValue,
    metadata,
  })
  if (error) throw error
}

async function getDefaultStatusAndPriority(orgId) {
  const [statuses, priorities] = await Promise.all([
    listTaskStatuses(orgId),
    listTaskPriorities(orgId),
  ])
  return {
    statusId: statuses.find((s) => s.name === 'Open')?.id || statuses[0]?.id,
    priorityId: priorities.find((p) => p.name === 'Medium')?.id || priorities[0]?.id,
    statuses,
    priorities,
  }
}

function validateTaskPayload(body, { isCreate = false, existing = null } = {}) {
  const title = trimOrNull(body.title ?? existing?.title)
  if (!title) throw Object.assign(new Error('Task title is required'), { status: 400 })

  const detailedDescription = trimOrNull(
    body.detailed_description ?? existing?.detailed_description,
  )
  if (isCreate && !detailedDescription) {
    throw Object.assign(new Error('Task description is required'), { status: 400 })
  }

  const categoryId = body.category_id ?? existing?.category_id
  if (isCreate && !categoryId) {
    throw Object.assign(new Error('Category is required'), { status: 400 })
  }

  const priorityId = body.priority_id ?? existing?.priority_id
  if (isCreate && !priorityId) {
    throw Object.assign(new Error('Priority is required'), { status: 400 })
  }

  const startDate = body.start_date ?? existing?.start_date
  const dueDate = body.due_date ?? existing?.due_date
  if (isCreate && !startDate) {
    throw Object.assign(new Error('Start date is required'), { status: 400 })
  }
  if (isCreate && !dueDate) {
    throw Object.assign(new Error('Due date is required'), { status: 400 })
  }

  const taskType = body.task_type ?? existing?.task_type ?? 'one_time'
  if (taskType === 'recurring' && isCreate) {
    const rec = body.recurrence
    if (!rec?.frequency) {
      throw Object.assign(new Error('Recurrence pattern is required for recurring tasks'), { status: 400 })
    }
    if (!rec.recurrence_start_date && !startDate) {
      throw Object.assign(new Error('Recurrence start date is required'), { status: 400 })
    }
    if (!rec.never_ends && !rec.recurrence_end_date) {
      throw Object.assign(new Error('Recurrence end date is required unless never ends'), { status: 400 })
    }
  } else if (taskType === 'recurring' && body.recurrence) {
    const rec = body.recurrence
    if (!rec?.frequency) {
      throw Object.assign(new Error('Recurrence pattern is required for recurring tasks'), { status: 400 })
    }
  }

  return { title, detailedDescription, categoryId, priorityId, startDate, dueDate, taskType }
}

async function syncRecurrence(orgId, taskId, body, existingTask, startDate) {
  const taskType = body.task_type ?? existingTask?.task_type
  if (taskType !== 'recurring') {
    await supabaseAdmin.from('task_recurrence').delete().eq('task_id', taskId)
    return
  }

  if (!body.recurrence) return

  const rec = normalizeRecurrencePayload(body.recurrence)
  const nextAt = computeNextOccurrence({
    ...rec,
    next_occurrence_at: null,
    recurrence_start_date: rec.recurrence_start_date || startDate,
  })

  const { data: existingRec } = await supabaseAdmin
    .from('task_recurrence')
    .select('id')
    .eq('task_id', taskId)
    .maybeSingle()

  const payload = {
    org_id: orgId,
    task_id: taskId,
    ...rec,
    next_occurrence_at: nextAt,
    updated_at: new Date().toISOString(),
  }

  if (existingRec) {
    const { error } = await supabaseAdmin
      .from('task_recurrence')
      .update(payload)
      .eq('id', existingRec.id)
    if (error) throw error
  } else {
    const { error } = await supabaseAdmin.from('task_recurrence').insert(payload)
    if (error) throw error
  }

  await supabaseAdmin.from('tasks').update({
    is_recurrence_template: true,
    task_type: 'recurring',
  }).eq('id', taskId)
}

async function syncAssignees(orgId, taskId, employeeIds, assignedByProfileId) {
  await supabaseAdmin.from('task_assignees').delete().eq('task_id', taskId)
  const uniqueIds = [...new Set((employeeIds || []).filter(Boolean))]
  if (!uniqueIds.length) return

  const { error } = await supabaseAdmin.from('task_assignees').insert(
    uniqueIds.map((employeeId) => ({
      org_id: orgId,
      task_id: taskId,
      employee_id: employeeId,
      assigned_by_profile_id: assignedByProfileId,
    })),
  )
  if (error) throw error
}

async function syncReminders(orgId, taskId, reminders, dueDate, dueTime) {
  await supabaseAdmin.from('task_reminders').delete().eq('task_id', taskId)
  if (!Array.isArray(reminders) || !reminders.length) return

  const rows = reminders.map((reminder) => ({
    org_id: orgId,
    task_id: taskId,
    reminder_type: reminder.reminder_type || reminder.type,
    custom_minutes_before: reminder.custom_minutes_before ?? null,
    remind_at: computeRemindAt(
      dueDate,
      dueTime,
      reminder.reminder_type || reminder.type,
      reminder.custom_minutes_before,
    ),
  })).filter((row) => row.remind_at)

  if (rows.length) {
    const { error } = await supabaseAdmin.from('task_reminders').insert(rows)
    if (error) throw error
  }
}

async function syncLinks(orgId, taskId, links) {
  await supabaseAdmin.from('task_links').delete().eq('task_id', taskId)
  if (!Array.isArray(links) || !links.length) return

  const rows = links
    .map((link, index) => ({
      org_id: orgId,
      task_id: taskId,
      title: trimOrNull(link.title),
      url: trimOrNull(link.url),
      sort_order: index,
    }))
    .filter((row) => row.title && row.url)

  if (rows.length) {
    const { error } = await supabaseAdmin.from('task_links').insert(rows)
    if (error) throw error
  }
}

async function validateAssignment(orgId, visibilityType, {
  assigneeEmployeeIds,
  departmentId,
  locationId,
  creatorEmployee,
}) {
  if (visibilityType === 'self') {
    return {
      assigneeEmployeeIds: creatorEmployee?.id ? [creatorEmployee.id] : [],
      departmentId: null,
      locationId: null,
    }
  }

  if (visibilityType === 'team') {
    if (!assigneeEmployeeIds?.length) {
      throw Object.assign(new Error('Select at least one team member'), { status: 400 })
    }
    const { data: employees, error } = await supabaseAdmin
      .from('org_employees')
      .select('id, department_id')
      .eq('org_id', orgId)
      .in('id', assigneeEmployeeIds)
      .eq('is_active', true)

    if (error) throw error
    const creatorDept = creatorEmployee?.department_id
    if (creatorDept) {
      const invalid = (employees || []).some((emp) => emp.department_id !== creatorDept)
      if (invalid) {
        throw Object.assign(new Error('Team assignees must be in your department'), { status: 400 })
      }
    }
    return { assigneeEmployeeIds, departmentId: null, locationId: null }
  }

  if (visibilityType === 'department') {
    if (!departmentId) {
      throw Object.assign(new Error('Department is required'), { status: 400 })
    }
    return { assigneeEmployeeIds: [], departmentId, locationId: null }
  }

  if (visibilityType === 'location') {
    if (!locationId) {
      throw Object.assign(new Error('Location is required'), { status: 400 })
    }
    return { assigneeEmployeeIds: [], departmentId: null, locationId }
  }

  throw Object.assign(new Error('Invalid visibility type'), { status: 400 })
}

function profileDisplayName(profile) {
  if (!profile) return null
  if (profile.full_name?.trim()) return profile.full_name.trim()
  if (profile.email) return profile.email.split('@')[0]
  return null
}

async function attachProfileAvatar(orgId, profile) {
  if (!profile?.id) return profile

  let avatarUrl = null
  if (profile.avatar_url) {
    avatarUrl = await getSignedUrl(USER_ASSETS_BUCKET, profile.avatar_url)
  }

  if (!avatarUrl) {
    const { data: employee, error } = await supabaseAdmin
      .from('org_employees')
      .select('photo_url')
      .eq('org_id', orgId)
      .eq('profile_id', profile.id)
      .eq('is_active', true)
      .maybeSingle()

    if (error) throw error
    if (employee?.photo_url) {
      avatarUrl = await getSignedUrl(ORG_ASSETS_BUCKET, employee.photo_url)
    }
  }

  return {
    ...profile,
    avatar_url: avatarUrl || null,
    display_name: profileDisplayName(profile),
  }
}

async function enrichProfilesWithAvatars(orgId, profiles) {
  const unique = [...new Map((profiles || []).filter(Boolean).map((profile) => [profile.id, profile])).values()]
  const enriched = await Promise.all(unique.map((profile) => attachProfileAvatar(orgId, profile)))
  return new Map(enriched.map((profile) => [profile.id, profile]))
}

function enrichTaskRow(row, counts = {}, extras = {}) {
  if (!row) return row
  const assigneeRows = row.task_assignees || []
  const assignees = assigneeRows
    .map((item) => item.employee)
    .filter(Boolean)

  const assignedBy = assigneeRows.map((item) => item.assigned_by).find(Boolean) || row.creator
  const assigned_by_name = profileDisplayName(assignedBy) || profileDisplayName(row.creator) || 'Unknown'

  const dueStatus = computeDueStatus(row)

  return {
    ...row,
    assignees,
    assigned_by_name,
    tags_list: extras.tags || [],
    task_references: extras.references || [],
    comment_count: counts.comment_count || 0,
    attachment_count: counts.attachment_count || 0,
    due_status: dueStatus,
    task_assignees: undefined,
  }
}

async function enrichTasksAssigneePhotos(rows) {
  const photoPaths = []
  for (const row of rows || []) {
    for (const item of row.task_assignees || []) {
      if (item.employee?.photo_url) photoPaths.push(item.employee.photo_url)
    }
  }
  if (!photoPaths.length) return rows

  const signedByPath = await getSignedUrls(ORG_ASSETS_BUCKET, photoPaths)

  return (rows || []).map((row) => ({
    ...row,
    task_assignees: (row.task_assignees || []).map((item) => {
      if (!item.employee?.photo_url) return item
      return {
        ...item,
        employee: {
          ...item.employee,
          photo_signed_url: signedByPath.get(item.employee.photo_url) || null,
        },
      }
    }),
  }))
}

async function enrichTaskAssigneeFallbacks(orgId, rows) {
  const needsFallback = (rows || []).filter(
    (row) => !(row.task_assignees?.length) && row.visibility_type === 'self' && row.creator?.id,
  )
  if (!needsFallback.length) return rows

  const profileIds = [...new Set(needsFallback.map((row) => row.creator.id))]
  const { data: employees, error } = await supabaseAdmin
    .from('org_employees')
    .select('id, name, emp_id, photo_url, profile_id')
    .eq('org_id', orgId)
    .in('profile_id', profileIds)
    .eq('is_active', true)

  if (error) throw error

  const employeeByProfile = new Map((employees || []).map((emp) => [emp.profile_id, emp]))
  const photoPaths = (employees || []).map((emp) => emp.photo_url).filter(Boolean)
  const signedByPath = photoPaths.length
    ? await getSignedUrls(ORG_ASSETS_BUCKET, photoPaths)
    : new Map()

  const creatorsNeedingProfile = needsFallback.filter((row) => !employeeByProfile.has(row.creator.id))
  const profileMap = creatorsNeedingProfile.length
    ? await enrichProfilesWithAvatars(orgId, creatorsNeedingProfile.map((row) => row.creator))
    : new Map()

  return (rows || []).map((row) => {
    if (row.task_assignees?.length || row.visibility_type !== 'self' || !row.creator?.id) {
      return row
    }

    const employee = employeeByProfile.get(row.creator.id)
    if (employee) {
      return {
        ...row,
        task_assignees: [{
          employee_id: employee.id,
          employee: {
            ...employee,
            photo_signed_url: employee.photo_url
              ? signedByPath.get(employee.photo_url) || null
              : null,
          },
        }],
      }
    }

    const enrichedCreator = profileMap.get(row.creator.id)
    if (!enrichedCreator) return row

    return {
      ...row,
      task_assignees: [{
        employee_id: null,
        employee: {
          id: enrichedCreator.id,
          name: enrichedCreator.display_name || profileDisplayName(enrichedCreator),
          emp_id: null,
          photo_signed_url: enrichedCreator.avatar_url || null,
        },
      }],
    }
  })
}

async function loadTaskCountsFallback(taskIds) {
  const map = new Map()
  if (!taskIds.length) return map

  const [comments, attachments] = await Promise.all([
    supabaseAdmin.from('task_comments').select('task_id').in('task_id', taskIds).eq('is_deleted', false),
    supabaseAdmin.from('task_attachments').select('task_id').in('task_id', taskIds),
  ])

  if (comments.error) throw comments.error
  if (attachments.error) throw attachments.error

  for (const id of taskIds) {
    map.set(id, { comment_count: 0, attachment_count: 0 })
  }
  for (const row of comments.data || []) {
    const entry = map.get(row.task_id)
    if (entry) entry.comment_count += 1
  }
  for (const row of attachments.data || []) {
    const entry = map.get(row.task_id)
    if (entry) entry.attachment_count += 1
  }

  return map
}

async function loadTaskCounts(taskIds) {
  if (!taskIds.length) return new Map()

  const { data, error } = await supabaseAdmin.rpc('task_engagement_counts', {
    p_task_ids: taskIds,
  })

  if (!error && data) {
    const map = new Map()
    for (const row of data) {
      map.set(row.task_id, {
        comment_count: Number(row.comment_count) || 0,
        attachment_count: Number(row.attachment_count) || 0,
      })
    }
    for (const id of taskIds) {
      if (!map.has(id)) {
        map.set(id, { comment_count: 0, attachment_count: 0 })
      }
    }
    return map
  }

  return loadTaskCountsFallback(taskIds)
}

export async function listTasks(orgId, profileId, filters = {}, options = {}) {
  const { lean = false, skipEnsure = false, withCount = false } = options

  if (!skipEnsure) {
    await ensureOrgTaskDefaults(orgId)
  }
  const actor = await getTaskActorContext(orgId, profileId)

  const limit = Math.min(200, Math.max(1, Number(filters.limit) || 50))
  const offset = Math.max(0, Number(filters.offset) || 0)
  const select = lean ? KANBAN_TASK_SELECT : TASK_LIST_SELECT
  const empty = withCount ? { items: [], total: 0, limit, offset } : []

  let query = supabaseAdmin
    .from('tasks')
    .select(select, withCount ? { count: 'exact' } : undefined)
    .eq('org_id', orgId)
    .order('updated_at', { ascending: false })

  const scoped = await applyTaskVisibilityFilter(query, orgId, actor, filters.tab)
  if (scoped.empty) return empty
  query = scoped.query

  if (filters.status_id) query = query.eq('status_id', filters.status_id)
  if (filters.priority_id) query = query.eq('priority_id', filters.priority_id)
  if (filters.category_id) query = query.eq('category_id', filters.category_id)
  if (filters.vendor_id) query = query.eq('vendor_id', filters.vendor_id)
  if (filters.visibility_type) query = query.eq('visibility_type', filters.visibility_type)
  if (filters.department_id) query = query.eq('department_id', filters.department_id)
  if (filters.location_id) query = query.eq('location_id', filters.location_id)
  if (filters.task_type) query = query.eq('task_type', filters.task_type)
  if (filters.created_by_profile_id) {
    query = query.eq('created_by_profile_id', filters.created_by_profile_id)
  }
  if (filters.due_from) query = query.gte('due_date', filters.due_from)
  if (filters.due_to) query = query.lte('due_date', filters.due_to)
  if (filters.recurring === 'true') {
    query = query.or('task_type.eq.recurring,parent_recurring_id.not.is.null')
  }

  const searchTerm = String(filters.search || '').trim()
  if (searchTerm) {
    const q = searchTerm.replace(/%/g, '')
    query = query.or(`title.ilike.%${q}%,short_description.ilike.%${q}%,task_number.ilike.%${q}%,detailed_description.ilike.%${q}%`)
  }

  if (filters.tag_id) {
    const { data: taggedTasks, error: tagError } = await supabaseAdmin
      .from('task_tag_assignments')
      .select('task_id')
      .eq('org_id', orgId)
      .eq('tag_id', filters.tag_id)

    if (tagError) throw tagError
    const tagTaskIds = (taggedTasks || []).map((row) => row.task_id)
    if (!tagTaskIds.length) return empty
    query = query.in('id', tagTaskIds)
  }

  const today = new Date().toISOString().slice(0, 10)
  if (filters.overdue === 'true') {
    query = query.lt('due_date', today)
  }
  if (filters.due_today === 'true') {
    query = query.eq('due_date', today)
  }

  query = query.range(offset, offset + limit - 1)

  const { data, error, count } = await query
  if (error) throw error

  let rows = data || []

  const taskIds = rows.map((r) => r.id)
  const [counts, tagsMap, refsMap] = await Promise.all([
    loadTaskCounts(taskIds),
    loadTagsForTasks(taskIds),
    lean ? Promise.resolve(new Map()) : loadReferencesForTasks(taskIds),
  ])
  const withPhotos = await enrichTasksAssigneePhotos(rows)
  const withAssignees = await enrichTaskAssigneeFallbacks(orgId, withPhotos)
  const items = withAssignees.map((row) => enrichTaskRow(row, counts.get(row.id), {
    tags: tagsMap.get(row.id) || [],
    references: refsMap.get(row.id) || [],
  }))
  if (withCount) return { items, total: count || 0, limit, offset }
  return items
}

export async function getTaskDetail(orgId, taskId, profileId) {
  await assertTaskVisible(orgId, taskId, await getTaskActorContext(orgId, profileId))

  const { data, error } = await supabaseAdmin
    .from('tasks')
    .select(`
      ${TASK_LIST_SELECT},
      detailed_description,
      task_recurrence (*),
      task_reminders (*),
      task_links (*),
      task_references (*),
      task_attachments (*),
      task_comments (
        id, parent_comment_id, body, mentions, is_deleted,
        created_by_profile_id, updated_by_profile_id, created_at, updated_at,
        author:created_by_profile_id (id, email, full_name, avatar_url)
      ),
      task_activities (
        id, action_type, field_name, old_value, new_value, metadata,
        actor_profile_id, created_at,
        actor:actor_profile_id (id, email, full_name, avatar_url)
      )
    `)
    .eq('org_id', orgId)
    .eq('id', taskId)
    .maybeSingle()

  if (error) throw error
  if (!data) throw Object.assign(new Error('Task not found'), { status: 404 })

  const attachments = await Promise.all((data.task_attachments || []).map(async (file) => ({
    ...file,
    signed_url: await getTaskAttachmentSignedUrl(file.storage_path),
  })))

  const comments = (data.task_comments || [])
    .filter((c) => !c.is_deleted)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

  const activities = (data.task_activities || [])
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  const profileMap = await enrichProfilesWithAvatars(orgId, [
    ...comments.map((comment) => comment.author),
    ...activities.map((activity) => activity.actor),
  ])

  const enrichedComments = comments.map((comment) => ({
    ...comment,
    author: profileMap.get(comment.author?.id) || comment.author,
  }))

  const enrichedActivities = activities.map((activity) => ({
    ...activity,
    actor: profileMap.get(activity.actor?.id) || activity.actor,
  }))

  const counts = await loadTaskCounts([taskId])
  const tagsMap = await loadTagsForTasks([taskId])
  const [withPhotos] = await enrichTasksAssigneePhotos([data])
  return enrichTaskRow({
    ...withPhotos,
    task_attachments: attachments,
    task_comments: enrichedComments,
    task_activities: enrichedActivities,
    task_links: (data.task_links || []).sort((a, b) => a.sort_order - b.sort_order),
    task_references: (data.task_references || []).sort((a, b) => a.sort_order - b.sort_order),
    task_reminders: data.task_reminders || [],
    recurrence: data.task_recurrence?.[0] || data.task_recurrence || null,
    tags_list: tagsMap.get(taskId) || [],
  }, counts.get(taskId))
}

export async function createTask(orgId, profileId, body) {
  await ensureTaskMetaForOrg(orgId)
  await ensureTaskCategoriesForOrg(orgId)
  const { statusId, priorityId } = await getDefaultStatusAndPriority(orgId)

  const validated = validateTaskPayload(body, { isCreate: true })

  const creatorEmployee = await getEmployeeByProfile(orgId, profileId)
  const visibilityType = body.visibility_type || 'self'

  const assignment = await validateAssignment(orgId, visibilityType, {
    assigneeEmployeeIds: body.assignee_employee_ids,
    departmentId: body.department_id,
    locationId: body.location_id,
    creatorEmployee,
  })

  const taskType = body.task_type === 'recurring' ? 'recurring' : 'one_time'
  const isTemplate = taskType === 'recurring'
  const taskNumber = await nextTaskNumber(orgId)

  const insertPayload = {
    org_id: orgId,
    task_number: taskNumber,
    title: validated.title,
    short_description: trimOrNull(body.short_description),
    detailed_description: validated.detailedDescription,
    visibility_type: visibilityType,
    task_type: taskType,
    status_id: body.status_id || statusId,
    priority_id: body.priority_id || priorityId,
    category_id: validated.categoryId,
    vendor_id: body.vendor_id || null,
    start_date: validated.startDate,
    start_time: body.start_time || null,
    due_date: validated.dueDate,
    due_time: body.due_time || null,
    department_id: assignment.departmentId,
    location_id: assignment.locationId,
    is_recurrence_template: isTemplate,
    follow_up_remarks: trimOrNull(body.follow_up_remarks),
    next_action: trimOrNull(body.next_action),
    completion_remarks: trimOrNull(body.completion_remarks),
    tags: [],
    created_by_profile_id: profileId,
    updated_by_profile_id: profileId,
  }

  const { data: task, error } = await supabaseAdmin
    .from('tasks')
    .insert(insertPayload)
    .select('id')
    .single()

  if (error) throw error

  const taskId = task.id

  if (isTemplate) {
    await supabaseAdmin.from('tasks').update({ recurrence_series_id: taskId }).eq('id', taskId)
  }

  await syncAssignees(orgId, taskId, assignment.assigneeEmployeeIds, profileId)
  await syncReminders(orgId, taskId, body.reminders, insertPayload.due_date, insertPayload.due_time)
  await syncLinks(orgId, taskId, body.links)
  await syncTaskReferences(orgId, taskId, body.references)
  await syncTaskTagAssignments(orgId, taskId, body.tag_ids)

  if (taskType === 'recurring' && body.recurrence) {
    const rec = normalizeRecurrencePayload(body.recurrence)
    const nextAt = computeNextOccurrence({
      ...rec,
      next_occurrence_at: null,
      recurrence_start_date: rec.recurrence_start_date || insertPayload.start_date,
    })

    await supabaseAdmin.from('task_recurrence').insert({
      org_id: orgId,
      task_id: taskId,
      ...rec,
      next_occurrence_at: nextAt,
    })
  }

  await addActivity(orgId, taskId, profileId, 'task_created', {
    newValue: { title: validated.title, task_number: taskNumber },
  })

  try {
    const assigneeIds = assignment.assigneeEmployeeIds || []
    if (assigneeIds.length) {
      const { data: employees } = await supabaseAdmin
        .from('org_employees')
        .select('id, profile_id')
        .in('id', assigneeIds)

      const notifyTargets = (employees || []).filter(
        (emp) => emp.profile_id && emp.profile_id !== profileId,
      )

      setImmediate(() => {
        Promise.all(notifyTargets.map((emp) => notifyUser(emp.profile_id, {
          title: 'Task assigned',
          body: validated.title,
          data: { type: 'task_assigned', task_id: taskId },
        }))).catch(() => {})
      })
    }
  } catch {
    // non-blocking
  }

  return getTaskDetail(orgId, taskId, profileId)
}

export async function updateTask(orgId, taskId, profileId, body) {
  const actor = await getTaskActorContext(orgId, profileId)
  await assertTaskVisible(orgId, taskId, actor)

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('tasks')
    .select('*')
    .eq('org_id', orgId)
    .eq('id', taskId)
    .single()

  if (existingError) throw existingError

  validateTaskPayload(body, { isCreate: false, existing })

  const patch = { updated_by_profile_id: profileId, updated_at: new Date().toISOString() }
  const trackFields = ['title', 'short_description', 'detailed_description', 'status_id', 'priority_id',
    'start_date', 'start_time', 'due_date', 'due_time', 'visibility_type', 'category_id', 'vendor_id',
    'follow_up_remarks', 'next_action', 'completion_remarks']

  for (const field of trackFields) {
    if (body[field] !== undefined) {
      const oldVal = existing[field]
      let newVal = body[field]
      if (['follow_up_remarks', 'next_action', 'completion_remarks', 'short_description', 'detailed_description'].includes(field)) {
        newVal = trimOrNull(newVal)
      }
      if (oldVal !== newVal) {
        patch[field] = newVal
        await addActivity(orgId, taskId, profileId, 'task_updated', {
          fieldName: field,
          oldValue: oldVal,
          newValue: newVal,
        })
      }
    }
  }

  if (Object.keys(patch).length > 2) {
    const { error } = await supabaseAdmin.from('tasks').update(patch).eq('id', taskId)
    if (error) throw error
  }

  if (body.tag_ids !== undefined) {
    await syncTaskTagAssignments(orgId, taskId, body.tag_ids)
  }

  if (body.references !== undefined) {
    await syncTaskReferences(orgId, taskId, body.references)
  }

  if (body.assignee_employee_ids !== undefined || body.department_id !== undefined || body.location_id !== undefined) {
    const visibilityType = body.visibility_type || existing.visibility_type
    const creatorEmployee = await getEmployeeByProfile(orgId, existing.created_by_profile_id)
    const assignment = await validateAssignment(orgId, visibilityType, {
      assigneeEmployeeIds: body.assignee_employee_ids,
      departmentId: body.department_id ?? existing.department_id,
      locationId: body.location_id ?? existing.location_id,
      creatorEmployee,
    })

    await supabaseAdmin.from('tasks').update({
      department_id: assignment.departmentId,
      location_id: assignment.locationId,
      visibility_type: visibilityType,
    }).eq('id', taskId)

    await syncAssignees(orgId, taskId, assignment.assigneeEmployeeIds, profileId)
    await addActivity(orgId, taskId, profileId, 'assignee_changed', {
      newValue: assignment.assigneeEmployeeIds,
    })
  }

  if (body.reminders !== undefined) {
    const dueDate = body.due_date ?? existing.due_date
    const dueTime = body.due_time ?? existing.due_time
    await syncReminders(orgId, taskId, body.reminders, dueDate, dueTime)
  }

  if (body.links !== undefined) {
    await syncLinks(orgId, taskId, body.links)
  }

  if (body.recurrence !== undefined || body.task_type !== undefined) {
    const startDate = body.start_date ?? existing.start_date
    await syncRecurrence(orgId, taskId, body, existing, startDate)
  }

  return getTaskDetail(orgId, taskId, profileId)
}

export async function changeTaskStatus(orgId, taskId, profileId, statusId) {
  const actor = await getTaskActorContext(orgId, profileId)
  await assertTaskVisible(orgId, taskId, actor)

  const { data: status, error: statusError } = await supabaseAdmin
    .from('task_statuses')
    .select('id, is_terminal')
    .eq('org_id', orgId)
    .eq('id', statusId)
    .maybeSingle()

  if (statusError) throw statusError
  if (!status) throw Object.assign(new Error('Status not found'), { status: 400 })

  const { data: existing } = await supabaseAdmin
    .from('tasks')
    .select('status_id')
    .eq('id', taskId)
    .single()

  const patch = {
    status_id: statusId,
    updated_by_profile_id: profileId,
    updated_at: new Date().toISOString(),
    completed_at: status.is_terminal ? new Date().toISOString() : null,
  }

  const { error } = await supabaseAdmin.from('tasks').update(patch).eq('id', taskId)
  if (error) throw error

  await addActivity(orgId, taskId, profileId, 'status_changed', {
    fieldName: 'status_id',
    oldValue: existing?.status_id,
    newValue: statusId,
  })

  return getTaskDetail(orgId, taskId, profileId)
}

export async function deleteTask(orgId, taskId, profileId) {
  const actor = await getTaskActorContext(orgId, profileId)
  await assertTaskVisible(orgId, taskId, actor)

  const { data: task } = await supabaseAdmin
    .from('tasks')
    .select('created_by_profile_id')
    .eq('id', taskId)
    .single()

  if (task?.created_by_profile_id !== profileId) {
    throw Object.assign(new Error('Only the task creator can delete this task'), { status: 403 })
  }

  const { data: attachments } = await supabaseAdmin
    .from('task_attachments')
    .select('storage_path')
    .eq('task_id', taskId)

  const { error } = await supabaseAdmin.from('tasks').delete().eq('id', taskId)
  if (error) throw error

  await Promise.all((attachments || []).map((a) => deleteTaskAttachmentFile(a.storage_path)))
  return { ok: true }
}

export async function bulkUpdateTasks(orgId, profileId, { taskIds, patch }) {
  if (!Array.isArray(taskIds) || !taskIds.length) {
    throw Object.assign(new Error('taskIds required'), { status: 400 })
  }

  const results = []
  for (const taskId of taskIds) {
    if (patch.status_id) {
      results.push(await changeTaskStatus(orgId, taskId, profileId, patch.status_id))
    } else {
      results.push(await updateTask(orgId, taskId, profileId, patch))
    }
  }
  return results
}

export async function bulkDeleteTasks(orgId, profileId, taskIds) {
  if (!Array.isArray(taskIds)) throw Object.assign(new Error('taskIds required'), { status: 400 })
  for (const taskId of taskIds) {
    await deleteTask(orgId, taskId, profileId)
  }
  return { ok: true, deleted: taskIds.length }
}

export async function addTaskComment(orgId, taskId, profileId, { body, parentCommentId, mentions }) {
  await assertTaskVisible(orgId, taskId, await getTaskActorContext(orgId, profileId))
  const text = trimOrNull(body)
  if (!text) throw Object.assign(new Error('Comment is required'), { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('task_comments')
    .insert({
      org_id: orgId,
      task_id: taskId,
      parent_comment_id: parentCommentId || null,
      body: text,
      mentions: Array.isArray(mentions) ? mentions : [],
      created_by_profile_id: profileId,
      updated_by_profile_id: profileId,
    })
    .select('*')
    .single()

  if (error) throw error

  await addActivity(orgId, taskId, profileId, 'comment_added', { newValue: { id: data.id } })

  for (const mentionId of data.mentions || []) {
    try {
      await notifyUser(mentionId, {
        title: 'Mentioned in task comment',
        body: text.slice(0, 120),
        data: { type: 'task_mention', task_id: taskId },
      })
    } catch {
      // non-blocking
    }
  }

  return data
}

export async function updateTaskComment(orgId, taskId, commentId, profileId, body) {
  await assertTaskVisible(orgId, taskId, await getTaskActorContext(orgId, profileId))
  const text = trimOrNull(body.body)
  if (!text) throw Object.assign(new Error('Comment is required'), { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('task_comments')
    .update({
      body: text,
      updated_by_profile_id: profileId,
      updated_at: new Date().toISOString(),
    })
    .eq('org_id', orgId)
    .eq('task_id', taskId)
    .eq('id', commentId)
    .eq('created_by_profile_id', profileId)
    .select('*')
    .single()

  if (error) throw error
  if (!data) throw Object.assign(new Error('Comment not found'), { status: 404 })
  return data
}

export async function deleteTaskComment(orgId, taskId, commentId, profileId) {
  await assertTaskVisible(orgId, taskId, await getTaskActorContext(orgId, profileId))

  const { error } = await supabaseAdmin
    .from('task_comments')
    .update({ is_deleted: true, updated_by_profile_id: profileId, updated_at: new Date().toISOString() })
    .eq('org_id', orgId)
    .eq('task_id', taskId)
    .eq('id', commentId)
    .eq('created_by_profile_id', profileId)

  if (error) throw error
  return { ok: true }
}

export async function addTaskAttachment(orgId, taskId, profileId, payload) {
  await assertTaskVisible(orgId, taskId, await getTaskActorContext(orgId, profileId))

  const uploaded = await uploadTaskAttachment(orgId, taskId, payload)

  const { data, error } = await supabaseAdmin
    .from('task_attachments')
    .insert({
      org_id: orgId,
      task_id: taskId,
      file_name: uploaded.fileName,
      storage_path: uploaded.path,
      file_size: uploaded.fileSize,
      content_type: uploaded.contentType,
      uploaded_by_profile_id: profileId,
    })
    .select('*')
    .single()

  if (error) throw error

  await addActivity(orgId, taskId, profileId, 'attachment_added', {
    newValue: { id: data.id, file_name: data.file_name },
  })

  return {
    ...data,
    signed_url: await getTaskAttachmentSignedUrl(data.storage_path),
  }
}

export async function deleteTaskAttachment(orgId, taskId, attachmentId, profileId) {
  await assertTaskVisible(orgId, taskId, await getTaskActorContext(orgId, profileId))

  const { data: file, error: fileError } = await supabaseAdmin
    .from('task_attachments')
    .select('*')
    .eq('org_id', orgId)
    .eq('task_id', taskId)
    .eq('id', attachmentId)
    .maybeSingle()

  if (fileError) throw fileError
  if (!file) throw Object.assign(new Error('Attachment not found'), { status: 404 })

  const { error } = await supabaseAdmin
    .from('task_attachments')
    .delete()
    .eq('id', attachmentId)

  if (error) throw error
  await deleteTaskAttachmentFile(file.storage_path)

  await addActivity(orgId, taskId, profileId, 'attachment_deleted', {
    oldValue: { id: file.id, file_name: file.file_name },
  })

  return { ok: true }
}

export async function getKanbanBoard(orgId, profileId, filters = {}, options = {}) {
  const { skipEnsure = false, statuses: preloadedStatuses = null, tasks: preloadedTasks = null } = options

  const tasks = preloadedTasks ?? await listTasks(
    orgId,
    profileId,
    { ...filters, limit: 200 },
    { lean: true, skipEnsure },
  )

  let activeStatuses = preloadedStatuses
  if (!activeStatuses) {
    if (!skipEnsure) await ensureTaskMetaForOrg(orgId)
    activeStatuses = await listTaskStatuses(orgId)
  }

  return buildKanbanFromTasks(orgId, activeStatuses, tasks)
}

async function buildKanbanFromTasks(orgId, activeStatuses, tasks) {
  const statusById = new Map(activeStatuses.map((status) => [status.id, status]))
  const orphanStatusIds = [...new Set(
    tasks.map((task) => task.status_id).filter((id) => id && !statusById.has(id)),
  )]

  let extraStatuses = []
  if (orphanStatusIds.length) {
    const { data, error } = await supabaseAdmin
      .from('task_statuses')
      .select('*')
      .eq('org_id', orgId)
      .in('id', orphanStatusIds)

    if (error) throw error
    extraStatuses = data || []
  }

  const statuses = [...activeStatuses]
  for (const status of extraStatuses) {
    if (!statusById.has(status.id)) {
      statuses.push(status)
      statusById.set(status.id, status)
    }
  }
  statuses.sort((a, b) => (a.sort_order - b.sort_order) || a.name.localeCompare(b.name))

  const columns = statuses.map((status) => ({
    status,
    tasks: tasks.filter((task) => task.status_id === status.id),
  }))

  const unknownTasks = tasks.filter((task) => !task.status_id || !statusById.has(task.status_id))
  if (unknownTasks.length) {
    columns.push({
      status: {
        id: '__unknown__',
        name: 'Unassigned',
        color: '#6B7280',
        sort_order: 9999,
        is_active: true,
        is_terminal: false,
      },
      tasks: unknownTasks,
    })
  }

  return { columns, statuses }
}

export async function getTasksBootstrap(orgId, profileId, filters = {}, { view = 'kanban' } = {}) {
  await ensureOrgTaskDefaults(orgId)

  if (view === 'list') {
    const [meta, page] = await Promise.all([
      queryActiveTaskMeta(orgId),
      listTasks(orgId, profileId, filters, { lean: true, skipEnsure: true, withCount: true }),
    ])
    return { ...meta, tasks: page.items, total: page.total, board: null }
  }

  const [meta, tasks] = await Promise.all([
    queryActiveTaskMeta(orgId),
    listTasks(orgId, profileId, { ...filters, limit: 200 }, { lean: true, skipEnsure: true }),
  ])

  const board = await buildKanbanFromTasks(orgId, meta.statuses, tasks)
  return { ...meta, board, tasks: null }
}
