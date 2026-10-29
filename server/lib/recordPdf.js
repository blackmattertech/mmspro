import PDFDocument from 'pdfkit'
import { supabaseAdmin } from '../services/supabase.js'
import { displayWorkOrderNumber, loadWorkOrderTimeline } from './workOrderService.js'
import { getWorkRequestById } from './workRequestService.js'
import { listWorkOrderDailyLogs, sanitizeDailyLogMaterials } from './workOrderDailyLogService.js'
import { loadOrgLetterhead } from './reportService.js'
import { progressPercentForStatus } from './statusProgress.js'

const COMPLETED_STATUSES = new Set(['completed', 'verified', 'closed'])

const SOURCE_LABELS = {
  approved_work_request: 'Work request',
  preventive_maintenance: 'Preventive maintenance',
  manual: 'Manual',
  breakdown: 'Work request',
  user_self_request: 'User self request',
}

const PERMIT_LABELS = {
  hot_work: 'Hot Work Permit',
  cold_work: 'Cold Work Permit',
  confined_space: 'Confined Space Permit',
  excavation: 'Excavation Permit',
  electrical_isolation: 'Electrical Isolation',
  loto: 'LOTO',
  height_work: 'Height Work',
  radiography: 'Radiography',
}

function httpError(message, status = 400) {
  const err = new Error(message)
  err.status = status
  return err
}

function isCompletedStatus(status) {
  return COMPLETED_STATUSES.has(String(status || '').toLowerCase())
}

function prettyLabel(key) {
  return String(key || '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function prettyStatus(value) {
  return prettyLabel(value)
}

function parseJsonValue(raw) {
  if (raw == null || raw === '') return null
  if (typeof raw === 'object') return raw
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function isIsoDate(value) {
  return typeof value === 'string' && (
    /^\d{4}-\d{2}-\d{2}T/.test(value) || /^\d{4}-\d{2}-\d{2}$/.test(value)
  )
}

function formatWhen(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  if (typeof value === 'string' && value.length <= 10) {
    return date.toLocaleDateString('en-IN', { dateStyle: 'medium' })
  }
  return date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
}

function personName(person) {
  if (!person) return ''
  if (typeof person === 'string') return person
  return person.display_name || person.full_name || person.name || person.email || ''
}

function displayText(value, { empty = '—' } = {}) {
  if (value == null || value === '') return empty
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : empty
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (isIsoDate(trimmed)) return formatWhen(trimmed) || empty
    if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && (trimmed.includes('"files"') || trimmed.includes('"name"'))) {
      const parsed = parseJsonValue(trimmed)
      if (parsed) return displayText(parsed, { empty })
    }
    return value
  }
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => displayText(item, { empty: '' }))
      .filter(Boolean)
    return parts.length ? parts.join(', ') : empty
  }
  if (typeof value === 'object') {
    if (Array.isArray(value.files)) return attachmentNames(value.files) || empty
    if (value.label != null && String(value.label).trim()) return String(value.label)
    if (value.name != null && String(value.name).trim()) return String(value.name)
    if (value.full_name != null) return personName(value)
    if (Array.isArray(value.values)) return displayText(value.values, { empty })
    try {
      return JSON.stringify(value)
    } catch {
      return empty
    }
  }
  return String(value)
}

function attachmentNames(files) {
  const list = Array.isArray(files) ? files : []
  return list
    .map((file) => (typeof file === 'string' ? file : (file?.name || file?.path || '')))
    .map((name) => String(name).trim())
    .filter(Boolean)
    .join(', ')
}

function line(label, value) {
  return [label, value]
}

function maybeLine(label, value) {
  const text = displayText(value, { empty: '' })
  if (!text) return null
  return [label, value]
}

function compact(lines) {
  return (lines || []).filter(Boolean)
}

function section(heading, lines) {
  const next = compact(lines)
  if (!next.length) return null
  return { heading, lines: next }
}

function formatDosDonts(raw) {
  const parsed = parseJsonValue(raw)
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const dos = String(parsed.dos || '').trim()
    const donts = String(parsed.donts || parsed.dont || '').trim()
    return [dos && `Do: ${dos}`, donts && `Don't: ${donts}`].filter(Boolean).join('\n')
  }
  return String(raw || '').trim()
}

