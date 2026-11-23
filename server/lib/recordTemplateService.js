/**
 * Org-shared record templates for WR / Manual WO / PM / Tasks.
 * Attachment bytes are snapshotted into the record-templates bucket.
 */

import { randomUUID } from 'node:crypto'
import { supabaseAdmin } from '../services/supabase.js'
import { getSignedUrl } from './signedUrlCache.js'
import { listFormFieldValues } from './orgFormLayouts.js'
import { getWorkRequestById } from './workRequestService.js'
import { getPmPlan } from './pmService.js'
import { getTaskDetail } from './taskService.js'
import {
  RECORD_TEMPLATE_BUCKET,
  RECORD_TEMPLATE_MAX_ATTACHMENTS,
  RECORD_TEMPLATE_MAX_FILE_BYTES,
  RECORD_TEMPLATE_MAX_PER_MODULE,
  isRecordTemplateModuleKey,
  normalizeTemplateName,
  recordTemplateModule,
  validateTemplateName,
} from '../shared/recordTemplates.js'

const WO_ASSETS_BUCKET = 'work-order-assets'
const ORG_ASSETS_BUCKET = 'org-assets'
const FILE_FIELD_TYPES = new Set(['file', 'image', 'document'])

function httpError(message, status = 400) {
  const error = new Error(message)
  error.status = status
  return error
}

function text(value) {
  return value == null ? '' : String(value).trim()
}

function equipmentValueText(row) {
  if (!row) return ''
  if (Array.isArray(row.value_json?.values)) {
    return row.value_json.values.map((value) => text(value)).filter(Boolean).join(', ')
  }
  return text(row.value_text)
}

/** field_id → text for an equipment's parent values. Used to prefill asset pickers. */
export function assetFieldValuesFromValueRows(rows) {
  const out = {}
  for (const row of rows || []) {
    const fieldId = text(row?.field_id)
    const value = equipmentValueText(row)
    if (fieldId && value) out[fieldId] = value
  }
  return out
}

async function assetFieldValuesForEquipment(orgId, equipmentId) {
  const id = text(equipmentId)
  if (!orgId || !id) return {}
  const { data, error } = await supabaseAdmin
    .from('equipment_values')
    .select('field_id, value_text, value_json')
    .eq('org_id', orgId)
    .eq('equipment_id', id)
  if (error) throw error
  return assetFieldValuesFromValueRows(data)
}

