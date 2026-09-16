import { supabaseAdmin } from '../services/supabase.js'
import {
  filterReportColumns,
  getReportCatalog,
  isMissingReportTable,
} from './reportConstants.js'

function httpError(message, status = 400) {
  const err = new Error(message)
  err.status = status
  return err
}

function uniqueNameError(error) {
  return error?.code === '23505' || /report_custom_reports_org_key_name/i.test(error?.message || '')
}

function inUseError(error) {
  return error?.code === '23503' || /report_schedules_custom_report_id_fkey/i.test(error?.message || '')
}

export function normalizeCustomReportName(raw) {
  const name = String(raw || '').trim().replace(/\s+/g, ' ')
  if (!name) throw httpError('Enter a name for this custom report')
  if (name.length > 80) throw httpError('Custom report name must be 80 characters or fewer')
  return name
}

function normalizeCustomInput(body, reportKey) {
  const catalog = getReportCatalog(reportKey)
  if (!catalog) throw httpError('Unknown report', 404)
  const columns = filterReportColumns(catalog.kind, body.columns)
  if (!columns.length) throw httpError('Select at least one column')
  return {
    report_key: catalog.key,
    name: normalizeCustomReportName(body.name),
    columns,
    location_id: body.location_id || null,
  }
}

export async function listCustomReports(orgId, reportKey) {
  const catalog = getReportCatalog(reportKey)
  if (!catalog) throw httpError('Unknown report', 404)
  const { data, error } = await supabaseAdmin
    .from('report_custom_reports')
    .select('*')
    .eq('org_id', orgId)
    .eq('report_key', catalog.key)
    .order('name', { ascending: true })
  if (error) {
    if (isMissingReportTable(error)) return []
    throw error
  }
  return data || []
}

export async function getCustomReport(orgId, id) {
  const { data, error } = await supabaseAdmin
    .from('report_custom_reports')
    .select('*')
    .eq('org_id', orgId)
    .eq('id', id)
    .maybeSingle()
  if (error) {
    if (isMissingReportTable(error)) throw httpError('Custom reports are not available yet', 503)
    throw error
  }
  if (!data) throw httpError('Custom report not found', 404)
  return data
}

export async function createCustomReport(orgId, reportKey, body, now = new Date()) {
  const payload = normalizeCustomInput(body, reportKey)
  const { data, error } = await supabaseAdmin
    .from('report_custom_reports')
    .insert({
      org_id: orgId,
      ...payload,
      updated_at: now.toISOString(),
    })
    .select('*')
    .single()
  if (error) {
    if (uniqueNameError(error)) throw httpError('A custom report with this name already exists')
    if (isMissingReportTable(error)) throw httpError('Custom reports are not available yet', 503)
    throw error
  }
  return data
}

export async function updateCustomReport(orgId, id, body, now = new Date()) {
  const existing = await getCustomReport(orgId, id)
  const merged = {
    name: body.name ?? existing.name,
    columns: body.columns ?? existing.columns,
    location_id: body.location_id === undefined ? existing.location_id : body.location_id,
  }
  const payload = normalizeCustomInput(merged, existing.report_key)
  const { data, error } = await supabaseAdmin
    .from('report_custom_reports')
    .update({
      ...payload,
      updated_at: now.toISOString(),
    })
    .eq('id', id)
    .eq('org_id', orgId)
    .select('*')
    .single()
  if (error) {
    if (uniqueNameError(error)) throw httpError('A custom report with this name already exists')
    throw error
  }
  return data
}

export async function deleteCustomReport(orgId, id) {
  const existing = await getCustomReport(orgId, id)
  const { data, error } = await supabaseAdmin
    .from('report_custom_reports')
    .delete()
    .eq('id', existing.id)
    .eq('org_id', orgId)
    .select('id')
    .maybeSingle()
  if (error) {
    if (inUseError(error)) {
      throw httpError('This custom report is used by a schedule. Delete or reassign the schedule first.')
    }
    throw error
  }
  if (!data) throw httpError('Custom report not found', 404)
  return { ok: true }
}