function parseMaterialRows(raw) {
  if (Array.isArray(raw)) return sanitizeDailyLogMaterials(raw)
  const parsed = parseJsonValue(raw)
  if (Array.isArray(parsed)) return sanitizeDailyLogMaterials(parsed)
  if (typeof raw === 'string' && raw.trim()) {
    return [{ code: '', description: raw.trim(), uom: '', qty: '' }]
  }
  return []
}

const MATERIAL_COLUMNS = [
  { key: 'sno', label: 'S.No', width: 0.08, align: 'center' },
  { key: 'code', label: 'Material code', width: 0.2 },
  { key: 'description', label: 'Material description', width: 0.44 },
  { key: 'uom', label: 'UOM', width: 0.14, align: 'center' },
  { key: 'qty', label: 'Qty', width: 0.14, align: 'center' },
]

function materialTable(raw) {
  const rows = parseMaterialRows(raw)
  if (!rows.length) return null
  return {
    columns: MATERIAL_COLUMNS,
    rows: rows.map((row, index) => ({
      sno: String(index + 1),
      code: row.code || '—',
      description: row.description || '—',
      uom: row.uom || '—',
      qty: row.qty || '—',
    })),
  }
}

function permitTypeLabel(type) {
  if (!type) return ''
  return PERMIT_LABELS[type] || prettyLabel(type)
}

function permitSections(order) {
  const required = Boolean(order?.permit_required)
  const details = Array.isArray(order?.permit_details) ? order.permit_details : []
  const types = Array.isArray(order?.permit_types) ? order.permit_types : []
  const rows = details.length
    ? details
    : types.map((type) => ({ type }))
  const fallback = (!rows.length && (order?.permit_number || order?.permit_issue_at || order?.permit_expiry_at))
    ? [{
      type: types[0] || '',
      number: order.permit_number,
      issue_at: order.permit_issue_at,
      expiry_at: order.permit_expiry_at,
    }]
    : rows

  const lines = [line('Permit required', required ? 'Yes' : 'No')]
  fallback.forEach((row, index) => {
    const prefix = fallback.length > 1 ? `Permit ${index + 1} ` : ''
    lines.push(maybeLine(`${prefix}Type`, permitTypeLabel(row.type)))
    lines.push(maybeLine(`${prefix}Number`, row.number || order.permit_number))
    lines.push(maybeLine(`${prefix}Issue date`, row.issue_at || order.permit_issue_at))
    lines.push(maybeLine(`${prefix}Expiry date`, row.expiry_at || order.permit_expiry_at))
  })
  lines.push(maybeLine('Permit attachments', attachmentNames(order?.permit_attachments)))
  return section('Permit details', lines)
}

function hierarchyLines(steps) {
  const list = Array.isArray(steps) ? steps : []
  const seen = new Set()
  const lines = []
  for (const step of list) {
    const name = String(step?.field_name || step?.label || '').trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    lines.push(line(name, step.value || step.value_text || ''))
  }
  return lines
}

function layoutFieldLines(fields) {
  return (Array.isArray(fields) ? fields : [])
    .map((field) => maybeLine(field.label || field.name || prettyLabel(field.id), field.value || field.display_value || field.value_text))
}

function checklistLines(snapshot, values) {
  const fields = snapshot?.fields || []
  return fields.map((field) => line(field.name || field.label || prettyLabel(field.id), values?.[field.id]))
}

function timelineLines(events) {
  return (Array.isArray(events) ? events : []).map((event) => {
    const actor = personName(event.actor)
    const change = event.previous_status || event.new_status
      ? `${prettyStatus(event.previous_status || '')}${event.previous_status && event.new_status ? ' → ' : ''}${prettyStatus(event.new_status || '')}`
      : prettyStatus(event.event_type)
    const message = [event.message, event.remarks].filter(Boolean).join(' — ')
    const detail = [change, message, actor && `by ${actor}`].filter(Boolean).join(' · ')
    return line(formatWhen(event.created_at) || 'Event', detail || prettyStatus(event.event_type))
  })
}

