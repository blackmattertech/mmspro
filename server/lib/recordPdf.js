import PDFDocument from 'pdfkit'
import { supabaseAdmin } from '../services/supabase.js'
import { loadWorkOrderTimeline } from './workOrderService.js'
import { loadOrgLetterhead } from './reportService.js'

const COMPLETED_STATUSES = new Set(['completed', 'verified', 'closed'])

function httpError(message, status = 400) {
  const err = new Error(message)
  err.status = status
  return err
}

function textValue(value) {
  if (value == null || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return value.map((item) => textValue(item)).join(', ')
  if (typeof value === 'object') {
    if (value.name) return String(value.name)
    return JSON.stringify(value)
  }
  return String(value)
}

function isCompletedStatus(status) {
  return COMPLETED_STATUSES.has(String(status || '').toLowerCase())
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

function writePdf(res, { title, filename, sections, letterhead }) {
  const doc = new PDFDocument({ margin: 48, size: 'A4' })
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  doc.pipe(res)
  drawLetterhead(doc, letterhead)
  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(16).text(title)
  doc.moveDown(0.8)
  doc.font('Helvetica')
  for (const section of sections) {
    if (!section?.lines?.length) continue
    doc.fillColor('#111827').fontSize(13).text(section.heading)
    doc.moveDown(0.3)
    for (const [label, value] of section.lines) {
      doc.fontSize(10).fillColor('#6B7280').text(label, { continued: true })
      doc.fillColor('#111827').text(`  ${textValue(value)}`)
    }
    doc.moveDown(0.7)
  }
  doc.end()
}

function fieldLines(row, keys) {
  return keys
    .filter((key) => row && Object.prototype.hasOwnProperty.call(row, key))
    .map((key) => [key.replace(/_/g, ' '), row[key]])
}

async function loadWorkOrder(orgId, id) {
  const { data, error } = await supabaseAdmin
    .from('manual_work_orders')
    .select('*')
    .eq('org_id', orgId)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) throw httpError('Work order not found.', 404)
  if (!isCompletedStatus(data.status)) {
    throw httpError('The report is available after this work order is completed.', 409)
  }
  if (data.source_type === 'preventive_maintenance') {
    const saved = data.checklist_values && Object.keys(data.checklist_values).length > 0
    if (!saved) {
      throw httpError('The history PDF is available after the inspection checklist is saved and the work order is completed or closed.', 409)
    }
  }
  let timeline = []
  try {
    timeline = await loadWorkOrderTimeline(orgId, id)
  } catch {
    timeline = []
  }
  let materials = []
  try {
    const { data: logs } = await supabaseAdmin
      .from('work_order_daily_logs')
      .select('log_date, materials')
      .eq('org_id', orgId)
      .eq('work_order_id', id)
      .order('log_date')
    materials = logs || []
  } catch {
    materials = []
  }
  let request = null
  if (data.work_request_id) {
    const { data: wr } = await supabaseAdmin
      .from('work_requests')
      .select('id, request_number, status, short_description')
      .eq('org_id', orgId)
      .eq('id', data.work_request_id)
      .maybeSingle()
    request = wr
  }
  return {
    title: data.wo_number || 'Work order',
    filename: `${data.wo_number || 'work-order'}.pdf`,
    sections: [
      { heading: 'Work order', lines: fieldLines(data, ['wo_number', 'status', 'priority', 'source_type', 'short_description', 'problem_description', 'work_center', 'scheduled_at', 'created_at']) },
      request ? { heading: 'Linked work request', lines: fieldLines(request, ['request_number', 'status', 'short_description']) } : null,
      { heading: 'Checklist', lines: checklistLines(data.checklist_snapshot, data.checklist_values) },
      { heading: 'Status history', lines: timeline.map((event) => [event.created_at, `${event.previous_status || ''} → ${event.new_status || event.event_type}: ${event.message || ''}`]) },
      { heading: 'Materials', lines: materials.flatMap((log) => (Array.isArray(log.materials) ? log.materials : []).map((item) => [log.log_date, item.name || item.material || JSON.stringify(item)])) },
    ].filter(Boolean),
  }
}

function checklistLines(snapshot, values) {
  const fields = snapshot?.fields || []
  return fields.map((field) => [field.name, values?.[field.id]])
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
  if (moduleKey === 'work_order') return loadWorkOrder(orgId, id)
  if (moduleKey === 'work_request') {
    const { data, error } = await supabaseAdmin.from('work_requests').select('*').eq('org_id', orgId).eq('id', id).maybeSingle()
    if (error) throw error
    if (!data) throw httpError('Work request not found.', 404)
    if (!isCompletedStatus(data.execution_status) && !isCompletedStatus(data.status)) {
      throw httpError('The report is available after this work request is completed.', 409)
    }
    let timeline = []
    try {
      const { data: events } = await supabaseAdmin.from('work_request_timeline').select('created_at, event_type, message, previous_status, new_status').eq('work_request_id', id).order('created_at')
      timeline = events || []
    } catch {
      timeline = []
    }
    let order = null
    if (data.manual_work_order_id) {
      const { data: wo } = await supabaseAdmin.from('manual_work_orders').select('wo_number, status').eq('id', data.manual_work_order_id).maybeSingle()
      order = wo
    }
    return {
      title: data.request_number || 'Work request',
      filename: `${data.request_number || 'work-request'}.pdf`,
      sections: [
        { heading: 'Work request', lines: fieldLines(data, ['request_number', 'status', 'priority', 'request_type', 'short_description', 'problem_description', 'remarks', 'request_date']) },
        order ? { heading: 'Linked work order', lines: fieldLines(order, ['wo_number', 'status']) } : null,
        { heading: 'Checklist', lines: checklistLines(data.checklist_snapshot, data.checklist_values) },
        { heading: 'Status history', lines: timeline.map((event) => [event.created_at, `${event.previous_status || ''} → ${event.new_status || event.event_type}: ${event.message || ''}`]) },
      ].filter(Boolean),
    }
  }
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
