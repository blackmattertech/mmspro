import { getImportJob, getImportJobFailedFile } from './api-import-jobs'

const TERMINAL = new Set(['completed', 'failed'])

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Normalize bulk upload API responses.
 * Sync: returns the result body as-is.
 * Async (202 `{ jobId }`): polls until terminal and returns the import result.
 */
export async function resolveBulkUploadResponse(response, {
  pollMs = 2000,
  maxWaitMs = 1000 * 60 * 30,
  onStatus,
} = {}) {
  if (!response || typeof response !== 'object') return response

  const jobId = response.jobId || response.job?.id
  const looksAsync = Boolean(jobId) && (
    response.status === 'queued'
    || response.status === 'active'
    || !('created' in response || 'failed' in response || 'errors' in response)
  )

  if (!looksAsync) return response

  const started = Date.now()
  let delay = pollMs
  while (Date.now() - started < maxWaitMs) {
    const payload = await getImportJob(jobId)
    const job = payload.job || payload
    onStatus?.(job)
    if (TERMINAL.has(job.status)) {
      if (job.status === 'failed') {
        const err = new Error(job.error || 'Import failed')
        err.job = job
        throw err
      }
      const result = payload.result || {
        created: job.created || 0,
        updated: job.updated || 0,
        failed: job.failed || 0,
        skipped: job.skipped || 0,
        ...(job.result || {}),
      }
      if (job.has_failed_file) {
        try {
          const failedFile = await getImportJobFailedFile(jobId)
          result.failedFile = failedFile
        } catch {
          /* optional */
        }
      }
      result.jobId = jobId
      return result
    }
    await sleep(delay)
    delay = Math.min(delay + 500, 8000)
  }
  const err = new Error('Import is still running. Check Import status later.')
  err.jobId = jobId
  throw err
}
