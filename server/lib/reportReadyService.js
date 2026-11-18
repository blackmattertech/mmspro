import { randomUUID } from 'node:crypto'
import { supabaseAdmin } from '../services/supabase.js'
import { buildReportExport } from './reportDelivery.js'
import { getReportCatalog, isMissingReportTable } from './reportConstants.js'

export const REPORT_READY_BUCKET = 'report-ready-assets'

function httpError(message, status = 400) {
  const err = new Error(message)
  err.status = status
  return err
}

function safeFilename(name, fallback) {
  const raw = String(name || fallback || 'report').trim() || fallback || 'report'
  return raw.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120)
}

/** Build a display name for a ready report artifact. */
export function buildReadyReportName({ title, period, customName } = {}) {
  const base = String(customName || title || 'Report').trim() || 'Report'
  const window = String(period || '').trim()
  const combined = window ? `${base} (${window})` : base
  return combined.slice(0, 160)
}

export function readyReportStoragePaths(orgId, readyId, pdfFilename, csvFilename) {
  const id = readyId || randomUUID()
  const pdfSafe = safeFilename(pdfFilename, 'report.pdf')
  const csvSafe = safeFilename(csvFilename, 'report.csv')
  return {
    readyId: id,
    pdfPath: `${orgId}/ready/${id}/${pdfSafe.endsWith('.pdf') ? pdfSafe : `${pdfSafe}.pdf`}`,
    csvPath: `${orgId}/ready/${id}/${csvSafe.endsWith('.csv') ? csvSafe : `${csvSafe}.csv`}`,
  }
}

async function uploadReadyFile(path, buffer, contentType) {
  const { error } = await supabaseAdmin.storage
    .from(REPORT_READY_BUCKET)
    .upload(path, buffer, { upsert: false, contentType })
  if (error) throw error
}

async function removeReadyFiles(paths = []) {
  const clean = paths.filter(Boolean)
  if (!clean.length) return
  const { error } = await supabaseAdmin.storage.from(REPORT_READY_BUCKET).remove(clean)
  if (error) throw error
}

function serializeReadyRow(row, { profileId = null, isOrgAdmin = false } = {}) {
  if (!row) return null
  return {
    id: row.id,
    org_id: row.org_id,
    report_key: row.report_key,
    custom_report_id: row.custom_report_id,
    name: row.name,
    date_from: row.date_from,
    date_to: row.date_to,
    filters: row.filters || {},
    columns: row.columns || [],
    row_count: row.row_count || 0,
    truncated: Boolean(row.truncated),
    pdf_filename: row.pdf_filename,
    csv_filename: row.csv_filename,
    byte_size: Number(row.byte_size || 0),
    created_at: row.created_at,
    created_by: row.created_by,
    created_by_name: row.creator?.full_name || row.creator?.name || null,
    can_delete: Boolean(isOrgAdmin || (profileId && row.created_by === profileId)),
  }
}

export async function listReadyReports(orgId, { profileId = null, isOrgAdmin = false, reportKey = null } = {}) {
  let query = supabaseAdmin
    .from('report_ready_reports')
    .select(`
      id, org_id, report_key, custom_report_id, name,
      date_from, date_to, filters, columns, row_count, truncated,
      pdf_filename, csv_filename, byte_size, created_at, created_by,
      creator:created_by ( id, full_name )
    `)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(200)

  if (reportKey) {
    const catalog = getReportCatalog(reportKey)
    if (!catalog) throw httpError('Unknown report', 404)
    query = query.eq('report_key', catalog.key)
  }

  const { data, error } = await query
  if (error) {
    if (isMissingReportTable(error)) return []
    throw error
  }
  return (data || []).map((row) => serializeReadyRow(row, { profileId, isOrgAdmin }))
}

export async function getReadyReport(orgId, id) {
  const { data, error } = await supabaseAdmin
    .from('report_ready_reports')
    .select('*')
    .eq('org_id', orgId)
    .eq('id', id)
    .maybeSingle()
  if (error) {
    if (isMissingReportTable(error)) throw httpError('Ready reports are not available yet', 503)
    throw error
  }
  if (!data) throw httpError('Ready report not found', 404)
  return data
}

