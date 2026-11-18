import { isJobQueueEnabled } from './redis.js'
import { enqueueBulkImportJob } from './queues.js'
import {
  createImportJob,
  setImportJobBullmqId,
  toPublicImportJob,
} from './importJobService.js'
import { getImportTemplate, runImportTemplate } from './importBulkRegistry.js'

/**
 * Run a bulk import synchronously or enqueue it when Redis/BullMQ is available.
 *
 * @returns {Promise<{ mode: 'sync', result: object } | { mode: 'async', jobId: string, job: object }>}
 */
export async function enqueueOrRunBulkImport({
  orgId,
  userId,
  templateKey,
  fileName,
  buffer,
  context = {},
  forceSync = false,
} = {}) {
  getImportTemplate(templateKey)

  const wantAsync = !forceSync && await isJobQueueEnabled()
  if (!wantAsync) {
    const result = await runImportTemplate(templateKey, orgId, buffer, context)
    return { mode: 'sync', result }
  }

  let row = null
  try {
    row = await createImportJob({
      orgId,
      userId,
      templateKey,
      fileName: fileName || `${templateKey}.xlsx`,
      buffer,
      context,
    })
  } catch (err) {
    console.warn('[bulkImport] async create failed — sync fallback:', err.message)
    const result = await runImportTemplate(templateKey, orgId, buffer, context)
    return { mode: 'sync', result }
  }

  try {
    const bullJob = await enqueueBulkImportJob(row.id)
    if (!bullJob) {
      // Job row exists — process inline once (do not re-run a second sync import)
      const { processImportJobById } = await import('./workers/bulkImportProcessor.js')
      const result = await processImportJobById(row.id, { inline: true })
      return { mode: 'sync', result }
    }
    await setImportJobBullmqId(row.id, String(bullJob.id))
    return {
      mode: 'async',
      jobId: row.id,
      job: toPublicImportJob(row),
    }
  } catch (err) {
    console.warn('[bulkImport] enqueue failed — processing job inline:', err.message)
    const { processImportJobById } = await import('./workers/bulkImportProcessor.js')
    const result = await processImportJobById(row.id, { inline: true })
    return { mode: 'sync', result }
  }
}

/** Express helper: send sync result or 202 accepted for async jobs. */
export function sendBulkImportResponse(res, outcome) {
  if (outcome.mode === 'async') {
    return res.status(202).json({
      jobId: outcome.jobId,
      status: 'queued',
      job: outcome.job,
    })
  }
  return res.json(outcome.result)
}

/** True when the request forces synchronous processing. */
export function wantsSyncImport(req) {
  if (req.query?.sync === '1' || req.query?.sync === 'true') return true
  if (req.body?.sync === true || req.body?.sync === '1') return true
  return false
}
