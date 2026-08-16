import { runInBackground } from './jobQueue.js'
import { runTaskRecurrenceJob } from './taskRecurrenceJob.js'
import { runTaskReminderJob } from './taskReminderJob.js'

const RECURRENCE_INTERVAL_MS = 60 * 60 * 1000
const REMINDER_INTERVAL_MS = 15 * 60 * 1000

let recurrenceTimer = null
let reminderTimer = null
let started = false

function scheduleRecurrence() {
  runInBackground(async () => {
    try {
      const result = await runTaskRecurrenceJob()
      if (result.generated > 0) {
        console.log(`[taskScheduler] generated ${result.generated} recurring task instance(s)`)
      }
    } catch (err) {
      console.error('[taskScheduler] recurrence job error:', err)
    }
  })
}

function scheduleReminders() {
  runInBackground(async () => {
    try {
      const result = await runTaskReminderJob()
      if (result.sent > 0) {
        console.log(`[taskScheduler] sent ${result.sent} task reminder(s)`)
      }
    } catch (err) {
      console.error('[taskScheduler] reminder job error:', err)
    }
  })
}

export function startTaskScheduler() {
  if (started) return
  started = true

  scheduleRecurrence()
  scheduleReminders()

  recurrenceTimer = setInterval(scheduleRecurrence, RECURRENCE_INTERVAL_MS)
  reminderTimer = setInterval(scheduleReminders, REMINDER_INTERVAL_MS)

  if (recurrenceTimer.unref) recurrenceTimer.unref()
  if (reminderTimer.unref) reminderTimer.unref()

  console.log('[taskScheduler] started (recurrence hourly, reminders every 15 min)')
}

export function stopTaskScheduler() {
  if (recurrenceTimer) clearInterval(recurrenceTimer)
  if (reminderTimer) clearInterval(reminderTimer)
  recurrenceTimer = null
  reminderTimer = null
  started = false
}
