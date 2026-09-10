import { runInBackground } from './jobQueue.js'
import { runTaskRecurrenceJob } from './taskRecurrenceJob.js'
import { runTaskReminderJob } from './taskReminderJob.js'
import { runPmScheduler } from './pmScheduler.js'
import { runReportSchedulerJob } from './reportSchedulerJob.js'

const RECURRENCE_INTERVAL_MS = 60 * 60 * 1000
const REMINDER_INTERVAL_MS = 60 * 1000
const PM_INTERVAL_MS = 60 * 1000
const REPORT_INTERVAL_MS = 60 * 1000

let recurrenceTimer = null
let reminderTimer = null
let pmTimer = null
let reportTimer = null
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

function scheduleReports() {
  runInBackground(async () => {
    try {
      const result = await runReportSchedulerJob()
      if (result.sent > 0 || result.failed > 0) {
        console.log(`[taskScheduler] report schedules sent=${result.sent} failed=${result.failed}`)
      }
    } catch (err) {
      console.error('[taskScheduler] report scheduler error:', err)
    }
  })
}

/** True when in-process timers should run (always-on Node, not Vercel Functions). */
export function shouldStartInlineScheduler() {
  if (process.env.ENABLE_TASK_SCHEDULER === 'false') return false
  if (process.env.ENABLE_TASK_SCHEDULER === 'true') return true
  // Vercel sets VERCEL=1 — timers are unreliable / wasteful on serverless
  if (process.env.VERCEL) return false
  return true
}

export async function runAllSchedulerJobs() {
  const [recurrence, reminders, pm, reports] = await Promise.all([
    runTaskRecurrenceJob().catch((err) => {
      console.error('[taskScheduler] recurrence job error:', err)
      return { generated: 0, error: err.message }
    }),
    runTaskReminderJob().catch((err) => {
      console.error('[taskScheduler] reminder job error:', err)
      return { sent: 0, error: err.message }
    }),
    runPmScheduler().catch((err) => {
      console.error('[taskScheduler] PM scheduler error:', err)
      return { generated: 0, error: err.message }
    }),
    runReportSchedulerJob().catch((err) => {
      console.error('[taskScheduler] report scheduler error:', err)
      return { due: 0, sent: 0, failed: 0, error: err.message }
    }),
  ])
  return { recurrence, reminders, pm, reports }
}

export function startTaskScheduler() {
  if (started) return false
  if (!shouldStartInlineScheduler()) {
    console.log('[taskScheduler] inline timers disabled (set ENABLE_TASK_SCHEDULER=true to force)')
    return false
  }
  started = true

  scheduleRecurrence()
  scheduleReminders()
  schedulePm()
  scheduleReports()

  recurrenceTimer = setInterval(scheduleRecurrence, RECURRENCE_INTERVAL_MS)
  reminderTimer = setInterval(scheduleReminders, REMINDER_INTERVAL_MS)
  pmTimer = setInterval(schedulePm, PM_INTERVAL_MS)
  reportTimer = setInterval(scheduleReports, REPORT_INTERVAL_MS)

  if (recurrenceTimer.unref) recurrenceTimer.unref()
  if (reminderTimer.unref) reminderTimer.unref()
  if (pmTimer.unref) pmTimer.unref()
  if (reportTimer.unref) reportTimer.unref()

  console.log('[taskScheduler] started (recurrence hourly, reminders/PM/reports every 60s)')
  return true
}

export function stopTaskScheduler() {
  if (recurrenceTimer) clearInterval(recurrenceTimer)
  if (reminderTimer) clearInterval(reminderTimer)
  if (pmTimer) clearInterval(pmTimer)
  if (reportTimer) clearInterval(reportTimer)
  recurrenceTimer = null
  reminderTimer = null
  pmTimer = null
  reportTimer = null
  started = false
}
