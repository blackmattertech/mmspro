import { createRequire } from 'node:module'
import { createRedisConnection, getRedisUrl, isJobQueueEnabled } from './redis.js'

export const QUEUE_BULK_IMPORT = 'bulk-import'
export const QUEUE_SCHEDULER = 'scheduler'
export const QUEUE_NOTIFICATIONS = 'notifications'

export const JOB_BULK_IMPORT = 'process-import'
export const JOB_NOTIFY_USERS = 'notify-users'

export const SCHEDULER_JOB_NAMES = Object.freeze({
  recurrence: 'task-recurrence',
  reminders: 'task-reminders',
  pm: 'pm-scheduler',
  reports: 'report-schedules',
  warranty: 'warranty-expiry',
})

const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: { count: 200, age: 60 * 60 * 24 * 7 },
  removeOnFail: { count: 500, age: 60 * 60 * 24 * 14 },
}

const queues = new Map()
const require = createRequire(import.meta.url)
let QueueCtor = null

/** Lazy-load BullMQ so Express cold starts do not pay for it until enqueue/worker use. */
function getQueueCtor() {
  if (!QueueCtor) {
    QueueCtor = require('bullmq').Queue
  }
  return QueueCtor
}

function connectionForQueue() {
  const url = getRedisUrl()
  if (!url) return null
  // BullMQ recommends a dedicated connection per Queue/Worker
  return createRedisConnection(url)
}

export function getQueue(name) {
  if (queues.has(name)) return queues.get(name)
  const connection = connectionForQueue()
  if (!connection) return null
  const Queue = getQueueCtor()
  const queue = new Queue(name, {
    connection,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  })
  queues.set(name, queue)
  return queue
}

export function getBulkImportQueue() {
  return getQueue(QUEUE_BULK_IMPORT)
}

export function getSchedulerQueue() {
  return getQueue(QUEUE_SCHEDULER)
}

export function getNotificationsQueue() {
  return getQueue(QUEUE_NOTIFICATIONS)
}

export async function enqueueBulkImportJob(importJobId) {
  const enabled = await isJobQueueEnabled()
  if (!enabled) return null
  const queue = getBulkImportQueue()
  if (!queue) return null
  return queue.add(JOB_BULK_IMPORT, { importJobId }, {
    // BullMQ custom ids cannot contain ":"
    jobId: `import-${importJobId}`,
  })
}

export async function enqueueNotifyUsersJob(payload) {
  const enabled = await isJobQueueEnabled()
  if (!enabled) return null
  const queue = getNotificationsQueue()
  if (!queue) return null
  return queue.add(JOB_NOTIFY_USERS, payload)
}

export async function closeQueues() {
  const list = [...queues.values()]
  queues.clear()
  await Promise.all(list.map(async (queue) => {
    try {
      await queue.close()
    } catch (err) {
      console.warn('[queues] close failed:', err.message)
    }
  }))
}
