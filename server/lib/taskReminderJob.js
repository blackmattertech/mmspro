import { supabaseAdmin } from '../services/supabase.js'
import { notifyUser } from '../services/notifications.js'

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
        created_by_profile_id
      )
    `)
    .lte('remind_at', now)
    .is('sent_at', null)
    .not('remind_at', 'is', null)
    .limit(200)

  if (error) throw error
  if (!dueReminders?.length) return { sent: 0 }

  let sent = 0

  for (const reminder of dueReminders) {
    const task = reminder.task
    if (!task) continue

    try {
      const { data: assignees } = await supabaseAdmin
        .from('task_assignees')
        .select('employee:employee_id (profile_id)')
        .eq('task_id', task.id)

      const profileIds = new Set()
      if (task.created_by_profile_id) profileIds.add(task.created_by_profile_id)
      for (const row of assignees || []) {
        if (row.employee?.profile_id) profileIds.add(row.employee.profile_id)
      }

      const label = task.task_number ? `${task.task_number}: ` : ''
      const body = `${label}${task.title || 'Task'} is due soon`

      await Promise.all([...profileIds].map((profileId) => notifyUser(profileId, {
        title: 'Task reminder',
        body,
        data: { type: 'task_reminder', task_id: task.id },
      }).catch(() => {})))

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
