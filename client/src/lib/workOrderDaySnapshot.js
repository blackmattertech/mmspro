export const DAILY_SNAPSHOT_ACTIVE_STATUSES = new Set([
  'assigned',
  'accepted',
  'started',
  'in_progress',
  'waiting_material',
  'waiting_shutdown',
  'on_hold',
])

export function todayDateString(timeZone) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date())
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

export function formatDayTabLabel(log) {
  const datePart = (() => {
    if (!log?.log_date) return 'Day'
    try {
      return new Date(`${log.log_date}T12:00:00`).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    } catch {
      return log.log_date
    }
  })()
  const stamp = log?.updated_at || log?.ended_at || log?.started_at
  if (!stamp) return datePart
  try {
    const time = new Date(stamp).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    })
    return `${datePart} · ${time}`
  } catch {
    return datePart
  }
}

export function blankExecutionForm() {
  return {
    permit_required: false,
    permit_types: [],
    permit_details: [],
    permit_number: '',
    permit_issue_at: '',
    permit_expiry_at: '',
    work_start_at: '',
    work_end_at: '',
    vendor_id: '',
    vendor_expense: '',
    vendor_currency: 'USD',
    labour_count: '',
    breakdown_start_at: '',
    breakdown_end_at: '',
    job_description: '',
    root_cause: '',
    action_taken: '',
    material_rows: [{ code: '', description: '', uom: '', qty: '' }],
    special_tools_used: '',
    safety_precautions: '',
    dos: '',
    donts: '',
    lessons_learned: '',
    execution_remarks: '',
    verification_remarks: '',
    remarks: '',
    checklist_values: {},
  }
}

function parseDosDonts(value) {
  if (!value) return { dos: '', donts: '' }
  if (typeof value === 'object') {
    return {
      dos: Array.isArray(value.dos) ? value.dos.join('\n') : String(value.dos || ''),
      donts: Array.isArray(value.donts) ? value.donts.join('\n') : String(value.donts || ''),
    }
  }
  try {
    const parsed = JSON.parse(value)
    return parseDosDonts(parsed)
  } catch {
    return { dos: String(value), donts: '' }
  }
}

function hasChecklistAnswers(values) {
  if (!values || typeof values !== 'object') return false
  return Object.values(values).some((value) => {
    if (value === true) return true
    if (value == null) return false
    return String(value).trim() !== ''
  })
}

/**
 * Map a day field_snapshot onto lifecycle form fields.
 * Empty snapshot slots are omitted so callers can keep WO-level values
 * (avoids wiping work stamps / checklist when a day never set them).
 */
export function formPatchFromSnapshot(snapshot = {}, { blankMissing = false } = {}) {
  const dosDonts = parseDosDonts(snapshot.dos_and_donts)
  const materials = Array.isArray(snapshot.material_rows) && snapshot.material_rows.length
    ? snapshot.material_rows
    : (blankMissing ? [{ code: '', description: '', uom: '', qty: '' }] : null)

  const patch = {}
  const assign = (key, value, { allowEmpty = false } = {}) => {
    if (value == null) {
      if (blankMissing) patch[key] = ''
      return
    }
    if (typeof value === 'string' && !value.trim() && !allowEmpty) {
      if (blankMissing) patch[key] = ''
      return
    }
    patch[key] = value
  }

  assign('labour_count', snapshot.labour_count ?? (blankMissing ? '' : null), { allowEmpty: true })
  assign('work_start_at', snapshot.work_start_at || null)
  assign('work_end_at', snapshot.work_end_at || null)
  assign('job_description', snapshot.job_description || null)
  assign('root_cause', snapshot.root_cause || null)
  assign('action_taken', snapshot.action_taken || null)
  if (materials) patch.material_rows = materials
  assign('special_tools_used', snapshot.special_tools_used || null)
  assign('safety_precautions', snapshot.safety_precautions || null)
  if (blankMissing || dosDonts.dos) patch.dos = dosDonts.dos
  if (blankMissing || dosDonts.donts) patch.donts = dosDonts.donts
  assign('lessons_learned', snapshot.lessons_learned || null)
  assign('execution_remarks', snapshot.execution_remarks || null)
  if (blankMissing) patch.remarks = ''

  const checklist = snapshot.checklist_values && typeof snapshot.checklist_values === 'object'
    ? snapshot.checklist_values
    : null
  if (hasChecklistAnswers(checklist)) {
    patch.checklist_values = checklist
  } else if (blankMissing) {
    patch.checklist_values = {}
  }

  return patch
}
