import { randomUUID } from 'node:crypto'
import { supabaseAdmin } from '../services/supabase.js'

export const IMPORT_JOB_BUCKET = 'import-job-assets'
export const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const TERMINAL = new Set(['completed', 'failed'])

function httpError(message, status = 400) {
  const err = new Error(message)
  err.status = status
  return err
}

function safeFilename(name, fallback = 'import.xlsx') {
  const raw = String(name || fallback).trim() || fallback
  return raw.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 180)
}

export function isTerminalImportStatus(status) {
  return TERMINAL.has(String(status || ''))
}

export function importJobStoragePaths(orgId, jobId, fileName) {
  const id = jobId || randomUUID()
  const safe = safeFilename(fileName, 'import.xlsx')
  const withExt = /\.xlsx$/i.test(safe) ? safe : `${safe}.xlsx`
  return {
    jobId: id,
    sourcePath: `${orgId}/imports/${id}/source-${withExt}`,
    failedPath: `${orgId}/imports/${id}/failed-rows.xlsx`,
  }
}

async function uploadImportFile(path, buffer, contentType = XLSX_CONTENT_TYPE) {
  const { error } = await supabaseAdmin.storage
    .from(IMPORT_JOB_BUCKET)
    .upload(path, buffer, { upsert: true, contentType })
  if (error) throw error
}