function dailyLogSections(logs) {
  return (Array.isArray(logs) ? logs : []).map((log) => {
    const lines = compact([
      maybeLine('Status', prettyStatus(log.day_status)),
      maybeLine('Started', log.started_at),
      maybeLine('Ended', log.ended_at),
      maybeLine('Labour count', log.labour_count),
      maybeLine('Work done', log.work_done),
      maybeLine('Remarks', log.remarks),
    ])
    const table = materialTable(log.materials)
    if (!lines.length && !table) return null
    return {
      heading: `Daily log — ${log.log_date || formatWhen(log.started_at) || 'Day'}`,
      lines,
      table,
    }
  }).filter(Boolean)
}

function equipmentLines(equipment) {
  if (!equipment) return []
  return compact([
    maybeLine('Asset', equipment.name || equipment.equipment_name),
    maybeLine('Code', equipment.code || equipment.tag_number),
    maybeLine('QR code', equipment.qr_code),
    maybeLine('Location', equipment.location_name || equipment.org_locations?.name),
    maybeLine('Department', equipment.department_name || equipment.departments?.name),
    maybeLine('Area', equipment.area_name || equipment.areas?.name),
  ])
}

function assetLines(record) {
  const hierarchy = hierarchyLines(record?.asset_hierarchy)
  const equipment = equipmentLines(record?.equipment)
  if (!hierarchy.length) return equipment
  const labels = new Set(hierarchy.map(([label]) => String(label).toLowerCase()))
  const extras = equipment.filter(([label]) => {
    const key = String(label).toLowerCase()
    if (key === 'qr code') return true
    if (labels.has(key)) return false
    if ((key === 'asset' || key === 'equipment') && (
      labels.has('asset name') || labels.has('asset')
      || labels.has('equipment name') || labels.has('equipment')
    )) return false
    if (key === 'code' && (
      labels.has('asset code') || labels.has('equipment code') || labels.has('code')
    )) return false
    return true
  })
  return [...extras, ...hierarchy]
}

function workRequestSections(request) {
  if (!request) return []
  const jobNature = request.job_nature
    || request.job_nature_label
    || (request.is_breakdown ? 'Breakdown' : '')
  const technicians = (request.assigned_technicians || [])
    .map((row) => [row.name, row.emp_id && `(${row.emp_id})`].filter(Boolean).join(' '))
    .filter(Boolean)
    .join(', ')

  return [
    section('Work request', [
      line('Request number', request.request_number),
      line('Status', prettyStatus(request.status)),
      maybeLine('Execution status', prettyStatus(request.execution_status)),
      maybeLine('Priority', prettyStatus(request.priority)),
      maybeLine('Request type', prettyStatus(request.request_type)),
      maybeLine('Job nature', jobNature),
      maybeLine('Breakdown', request.is_breakdown == null ? '' : request.is_breakdown),
      maybeLine('Request date', request.request_date || request.created_at),
      maybeLine('From department', request.order_from?.name),
      maybeLine('To department', request.order_to?.name),
      maybeLine('Requested by', personName(request.requester)),
      maybeLine('Approved by', personName(request.approver)),
      maybeLine('Short description', request.short_description),
      maybeLine('Problem description', request.problem_description),
      maybeLine('Remarks', request.remarks),
      maybeLine('Assigned technicians', technicians),
    ]),
    section('Asset information', assetLines(request)),
    section('Request form fields', [
      ...layoutFieldLines(request.layout_fields),
      ...layoutFieldLines(request.breakdown_fields),
    ]),
    section('Request attachments', [
      maybeLine('Files', attachmentNames(request.attachments)),
    ]),
    section('Request checklist', checklistLines(request.checklist_snapshot, request.checklist_values)),
    section('Request progress', timelineLines(request.timeline)),
  ].filter(Boolean)
}

