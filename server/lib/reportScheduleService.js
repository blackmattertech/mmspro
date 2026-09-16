import { supabaseAdmin } from '../services/supabase.js'
import {
  computeNextRunAt,
  DATE_WINDOWS,
  filterReportColumns,
  getReportCatalog,
  isMissingReportTable,
  MONTH_DAY_FREQUENCIES,
  SCHEDULE_FREQUENCIES,
  WEEKDAY_FREQUENCIES,
} from './reportConstants.js'
import { getCustomReport } from './reportCustomService.js'

function httpError(message, status = 400) {
  const err = new Error(message)
  err.status = status
  return err
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SCHEDULE_WITH_CUSTOM = '*, report_custom_reports(id, name, columns, location_id)'

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
    throw httpError('Choose a valid send frequency')
  }
  const dateWindow = String(body.date_window || 'last_7_days')
  if (!DATE_WINDOWS.includes(dateWindow)) {
    throw httpError('Invalid date window')
  }
  const sendHour = Number(body.send_hour)
  if (!Number.isInteger(sendHour) || sendHour < 0 || sendHour > 23) {
    throw httpError('send_hour must be an integer from 0 to 23 (UTC)')
  }
  let sendHour2 = body.send_hour_2 == null || body.send_hour_2 === '' ? null : Number(body.send_hour_2)
  if (frequency === 'twice_daily') {
    if (!Number.isInteger(sendHour2) || sendHour2 < 0 || sendHour2 > 23) {
      throw httpError('Choose a second send hour')
    }
    if (sendHour2 === sendHour) throw httpError('The two send hours must be different')
  } else {
    sendHour2 = null
  }

  const needsWeekday = WEEKDAY_FREQUENCIES.includes(frequency) || frequency === 'twice_weekly'
  const weekday = needsWeekday ? Number(body.weekday) : null
  if (needsWeekday && (!Number.isInteger(weekday) || weekday < 0 || weekday > 6)) {
    throw httpError('Choose a weekday')
  }
  let weekday2 = body.weekday_2 == null || body.weekday_2 === '' ? null : Number(body.weekday_2)
  if (frequency === 'twice_weekly') {
    if (!Number.isInteger(weekday2) || weekday2 < 0 || weekday2 > 6) {
      throw httpError('Choose a second weekday')
    }
    if (weekday2 === weekday) throw httpError('The two weekdays must be different')
  } else {
    weekday2 = null
  }

  const monthDay = MONTH_DAY_FREQUENCIES.includes(frequency) ? Number(body.month_day) : null
  if (MONTH_DAY_FREQUENCIES.includes(frequency) && (!Number.isInteger(monthDay) || monthDay < 1 || monthDay > 31)) {
    throw httpError('month_day must be 1 through 31')
  }

  return {
    report_key: catalog.key,
    emails: parseEmails(body.emails),
    frequency,
    send_hour: sendHour,
    send_hour_2: sendHour2,
    weekday,
    weekday_2: weekday2,
    month_day: monthDay,
    date_window: dateWindow,
    is_active: body.is_active !== false,
  }
}

async function resolveCustomReportFields(orgId, reportKey, customReportId) {
  if (!customReportId) throw httpError('Select a custom report')
  const custom = await getCustomReport(orgId, customReportId)
  if (custom.report_key !== reportKey) {
    throw httpError('Custom report does not match this report type')
  }
  const catalog = getReportCatalog(reportKey)
  const columns = filterReportColumns(catalog.kind, custom.columns)
  if (!columns.length) throw httpError('The selected custom report has no columns')
  return {
    custom_report_id: custom.id,
    columns,
    location_id: custom.location_id || null,
  }
}

function shapeSchedule(row) {
  if (!row) return row
  const custom = row.report_custom_reports || null
  const { report_custom_reports, ...rest } = row
  return {
    ...rest,
    custom_report: custom,
  }
}

