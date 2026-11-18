import { Worker } from 'bullmq'
import {
  QUEUE_BULK_IMPORT,
  QUEUE_SCHEDULER,
  QUEUE_NOTIFICATIONS,
  JOB_BULK_IMPORT,
  JOB_NOTIFY_USERS,
  getSchedulerQueue,
} from '../queues.js'
import { createRedisConnection, getRedisUrl, isJobQueueEnabled } from '../redis.js'
import { handleBulkImportJob } from './bulkImportProcessor.js'
import { handleSchedulerJob, ensureSchedulerRepeatables } from './schedulerProcessor.js'
import { deliverNotifyUsers } from '../../services/notifications.js'

let started = false
let workers = []
let ownsSchedulers = false

export function bullmqWorkersOwnSchedulers() {
  return ownsSchedulers
}

export function shouldStartBullmqWorkers() {
  if (process.env.ENABLE_BULLMQ_WORKER === 'false') return false
  if (process.env.ENABLE_BULLMQ_WORKER === 'true') return true
  // Never start Workers inside Vercel serverless functions
  if (process.env.VERCEL) return false
  return Boolean(getRedisUrl())
}

function connection() {
  return createRedisConnection(getRedisUrl())
}

async function handleNotificationsJob(job) {
  if (job.name !== JOB_NOTIFY_USERS && job.name) {
    // allow default name
  }
  const { userIds, payload } = job.data || {}
  await deliverNotifyUsers(userIds, payload)
}

/**
 * Start BullMQ workers in this process. Safe to call once.
 * @returns {Promise<boolean>} true when workers started
 */
export async function startWorkers() {
  if (started) return true
  if (!shouldStartBullmqWorkers()) {
    console.log('[workers] BullMQ workers not started (REDIS_URL missing, Vercel, or ENABLE_BULLMQ_WORKER=false)')
    return false
  }
  const enabled = await isJobQueueEnabled()
  if (!enabled) {
    console.log('[workers] Redis unavailable — BullMQ workers not started')
    return false
  }

  started = true

  const bulkWorker = new Worker(
    QUEUE_BULK_IMPORT,
    async (job) => {
      if (job.name && job.name !== JOB_BULK_IMPORT) {
        console.warn(`[workers] unexpected bulk job name: ${job.name}`)
      }
      return handleBulkImportJob(job)
    },
    { connection: connection(), concurrency: 2 },
  )

  const schedulerWorker = new Worker(
    QUEUE_SCHEDULER,
    async (job) => handleSchedulerJob(job),
    { connection: connection(), concurrency: 1 },
  )

  const notificationsWorker = new Worker(
    QUEUE_NOTIFICATIONS,
    async (job) => handleNotificationsJob(job),
    { connection: connection(), concurrency: 4 },
  )

  workers = [bulkWorker, schedulerWorker, notificationsWorker]

  for (const worker of workers) {
    worker.on('failed', (job, err) => {
      console.error(`[workers] ${worker.name} job ${job?.id} failed:`, err.message)
    })
    worker.on('error', (err) => {
      console.error(`[workers] ${worker.name} error:`, err.message)
    })
  }

  try {
    await ensureSchedulerRepeatables(getSchedulerQueue())
    ownsSchedulers = true
    console.log('[workers] BullMQ workers started (bulk-import, scheduler, notifications)')
  } catch (err) {
    console.error('[workers] failed to register scheduler repeatables:', err.message)
    ownsSchedulers = false
    console.log('[workers] BullMQ workers started (bulk-import, notifications) — schedulers will use inline timers')
  }

  return true
}

export async function stopWorkers() {
  const list = workers
  workers = []
  started = false
  ownsSchedulers = false
  await Promise.all(list.map(async (worker) => {
    try {
      await worker.close()
    } catch (err) {
      console.warn('[workers] close failed:', err.message)
    }
  }))
}