export async function downloadImportFile(path) {
  const { data, error } = await supabaseAdmin.storage
    .from(IMPORT_JOB_BUCKET)
    .download(path)
  if (error) throw error
  const arrayBuffer = await data.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

function serializeImportJob(row) {
  if (!row) return null
  const result = row.result_json || null
  return {
    id: row.id,
    org_id: row.org_id,
    user_id: row.user_id,
    template_key: row.template_key,
    file_name: row.file_name,
    status: row.status,
    created: row.created_count ?? result?.created ?? 0,
    updated: row.updated_count ?? result?.updated ?? 0,
    failed: row.failed_count ?? result?.failed ?? 0,
    skipped: row.skipped_count ?? result?.skipped ?? 0,
    error: row.error || null,
    result,
    progress_done: Number(row.progress_done || 0),
    progress_total: Number(row.progress_total || 0),
    progress_percent: (() => {
      const total = Number(row.progress_total || 0)
      const done = Number(row.progress_done || 0)
      if (total <= 0) return null
      return Math.min(100, Math.round((done / total) * 100))
    })(),
    has_failed_file: Boolean(row.failed_path),
    failed_filename: row.failed_filename || null,
    created_at: row.created_at,
    started_at: row.started_at,
    finished_at: row.finished_at,
  }
}

export async function createImportJob({
  orgId,
  userId,
  templateKey,
  fileName,
  buffer,
  context = {},
}) {
  const jobId = randomUUID()
  const paths = importJobStoragePaths(orgId, jobId, fileName)
  await uploadImportFile(paths.sourcePath, buffer)

  const { data, error } = await supabaseAdmin
    .from('import_jobs')
    .insert({
      id: jobId,
      org_id: orgId,
      user_id: userId || null,
      template_key: templateKey,
      file_name: safeFilename(fileName, 'import.xlsx'),
      status: 'queued',
      context: context || {},
      source_path: paths.sourcePath,
    })
    .select('*')
    .single()

  if (error) {
    try {
      await supabaseAdmin.storage.from(IMPORT_JOB_BUCKET).remove([paths.sourcePath])
    } catch {
      /* ignore */
    }
    throw error
  }
  return data
}

export async function getImportJob(orgId, jobId) {
  const { data, error } = await supabaseAdmin
    .from('import_jobs')
    .select('*')
    .eq('org_id', orgId)
    .eq('id', jobId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw httpError('Import job not found', 404)
  return data
}

export async function getImportJobForUser(orgId, jobId, userId, { isOrgAdmin = false } = {}) {
  const row = await getImportJob(orgId, jobId)
  if (!isOrgAdmin && row.user_id && userId && row.user_id !== userId) {
    throw httpError('Import job not found', 404)
  }
  return row
}

export async function listImportJobs(orgId, userId, { isOrgAdmin = false, limit = 30 } = {}) {
  let query = supabaseAdmin
    .from('import_jobs')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(Math.min(100, Math.max(1, Number(limit) || 30)))

  if (!isOrgAdmin && userId) {
    query = query.eq('user_id', userId)
  }

  const { data, error } = await query
  if (error) throw error
  return (data || []).map(serializeImportJob)
}

export async function markImportJobActive(jobId) {
  const { data, error } = await supabaseAdmin
    .from('import_jobs')
    .update({
      status: 'active',
      started_at: new Date().toISOString(),
      error: null,
    })
    .eq('id', jobId)
    .eq('status', 'queued')
    .select('*')
    .maybeSingle()
  if (error) throw error
  return data
}

export async function setImportJobBullmqId(jobId, bullmqJobId) {
  const { error } = await supabaseAdmin
    .from('import_jobs')
    .update({ bullmq_job_id: bullmqJobId || null })
    .eq('id', jobId)
  if (error) throw error
}

export async function updateImportJobProgress(jobId, { done = 0, total = 0 } = {}) {
  const { error } = await supabaseAdmin
    .from('import_jobs')
    .update({
      progress_done: Math.max(0, Number(done) || 0),
      progress_total: Math.max(0, Number(total) || 0),
    })
    .eq('id', jobId)
  if (error) throw error
}

/** Throttled progress writer for workers (avoids a DB write per row). */
export function createThrottledProgressWriter(jobId, { minIntervalMs = 400 } = {}) {
  let lastAt = 0
  let lastDone = -1
  let pending = null
  let timer = null

  const flush = async (done, total, force = false) => {
    const now = Date.now()
    if (!force && done === lastDone && now - lastAt < minIntervalMs) return
    if (!force && now - lastAt < minIntervalMs) {
      pending = { done, total }
      if (!timer) {
        timer = setTimeout(() => {
          timer = null
          if (pending) {
            const next = pending
            pending = null
            flush(next.done, next.total, true).catch(() => {})
          }
        }, minIntervalMs)
        if (timer.unref) timer.unref()
      }
      return
    }
    lastAt = now
    lastDone = done
    pending = null
    await updateImportJobProgress(jobId, { done, total })
  }

  return {
    report(done, total) {
      flush(done, total).catch((err) => {
        console.warn('[importProgress] update failed:', err.message)
      })
    },
    async flush(done, total) {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      await flush(done ?? lastDone, total ?? 0, true)
    },
  }
}

export async function completeImportJob(jobId, {
  result,
  failedBuffer = null,
  failedFilename = null,
} = {}) {
  const row = await getImportJobById(jobId)
  let storedFailedPath = null
  let storedFailedFilename = null
  if (failedBuffer?.length) {
    const paths = importJobStoragePaths(row.org_id, jobId, failedFilename || 'failed-rows.xlsx')
    storedFailedPath = paths.failedPath
    storedFailedFilename = safeFilename(failedFilename || 'failed-rows.xlsx', 'failed-rows.xlsx')
    await uploadImportFile(storedFailedPath, failedBuffer)
  }

  const created = Number(result?.created || 0)
  const updated = Number(result?.updated || 0)
  const failed = Number(result?.failed || 0)
  const skipped = Number(result?.skipped || 0)

  // Strip inline failedFile from persisted result (stored separately)
  const resultJson = result ? { ...result } : {}
  delete resultJson.failedFile

  const processed = created + updated + failed + skipped
  const { data, error } = await supabaseAdmin
    .from('import_jobs')
    .update({
      status: 'completed',
      result_json: resultJson,
      created_count: created,
      updated_count: updated,
      failed_count: failed,
      skipped_count: skipped,
      progress_done: processed,
      progress_total: Math.max(Number(row.progress_total || 0), processed),
      failed_path: storedFailedPath,
      failed_filename: storedFailedFilename,
      finished_at: new Date().toISOString(),
      error: null,
    })
    .eq('id', jobId)
    .select('*')
    .single()
  if (error) throw error
  return data
}

async function getImportJobById(jobId) {
  const { data, error } = await supabaseAdmin
    .from('import_jobs')
    .select('*')
    .eq('id', jobId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw httpError('Import job not found', 404)
  return data
}

export async function failImportJob(jobId, errorMessage) {
  const { data, error } = await supabaseAdmin
    .from('import_jobs')
    .update({
      status: 'failed',
      error: String(errorMessage || 'Import failed').slice(0, 2000),
      finished_at: new Date().toISOString(),
    })
    .eq('id', jobId)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function getImportJobFailedFile(orgId, jobId, userId, { isOrgAdmin = false } = {}) {
  const row = await getImportJobForUser(orgId, jobId, userId, { isOrgAdmin })
  if (!row.failed_path) throw httpError('No failed-rows file for this import', 404)
  const buffer = await downloadImportFile(row.failed_path)
  return {
    filename: row.failed_filename || 'import-failed-rows.xlsx',
    contentType: XLSX_CONTENT_TYPE,
    data: buffer.toString('base64'),
    buffer,
  }
}

export function toPublicImportJob(row) {
  return serializeImportJob(row)
}

export function toClientImportResult(row) {
  const result = row.result_json || {}
  return {
    ...result,
    created: row.created_count ?? result.created ?? 0,
    updated: row.updated_count ?? result.updated ?? 0,
    failed: row.failed_count ?? result.failed ?? 0,
    skipped: row.skipped_count ?? result.skipped ?? 0,
  }
}