export async function listReportSchedules(orgId, reportKey) {
  const catalog = getReportCatalog(reportKey)
  if (!catalog) throw httpError('Unknown report', 404)
  const { data, error } = await supabaseAdmin
    .from('report_schedules')
    .select(SCHEDULE_WITH_CUSTOM)
    .eq('org_id', orgId)
    .eq('report_key', catalog.key)
    .order('created_at', { ascending: false })
  if (error) {
    if (isMissingReportTable(error)) return []
    const fallback = await supabaseAdmin
      .from('report_schedules')
      .select('*')
      .eq('org_id', orgId)
      .eq('report_key', catalog.key)
      .order('created_at', { ascending: false })
    if (fallback.error) {
      if (isMissingReportTable(fallback.error)) return []
      throw fallback.error
    }
    return fallback.data || []
  }
  return (data || []).map(shapeSchedule)
}

export async function createReportSchedule(orgId, reportKey, body, now = new Date()) {
  const payload = normalizeScheduleInput(body, reportKey)
  const customFields = await resolveCustomReportFields(orgId, reportKey, body.custom_report_id)
  const row = {
    org_id: orgId,
    ...payload,
    ...customFields,
    next_run_at: computeNextRunAt(payload, now),
    last_sent_at: null,
    last_error: null,
  }
  const { data, error } = await supabaseAdmin
    .from('report_schedules')
    .insert({ ...row, updated_at: now.toISOString() })
    .select(SCHEDULE_WITH_CUSTOM)
    .single()
  if (error) throw error
  return shapeSchedule(data)
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

  const pauseOnly = (
    body.is_active !== undefined
    && body.emails === undefined
    && body.frequency === undefined
    && body.send_hour === undefined
    && body.date_window === undefined
    && body.custom_report_id === undefined
  )

  if (pauseOnly) {
    const isActive = body.is_active !== false
    const patch = {
      is_active: isActive,
      next_run_at: isActive ? computeNextRunAt(existing, now) : existing.next_run_at,
      updated_at: now.toISOString(),
    }
    const { data, error } = await supabaseAdmin
      .from('report_schedules')
      .update(patch)
      .eq('id', id)
      .eq('org_id', orgId)
      .select(SCHEDULE_WITH_CUSTOM)
      .single()
    if (error) throw error
    return shapeSchedule(data)
  }

  const merged = {
    frequency: body.frequency ?? existing.frequency,
    send_hour: body.send_hour ?? existing.send_hour,
    send_hour_2: body.send_hour_2 === undefined ? existing.send_hour_2 : body.send_hour_2,
    weekday: body.weekday ?? existing.weekday,
    weekday_2: body.weekday_2 === undefined ? existing.weekday_2 : body.weekday_2,
    month_day: body.month_day ?? existing.month_day,
    emails: body.emails ?? existing.emails,
    date_window: body.date_window ?? existing.date_window,
    is_active: body.is_active === undefined ? existing.is_active : body.is_active,
    custom_report_id: body.custom_report_id ?? existing.custom_report_id,
  }
  const payload = normalizeScheduleInput(merged, existing.report_key)
  const customFields = await resolveCustomReportFields(
    orgId,
    existing.report_key,
    merged.custom_report_id,
  )
  const next = {
    ...payload,
    ...customFields,
    next_run_at: payload.is_active ? computeNextRunAt(payload, now) : existing.next_run_at,
    updated_at: now.toISOString(),
  }
  const { data, error } = await supabaseAdmin
    .from('report_schedules')
    .update(next)
    .eq('id', id)
    .eq('org_id', orgId)
    .select(SCHEDULE_WITH_CUSTOM)
    .single()
  if (error) throw error
  return shapeSchedule(data)
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
    if (isMissingReportTable(error)) return []
    throw error
  }
  return data || []
}

export async function getReportSchedule(orgId, id) {
  const { data, error } = await supabaseAdmin
    .from('report_schedules')
    .select(SCHEDULE_WITH_CUSTOM)
    .eq('org_id', orgId)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) throw httpError('Schedule not found', 404)
  return shapeSchedule(data)
}

export async function markScheduleSentNow(id, now = new Date()) {
  const { error } = await supabaseAdmin
    .from('report_schedules')
    .update({
      last_sent_at: now.toISOString(),
      last_error: null,
      updated_at: now.toISOString(),
    })
    .eq('id', id)
  if (error) throw error
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
