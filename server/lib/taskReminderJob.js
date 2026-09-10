import { supabaseAdmin } from '../services/supabase.js'
import { notifyUsers } from '../services/notifications.js'
import { listTaskNotifyProfileIds } from './taskNotifyRecipients.js'
import {
  getTaskActorContext,
  loadAssigneeIdsForTasks,
  taskAssignedToActor,
} from './taskVisibility.js'

export async function runTaskReminderJob() {
  const now = new Date().toISOString()

  const { data: dueReminders, error } = await supabaseAdmin
    .from('task_reminders')
    .select(`
      id,
      org_id,
      task_id,
      reminder_type,
      remind_at,
      task:task_id (
        id,
        title,
        task_number,
        short_description,
        due_date,
        due_time,
        created_by_profile_id,
        visibility_type,
        department_id,
        location_id
      )
    `)
    .lte('remind_at', now)
    .is('sent_at', null)
    .not('remind_at', 'is', null)
    .order('remind_at', { ascending: true })
    .limit(100)

  if (error) throw error
  if (!dueReminders?.length) return { sent: 0 }

  const assigneeMap = await loadAssigneeIdsForTasks(
    [...new Set(dueReminders.map((row) => row.task_id).filter(Boolean))],
  )

  let sent = 0

  for (const reminder of dueReminders) {
    const task = reminder.task
    if (!task) continue

    try {
      const assigneeEmployeeIds = assigneeMap.get(task.id) || []
      const profileIds = await listTaskNotifyProfileIds(reminder.org_id, {
        visibilityType: task.visibility_type,
        assigneeEmployeeIds,
        departmentId: task.department_id,
        locationId: task.location_id,
        extraProfileIds: [task.created_by_profile_id],
      })

      const label = task.task_number ? `${task.task_number}: ` : ''
      const body = `${label}${task.title || 'Task'} is due soon`

      await notifyUsers(profileIds, {
        title: 'Task reminder',
        body,
        data: {
          type: 'task_reminder',
          task_id: task.id,
          reminder_id: reminder.id,
          task_number: task.task_number || '',
          due_date: task.due_date || '',
          due_time: task.due_time || '',
          short_description: task.short_description || '',
        },
      })

      await supabaseAdmin
        .from('task_reminders')
        .update({ sent_at: now })
        .eq('id', reminder.id)

      sent += 1
    } catch (err) {
      console.error('[taskReminderJob] failed for reminder', reminder.id, err)
    }
  }

  return { sent }
}

export async function listUpcomingRemindersForUser(orgId, profileId) {
  const actor = await getTaskActorContext(orgId, profileId)
  const now = Date.now()
  const from = new Date(now - 5 * 60 * 1000).toISOString()
  const to = new Date(now + 24 * 60 * 60 * 1000).toISOString()
  const recentlySent = new Date(now - 10 * 60 * 1000).toISOString()

  const { data, error } = await supabaseAdmin
    .from('task_reminders')
    .select(`
      id,
      remind_at,
      reminder_type,
      sent_at,
      task_id,
      task:task_id (
        id,
        title,
        task_number,
        short_description,
        due_date,
        due_time,
        visibility_type,
        department_id,
        location_id,
        created_by_profile_id
      )
    `)
    .eq('org_id', orgId)
    .not('remind_at', 'is', null)
    .gte('remind_at', from)
    .lte('remind_at', to)
    .order('remind_at', { ascending: true })
    .limit(100)

  if (error) throw error

  const rows = (data || []).filter((row) => {
    if (!row.task) return false
    if (!row.sent_at) return true
    return row.sent_at >= recentlySent
  })
  const assigneeMap = await loadAssigneeIdsForTasks(rows.map((row) => row.task.id))

  return rows
    .filter((row) => taskAssignedToActor(row.task, actor, assigneeMap.get(row.task.id) || []))
    .map((row) => ({
      id: row.id,
      remind_at: row.remind_at,
      reminder_type: row.reminder_type,
      task_id: row.task.id,
      title: row.task.title,
      task_number: row.task.task_number,
      short_description: row.task.short_description,
      due_date: row.task.due_date,
      due_time: row.task.due_time,
    }))
}
