/**
 * Plant / equipment reliability formulas (MTBF, MTTR, availability, etc.).
 * Single source of truth for calculator UI and server aggregation.
 */

export const NA = null

export const RELIABILITY_HOURS_METHOD = Object.freeze({
  METER: 'Meter',
  MANUAL: 'Manual',
  NA: 'N/A',
})

export function roundHours(value, digits = 2) {
  if (value == null || !Number.isFinite(Number(value))) return NA
  const scale = 10 ** digits
  return Math.round((Number(value) + Number.EPSILON) * scale) / scale
}

export function roundRate(value, digits = 6) {
  if (value == null || !Number.isFinite(Number(value))) return NA
  const scale = 10 ** digits
  return Math.round((Number(value) + Number.EPSILON) * scale) / scale
}

export function roundPct(value, digits = 2) {
  return roundHours(value, digits)
}

function asNonNeg(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}

/** Mean Time Between Failures = Running Hours / Failure Count */
export function calcMtbf(runningHours, failures) {
  const run = asNonNeg(runningHours)
  const fail = asNonNeg(failures)
  if (fail <= 0) return NA
  return roundHours(run / fail)
}

/** Mean Time To Repair = Verified Active Repair Hours / Completed Repairs */
export function calcMttr(repairHours, completedRepairs) {
  const repair = asNonNeg(repairHours)
  const done = asNonNeg(completedRepairs)
  if (done <= 0) return NA
  return roundHours(repair / done)
}

/** Failure Rate = Failures / Running Hours */
export function calcFailureRate(failures, runningHours) {
  const fail = asNonNeg(failures)
  const run = asNonNeg(runningHours)
  if (fail <= 0 || run <= 0) return NA
  return roundRate(fail / run)
}

/** Reliability % = exp(-Failure Rate × Evaluation Hours) × 100 */
export function calcReliabilityPct(failureRate, evaluationHours) {
  if (failureRate == null || !Number.isFinite(Number(failureRate))) return NA
  const t = asNonNeg(evaluationHours)
  return roundPct(Math.exp(-Number(failureRate) * t) * 100)
}

/** Inherent Availability % = MTBF / (MTBF + MTTR) × 100 */
export function calcInherentAvailabilityPct(mtbf, mttr) {
  if (mtbf == null || mttr == null) return NA
  const a = Number(mtbf)
  const b = Number(mttr)
  if (!Number.isFinite(a) || !Number.isFinite(b) || a + b <= 0) return NA
  return roundPct((a / (a + b)) * 100)
}

/**
 * Operational Availability % = Running / (Running + Operational BD) × 100
 * Zero failures with positive running hours → 100% (reference MOTOR-01).
 */
export function calcOperationalAvailabilityPct(runningHours, operationalBdHours, failures = null) {
  const run = asNonNeg(runningHours)
  if (run <= 0) return NA
  if (failures != null && asNonNeg(failures) === 0) return roundPct(100)
  const op = asNonNeg(operationalBdHours)
  return roundPct((run / (run + op)) * 100)
}

export function calcOtherElapsedHours(calendarBdHours, repairHours) {
  return roundHours(asNonNeg(calendarBdHours) - asNonNeg(repairHours))
}

/**
 * Pro-rate manual period hours onto a report window by overlapping calendar days.
 */
export function prorateManualHours({
  periodStart,
  periodEnd,
  hours,
  windowStart,
  windowEnd,
}) {
  const totalHours = asNonNeg(hours)
  const start = toUtcDateOnly(periodStart)
  const end = toUtcDateOnly(periodEnd)
  const winStart = toUtcDateOnly(windowStart)
  const winEnd = toUtcDateOnly(windowEnd)
  if (!start || !end || !winStart || !winEnd || end < start || winEnd < winStart) return 0

  const overlapStart = start > winStart ? start : winStart
  const overlapEnd = end < winEnd ? end : winEnd
  if (overlapEnd < overlapStart) return 0

  const periodDays = daysInclusive(start, end)
  const overlapDays = daysInclusive(overlapStart, overlapEnd)
  if (periodDays <= 0) return 0
  if (overlapDays >= periodDays) return roundHours(totalHours)
  return roundHours((totalHours * overlapDays) / periodDays)
}

