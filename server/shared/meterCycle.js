/**
 * A meter face starts again at 0 after a reset.
 * Cumulative reading is that face value plus every total closed by an earlier reset.
 * Reset at 1,00,000, then a face reading of 500, and the cumulative reading is 1,00,500.
 */

const METER_SCALE = 1e6

export function roundMeter(value) {
  if (value == null || value === '') return null
  const reading = Number(value)
  if (!Number.isFinite(reading)) return null
  return Math.round((reading + Number.EPSILON) * METER_SCALE) / METER_SCALE
}

export function cumulativeFromOffset(offset, reading) {
  const face = roundMeter(reading)
  if (face == null) return null
  const base = roundMeter(offset) ?? 0
  return roundMeter(base + face)
}

export function canResetMeter(lastReading) {
  const face = roundMeter(lastReading)
  return face != null && face > 0
}

/** Offset stored on the reset row: previous cycle offset plus the face value being closed. */
export function resetCycleOffset(currentOffset, lastReading) {
  if (!canResetMeter(lastReading)) return null
  return cumulativeFromOffset(currentOffset, lastReading)
}

function timeValue(value) {
  const time = Date.parse(value || '')
  return Number.isFinite(time) ? time : 0
}

function compareReadings(left, right) {
  const byReadingAt = timeValue(left?.reading_at) - timeValue(right?.reading_at)
  if (byReadingAt !== 0) return byReadingAt
  const byCreated = timeValue(left?.created_at) - timeValue(right?.created_at)
  if (byCreated !== 0) return byCreated
  return String(left?.id || '').localeCompare(String(right?.id || ''))
}

/**
 * Replay a meter's readings in time order.
 * A reset closes the previous face value into the cycle offset and records face 0.
 * Later face readings add onto that offset.
 */
export function annotateMeterCycle(readings) {
  const ordered = [...(readings || [])].sort(compareReadings)
  let offset = 0
  let lastFace = null
  const annotated = []

  for (const row of ordered) {
    if (row?.is_reset === true) {
      const closed = lastFace == null ? 0 : lastFace
      offset = roundMeter(offset + closed) ?? offset
      annotated.push({
        ...row,
        reading: 0,
        is_reset: true,
        cycle_offset: offset,
        cumulative_reading: offset,
      })
      lastFace = 0
      continue
    }

    const face = roundMeter(row?.reading) ?? 0
    const cumulative = roundMeter(offset + face) ?? face
    annotated.push({
      ...row,
      reading: face,
      is_reset: false,
      cycle_offset: offset,
      cumulative_reading: cumulative,
    })
    lastFace = face
  }

  const latest = annotated.at(-1) || null
  return {
    readings: annotated,
    meter_reading_offset: latest ? latest.cycle_offset : 0,
    last_reading: latest ? latest.reading : null,
    cumulative_reading: latest ? latest.cumulative_reading : null,
  }
}