function workOrderSections(order, { includeAsset = true } = {}) {
  if (!order) return []
  const assignees = (order.assignees || [])
    .map((row) => [row.name, row.emp_id && `(${row.emp_id})`].filter(Boolean).join(' '))
    .filter(Boolean)
    .join(', ')
  const progress = progressPercentForStatus(order.status)
  const source = SOURCE_LABELS[order.source_type] || prettyLabel(order.source_type)

  return [
    section('Work order', [
      line('WO number', displayWorkOrderNumber(order) || order.wo_number),
      line('Status', prettyStatus(order.status)),
      line('Progress', `${progress}%`),
      maybeLine('Priority', prettyStatus(order.priority)),
      maybeLine('Source', source),
      maybeLine('Job nature', order.job_nature || (order.is_breakdown ? 'Breakdown' : '')),
      maybeLine('Work center', order.work_center),
      maybeLine('Location', order.assigned_location?.name),
      maybeLine('Department', order.assigned_department?.name),
      maybeLine('Assignees', assignees),
      maybeLine('Created by', personName(order.creator)),
      maybeLine('Created at', order.created_at),
      maybeLine('Planned start', order.planned_start_at),
      maybeLine('Planned end', order.planned_end_at),
      maybeLine('Scheduled at', order.scheduled_at),
      maybeLine('Short description', order.short_description || order.summary),
      maybeLine('Problem', order.problem_description),
      maybeLine('Special instructions', order.special_instructions),
    ]),
    includeAsset ? section('Work order asset information', assetLines(order)) : null,
    permitSections(order),
    section('Work execution', [
      line('Work start', order.work_start_at),
      line('Work end', order.work_end_at),
      line('Labour count', order.labour_count),
      maybeLine('Vendor expense', order.vendor_expense),
      maybeLine('Vendor currency', order.vendor_currency),
      maybeLine('Breakdown start', order.breakdown_start_at),
      maybeLine('Breakdown end', order.breakdown_end_at),
      maybeLine('Breakdown duration (hours)', order.breakdown_duration_hours),
    ]),
    ...dailyLogSections(order.daily_logs),
    (() => {
      const table = materialTable(
        parseMaterialRows(order.material_summary).length
          ? order.material_summary
          : order.material_consumed,
      )
      return table ? { heading: 'Materials consumed', lines: [], table } : null
    })(),
    section('Maintenance documentation', [
      line('Detailed job description', order.job_description),
      line('Root cause analysis', order.root_cause),
      line('Action taken', order.action_taken),
      maybeLine('Special tools used', order.special_tools_used),
      maybeLine('Safety precautions', order.safety_precautions),
      maybeLine("Do's and don'ts", formatDosDonts(order.dos_and_donts)),
      maybeLine('Lessons learned', order.lessons_learned),
      maybeLine('Remarks', order.execution_remarks),
      maybeLine('Technician photos & files', attachmentNames(order.execution_attachments || order.attachments)),
    ]),
    section('Supervisor verification', [
      maybeLine('Verification remarks', order.verification_remarks),
    ]),
    section('Work order checklist', checklistLines(order.checklist_snapshot, order.checklist_values)),
    section('Work order progress', timelineLines(order.timeline)),
  ].filter(Boolean)
}

function drawLetterhead(doc, letterhead) {
  const margin = doc.page.margins.left
  const width = doc.page.width - margin * 2
  const top = doc.y
  const logoSize = 58
  const hasLogo = Boolean(letterhead?.logo)
  const textX = margin + (hasLogo ? logoSize + 14 : 0)
  const textW = width - (textX - margin)

  if (hasLogo) {
    try {
      doc.image(letterhead.logo, margin, top, {
        fit: [logoSize, logoSize],
        align: 'center',
        valign: 'center',
      })
    } catch {
      // unsupported image type
    }
  }

  doc.font('Helvetica-Bold').fontSize(15).fillColor('#111827')
  doc.text(letterhead?.name || 'Company', textX, top, { width: textW })
  doc.font('Helvetica').fontSize(9).fillColor('#374151')
  const contact = [
    letterhead?.phone ? `Phone: ${letterhead.phone}` : '',
    letterhead?.email ? `Email: ${letterhead.email}` : '',
  ].filter(Boolean).join('    ')
  const details = [letterhead?.address, contact, letterhead?.website].filter((line) => String(line || '').trim())
  for (const line of details) {
    doc.text(line, { width: textW })
  }

  const bottom = Math.max(doc.y, top + (hasLogo ? logoSize : 0))
  doc.save()
  doc.moveTo(margin, bottom + 10).lineTo(margin + width, bottom + 10).lineWidth(1).strokeColor('#D1D5DB').stroke()
  doc.restore()
  doc.x = margin
  doc.y = bottom + 20
}