export function toUtcDateOnly(value) {
  if (!value) return null
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
  }
  const raw = String(value).trim()
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) {
    return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  }
  const parsed = Date.parse(raw)
  if (!Number.isFinite(parsed)) return null
  const d = new Date(parsed)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

function daysInclusive(startMs, endMs) {
  return Math.floor((endMs - startMs) / 86400000) + 1
}

/**
 * Clip a breakdown interval to the report window; return overlap hours.
 * Prefers start/end when both present; else uses calendarHours as full duration.
 */
export function clipBreakdownHoursToWindow({
  breakdownStartAt,
  breakdownEndAt,
  calendarHours,
  windowStart,
  windowEnd,
}) {
  const winStart = parseInstantStart(windowStart)
  const winEnd = parseInstantEnd(windowEnd)
  if (winStart == null || winEnd == null || winEnd < winStart) return 0

  const start = Date.parse(breakdownStartAt || '')
  const end = Date.parse(breakdownEndAt || '')
  if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
    const overlapStart = Math.max(start, winStart)
    const overlapEnd = Math.min(end, winEnd)
    if (overlapEnd < overlapStart) return 0
    return roundHours((overlapEnd - overlapStart) / 3600000)
  }

  const hours = asNonNeg(calendarHours)
  if (hours <= 0) return 0
  if (Number.isFinite(start)) {
    const assumedEnd = start + hours * 3600000
    const overlapStart = Math.max(start, winStart)
    const overlapEnd = Math.min(assumedEnd, winEnd)
    if (overlapEnd < overlapStart) return 0
    return roundHours((overlapEnd - overlapStart) / 3600000)
  }
  return roundHours(hours)
}

function parseInstantStart(value) {
  const raw = String(value || '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return toUtcDateOnly(raw)
  }
  const t = Date.parse(value || '')
  if (Number.isFinite(t)) return t
  return toUtcDateOnly(value)
}

function parseInstantEnd(value) {
  const raw = String(value || '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const day = toUtcDateOnly(raw)
    return day == null ? null : day + 86400000 - 1
  }
  const t = Date.parse(value || '')
  return Number.isFinite(t) ? t : null
}

/** Running hours from meter cumulative boundaries. */
export function meterRunningHours(cumulativeAtOrBeforeFrom, cumulativeAtOrBeforeTo) {
  const start = cumulativeAtOrBeforeFrom == null ? null : Number(cumulativeAtOrBeforeFrom)
  const end = cumulativeAtOrBeforeTo == null ? null : Number(cumulativeAtOrBeforeTo)
  if (!Number.isFinite(end)) return NA
  const base = Number.isFinite(start) ? start : 0
  const delta = end - base
  if (delta < 0) return NA
  return roundHours(delta)
}

export function buildEquipmentMetrics(input) {
  const runningHours = input.runningHours == null ? NA : roundHours(asNonNeg(input.runningHours))
  const failures = Math.max(0, Math.floor(asNonNeg(input.failures)))
  const calendarBdHours = roundHours(asNonNeg(input.calendarBdHours))
  const operationalBdHours = roundHours(asNonNeg(input.operationalBdHours))
  const repairHours = roundHours(asNonNeg(input.repairHours))
  const completedRepairs = Math.max(0, Math.floor(asNonNeg(input.completedRepairs)))
  const evaluationHours = asNonNeg(input.evaluationHours)
  const otherHours = calcOtherElapsedHours(calendarBdHours, repairHours)

  const mtbf = calcMtbf(runningHours ?? 0, failures)
  const mttr = calcMttr(repairHours, completedRepairs)
  const failureRate = calcFailureRate(failures, runningHours ?? 0)
  const reliabilityPct = calcReliabilityPct(failureRate, evaluationHours)
  const inherentPct = calcInherentAvailabilityPct(mtbf, mttr)
  const operationalPct = calcOperationalAvailabilityPct(runningHours ?? 0, operationalBdHours, failures)

  return {
    equipmentId: input.equipmentId || null,
    equipmentCode: input.equipmentCode || '',
    equipmentName: input.equipmentName || '',
    plantName: input.plantName || '',
    departmentName: input.departmentName || '',
    hoursMethod: input.hoursMethod || RELIABILITY_HOURS_METHOD.NA,
    runningHours,
    failures,
    calendarBdHours,
    operationalBdHours,
    repairHours,
    otherHours,
    completedRepairs,
    mtbf,
    mttr,
    failureRate,
    reliabilityPct,
    inherentPct,
    operationalPct,
    evaluationHours,
  }
}

