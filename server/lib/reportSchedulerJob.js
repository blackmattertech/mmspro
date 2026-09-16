import { deliverScheduleReport } from './reportDelivery.js'
import { listDueReportSchedules, markScheduleResult } from './reportScheduleService.js'

export async function runReportSchedulerJob(now = new Date()) {
  const due = await listDueReportSchedules(now)
  let sent = 0
  let failed = 0

  for (const schedule of due) {
    try {
      await deliverScheduleReport(schedule, now)
      await markScheduleResult(schedule.id, { now })
      sent += 1
    } catch (err) {
      failed += 1
      try {
        await markScheduleResult(schedule.id, { errorMessage: err.message, now })
      } catch (markErr) {
        console.error('[reportScheduler] failed to record error:', markErr)
      }
      console.error(`[reportScheduler] schedule ${schedule.id} failed:`, err.message)
    }
  }

  return { due: due.length, sent, failed }
}