export async function createReadyReport({
  orgId,
  profileId,
  session,
  reportKey,
  body = {},
}) {
  const catalog = getReportCatalog(reportKey)
  if (!catalog) throw httpError('Unknown report', 404)

  const bundle = await buildReportExport({
    orgId,
    session,
    reportKey: catalog.key,
    customReportId: body.custom_report_id || undefined,
    dateFrom: body.date_from,
    dateTo: body.date_to,
    search: body.search,
    locationId: body.location_id || body.facility_id,
    filters: {
      date_from: body.date_from,
      date_to: body.date_to,
      location_id: body.location_id || body.facility_id,
      facility_id: body.facility_id || body.location_id,
      search: body.search,
      order_type: body.order_type,
      order_from: body.order_from,
      order_to: body.order_to,
      area_id: body.area_id,
      equipment_id: body.equipment_id,
      equipment_type: body.equipment_type,
      equipment_capacity: body.equipment_capacity,
      equipment_tag: body.equipment_tag,
      priority: body.priority,
      status: body.status || body.job_status,
      job_nature: body.job_nature,
      created_by: body.created_by,
      reported_by: body.reported_by,
      assigned_to: body.assigned_to,
    },
    columns: body.columns,
  })

  const readyId = randomUUID()
  const { pdfPath, csvPath } = readyReportStoragePaths(
    orgId,
    readyId,
    bundle.pdfFilename,
    bundle.csvFilename,
  )
  const pdfBuffer = Buffer.isBuffer(bundle.pdf) ? bundle.pdf : Buffer.from(bundle.pdf)
  const csvBuffer = Buffer.from(bundle.csv || '', 'utf8')
  const byteSize = pdfBuffer.length + csvBuffer.length
  const name = buildReadyReportName({
    title: bundle.title,
    period: bundle.period,
  })

  try {
    await uploadReadyFile(pdfPath, pdfBuffer, 'application/pdf')
    await uploadReadyFile(csvPath, csvBuffer, 'text/csv; charset=utf-8')
  } catch (err) {
    await removeReadyFiles([pdfPath, csvPath]).catch(() => {})
    throw err
  }

  const insertRow = {
    id: readyId,
    org_id: orgId,
    created_by: profileId || null,
    report_key: catalog.key,
    custom_report_id: body.custom_report_id || null,
    name,
    date_from: bundle.report?.filters?.date_from || body.date_from || null,
    date_to: bundle.report?.filters?.date_to || body.date_to || null,
    filters: bundle.report?.filters || {},
    columns: bundle.columns || [],
    row_count: Array.isArray(bundle.report?.rows) ? bundle.report.rows.length : 0,
    truncated: Boolean(bundle.report?.truncated),
    pdf_path: pdfPath,
    csv_path: csvPath,
    pdf_filename: bundle.pdfFilename,
    csv_filename: bundle.csvFilename,
    byte_size: byteSize,
  }

  const { data, error } = await supabaseAdmin
    .from('report_ready_reports')
    .insert(insertRow)
    .select('*')
    .single()

  if (error) {
    await removeReadyFiles([pdfPath, csvPath]).catch(() => {})
    if (isMissingReportTable(error)) throw httpError('Ready reports are not available yet', 503)
    throw error
  }

  return serializeReadyRow(data, { profileId, isOrgAdmin: Boolean(session?.is_org_admin) })
}

export async function downloadReadyReport(orgId, id, format = 'pdf') {
  const row = await getReadyReport(orgId, id)
  const kind = String(format || 'pdf').toLowerCase()
  if (kind !== 'pdf' && kind !== 'csv') throw httpError('Format must be pdf or csv')

  const path = kind === 'pdf' ? row.pdf_path : row.csv_path
  const filename = kind === 'pdf' ? row.pdf_filename : row.csv_filename
  const contentType = kind === 'pdf'
    ? 'application/pdf'
    : 'text/csv; charset=utf-8'

  const { data, error } = await supabaseAdmin.storage
    .from(REPORT_READY_BUCKET)
    .download(path)
  if (error) throw error

  const arrayBuffer = await data.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  return {
    filename,
    contentType,
    data: buffer.toString('base64'),
    byteLength: buffer.length,
  }
}

export async function deleteReadyReport(orgId, id, { profileId = null, isOrgAdmin = false } = {}) {
  const row = await getReadyReport(orgId, id)
  const allowed = isOrgAdmin || (profileId && row.created_by === profileId)
  if (!allowed) throw httpError('You can only delete ready reports you generated', 403)

  await removeReadyFiles([row.pdf_path, row.csv_path])

  const { data, error } = await supabaseAdmin
    .from('report_ready_reports')
    .delete()
    .eq('org_id', orgId)
    .eq('id', id)
    .select('id')
    .maybeSingle()
  if (error) throw error
  if (!data) throw httpError('Ready report not found', 404)
  return { ok: true }
}