export function buildPlantSummary(equipmentRows, evaluationHours) {
  const rows = Array.isArray(equipmentRows) ? equipmentRows : []

  let totalRunning = 0
  let totalFailures = 0
  let totalCalendarBd = 0
  let totalOperationalBd = 0
  let totalRepair = 0
  let totalCompletedRepairs = 0

  for (const row of rows) {
    totalRunning += asNonNeg(row.runningHours)
    totalFailures += asNonNeg(row.failures)
    totalCalendarBd += asNonNeg(row.calendarBdHours)
    totalOperationalBd += asNonNeg(row.operationalBdHours)
    totalRepair += asNonNeg(row.repairHours)
    totalCompletedRepairs += asNonNeg(row.completedRepairs)
  }

  const otherHours = calcOtherElapsedHours(totalCalendarBd, totalRepair)
  const mtbf = calcMtbf(totalRunning, totalFailures)
  const mttr = calcMttr(totalRepair, totalCompletedRepairs)
  const failureRate = calcFailureRate(totalFailures, totalRunning)
  const t = asNonNeg(evaluationHours)
  const reliabilityPct = calcReliabilityPct(failureRate, t)
  const inherentPct = calcInherentAvailabilityPct(mtbf, mttr)
  const operationalPct = calcOperationalAvailabilityPct(totalRunning, totalOperationalBd, totalFailures)

  return {
    equipmentIncluded: rows.length,
    breakdownEvents: totalFailures,
    calendarBreakdownHours: roundHours(totalCalendarBd),
    verifiedActiveRepairHours: roundHours(totalRepair),
    totalRunningHours: roundHours(totalRunning),
    completedRepairs: totalCompletedRepairs,
    operationalBreakdownHours: roundHours(totalOperationalBd),
    otherElapsedHours: otherHours,
    mtbf,
    mttr,
    failureRate,
    reliabilityPct,
    inherentAvailabilityPct: inherentPct,
    operationalAvailabilityPct: operationalPct,
    evaluationHours: t,
  }
}

