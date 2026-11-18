import { runTaskRecurrenceJob } from '../taskRecurrenceJob.js'
import { runTaskReminderJob } from '../taskReminderJob.js'
import { runPmScheduler } from '../pmScheduler.js'
import { runReportSchedulerJob } from '../reportSchedulerJob.js'
import { runWarrantyExpiryJob } from '../warrantyExpiryJob.js'
import { SCHEDULER_JOB_NAMES } from '../queues.js'

const HANDLERS = {
  [SCHEDULER_JOB_NAMES.recurrence]: async () => {
    const result = await runTaskRecurrenceJob()
    if (result.generated > 0) {
      console.log(`[scheduler] generated ${result.generated} recurring task instance(s)`)
    }
    return result
  },
  [SCHEDULER_JOB_NAMES.reminders]: async () => {
    const result = await runTaskReminderJob()
    if (result.sent > 0) {
      console.log(`[scheduler] sent ${result.sent} task reminder(s)`)
    }
    return result
  },
  [SCHEDULER_JOB_NAMES.pm]: async () => {
    const result = await runPmScheduler()
    if (result.generated > 0) {
      console.log(`[scheduler] generated ${result.generated} scheduled work order(s)`)
    }
    return result
  },
  [SCHEDULER_JOB_NAMES.reports]: async () => {
    const result = await runReportSchedulerJob()
    if (result.sent > 0 || result.failed > 0) {
      console.log(`[scheduler] report schedules sent=${result.sent} failed=${result.failed}`)
    }
    return result
  },
  [SCHEDULER_JOB_NAMES.warranty]: async () => {
    const result = await runWarrantyExpiryJob()
    if (result.sent > 0) {
      console.log(`[scheduler] sent ${result.sent} warranty expiry alert(s)`)
    }
    return result
  },
}

export async function handleSchedulerJob(job) {
  const name = job?.name
  const handler = HANDLERS[name]
  if (!handler) {
    throw new Error(`Unknown scheduler job: ${name}`)
  }
  return handler()
}

export async function ensureSchedulerRepeatables(schedulerQueue) {
  if (!schedulerQueue) return

  const specs = [
    { name: SCHEDULER_JOB_NAMES.recurrence, every: 60 * 60 * 1000 },
    { name: SCHEDULER_JOB_NAMES.reminders, every: 60 * 1000 },
    { name: SCHEDULER_JOB_NAMES.pm, every: 60 * 1000 },
    { name: SCHEDULER_JOB_NAMES.reports, every: 60 * 1000 },
    { name: SCHEDULER_JOB_NAMES.warranty, every: 60 * 60 * 1000 },
  ]

  for (const spec of specs) {
    // BullMQ custom ids cannot contain ":". Prefer upsertJobScheduler when available.
    const schedulerId = `repeat-${spec.name}`
    if (typeof schedulerQueue.upsertJobScheduler === 'function') {
      await schedulerQueue.upsertJobScheduler(
        schedulerId,
        { every: spec.every },
        {
          name: spec.name,
          data: {},
          opts: {
            removeOnComplete: { count: 50 },
            removeOnFail: { count: 100 },
          },
        },
      )
      continue
    }
    await schedulerQueue.add(
      spec.name,
      {},
      {
        repeat: { every: spec.every },
        jobId: schedulerId,
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 100 },
      },
    )
  }
}