function ensureSpace(doc, needed) {
  const bottom = doc.page.height - doc.page.margins.bottom
  if (doc.y + needed > bottom) {
    doc.addPage()
  }
}

function writeField(doc, label, value) {
  const margin = doc.page.margins.left
  const width = doc.page.width - margin * 2
  const labelW = 150
  const gap = 10
  const valueW = width - labelW - gap
  const text = displayText(value)
  doc.font('Helvetica').fontSize(9)
  const height = Math.max(
    doc.heightOfString(String(label || ''), { width: labelW }),
    doc.heightOfString(text, { width: valueW }),
    12,
  ) + 5
  ensureSpace(doc, height)
  const y = doc.y
  doc.font('Helvetica').fontSize(8).fillColor('#6B7280').text(String(label || ''), margin, y, { width: labelW })
  doc.font('Helvetica').fontSize(9).fillColor('#111827').text(text, margin + labelW + gap, y, { width: valueW })
  doc.x = margin
  doc.y = y + height
}

function cellHeight(doc, text, width, { bold = false, size = 8 } = {}) {
  doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size)
  return Math.max(doc.heightOfString(String(text || '—'), { width: Math.max(width - 10, 12) }) + 10, 18)
}

function writeTable(doc, table) {
  const margin = doc.page.margins.left
  const width = doc.page.width - margin * 2
  const cols = (table.columns || []).map((col) => ({
    ...col,
    width: width * (col.width || 0),
  }))
  if (!cols.length) return

  const drawHeader = () => {
    const headerH = 20
    ensureSpace(doc, headerH + 24)
    const y = doc.y
    let x = margin
    doc.save()
    doc.rect(margin, y, width, headerH).fillColor('#F2F4F7').fill()
    doc.restore()
    for (const col of cols) {
      doc.save()
      doc.lineWidth(0.5).strokeColor('#D1D5DB').rect(x, y, col.width, headerH).stroke()
      doc.restore()
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#111827')
      doc.text(col.label, x + 5, y + 6, {
        width: col.width - 10,
        align: col.align || 'left',
      })
      x += col.width
    }
    doc.x = margin
    doc.y = y + headerH
  }

  drawHeader()
  for (const row of table.rows || []) {
    const heights = cols.map((col) => cellHeight(doc, row[col.key], col.width))
    const rowH = Math.max(...heights)
    const bottom = doc.page.height - doc.page.margins.bottom
    if (doc.y + rowH > bottom) {
      doc.addPage()
      drawHeader()
    }
    const y = doc.y
    let x = margin
    for (const col of cols) {
      doc.save()
      doc.lineWidth(0.5).strokeColor('#E5E7EB').rect(x, y, col.width, rowH).stroke()
      doc.restore()
      doc.font('Helvetica').fontSize(8).fillColor('#111827')
      doc.text(displayText(row[col.key]), x + 5, y + 5, {
        width: col.width - 10,
        align: col.align || 'left',
      })
      x += col.width
    }
    doc.x = margin
    doc.y = y + rowH
  }
}

function writePdf(res, { title, filename, sections, letterhead }) {
  const doc = new PDFDocument({ margin: 48, size: 'A4' })
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  doc.pipe(res)
  drawLetterhead(doc, letterhead)
  const margin = doc.page.margins.left
  const width = doc.page.width - margin * 2
  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(16).text(title, { width })
  doc.moveDown(0.8)
  for (const item of sections || []) {
    const hasLines = Boolean(item?.lines?.length)
    const hasTable = Boolean(item?.table?.rows?.length)
    if (!item?.heading || (!hasLines && !hasTable)) continue
    ensureSpace(doc, 36)
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#B91C1C').text(item.heading, { width })
    doc.save()
    doc.moveTo(margin, doc.y + 2).lineTo(margin + width, doc.y + 2).lineWidth(0.6).strokeColor('#FECACA').stroke()
    doc.restore()
    doc.moveDown(0.45)
    for (const [label, value] of item.lines || []) {
      writeField(doc, label, value)
    }
    if (hasTable) {
      if (hasLines) doc.moveDown(0.2)
      writeTable(doc, item.table)
    }
    doc.moveDown(0.35)
  }
  doc.end()
}

