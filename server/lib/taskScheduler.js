import { runInBackground } from './jobQueue.js'
import { runTaskRecurrenceJob } from './taskRecurrenceJob.js'
import { runTaskReminderJob } from './taskReminderJob.js'
import { runPmScheduler } from './pmScheduler.js'

const RECURRENCE_INTERVAL_MS = 60 * 60 * 1000
const REMINDER_INTERVAL_MS = 20 * 1000
const PM_INTERVAL_MS = 60 * 1000

let recurrenceTimer = null
let reminderTimer = null
let pmTimer = null
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

function schedulePm() {
  runInBackground(async () => {
    try {
      const result = await runPmScheduler()
      if (result.generated > 0) {
        console.log(`[taskScheduler] generated ${result.generated} scheduled work order(s)`)
      }
    } catch (err) {
      console.error('[taskScheduler] PM scheduler error:', err)
    }
  })
}

export function startTaskScheduler() {
  if (started) return
  started = true

  scheduleRecurrence()
  scheduleReminders()
  schedulePm()

  recurrenceTimer = setInterval(scheduleRecurrence, RECURRENCE_INTERVAL_MS)
  reminderTimer = setInterval(scheduleReminders, REMINDER_INTERVAL_MS)
  pmTimer = setInterval(schedulePm, PM_INTERVAL_MS)

  if (recurrenceTimer.unref) recurrenceTimer.unref()
  if (reminderTimer.unref) reminderTimer.unref()
  if (pmTimer.unref) pmTimer.unref()

  console.log('[taskScheduler] started (recurrence hourly, reminders every 20s, PM every 60s)')
}

export function stopTaskScheduler() {
  if (recurrenceTimer) clearInterval(recurrenceTimer)
  if (reminderTimer) clearInterval(reminderTimer)
  if (pmTimer) clearInterval(pmTimer)
  recurrenceTimer = null
  reminderTimer = null
  pmTimer = null
  started = false
}