function safeFileName(name) {
  return String(name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_') || 'file'
}

function templateFilePath(orgId, templateId, fileName) {
  return `${orgId}/${templateId}/${randomUUID()}-${safeFileName(fileName)}`
}

async function copyStorageObject({
  sourceBucket,
  sourcePath,
  destBucket,
  destPath,
  contentType,
}) {
  const downloaded = await supabaseAdmin.storage.from(sourceBucket).download(sourcePath)
  if (downloaded.error || !downloaded.data) {
    throw httpError(`Could not copy attachment: ${sourcePath}`, 400)
  }
  const bytes = Buffer.from(await downloaded.data.arrayBuffer())
  if (bytes.length > RECORD_TEMPLATE_MAX_FILE_BYTES) {
    throw httpError('Attachment exceeds the 25 MB limit', 400)
  }
  const uploaded = await supabaseAdmin.storage.from(destBucket).upload(destPath, bytes, {
    upsert: false,
    contentType: contentType || 'application/octet-stream',
  })
  if (uploaded.error) throw uploaded.error
  return { path: destPath, size: bytes.length, bucket: destBucket }
}

export function collectJsonFiles(value, fieldId = null, out = []) {
  if (!value) return out
  if (Array.isArray(value)) {
    for (const item of value) collectJsonFiles(item, fieldId, out)
    return out
  }
  if (typeof value !== 'object') return out
  if (Array.isArray(value.files)) {
    for (const file of value.files) collectJsonFiles(file, fieldId, out)
    return out
  }
  const path = text(value.path || value.storage_path)
  if (path) {
    out.push({
      path,
      name: text(value.name || value.file_name || value.fileName) || 'file',
      mime_type: text(value.mime_type || value.content_type || value.type) || 'application/octet-stream',
      size: Number(value.size || value.file_size || 0) || 0,
      bucket: text(value.bucket) || WO_ASSETS_BUCKET,
      field_id: fieldId,
      kind: text(value.kind || value.field_type) || 'file',
    })
  }
  return out
}

/** Pure PM payload shape used by create-from-template (identity / due bookkeeping omitted). */
export function buildPmPlanTemplatePayload(plan = {}) {
  const technicianIds = Array.isArray(plan.technician_ids)
    ? plan.technician_ids.map(String)
    : (plan.technicians || []).map((person) => String(person.id)).filter(Boolean)
  return {
    name: plan.name || '',
    department_id: plan.department_id || null,
    location_id: plan.location_id || null,
    area_id: plan.area_id || null,
    equipment_id: plan.equipment_id || null,
    activity_type_id: plan.activity_type_id || null,
    work_center: plan.work_center || '',
    priority: plan.priority || 'medium',
    status: 'inactive',
    schedule_type: plan.schedule_type || null,
    is_recurring: Boolean(plan.is_recurring),
    calendar_unit: plan.calendar_unit || null,
    every_n: plan.every_n ?? null,
    weekdays: plan.weekdays || null,
    custom_interval: plan.custom_interval ?? null,
    custom_unit: plan.custom_unit || null,
    never_ends: Boolean(plan.never_ends),
    start_date: plan.start_date ? String(plan.start_date).slice(0, 10) : null,
    end_date: plan.end_date ? String(plan.end_date).slice(0, 10) : null,
    grace_days: plan.grace_days ?? null,
    generate_before_days: plan.generate_before_days ?? null,
    last_reading: plan.last_reading ?? null,
    last_service_date: plan.last_service_date ? String(plan.last_service_date).slice(0, 10) : null,
    reading_interval: plan.reading_interval ?? null,
    whichever_comes_first: Boolean(plan.whichever_comes_first),
    checklist_template_id: plan.checklist_template_id || null,
    contractor_vendor_id: plan.contractor_vendor_id || null,
    estimated_labour_hours: plan.estimated_labour_hours ?? null,
    estimated_duration_hours: plan.estimated_duration_hours ?? null,
    required_tools: plan.required_tools || null,
    required_skills: plan.required_skills || null,
    technician_ids: technicianIds,
  }
}

/** Pure WR payload shape — no request number / status / approvals / requester. */
export function buildWorkRequestTemplatePayload(source = {}, formValues = {}) {
  const form_values = {}
  const files = []
  for (const [fieldId, raw] of Object.entries(formValues || {})) {
    const collected = collectJsonFiles(raw, fieldId)
    if (collected.length) {
      files.push(...collected)
      form_values[fieldId] = { files: [] }
      continue
    }
    form_values[fieldId] = raw
  }
  return {
    payload: {
      request_type: source.request_type || 'inter_department',
      order_from_department_id: source.order_from_department_id || source.order_from?.id || null,
      order_to_department_id: source.order_to_department_id || source.order_to?.id || null,
      equipment_id: source.equipment_id || source.equipment?.id || null,
      short_description: source.short_description || '',
      problem_description: source.problem_description || '',
      job_nature: source.job_nature || '',
      priority: source.priority || 'medium',
      remarks: source.remarks || '',
      form_field_values: source.form_field_values && typeof source.form_field_values === 'object'
        ? source.form_field_values
        : {},
      // Org layout / catalog extras (Equipment Location, etc.) — separate from breakdown JSON.
      form_values,
      checklist_template_id: source.checklist_template_id || null,
    },
    files,
  }
}

async function assertModuleCap(orgId, moduleKey) {
  const { count, error } = await supabaseAdmin
    .from('record_templates')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('module_key', moduleKey)
  if (error) throw error
  if ((count || 0) >= RECORD_TEMPLATE_MAX_PER_MODULE) {
    throw httpError(
      `This module already has ${RECORD_TEMPLATE_MAX_PER_MODULE} templates. Delete one before adding another.`,
      400,
    )
  }
}

async function assertUniqueName(orgId, moduleKey, name, { excludeId = null } = {}) {
  let query = supabaseAdmin
    .from('record_templates')
    .select('id')
    .eq('org_id', orgId)
    .eq('module_key', moduleKey)
    .ilike('name', name)
    .limit(1)
  if (excludeId) query = query.neq('id', excludeId)
  const { data, error } = await query
  if (error) throw error
  if (data?.length) throw httpError('A template with this name already exists for this module', 409)
}

async function snapshotAttachments(orgId, templateId, sourceFiles = []) {
  if (sourceFiles.length > RECORD_TEMPLATE_MAX_ATTACHMENTS) {
    throw httpError(`Templates support up to ${RECORD_TEMPLATE_MAX_ATTACHMENTS} attachments`, 400)
  }
  const attachments = []
  for (const file of sourceFiles) {
    const sourcePath = text(file.path)
    if (!sourcePath) continue
    const sourceBucket = text(file.bucket) || WO_ASSETS_BUCKET
    const destPath = templateFilePath(orgId, templateId, file.name)
    const copied = await copyStorageObject({
      sourceBucket,
      sourcePath,
      destBucket: RECORD_TEMPLATE_BUCKET,
      destPath,
      contentType: file.mime_type,
    })
    attachments.push({
      path: copied.path,
      bucket: RECORD_TEMPLATE_BUCKET,
      name: file.name || 'file',
      mime_type: file.mime_type || 'application/octet-stream',
      size: copied.size || file.size || 0,
      field_id: file.field_id || null,
      kind: file.kind || 'file',
    })
  }
  return attachments
}

async function buildWorkRequestTemplate(orgId, sourceId) {
  const source = await getWorkRequestById(orgId, sourceId)
  if (!source) throw httpError('Work request not found', 404)
  const layoutValues = await listFormFieldValues(orgId, 'work_request.create', sourceId)
  const built = buildWorkRequestTemplatePayload(source, layoutValues)
  const files = [...built.files]
  collectJsonFiles(source.attachments, null, files)
  const defaultName = normalizeTemplateName(
    `${built.payload.short_description || 'Work request'} template`,
  )
  return { payload: built.payload, files, defaultName }
}

async function buildManualWorkOrderTemplate(orgId, sourceId) {
  const { data: row, error } = await supabaseAdmin
    .from('manual_work_orders')
    .select('*')
    .eq('org_id', orgId)
    .eq('id', sourceId)
    .maybeSingle()
  if (error) throw error
  if (!row) throw httpError('Work order not found', 404)

  const formValues = await listFormFieldValues(orgId, 'work_orders.manual', sourceId)
  const { data: assignees } = await supabaseAdmin
    .from('manual_work_order_assignees')
    .select('employee_id')
    .eq('org_id', orgId)
    .eq('work_order_id', sourceId)

  const form_values = {}
  const files = []
  for (const [fieldId, raw] of Object.entries(formValues || {})) {
    const collected = collectJsonFiles(raw, fieldId)
    if (collected.length) {
      files.push(...collected)
      form_values[fieldId] = { files: [] }
      continue
    }
    form_values[fieldId] = raw
  }

  collectJsonFiles(row.attachments, 'attachments', files)
  collectJsonFiles(row.permit_attachments, 'permit_attachments', files)
  collectJsonFiles(row.execution_attachments, 'execution_attachments', files)

  const payload = {
    form_values,
    assigned_employee_ids: (assignees || []).map((row) => row.employee_id).filter(Boolean),
    assigned_department_id: row.assigned_department_id || null,
    assigned_location_id: row.assigned_location_id || null,
    assign_to_department: Boolean(row.assigned_department_id && !(assignees || []).length),
    short_description: row.short_description || '',
    problem_description: row.problem_description || '',
    priority: row.priority || 'medium',
    equipment_id: row.equipment_id || null,
    work_center: row.work_center || '',
    special_instructions: row.special_instructions || '',
    is_breakdown: Boolean(row.is_breakdown),
    planned_start_at: row.planned_start_at || null,
    planned_end_at: row.planned_end_at || null,
    vendor_id: row.vendor_id || null,
    vendor_expense: row.vendor_expense ?? null,
    labour_count: row.labour_count ?? null,
    work_start_at: row.work_start_at || null,
    work_end_at: row.work_end_at || null,
    job_description: row.job_description || '',
    root_cause: row.root_cause || '',
    action_taken: row.action_taken || '',
    special_tools_used: row.special_tools_used || '',
    safety_precautions: row.safety_precautions || '',
    lessons_learned: row.lessons_learned || '',
    execution_remarks: row.execution_remarks || '',
    material_consumed: row.material_consumed || '',
    permit_required: Boolean(row.permit_required),
    permit_types: row.permit_types || [],
    permit_number: row.permit_number || '',
    permit_issue_at: row.permit_issue_at || null,
    permit_expiry_at: row.permit_expiry_at || null,
    permit_details: row.permit_details || null,
    checklist_template_id: row.checklist_template_id || null,
  }

  const defaultName = normalizeTemplateName(`${payload.short_description || 'Work order'} template`)
  return { payload, files, defaultName }
}

async function buildPmPlanTemplate(orgId, sourceId) {
  const plan = await getPmPlan(orgId, sourceId)
  const payload = buildPmPlanTemplatePayload(plan)
  return {
    payload,
    files: [],
    defaultName: normalizeTemplateName(`${payload.name || 'PM plan'} template`),
  }
}

async function buildTaskTemplate(orgId, sourceId, profileId) {
  const task = await getTaskDetail(orgId, sourceId, profileId)
  const payload = {
    title: task.title || '',
    short_description: task.short_description || '',
    detailed_description: task.detailed_description || '',
    visibility_type: task.visibility_type || 'self',
    task_type: task.task_type === 'recurring' ? 'one_time' : (task.task_type || 'one_time'),
    category_id: task.category_id || null,
    priority_id: task.priority_id || null,
    vendor_id: task.vendor_id || null,
    start_date: task.start_date || null,
    start_time: task.start_time || null,
    due_date: task.due_date || null,
    due_time: task.due_time || null,
    department_id: task.department_id || null,
    location_id: task.location_id || null,
    follow_up_remarks: task.follow_up_remarks || '',
    next_action: task.next_action || '',
    assignee_employee_ids: (task.assignees || []).map((row) => row.id || row.employee_id).filter(Boolean),
    tag_ids: (task.tags_list || task.tags || []).map((row) => row.id || row).filter(Boolean),
    reminder_types: (task.task_reminders || []).map((row) => row.reminder_type || row.type).filter(Boolean),
  }
  const files = (task.task_attachments || []).map((file) => ({
    path: file.storage_path || file.path,
    name: file.file_name || file.name || 'file',
    mime_type: file.content_type || file.mime_type || 'application/octet-stream',
    size: file.file_size || file.size || 0,
    bucket: ORG_ASSETS_BUCKET,
    kind: 'file',
  })).filter((file) => file.path)

  return {
    payload,
    files,
    defaultName: normalizeTemplateName(`${payload.title || 'Task'} template`),
  }
}

async function buildFromSource(orgId, moduleKey, sourceRecordId, profileId) {
  if (moduleKey === 'work_request') return buildWorkRequestTemplate(orgId, sourceRecordId)
  if (moduleKey === 'work_orders_manual') return buildManualWorkOrderTemplate(orgId, sourceRecordId)
  if (moduleKey === 'work_orders_scheduled') return buildPmPlanTemplate(orgId, sourceRecordId)
  if (moduleKey === 'tasks_followups') return buildTaskTemplate(orgId, sourceRecordId, profileId)
  throw httpError('Unsupported module', 400)
}

function mapRow(row) {
  return {
    id: row.id,
    org_id: row.org_id,
    module_key: row.module_key,
    name: row.name,
    source_record_id: row.source_record_id,
    payload: row.payload || {},
    attachments: Array.isArray(row.attachments) ? row.attachments : [],
    created_by: row.created_by,
    updated_by: row.updated_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    module_label: recordTemplateModule(row.module_key)?.label || row.module_key,
  }
}

export async function listRecordTemplates(orgId, moduleKey) {
  if (!isRecordTemplateModuleKey(moduleKey)) throw httpError('Invalid module_key', 400)
  const { data, error } = await supabaseAdmin
    .from('record_templates')
    .select('id, org_id, module_key, name, source_record_id, created_by, updated_by, created_at, updated_at, attachments')
    .eq('org_id', orgId)
    .eq('module_key', moduleKey)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return (data || []).map((row) => ({
    ...mapRow({ ...row, payload: {} }),
    attachment_count: Array.isArray(row.attachments) ? row.attachments.length : 0,
    payload: undefined,
    attachments: undefined,
  }))
}

export async function getRecordTemplate(orgId, templateId) {
  const { data, error } = await supabaseAdmin
    .from('record_templates')
    .select('*')
    .eq('org_id', orgId)
    .eq('id', templateId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw httpError('Template not found', 404)
  return mapRow(data)
}

export async function applyRecordTemplate(orgId, templateId) {
  const template = await getRecordTemplate(orgId, templateId)
  const attachments = []
  for (const file of template.attachments || []) {
    const signedUrl = await getSignedUrl(file.bucket || RECORD_TEMPLATE_BUCKET, file.path)
    attachments.push({
      ...file,
      signed_url: signedUrl,
    })
  }
  const payload = { ...(template.payload || {}) }
  if (payload.equipment_id) {
    payload.asset_field_values = await assetFieldValuesForEquipment(orgId, payload.equipment_id)
  }
  return {
    id: template.id,
    module_key: template.module_key,
    name: template.name,
    payload,
    attachments,
  }
}

export async function createRecordTemplate(orgId, profileId, body = {}) {
  const moduleKey = text(body.module_key)
  if (!isRecordTemplateModuleKey(moduleKey)) throw httpError('Invalid module_key', 400)
  const sourceRecordId = text(body.source_record_id)
  if (!sourceRecordId) throw httpError('source_record_id is required', 400)

  await assertModuleCap(orgId, moduleKey)
  const built = await buildFromSource(orgId, moduleKey, sourceRecordId, profileId)
  const name = validateTemplateName(body.name || built.defaultName)
  await assertUniqueName(orgId, moduleKey, name)

  const templateId = randomUUID()
  const attachments = await snapshotAttachments(orgId, templateId, built.files)

  const { data, error } = await supabaseAdmin
    .from('record_templates')
    .insert({
      id: templateId,
      org_id: orgId,
      module_key: moduleKey,
      name,
      source_record_id: sourceRecordId,
      payload: built.payload,
      attachments,
      created_by: profileId || null,
      updated_by: profileId || null,
    })
    .select('*')
    .single()

  if (error) {
    if (attachments.length) {
      await supabaseAdmin.storage.from(RECORD_TEMPLATE_BUCKET).remove(attachments.map((file) => file.path))
    }
    if (error.code === '23505') throw httpError('A template with this name already exists for this module', 409)
    throw error
  }
  return mapRow(data)
}

export async function renameRecordTemplate(orgId, profileId, templateId, nameInput) {
  const name = validateTemplateName(nameInput)
  const existing = await getRecordTemplate(orgId, templateId)
  await assertUniqueName(orgId, existing.module_key, name, { excludeId: templateId })
  const { data, error } = await supabaseAdmin
    .from('record_templates')
    .update({ name, updated_by: profileId || null, updated_at: new Date().toISOString() })
    .eq('org_id', orgId)
    .eq('id', templateId)
    .select('*')
    .single()
  if (error) {
    if (error.code === '23505') throw httpError('A template with this name already exists for this module', 409)
    throw error
  }
  return mapRow(data)
}

export async function deleteRecordTemplate(orgId, templateId) {
  const existing = await getRecordTemplate(orgId, templateId)
  const paths = (existing.attachments || []).map((file) => file.path).filter(Boolean)
  const { error } = await supabaseAdmin
    .from('record_templates')
    .delete()
    .eq('org_id', orgId)
    .eq('id', templateId)
  if (error) throw error
  if (paths.length) {
    await supabaseAdmin.storage.from(RECORD_TEMPLATE_BUCKET).remove(paths)
  }
  return { ok: true }
}

export { FILE_FIELD_TYPES }