function fieldLines(row, keys) {
  return keys
    .filter((key) => row && Object.prototype.hasOwnProperty.call(row, key))
    .map((key) => [prettyLabel(key), row[key]])
}

async function loadNamed(table, id, select = 'id, name') {
  if (!id) return null
  const { data, error } = await supabaseAdmin
    .from(table)
    .select(select)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data || null
}

async function loadWorkOrderRecord(orgId, id, { requireCompleted = false } = {}) {
  const { data, error } = await supabaseAdmin
    .from('manual_work_orders')
    .select('*')
    .eq('org_id', orgId)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  if (requireCompleted && !isCompletedStatus(data.status)) {
    throw httpError('The report is available after this work order is completed.', 409)
  }
  if (requireCompleted && data.source_type === 'preventive_maintenance') {
    const saved = data.checklist_values && Object.keys(data.checklist_values).length > 0
    if (!saved) {
      throw httpError('The history PDF is available after the inspection checklist is saved and the work order is completed or closed.', 409)
    }
  }

  const [assigneeResult, creator, location, department, equipment, timeline, daily] = await Promise.all([
    supabaseAdmin
      .from('manual_work_order_assignees')
      .select('employee_id, org_employees(id, name, emp_id)')
      .eq('org_id', orgId)
      .eq('work_order_id', id),
    data.created_by
      ? supabaseAdmin.from('profiles').select('id, email, full_name').eq('id', data.created_by).maybeSingle()
      : Promise.resolve({ data: null }),
    loadNamed('org_locations', data.assigned_location_id, 'id, name, code'),
    loadNamed('departments', data.assigned_department_id, 'id, name'),
    data.equipment_id
      ? loadNamed(
        'equipment',
        data.equipment_id,
        'id, name, code, qr_code, areas(name), departments(name), org_locations(name)',
      )
      : Promise.resolve(null),
    loadWorkOrderTimeline(orgId, id).catch(() => []),
    listWorkOrderDailyLogs(orgId, id).catch(() => ({ logs: [], material_summary: [] })),
  ])

  if (assigneeResult.error) throw assigneeResult.error

  return {
    ...data,
    wo_number: displayWorkOrderNumber(data) || data.wo_number,
    assignees: (assigneeResult.data || []).map((link) => link.org_employees).filter(Boolean),
    creator: creator.data
      ? {
        ...creator.data,
        display_name: creator.data.full_name || creator.data.email || null,
      }
      : null,
    assigned_location: location,
    assigned_department: department,
    equipment: equipment
      ? {
        ...equipment,
        area_name: equipment.areas?.name || null,
        department_name: equipment.departments?.name || null,
        location_name: equipment.org_locations?.name || null,
      }
      : null,
    timeline,
    daily_logs: daily.logs || [],
    material_summary: daily.material_summary || [],
  }
}

async function loadWorkRequestRecord(orgId, id) {
  const request = await getWorkRequestById(orgId, id)
  if (!request) throw httpError('Work request not found.', 404)
  return request
}

async function loadWorkOrderDocument(orgId, id) {
  const order = await loadWorkOrderRecord(orgId, id, { requireCompleted: true })
  if (!order) throw httpError('Work order not found.', 404)

  let request = null
  if (order.work_request_id) {
    try {
      request = await getWorkRequestById(orgId, order.work_request_id)
    } catch {
      request = null
    }
  }

  return {
    title: order.wo_number || 'Work order',
    filename: `${order.wo_number || 'work-order'}.pdf`,
    sections: [
      ...workRequestSections(request),
      ...workOrderSections(order, { includeAsset: !request }),
    ],
  }
}

