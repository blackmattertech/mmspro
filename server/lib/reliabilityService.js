import ExcelJS from 'exceljs'
import { supabaseAdmin } from '../services/supabase.js'
import {
  ACTIVE_REPAIR_HOURS_FIELD_ID,
  OPERATIONAL_BREAKDOWN_HOURS_FIELD_ID,
} from '../shared/workOrderReliabilityFields.js'
import {
  PLANT_SUMMARY_TERMINOLOGY,
  RELIABILITY_HOURS_METHOD,
  buildCalculationExamples,
  buildEquipmentMetrics,
  buildPlantSummary,
  clipBreakdownHoursToWindow,
  meterRunningHours,
  prorateManualHours,
} from '../shared/reliabilityMetrics.js'
import { cumulativeFromOffset } from '../shared/meterCycle.js'

const EQUIPMENT_CAP = 5000
/** Draft WOs are excluded; breakdown hours on open/closed WOs still count once times exist. */
const EXCLUDED_BREAKDOWN_STATUSES = ['draft']
const ID_CHUNK = 200

function httpError(message, status = 400) {
  const err = new Error(message)
  err.status = status
  return err
}

function asDateOnly(value, label) {
  const raw = String(value || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw httpError(`${label} must be YYYY-MM-DD`)
  }
  return raw
}

function asHours(value, label, { required = false, allowZero = true } = {}) {
  if (value == null || value === '') {
    if (required) throw httpError(`${label} is required`)
    return null
  }
  const n = Number(value)
  if (!Number.isFinite(n)) throw httpError(`${label} must be a number`)
  if (n < 0) throw httpError(`${label} cannot be negative`)
  if (!allowZero && n === 0) throw httpError(`${label} must be greater than zero`)
  return n
}

function periodsOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart <= bEnd && bStart <= aEnd
}

async function fetchIdChunks(ids, runChunk) {
  const unique = [...new Set((ids || []).filter(Boolean))]
  const out = []
  for (let i = 0; i < unique.length; i += ID_CHUNK) {
    const chunk = unique.slice(i, i + ID_CHUNK)
    const rows = await runChunk(chunk)
    out.push(...(rows || []))
  }
  return out
}

