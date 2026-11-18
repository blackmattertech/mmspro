import {
  downloadImportFile,
  markImportJobActive,
  completeImportJob,
  failImportJob,
  isTerminalImportStatus,
  toClientImportResult,
  getImportJobFailedFile,
  createThrottledProgressWriter,
  updateImportJobProgress,
} from '../importJobService.js'
import { runImportTemplateForWorker } from '../importBulkRegistry.js'
import { countExcelDataRows } from '../excelTemplate.js'
import { runWithImportProgress } from '../importProgressContext.js'
import { supabaseAdmin } from '../../services/supabase.js'

async function loadJobRow(importJobId) {
  const { data, error } = await supabaseAdmin
    .from('import_jobs')
    .select('*')
    .eq('id', importJobId)
    .maybeSingle()
  if (error) throw error
  if (!data) {
    const err = new Error(`Import job ${importJobId} not found`)
    err.status = 404
    throw err
  }
  return data
}

/**
 * Process a stored import job. Idempotent for terminal statuses.
 * @returns {Promise<object>} client-shaped result (with optional failedFile when inline)
 */
export async function processImportJobById(importJobId, { inline = false } = {}) {
  let row = await loadJobRow(importJobId)
  if (isTerminalImportStatus(row.status)) {
    const result = toClientImportResult(row)
    if (inline && row.failed_path) {
      try {
        const failed = await getImportJobFailedFile(row.org_id, row.id, row.user_id, { isOrgAdmin: true })
        result.failedFile = {
          filename: failed.filename,
          contentType: failed.contentType,
          data: failed.data,
        }
      } catch {
        /* ignore */
      }
    }
    return result
  }

  if (row.status === 'queued') {
    const activated = await markImportJobActive(importJobId)
    if (activated) row = activated
  }

  const progress = createThrottledProgressWriter(importJobId)

  try {
    const buffer = await downloadImportFile(row.source_path)
    let total = 0
    try {
      total = await countExcelDataRows(buffer)
    } catch {
      total = 0
    }
    await updateImportJobProgress(importJobId, { done: 0, total })

    const ctx = { ...(row.context || {}), onProgress: (done, tot) => progress.report(done, tot || total) }
    const { result, failedBuffer, failedFilename } = await runWithImportProgress(
      (done, tot) => progress.report(done, tot || total),
      () => runImportTemplateForWorker(
        row.template_key,
        row.org_id,
        buffer,
        ctx,
      ),
    )
    await progress.flush(
      (result?.created || 0) + (result?.updated || 0) + (result?.failed || 0) + (result?.skipped || 0),
      total || undefined,
    )
    const completed = await completeImportJob(importJobId, {
      result,
      failedBuffer,
      failedFilename,
    })
    const clientResult = toClientImportResult(completed)
    if (inline && failedBuffer?.length) {
      clientResult.failedFile = {
        filename: failedFilename,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        data: failedBuffer.toString('base64'),
      }
    }
    return clientResult
  } catch (err) {
    await failImportJob(importJobId, err.message).catch((failErr) => {
      console.error('[bulkImport] failImportJob error:', failErr.message)
    })
    throw err
  }
}

export async function handleBulkImportJob(job) {
  const importJobId = job?.data?.importJobId
  if (!importJobId) {
    throw new Error('bulk-import job missing importJobId')
  }
  return processImportJobById(importJobId)
}