async function loadWorkRequestDocument(orgId, id) {
  const request = await loadWorkRequestRecord(orgId, id)
  const linkedId = request.manual_work_order_id || request.linked_work_order?.id
  let order = null
  if (linkedId) {
    order = await loadWorkOrderRecord(orgId, linkedId).catch(() => null)
  }

  const completed = isCompletedStatus(request.execution_status)
    || isCompletedStatus(request.status)
    || isCompletedStatus(order?.status)
  if (!completed) {
    throw httpError('The report is available after this work request is completed.', 409)
  }

  return {
    title: request.request_number || 'Work request',
    filename: `${request.request_number || 'work-request'}.pdf`,
    sections: [
      ...workRequestSections(request),
      ...workOrderSections(order, { includeAsset: !request }),
    ],
  }
}

async function loadSimple(orgId, table, id, titleKey, filename, keys) {
  const { data, error } = await supabaseAdmin
    .from(table)
    .select('*')
    .eq('org_id', orgId)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) throw httpError('Record not found.', 404)
  return {
    title: data[titleKey] || filename,
    filename: `${filename}.pdf`,
    sections: [{ heading: 'Record', lines: fieldLines(data, keys) }],
  }
}

async function withLetterhead(orgId, document) {
  const letterhead = await loadOrgLetterhead(orgId)
  return { ...document, letterhead }
}

async function buildRecordDocument(orgId, moduleKey, id) {
  if (moduleKey === 'work_order') return loadWorkOrderDocument(orgId, id)
  if (moduleKey === 'work_request') return loadWorkRequestDocument(orgId, id)
  if (moduleKey === 'task') {
    return loadSimple(orgId, 'tasks', id, 'title', 'task', ['task_number', 'title', 'status_id', 'short_description', 'detailed_description', 'due_date', 'created_at'])
  }
  if (moduleKey === 'warranty') {
    return loadSimple(orgId, 'warranties', id, 'serial_number', 'warranty', ['serial_number', 'vendor', 'contact_name', 'contact_email', 'warranty_start', 'warranty_end', 'expiry_notification_days'])
  }
  if (moduleKey === 'pm_plan') {
    return loadSimple(orgId, 'pm_plans', id, 'name', 'pm-plan', ['plan_number', 'name', 'status', 'schedule_type', 'every_n', 'start_date', 'end_date', 'next_due_at'])
  }
  if (moduleKey === 'location') return loadSimple(orgId, 'org_locations', id, 'name', 'location', ['name', 'code', 'city', 'state', 'country', 'is_active'])
  if (moduleKey === 'department') return loadSimple(orgId, 'departments', id, 'name', 'department', ['name', 'code', 'description', 'is_active'])
  if (moduleKey === 'employee') return loadSimple(orgId, 'org_employees', id, 'name', 'employee', ['emp_id', 'name', 'email', 'mobile', 'is_active'])
  if (moduleKey === 'equipment') return loadSimple(orgId, 'equipment', id, 'name', 'equipment', ['name', 'code', 'status'])
  if (moduleKey === 'vendor') return loadSimple(orgId, 'vendors', id, 'name', 'vendor', ['vendor_code', 'name', 'contact_person', 'email', 'mobile', 'city'])
  if (moduleKey === 'area') return loadSimple(orgId, 'areas', id, 'name', 'area', ['name', 'code', 'is_active'])
  if (moduleKey === 'work_center') return loadSimple(orgId, 'work_centers', id, 'name', 'work-center', ['name', 'code', 'description', 'is_active'])
  if (moduleKey === 'checklist') return loadSimple(orgId, 'checklist_templates', id, 'name', 'checklist', ['name', 'description', 'module_key', 'version', 'is_active'])
  if (moduleKey === 'org_status') return loadSimple(orgId, 'org_statuses', id, 'name', 'status', ['name', 'key', 'entity_type', 'is_active'])
  throw httpError('This record cannot be exported.', 404)
}

export async function buildRecordPdf(orgId, moduleKey, id) {
  return withLetterhead(orgId, await buildRecordDocument(orgId, moduleKey, id))
}

export function sendRecordPdf(res, document) {
  writePdf(res, document)
}