async function getEquipmentRow(orgId, equipmentId) {
  const { data, error } = await supabaseAdmin
    .from('equipment')
    .select('id, org_id, name, code, location_id, department_id, reading_required, is_active')
    .eq('org_id', orgId)
    .eq('id', equipmentId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw httpError('Equipment not found', 404)
  return data
}

function mapManualRow(row) {
  if (!row) return null
  return {
    id: row.id,
    equipment_id: row.equipment_id,
    period_start: row.period_start,
    period_end: row.period_end,
    hours: row.hours == null ? null : Number(row.hours),
    notes: row.notes || '',
    created_by: row.created_by || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    equipment_name: row.equipment?.name || row.equipment_name || null,
  }
}

export async function listManualRunningHours(orgId, {
  equipmentId = null,
  locationId = null,
  dateFrom = null,
  dateTo = null,
  limit = 200,
  offset = 0,
} = {}) {
  let query = supabaseAdmin
    .from('equipment_manual_running_hours')
    .select(`
      id, equipment_id, period_start, period_end, hours, notes, created_by, created_at, updated_at,
      equipment:equipment_id ( id, name, location_id, department_id, reading_required )
    `, { count: 'exact' })
    .eq('org_id', orgId)
    .order('period_start', { ascending: false })
    .range(offset, offset + Math.max(1, Math.min(500, limit)) - 1)

  if (equipmentId) query = query.eq('equipment_id', equipmentId)
  if (dateFrom) query = query.gte('period_end', dateFrom)
  if (dateTo) query = query.lte('period_start', dateTo)

  const { data, error, count } = await query
  if (error) throw error

  const rows = (data || [])
    .filter((row) => !locationId || row.equipment?.location_id === locationId)
    .map(mapManualRow)
  return { items: rows, total: count ?? rows.length }
}

async function assertNoOverlap(orgId, equipmentId, periodStart, periodEnd, excludeId = null) {
  let query = supabaseAdmin
    .from('equipment_manual_running_hours')
    .select('id, period_start, period_end')
    .eq('org_id', orgId)
    .eq('equipment_id', equipmentId)
    .lte('period_start', periodEnd)
    .gte('period_end', periodStart)

  if (excludeId) query = query.neq('id', excludeId)

  const { data, error } = await query
  if (error) throw error
  const overlap = (data || []).find((row) => periodsOverlap(
    row.period_start,
    row.period_end,
    periodStart,
    periodEnd,
  ))
  if (overlap) {
    throw httpError(
      `This period overlaps an existing manual hours entry (${overlap.period_start} → ${overlap.period_end}).`,
    )
  }
}

export async function createManualRunningHours(orgId, profileId, body = {}) {
  const equipmentId = String(body.equipment_id || '').trim()
  if (!equipmentId) throw httpError('equipment_id is required')
  const periodStart = asDateOnly(body.period_start, 'period_start')
  const periodEnd = asDateOnly(body.period_end, 'period_end')
  if (periodEnd < periodStart) throw httpError('period_end must be on or after period_start')
  const hours = asHours(body.hours, 'hours', { required: true })

  const equipment = await getEquipmentRow(orgId, equipmentId)
  if (equipment.reading_required === true) {
    throw httpError('Metered equipment uses Logbook readings. Manual running hours are only for non-metered assets.')
  }

  await assertNoOverlap(orgId, equipmentId, periodStart, periodEnd)

  const payload = {
    org_id: orgId,
    equipment_id: equipmentId,
    period_start: periodStart,
    period_end: periodEnd,
    hours,
    notes: body.notes == null ? null : String(body.notes).trim() || null,
    created_by: profileId || null,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabaseAdmin
    .from('equipment_manual_running_hours')
    .insert(payload)
    .select(`
      id, equipment_id, period_start, period_end, hours, notes, created_by, created_at, updated_at,
      equipment:equipment_id ( id, name )
    `)
    .single()
  if (error) throw error
  return mapManualRow(data)
}

export async function updateManualRunningHours(orgId, id, body = {}) {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from('equipment_manual_running_hours')
    .select('id, equipment_id, period_start, period_end, hours, notes')
    .eq('org_id', orgId)
    .eq('id', id)
    .maybeSingle()
  if (existingError) throw existingError
  if (!existing) throw httpError('Manual hours entry not found', 404)

  const equipment = await getEquipmentRow(orgId, existing.equipment_id)
  if (equipment.reading_required === true) {
    throw httpError('Metered equipment uses Logbook readings. Manual running hours are only for non-metered assets.')
  }

  const periodStart = body.period_start != null
    ? asDateOnly(body.period_start, 'period_start')
    : existing.period_start
  const periodEnd = body.period_end != null
    ? asDateOnly(body.period_end, 'period_end')
    : existing.period_end
  if (periodEnd < periodStart) throw httpError('period_end must be on or after period_start')
  const hours = body.hours != null
    ? asHours(body.hours, 'hours', { required: true })
    : Number(existing.hours)

  await assertNoOverlap(orgId, existing.equipment_id, periodStart, periodEnd, id)

  const patch = {
    period_start: periodStart,
    period_end: periodEnd,
    hours,
    updated_at: new Date().toISOString(),
  }
  if (body.notes !== undefined) {
    patch.notes = body.notes == null ? null : String(body.notes).trim() || null
  }

  const { data, error } = await supabaseAdmin
    .from('equipment_manual_running_hours')
    .update(patch)
    .eq('org_id', orgId)
    .eq('id', id)
    .select(`
      id, equipment_id, period_start, period_end, hours, notes, created_by, created_at, updated_at,
      equipment:equipment_id ( id, name )
    `)
    .single()
  if (error) throw error
  return mapManualRow(data)
}

export async function deleteManualRunningHours(orgId, id) {
  const { data, error } = await supabaseAdmin
    .from('equipment_manual_running_hours')
    .delete()
    .eq('org_id', orgId)
    .eq('id', id)
    .select('id')
    .maybeSingle()
  if (error) throw error
  if (!data) throw httpError('Manual hours entry not found', 404)
  return { id: data.id }
}

function windowBounds(dateFrom, dateTo) {
  return {
    fromStart: `${dateFrom}T00:00:00.000Z`,
    toEnd: `${dateTo}T23:59:59.999Z`,
  }
}

function readEquipmentFieldValue(row) {
  if (!row) return ''
  if (Array.isArray(row.value_json?.values)) {
    return row.value_json.values.map((value) => String(value || '').trim()).filter(Boolean).join(', ')
  }
  return String(row.value_text ?? '').trim()
}

async function loadEquipmentValuesByIds(orgId, equipmentIds) {
  const map = new Map()
  const unique = [...new Set((equipmentIds || []).filter(Boolean))]
  for (let i = 0; i < unique.length; i += ID_CHUNK) {
    const chunk = unique.slice(i, i + ID_CHUNK)
    const { data, error } = await supabaseAdmin
      .from('equipment_values')
      .select('equipment_id, field_id, value_text, value_json')
      .eq('org_id', orgId)
      .in('equipment_id', chunk)
    if (error) throw error
    for (const row of data || []) {
      if (!map.has(row.equipment_id)) map.set(row.equipment_id, {})
      map.get(row.equipment_id)[row.field_id] = readEquipmentFieldValue(row)
    }
  }
  return map
}

async function listAssetMasterNameFields(orgId) {
  const { data, error } = await supabaseAdmin
    .from('equipment_fields')
    .select('id, name, kind, sort_order, is_active, depends_on_parent_id')
    .eq('org_id', orgId)
    .neq('is_active', false)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return (data || [])
    .filter((field) => field.kind !== 'section' && field.kind !== 'child')
    .map((field) => ({
      id: field.id,
      name: field.name,
    }))
}

function resolveEquipmentDisplayName(equipment, fieldValues, nameFieldId) {
  if (nameFieldId) {
    const mapped = String(fieldValues?.[nameFieldId] || '').trim()
    if (mapped) return mapped
  }
  return String(equipment?.name || '').trim()
}

async function loadEquipmentSet(orgId, {
  locationId = null,
  departmentId = null,
  equipmentId = null,
} = {}) {
  let query = supabaseAdmin
    .from('equipment')
    .select(`
      id, name, code, qr_code, location_id, department_id, reading_required, is_active,
      org_locations ( id, name ),
      departments ( id, name )
    `)
    .eq('org_id', orgId)
    .neq('is_active', false)
    .order('name', { ascending: true })
    .limit(EQUIPMENT_CAP + 1)

  if (equipmentId) query = query.eq('id', equipmentId)
  if (locationId) query = query.eq('location_id', locationId)
  if (departmentId) query = query.eq('department_id', departmentId)

  const { data, error } = await query
  if (error) throw error
  const rows = data || []
  if (rows.length > EQUIPMENT_CAP) {
    throw httpError(
      `Too many assets (${EQUIPMENT_CAP}+). Narrow the filters (select a Plant) and try again.`,
      400,
    )
  }
  return rows
}

async function loadMeterCumulatives(orgId, equipmentIds, atIso) {
  const map = new Map()
  if (!equipmentIds.length) return map

  const { data, error } = await supabaseAdmin.rpc('reliability_meter_cumulative_at', {
    p_org_id: orgId,
    p_equipment_ids: equipmentIds,
    p_at: atIso,
  })

  if (!error && Array.isArray(data)) {
    for (const row of data) {
      map.set(row.equipment_id, row.cumulative_reading == null ? null : Number(row.cumulative_reading))
    }
    return map
  }

  // Fallback when RPC is not applied yet: last reading at-or-before timestamp per chunk.
  const rows = await fetchIdChunks(equipmentIds, async (chunk) => {
    const { data: readings, error: readError } = await supabaseAdmin
      .from('equipment_meter_readings')
      .select('equipment_id, reading, cycle_offset, reading_at, created_at, id')
      .eq('org_id', orgId)
      .in('equipment_id', chunk)
      .lte('reading_at', atIso)
      .order('reading_at', { ascending: false })
      .limit(chunk.length * 5)
    if (readError) throw readError
    return readings || []
  })

  for (const row of rows) {
    if (map.has(row.equipment_id)) continue
    map.set(row.equipment_id, cumulativeFromOffset(row.cycle_offset, row.reading))
  }
  return map
}

async function loadManualHoursForWindow(orgId, equipmentIds, dateFrom, dateTo) {
  if (!equipmentIds.length) return []
  return fetchIdChunks(equipmentIds, async (chunk) => {
    const { data, error } = await supabaseAdmin
      .from('equipment_manual_running_hours')
      .select('id, equipment_id, period_start, period_end, hours')
      .eq('org_id', orgId)
      .in('equipment_id', chunk)
      .lte('period_start', dateTo)
      .gte('period_end', dateFrom)
    if (error) throw error
    return data || []
  })
}

async function loadBreakdownWorkOrders(orgId, equipmentIds, dateFrom, dateTo) {
  if (!equipmentIds.length) return []
  const { fromStart, toEnd } = windowBounds(dateFrom, dateTo)

  return fetchIdChunks(equipmentIds, async (chunk) => {
    // Prefer is_breakdown, but also accept any WO with breakdown start filled
    // (technicians may enter times before status reaches completed).
    const { data, error } = await supabaseAdmin
      .from('manual_work_orders')
      .select(`
        id, equipment_id, is_breakdown, status, source_type,
        breakdown_start_at, breakdown_end_at, breakdown_duration_hours
      `)
      .eq('org_id', orgId)
      .in('equipment_id', chunk)
      .not('breakdown_start_at', 'is', null)
      .lte('breakdown_start_at', toEnd)
      .neq('status', 'draft')
    if (error) throw error
    return (data || []).filter((row) => {
      if (EXCLUDED_BREAKDOWN_STATUSES.includes(String(row.status || ''))) return false
      // Keep clear non-breakdown rows without calendar duration out of the set
      if (
        row.is_breakdown !== true
        && !(Number(row.breakdown_duration_hours) > 0)
        && !row.breakdown_end_at
      ) {
        return false
      }
      const endAt = row.breakdown_end_at ? Date.parse(row.breakdown_end_at) : null
      if (Number.isFinite(endAt) && endAt < Date.parse(fromStart)) return false
      const clipped = clipBreakdownHoursToWindow({
        breakdownStartAt: row.breakdown_start_at,
        breakdownEndAt: row.breakdown_end_at,
        calendarHours: row.breakdown_duration_hours,
        windowStart: dateFrom,
        windowEnd: dateTo,
      })
      // Count the event when times overlap the window, even if duration clips to a
      // tiny fraction (still a failure in-period).
      if (clipped > 0) return true
      const startAt = Date.parse(row.breakdown_start_at || '')
      if (!Number.isFinite(startAt)) return false
      const winStart = Date.parse(fromStart)
      const winEnd = Date.parse(toEnd)
      return startAt >= winStart && startAt <= winEnd
    })
  })
}

async function loadReliabilityFormValues(orgId, workOrderIds) {
  const byRecord = new Map()
  if (!workOrderIds.length) return byRecord

  const rows = await fetchIdChunks(workOrderIds, async (chunk) => {
    const { data, error } = await supabaseAdmin
      .from('org_form_field_values')
      .select('record_id, field_id, value_json')
      .eq('org_id', orgId)
      .in('record_id', chunk)
      .in('field_id', [OPERATIONAL_BREAKDOWN_HOURS_FIELD_ID, ACTIVE_REPAIR_HOURS_FIELD_ID])
    if (error) {
      if (/org_form_field_values/i.test(error.message || '')) return []
      throw error
    }
    return data || []
  })

  for (const row of rows) {
    if (!byRecord.has(row.record_id)) byRecord.set(row.record_id, {})
    byRecord.get(row.record_id)[row.field_id] = row.value_json
  }

  // Fallback: latest daily-log snapshots may hold process_extras before/without a form-values write.
  const missingIds = workOrderIds.filter((id) => !byRecord.has(id))
  if (missingIds.length) {
    const logs = await fetchIdChunks(missingIds, async (chunk) => {
      const { data, error } = await supabaseAdmin
        .from('work_order_daily_logs')
        .select('work_order_id, field_snapshot, log_date')
        .eq('org_id', orgId)
        .in('work_order_id', chunk)
        .order('log_date', { ascending: false })
      if (error) return []
      return data || []
    })
    for (const log of logs) {
      if (byRecord.has(log.work_order_id)) continue
      const extras = log.field_snapshot?.process_extras
      if (!extras || typeof extras !== 'object') continue
      const operational = extras[OPERATIONAL_BREAKDOWN_HOURS_FIELD_ID]
      const repair = extras[ACTIVE_REPAIR_HOURS_FIELD_ID]
      if (operational == null && repair == null) continue
      byRecord.set(log.work_order_id, {
        [OPERATIONAL_BREAKDOWN_HOURS_FIELD_ID]: operational,
        [ACTIVE_REPAIR_HOURS_FIELD_ID]: repair,
      })
    }
  }

  return byRecord
}

function parseFormNumber(raw) {
  if (raw == null || raw === '') return null
  if (typeof raw === 'object' && raw !== null && 'value' in raw) {
    return parseFormNumber(raw.value)
  }
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

function resolveRunningHours({
  equipment,
  meterFrom,
  meterTo,
  manualRows,
  dateFrom,
  dateTo,
}) {
  if (equipment.reading_required === true) {
    const hours = meterRunningHours(meterFrom, meterTo)
    return {
      hoursMethod: hours == null ? RELIABILITY_HOURS_METHOD.NA : RELIABILITY_HOURS_METHOD.METER,
      runningHours: hours,
    }
  }

  let total = 0
  let any = false
  for (const row of manualRows) {
    const part = prorateManualHours({
      periodStart: row.period_start,
      periodEnd: row.period_end,
      hours: row.hours,
      windowStart: dateFrom,
      windowEnd: dateTo,
    })
    if (part > 0) {
      any = true
      total += part
    }
  }
  if (!any) {
    return { hoursMethod: RELIABILITY_HOURS_METHOD.NA, runningHours: null }
  }
  return { hoursMethod: RELIABILITY_HOURS_METHOD.MANUAL, runningHours: total }
}

export async function buildReliabilityReport(orgId, filters = {}) {
  const dateFrom = asDateOnly(filters.dateFrom || filters.date_from, 'date_from')
  const dateTo = asDateOnly(filters.dateTo || filters.date_to, 'date_to')
  if (dateFrom > dateTo) throw httpError('date_from must be on or before date_to')

  const evaluationHours = asHours(
    filters.evaluationHours ?? filters.evaluation_hours ?? 100,
    'evaluation_hours',
    { required: true },
  )

  const locationId = filters.locationId || filters.location_id || null
  const departmentId = filters.departmentId || filters.department_id || null
  const equipmentId = filters.equipmentId || filters.equipment_id || null
  const nameFieldIdRaw = String(filters.nameFieldId || filters.name_field_id || '').trim()
  const useAssetRegisterName = !nameFieldIdRaw
    || nameFieldIdRaw === 'asset_name'
    || nameFieldIdRaw === '__asset_name__'

  if (!locationId && !equipmentId && !departmentId) {
    // Allow org-wide only when small; loadEquipmentSet enforces EQUIPMENT_CAP.
  }

  const equipmentRows = await loadEquipmentSet(orgId, { locationId, departmentId, equipmentId })
  const equipmentIds = equipmentRows.map((row) => row.id)
  const { fromStart, toEnd } = windowBounds(dateFrom, dateTo)

  const meteredIds = equipmentRows.filter((row) => row.reading_required === true).map((row) => row.id)
  const manualIds = equipmentRows.filter((row) => row.reading_required !== true).map((row) => row.id)

  const [meterFromMap, meterToMap, manualHourRows, breakdownWos, valuesByEquipment, nameFieldOptions] = await Promise.all([
    loadMeterCumulatives(orgId, meteredIds, fromStart),
    loadMeterCumulatives(orgId, meteredIds, toEnd),
    loadManualHoursForWindow(orgId, manualIds, dateFrom, dateTo),
    loadBreakdownWorkOrders(orgId, equipmentIds, dateFrom, dateTo),
    loadEquipmentValuesByIds(orgId, equipmentIds),
    listAssetMasterNameFields(orgId),
  ])

  // Explicit asset_name → equipment.name. Otherwise use mapped Asset Master field.
  // When omitted on first load, prefer a field literally named "Equipment Name".
  let resolvedNameFieldId = null
  if (!useAssetRegisterName) {
    resolvedNameFieldId = nameFieldIdRaw
  } else if (!nameFieldIdRaw) {
    resolvedNameFieldId = nameFieldOptions.find((field) => /equipment\s*name/i.test(field.name))?.id || null
  }

  const formValues = await loadReliabilityFormValues(
    orgId,
    breakdownWos.map((row) => row.id),
  )

  const manualByEquipment = new Map()
  for (const row of manualHourRows) {
    if (!manualByEquipment.has(row.equipment_id)) manualByEquipment.set(row.equipment_id, [])
    manualByEquipment.get(row.equipment_id).push(row)
  }

  const woByEquipment = new Map()
  for (const row of breakdownWos) {
    if (!row.equipment_id) continue
    if (!woByEquipment.has(row.equipment_id)) woByEquipment.set(row.equipment_id, [])
    woByEquipment.get(row.equipment_id).push(row)
  }

  const detailRows = equipmentRows.map((equipment) => {
    const { hoursMethod, runningHours } = resolveRunningHours({
      equipment,
      meterFrom: meterFromMap.get(equipment.id),
      meterTo: meterToMap.get(equipment.id),
      manualRows: manualByEquipment.get(equipment.id) || [],
      dateFrom,
      dateTo,
    })

    const wos = woByEquipment.get(equipment.id) || []
    let calendarBdHours = 0
    let operationalBdHours = 0
    let repairHours = 0
    let completedRepairs = 0

    for (const wo of wos) {
      const clipped = clipBreakdownHoursToWindow({
        breakdownStartAt: wo.breakdown_start_at,
        breakdownEndAt: wo.breakdown_end_at,
        calendarHours: wo.breakdown_duration_hours,
        windowStart: dateFrom,
        windowEnd: dateTo,
      })
      calendarBdHours += clipped

      const values = formValues.get(wo.id) || {}
      const operational = parseFormNumber(values[OPERATIONAL_BREAKDOWN_HOURS_FIELD_ID])
      const repair = parseFormNumber(values[ACTIVE_REPAIR_HOURS_FIELD_ID])
      if (operational != null) operationalBdHours += operational
      if (repair != null) {
        repairHours += repair
        completedRepairs += 1
      }
    }

    const fieldValues = valuesByEquipment.get(equipment.id) || {}
    return buildEquipmentMetrics({
      equipmentId: equipment.id,
      equipmentCode: equipment.code || equipment.qr_code || '',
      equipmentName: resolveEquipmentDisplayName(equipment, fieldValues, resolvedNameFieldId),
      plantName: equipment.org_locations?.name || '',
      departmentName: equipment.departments?.name || '',
      hoursMethod,
      runningHours,
      failures: wos.length,
      calendarBdHours,
      operationalBdHours,
      repairHours,
      completedRepairs,
      evaluationHours,
    })
  })

  const plantSummary = buildPlantSummary(detailRows, evaluationHours)
  const exampleEquipment = detailRows.find((row) => row.failures > 0) || detailRows[0] || null
  const calculationExamples = buildCalculationExamples({
    equipmentRow: exampleEquipment,
    plantSummary,
    evaluationHours,
  })

  return {
    filters: {
      location_id: locationId,
      department_id: departmentId,
      equipment_id: equipmentId,
      date_from: dateFrom,
      date_to: dateTo,
      evaluation_hours: evaluationHours,
      name_field_id: resolvedNameFieldId,
    },
    evaluationHours,
    nameFieldId: resolvedNameFieldId,
    nameFieldOptions,
    terminology: PLANT_SUMMARY_TERMINOLOGY,
    plantSummary,
    equipmentRows: detailRows,
    calculationExamples,
  }
}

const EXCEL_HEADER_FILL = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF111827' },
}
const EXCEL_HEADER_FONT = {
  bold: true,
  color: { argb: 'FFFFFFFF' },
  name: 'Calibri',
  size: 11,
}
const EXCEL_TITLE_FONT = {
  bold: true,
  color: { argb: 'FFE63946' },
  name: 'Calibri',
  size: 14,
}
const EXCEL_META_FONT = {
  color: { argb: 'FF6B7280' },
  name: 'Calibri',
  size: 10,
}

function excelCell(value) {
  if (value == null || value === '') return 'N/A'
  return value
}

function styleHeaderRow(sheet, rowNumber, columnCount) {
  const row = sheet.getRow(rowNumber)
  row.height = 22
  for (let col = 1; col <= columnCount; col += 1) {
    const cell = row.getCell(col)
    cell.fill = EXCEL_HEADER_FILL
    cell.font = EXCEL_HEADER_FONT
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF111827' } },
      left: { style: 'thin', color: { argb: 'FF111827' } },
      bottom: { style: 'thin', color: { argb: 'FF111827' } },
      right: { style: 'thin', color: { argb: 'FF111827' } },
    }
  }
}

function autosizeColumns(sheet, widths) {
  sheet.columns = widths.map((width) => ({ width }))
}

function addFilterMeta(sheet, report, startRow = 1) {
  sheet.getCell(startRow, 1).value = 'Reliability Calculator Export'
  sheet.getCell(startRow, 1).font = EXCEL_TITLE_FONT
  const filters = report.filters || {}
  const meta = [
    `From: ${filters.date_from || '—'}`,
    `To: ${filters.date_to || '—'}`,
    `Evaluation period: ${report.evaluationHours ?? filters.evaluation_hours ?? 100} h`,
  ].join('  ·  ')
  sheet.getCell(startRow + 1, 1).value = meta
  sheet.getCell(startRow + 1, 1).font = EXCEL_META_FONT
}

function writePlantSummarySheet(workbook, report) {
  const sheet = workbook.addWorksheet('Plant Summary')
  addFilterMeta(sheet, report, 1)
  const plant = report.plantSummary || {}
  const t = report.evaluationHours ?? 100
  const headers = ['Parameter', 'Result', 'Parameter', 'Result']
  const headerRow = 4
  sheet.addRow([])
  sheet.addRow(headers)
  styleHeaderRow(sheet, headerRow, headers.length)

  const left = [
    ['Equipment Included', plant.equipmentIncluded],
    ['Breakdown Events', plant.breakdownEvents],
    ['Calendar Breakdown Hours', plant.calendarBreakdownHours],
    ['Verified Active Repair Hours', plant.verifiedActiveRepairHours],
    ['Overall Plant Equipment MTBF', plant.mtbf == null ? 'N/A' : plant.mtbf],
    ['Overall Plant Equipment Failure Rate', plant.failureRate == null ? 'N/A' : plant.failureRate],
    ['Overall Inherent Availability', plant.inherentAvailabilityPct == null ? 'N/A' : `${plant.inherentAvailabilityPct}%`],
  ]
  const right = [
    ['Total Running Hours', plant.totalRunningHours],
    ['Completed Repairs', plant.completedRepairs],
    ['Operational Breakdown Hours', plant.operationalBreakdownHours],
    ['Other Elapsed Hours', plant.otherElapsedHours],
    ['Overall Plant Equipment MTTR', plant.mttr == null ? 'N/A' : plant.mttr],
    [`Overall Plant Equipment Reliability (${t} h)`, plant.reliabilityPct == null ? 'N/A' : `${plant.reliabilityPct}%`],
    ['Overall Operational Availability', plant.operationalAvailabilityPct == null ? 'N/A' : `${plant.operationalAvailabilityPct}%`],
  ]

  left.forEach((row, index) => {
    sheet.addRow([
      row[0],
      excelCell(row[1]),
      right[index]?.[0] || '',
      right[index] ? excelCell(right[index][1]) : '',
    ])
  })

  sheet.addRow([])
  sheet.addRow([report.terminology || PLANT_SUMMARY_TERMINOLOGY])
  autosizeColumns(sheet, [36, 18, 42, 18])
}

function writeEquipmentDetailsSheet(workbook, report) {
  const sheet = workbook.addWorksheet('Equipment Details')
  addFilterMeta(sheet, report, 1)
  const headers = [
    'Equipment',
    'Equipment Name',
    'Plant',
    'Department',
    'Hours Method',
    'Running h',
    'Failures',
    'Calendar BD h',
    'Operational BD h',
    'Repair h',
    'Other h',
    'MTBF h',
    'MTTR h',
    'Failure /h',
    'Reliability %',
    'Inherent %',
    'Operational %',
  ]
  sheet.addRow([])
  sheet.addRow(headers)
  styleHeaderRow(sheet, 4, headers.length)

  for (const row of report.equipmentRows || []) {
    sheet.addRow([
      row.equipmentCode || '—',
      row.equipmentName || '—',
      row.plantName || '—',
      row.departmentName || '—',
      row.hoursMethod || 'N/A',
      excelCell(row.runningHours),
      row.failures ?? 0,
      row.calendarBdHours ?? 0,
      row.operationalBdHours ?? 0,
      row.repairHours ?? 0,
      row.otherHours ?? 0,
      excelCell(row.mtbf),
      excelCell(row.mttr),
      excelCell(row.failureRate),
      row.reliabilityPct == null ? 'N/A' : row.reliabilityPct,
      row.inherentPct == null ? 'N/A' : row.inherentPct,
      row.operationalPct == null ? 'N/A' : row.operationalPct,
    ])
  }
  autosizeColumns(sheet, [16, 24, 22, 18, 14, 12, 10, 14, 16, 12, 10, 12, 12, 12, 14, 12, 14])
}

function writeCalculationsSheet(workbook, report) {
  const sheet = workbook.addWorksheet('Calculations')
  addFilterMeta(sheet, report, 1)
  const examples = report.calculationExamples || {}
  let rowCursor = 4

  function writeBlock(title, rows) {
    sheet.getCell(rowCursor, 1).value = title
    sheet.getCell(rowCursor, 1).font = { ...EXCEL_TITLE_FONT, size: 12 }
    rowCursor += 1
    const headers = ['Metric', 'Formula', 'Example Substitution', 'Example Result']
    const headerExcelRow = sheet.getRow(rowCursor)
    headers.forEach((header, index) => {
      headerExcelRow.getCell(index + 1).value = header
    })
    styleHeaderRow(sheet, rowCursor, headers.length)
    rowCursor += 1
    for (const row of rows || []) {
      const dataRow = sheet.getRow(rowCursor)
      dataRow.getCell(1).value = row.metric
      dataRow.getCell(2).value = row.formula
      dataRow.getCell(3).value = row.substitution
      dataRow.getCell(4).value = row.result
      rowCursor += 1
    }
    rowCursor += 2
  }

  const equipmentTitle = examples.equipmentLabel
    ? `Equipment Example (${examples.equipmentLabel})`
    : 'Equipment Example'
  writeBlock(equipmentTitle, examples.equipmentExample)
  writeBlock('Overall Plant Equipment Calculations', examples.plantExample)
  autosizeColumns(sheet, [28, 48, 48, 22])
}

export async function buildReliabilityExcelExport(orgId, filters = {}) {
  const report = await buildReliabilityReport(orgId, filters)
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'MMS Pro'
  workbook.created = new Date()
  writePlantSummarySheet(workbook, report)
  writeEquipmentDetailsSheet(workbook, report)
  writeCalculationsSheet(workbook, report)
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer())
  const from = report.filters?.date_from || 'from'
  const to = report.filters?.date_to || 'to'
  return {
    filename: `reliability-calculator-${from}-to-${to}.xlsx`,
    buffer,
    report,
  }
}