export function buildCalculationExamples({ equipmentRow, plantSummary, evaluationHours }) {
  const t = asNonNeg(evaluationHours)
  const eq = equipmentRow || null
  const plant = plantSummary || null

  const equipmentExample = eq ? [
    {
      metric: 'MTBF',
      formula: 'Running Hours / Failure Count',
      substitution: formatDivision(eq.runningHours, eq.failures),
      result: formatHoursResult(eq.mtbf),
    },
    {
      metric: 'MTTR',
      formula: 'Verified Active Repair Hours / Completed Repairs',
      substitution: formatDivision(eq.repairHours, eq.completedRepairs),
      result: formatHoursResult(eq.mttr),
    },
    {
      metric: 'Failure Rate',
      formula: 'Failure Count / Running Hours',
      substitution: formatDivision(eq.failures, eq.runningHours),
      result: formatRateResult(eq.failureRate),
    },
    {
      metric: 'Reliability',
      formula: 'exp(-Failure Rate × Evaluation Hours) × 100',
      substitution: `exp(-(${formatPlain(eq.failures)}/${formatPlain(eq.runningHours)}) × ${formatPlain(t)}) × 100`,
      result: formatPctResult(eq.reliabilityPct),
    },
    {
      metric: 'Inherent Availability',
      formula: 'MTBF / (MTBF + MTTR) × 100',
      substitution: eq.mtbf == null || eq.mttr == null
        ? 'N/A'
        : `${formatPlain(eq.mtbf)} / (${formatPlain(eq.mtbf)} + ${formatPlain(eq.mttr)}) × 100`,
      result: formatPctResult(eq.inherentPct),
    },
    {
      metric: 'Operational Availability',
      formula: 'Running Hours / (Running Hours + Operational BD Hours) × 100',
      substitution: `${formatPlain(eq.runningHours)} / (${formatPlain(eq.runningHours)} + ${formatPlain(eq.operationalBdHours)}) × 100`,
      result: formatPctResult(eq.operationalPct),
    },
    {
      metric: 'Other Elapsed Hours',
      formula: 'Calendar Breakdown Hours − Active Repair Hours',
      substitution: `${formatPlain(eq.calendarBdHours)} − ${formatPlain(eq.repairHours)}`,
      result: formatHoursResult(eq.otherHours),
    },
  ] : []

  const plantExample = plant ? [
    {
      metric: 'Overall MTBF',
      formula: 'Total Running Hours / Total Failures',
      substitution: formatDivision(plant.totalRunningHours, plant.breakdownEvents),
      result: formatHoursResult(plant.mtbf),
    },
    {
      metric: 'Overall MTTR',
      formula: 'Total Verified Repair Hours / Completed Repairs',
      substitution: formatDivision(plant.verifiedActiveRepairHours, plant.completedRepairs),
      result: formatHoursResult(plant.mttr),
    },
    {
      metric: 'Overall Failure Rate',
      formula: 'Total Failures / Total Running Hours',
      substitution: formatDivision(plant.breakdownEvents, plant.totalRunningHours),
      result: formatRateResult(plant.failureRate),
    },
    {
      metric: 'Overall Reliability',
      formula: 'exp(-(Failures / Running Hours) × t) × 100',
      substitution: `exp(-(${formatPlain(plant.breakdownEvents)}/${formatPlain(plant.totalRunningHours)}) × ${formatPlain(t)}) × 100`,
      result: formatPctResult(plant.reliabilityPct),
    },
    {
      metric: 'Overall Inherent Availability',
      formula: 'MTBF / (MTBF + MTTR) × 100',
      substitution: plant.mtbf == null || plant.mttr == null
        ? 'N/A'
        : `${formatPlain(plant.mtbf)} / (${formatPlain(plant.mtbf)} + ${formatPlain(plant.mttr)}) × 100`,
      result: formatPctResult(plant.inherentAvailabilityPct),
    },
    {
      metric: 'Overall Operational Availability',
      formula: 'Running Hours / (Running Hours + Operational BD Hours) × 100',
      substitution: `${formatPlain(plant.totalRunningHours)} / (${formatPlain(plant.totalRunningHours)} + ${formatPlain(plant.operationalBreakdownHours)}) × 100`,
      result: formatPctResult(plant.operationalAvailabilityPct),
    },
    {
      metric: 'Other Elapsed Hours',
      formula: 'Calendar Breakdown Hours − Active Repair Hours',
      substitution: `${formatPlain(plant.calendarBreakdownHours)} − ${formatPlain(plant.verifiedActiveRepairHours)}`,
      result: formatHoursResult(plant.otherElapsedHours),
    },
  ] : []

  return {
    evaluationHours: t,
    equipmentLabel: eq
      ? [eq.equipmentName || eq.equipmentCode, eq.plantName].filter(Boolean).join(' / ')
      : null,
    equipmentExample,
    plantExample,
  }
}

function formatPlain(value) {
  if (value == null || !Number.isFinite(Number(value))) return 'N/A'
  return String(value)
}

function formatDivision(numerator, denominator) {
  if (numerator == null || denominator == null) return 'N/A'
  if (!Number.isFinite(Number(numerator)) || !Number.isFinite(Number(denominator))) return 'N/A'
  return `${formatNumberWithCommas(numerator)} / ${formatNumberWithCommas(denominator)}`
}

function formatNumberWithCommas(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 'N/A'
  return n.toLocaleString('en-US')
}

function formatHoursResult(value) {
  if (value == null) return 'N/A'
  return `${Number(value).toFixed(2)} h`
}

function formatRateResult(value) {
  if (value == null) return 'N/A'
  return `${Number(value).toFixed(6)} failures/h`
}

function formatPctResult(value) {
  if (value == null) return 'N/A'
  return `${Number(value).toFixed(2)}%`
}

export const PLANT_SUMMARY_TERMINOLOGY = (
  'Terminology: Overall Plant Equipment Reliability is a combined equipment-population indicator, not the reliability of the entire interconnected plant.'
)
