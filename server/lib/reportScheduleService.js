import { supabaseAdmin } from '../services/supabase.js'
import {
  computeNextRunAt,
  DATE_WINDOWS,
  getReportCatalog,
  SCHEDULE_FREQUENCIES,
} from './reportConstants.js'

function httpError(message, status = 400) {
  const err = new Error(message)
  err.status = status
  return err
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function parseEmails(raw) {
  const list = Array.isArray(raw)
    ? raw
    : String(raw || '').split(/[\s,;]+/)
  const emails = [...new Set(list.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean))]
  if (!emails.length) throw httpError('Add at least one recipient email')
  const invalid = emails.find((email) => !EMAIL_RE.test(email))
  if (invalid) throw httpError(`Invalid email: ${invalid}`)
  if (emails.length > 20) throw httpError('A schedule can have at most 20 recipients')
  return emails
}

function normalizeScheduleInput(body, reportKey) {
  const catalog = getReportCatalog(reportKey)
  if (!catalog) throw httpError('Unknown report', 404)

  const frequency = String(body.frequency || 'weekly').toLowerCase()
  if (!SCHEDULE_FREQUENCIES.includes(frequency)) {
    throw httpError('Frequency must be daily, weekly, or monthly')
  }
  const dateWindow = String(body.date_window || 'last_7_days')
  if (!DATE_WINDOWS.includes(dateWindow)) {
    throw httpError('Invalid date window')
  }
  const sendHour = Number(body.send_hour)
  if (!Number.isInteger(sendHour) || sendHour < 0 || sendHour > 23) {
    throw httpError('send_hour must be an integer from 0 to 23 (UTC)')
  }
  const weekday = frequency === 'weekly' ? Number(body.weekday) : null
  if (frequency === 'weekly' && (!Number.isInteger(weekday) || weekday < 0 || weekday > 6)) {
    throw httpError('weekday must be 0 (Sunday) through 6 (Saturday)')
  }
  const monthDay = frequency === 'monthly' ? Number(body.month_day) : null
  if (frequency === 'monthly' && (!Number.isInteger(monthDay) || monthDay < 1 || monthDay > 31)) {
    throw httpError('month_day must be 1 through 31')
  }
  const columns = Array.isArray(body.columns)
    ? body.columns.map((id) => String(id || '').trim()).filter(Boolean)
    : []
  if (!columns.length) throw httpError('Select at least one column for the PDF')

  return {
    report_key: catalog.key,
    emails: parseEmails(body.emails),
    frequency,
    send_hour: sendHour,
    weekday,
    month_day: monthDay,
    location_id: body.location_id || null,
    date_window: dateWindow,
    columns,
    is_active: body.is_active !== false,
  }
}

export async function listReportSchedules(orgId, reportKey) {
  const catalog = getReportCatalog(reportKey)
  if (!catalog) throw httpError('Unknown report', 404)
  const { data, error } = await supabaseAdmin
    .from('report_schedules')
    .select('*')
    .eq('org_id', orgId)
    .eq('report_key', catalog.key)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function createReportSchedule(orgId, reportKey, body, now = new Date()) {
  const payload = normalizeScheduleInput(body, reportKey)
  const row = {
    org_id: orgId,
    ...payload,
    next_run_at: computeNextRunAt(payload, now),
    last_sent_at: null,
    last_error: null,
  }
  const { data, error } = await supabaseAdmin
    .from('report_schedules')
    .insert({ ...row, updated_at: now.toISOString() })
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function updateReportSchedule(orgId, id, body, now = new Date()) {
  const { data: existing, error: loadError } = await supabaseAdmin
    .from('report_schedules')
    .select('*')
    .eq('org_id', orgId)
    .eq('id', id)
    .maybeSingle()
  if (loadError) throw loadError
  if (!existing) throw httpError('Schedule not found', 404)

  const merged = {
    frequency: body.frequency ?? existing.frequency,
    send_hour: body.send_hour ?? existing.send_hour,
    weekday: body.weekday ?? existing.weekday,
    month_day: body.month_day ?? existing.month_day,
    emails: body.emails ?? existing.emails,
    location_id: body.location_id === undefined ? existing.location_id : body.location_id,
    date_window: body.date_window ?? existing.date_window,
    columns: body.columns ?? existing.columns,
    is_active: body.is_active === undefined ? existing.is_active : body.is_active,
  }
  const payload = normalizeScheduleInput(merged, existing.report_key)
  const next = {
    ...payload,
    next_run_at: payload.is_active ? computeNextRunAt(payload, now) : existing.next_run_at,
    updated_at: now.toISOString(),
  }
  const { data, error } = await supabaseAdmin
    .from('report_schedules')
    .update(next)
    .eq('id', id)
    .eq('org_id', orgId)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function deleteReportSchedule(orgId, id) {
  const { data, error } = await supabaseAdmin
    .from('report_schedules')
    .delete()
    .eq('org_id', orgId)
    .eq('id', id)
    .select('id')
    .maybeSingle()
  if (error) throw error
  if (!data) throw httpError('Schedule not found', 404)
  return { ok: true }
}

export async function listDueReportSchedules(now = new Date()) {
  const { data, error } = await supabaseAdmin
    .from('report_schedules')
    .select('*')
    .eq('is_active', true)
    .lte('next_run_at', now.toISOString())
    .order('next_run_at', { ascending: true })
    .limit(50)
  if (error) {
    if (
      error.code === '42P01'
      || error.code === 'PGRST205'
      || /report_schedules/i.test(error.message || '')
    ) {
      return []
    }
    throw error
  }
  return data || []
}

export async function markScheduleResult(id, { errorMessage, now = new Date() } = {}) {
  const { data: existing, error: loadError } = await supabaseAdmin
    .from('report_schedules')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (loadError) throw loadError
  if (!existing) return null

  const nextRun = computeNextRunAt(existing, now)
  const patch = {
    next_run_at: nextRun,
    last_error: errorMessage || null,
    updated_at: now.toISOString(),
  }
  if (!errorMessage) patch.last_sent_at = now.toISOString()

  const { error } = await supabaseAdmin
    .from('report_schedules')
    .update(patch)
    .eq('id', id)
  if (error) throw error
  return patch
}
