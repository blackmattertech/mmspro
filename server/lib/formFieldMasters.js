import { supabaseAdmin } from '../services/supabase.js'
import { cloneLayout, parseLayoutId, catalogId, systemId } from './formLayoutIds.js'
import { buildDefaultLayout, getFormDef, MODULE_FORM_GROUPS } from './formRegistry.js'
import { getMasterSource } from './formFieldSources.js'
import { normalizeOptions } from './formOptionRules.js'
import {
  LOCKED_ENUM_FIELD_KEYS,
  SYSTEM_FIELD_MASTERS,
  SYSTEM_FIELD_OPTIONS,
} from './systemFieldFallback.js'
import {
  jobNatureOptionsFromField,
  resolveJobNatureField,
} from './jobNatureField.js'
import {
  getFieldById as getAssetFieldById,
  updateAssetFieldDropdownValues,
} from './assetFieldService.js'
import {
  getFieldById as getEquipmentFieldById,
  updateEquipmentFieldDropdownValues,
} from './equipmentFieldService.js'

const OPTION_FIELD_TYPES = new Set(['dropdown', 'radio', 'checkbox'])
const JOB_NATURE_FORM_ID = 'work_request.create'
const JOB_NATURE_FIELD_ID = systemId('job_nature')
export const WORK_REQUEST_WORK_CENTER_FIELD_ID = systemId('work_center')
export const PERMIT_TYPES_FIELD_ID = systemId('permit_types')

const DEFAULT_PERMIT_TYPE_OPTIONS = [
  { value: 'hot_work', label: 'Hot Work Permit' },
  { value: 'cold_work', label: 'Cold Work Permit' },
  { value: 'confined_space', label: 'Confined Space Permit' },
  { value: 'excavation', label: 'Excavation Permit' },
  { value: 'electrical_isolation', label: 'Electrical Isolation' },
  { value: 'loto', label: 'LOTO' },
  { value: 'height_work', label: 'Height Work' },
  { value: 'radiography', label: 'Radiography' },
]

function httpError(message, status = 400) {
  const err = new Error(message)
  err.status = status
  return err
}

export function isMissingFormFieldOptionsTable(error) {
  const msg = String(error?.message || '')
  return /org_form_field_options/i.test(msg) && /does not exist|schema cache/i.test(msg)
}

function publicOptions(list) {
  return normalizeOptions(list).map((entry) => ({
    label: entry.label,
    value: entry.value,
    ...(entry.rules?.length ? { rules: entry.rules } : {}),
  }))
}

function mergePreferredOptions(preferred, seed) {
  const preferredNorm = publicOptions(preferred)
  if (!preferredNorm.length) return publicOptions(seed)
  const seedByValue = new Map(publicOptions(seed).map((item) => [item.value.toLowerCase(), item]))
  return preferredNorm.map((item) => {
    const prev = seedByValue.get(item.value.toLowerCase())
    if (prev?.rules?.length && !item.rules?.length) {
      return { ...item, rules: prev.rules }
    }
    return item
  })
}

export async function loadFormFieldOptionOverlays(orgId, formId = null) {
  if (!orgId) return new Map()
  let query = supabaseAdmin
    .from('org_form_field_options')
    .select('form_id, field_id, options')
    .eq('org_id', orgId)
  if (formId) query = query.eq('form_id', formId)
  const { data, error } = await query
  if (error) {
    if (isMissingFormFieldOptionsTable(error)) return new Map()
    throw error
  }
  const map = new Map()
  for (const row of data || []) {
    map.set(`${row.form_id}\t${row.field_id}`, publicOptions(row.options))
  }
  return map
}

function overlayFor(overlays, formId, fieldId) {
  return overlays.get(`${formId}\t${fieldId}`) || []
}

function catalogOptionValues(row, catalogById) {
  if (!row) return []
  if (Array.isArray(row.dropdown_options) && row.dropdown_options.length) {
    return row.dropdown_options
  }
  const id = String(row.id || '')
  return [...catalogById.values()]
    .filter((item) => item.kind === 'child' && String(item.parent_id) === id)
    .map((item) => item.name)
}

function fieldMasterSource(field) {
  if (field?.masterSource) return field.masterSource
  const parsed = parseLayoutId(field?.id)
  if (parsed.kind === 'master') return parsed.value
  if (parsed.kind === 'system') return SYSTEM_FIELD_MASTERS[parsed.value] || ''
  return ''
}

function systemKeyOf(field) {
  const parsed = parseLayoutId(field?.id)
  return parsed.kind === 'system' ? parsed.value : ''
}

export function describeConfigurableField(field, formDef, catalogById = new Map()) {
  if (!field?.id) return null
  if (field.equipmentColumnId) return null
  const parsed = parseLayoutId(field.id)
  const systemKey = parsed.kind === 'system' ? parsed.value : ''
  if (LOCKED_ENUM_FIELD_KEYS.has(systemKey)) return null
  const masterSource = fieldMasterSource(field)
  if (masterSource && getMasterSource(masterSource) && systemKey !== 'work_center') return null

  const systemField = systemKey
    ? (formDef?.systemFields || []).find((item) => item.key === systemKey || item.id === field.id)
    : null
  if (systemField?.compound) return null

  let fieldType = field.fieldType || systemField?.fieldType || ''
  let label = field.label || systemField?.label || ''
  let catalogRow = null

  if (parsed.kind === 'catalog') {
    catalogRow = catalogById.get(String(parsed.value)) || catalogById.get(field.id) || null
    if (!catalogRow || catalogRow.kind === 'child') return null
    if (catalogRow.field_source === 'equipment' || catalogRow.source === 'equipment') return null
    fieldType = catalogRow.field_type || fieldType
    label = catalogRow.name || catalogRow.label || label
  }

  if (!OPTION_FIELD_TYPES.has(fieldType)) {
    if (Array.isArray(field.options) && field.options.length) fieldType = fieldType || 'dropdown'
    else if (systemKey && SYSTEM_FIELD_OPTIONS[systemKey]) fieldType = 'dropdown'
    else if (systemKey === 'job_nature') fieldType = 'dropdown'
    else return null
  }
  if (!OPTION_FIELD_TYPES.has(fieldType)) return null

  return {
    id: field.id,
    label: label || 'Field',
    fieldType,
    systemKey,
    catalogRow,
    parsed,
  }
}

function resolveFieldOptions(field, meta, {
  formId,
  overlays,
  catalogById,
  jobNatureField,
}) {
  const overlay = overlayFor(overlays, formId, field.id)
  const layoutOptions = field.options
  const catalogOptions = meta.catalogRow
    ? catalogOptionValues(meta.catalogRow, catalogById)
    : []
  const jobNatureOptions = (
    meta.systemKey === 'job_nature' || field.id === JOB_NATURE_FIELD_ID || field.bindKey === 'job_nature'
  )
    ? jobNatureOptionsFromField(jobNatureField)
    : []
  const systemOptions = meta.systemKey ? SYSTEM_FIELD_OPTIONS[meta.systemKey] : null

  if (overlay.length) {
    return { options: mergePreferredOptions(overlay, layoutOptions || systemOptions || []), source: 'org' }
  }
  if (catalogOptions.length) {
    return { options: publicOptions(catalogOptions), source: 'catalog' }
  }
  if (jobNatureOptions.length) {
    return { options: publicOptions(jobNatureOptions), source: 'job_nature' }
  }
  if (publicOptions(layoutOptions).length) {
    return { options: publicOptions(layoutOptions), source: 'layout' }
  }
  if (systemOptions?.length) {
    return { options: publicOptions(systemOptions), source: 'system' }
  }
  return { options: [], source: 'none' }
}

export async function applyCompanyOptionsToLayout(orgId, formId, layout, extra = {}) {
  if (!layout) return layout
  const formDef = extra.formDef || getFormDef(formId)
  const overlays = extra.overlays || await loadFormFieldOptionOverlays(orgId, formId)
  const jobNatureField = extra.jobNatureField !== undefined
    ? extra.jobNatureField
    : (formId === JOB_NATURE_FORM_ID ? await resolveJobNatureField(orgId) : null)
  const catalogById = extra.catalogById || new Map()
  const next = cloneLayout(layout)
  for (const field of next.fields || []) {
    const meta = describeConfigurableField(field, formDef, catalogById)
    if (!meta) continue
    const resolved = resolveFieldOptions(field, meta, {
      formId,
      overlays,
      catalogById,
      jobNatureField,
    })
    if (resolved.options.length) field.options = resolved.options
  }
  return next
}

export function applyCompanyOptionsToCatalog(formId, catalogFields, overlays) {
  if (!catalogFields?.length) return catalogFields || []
  return catalogFields.map((row) => {
    const fieldId = catalogId(row.id)
    const overlay = overlayFor(overlays, formId, fieldId)
    if (!overlay.length) return row
    return {
      ...row,
      dropdown_options: overlay.map((item) => item.label || item.value),
    }
  })
}

export async function resolveJobNatureChoiceList(orgId) {
  const overlays = await loadFormFieldOptionOverlays(orgId, JOB_NATURE_FORM_ID)
  const overlay = overlayFor(overlays, JOB_NATURE_FORM_ID, JOB_NATURE_FIELD_ID)
  if (overlay.length) return overlay
  const named = await resolveJobNatureField(orgId)
  return jobNatureOptionsFromField(named)
}

async function loadCompanyWorkCenterOptions(orgId) {
  if (!orgId) return []
  const { data, error } = await supabaseAdmin
    .from('work_centers')
    .select('name, is_active')
    .eq('org_id', orgId)
    .order('name')
  if (error) return []
  return publicOptions(
    (data || [])
      .filter((row) => row.is_active !== false)
      .map((row) => row.name),
  )
}

export function formUsesWorkCenterList(formDef) {
  const field = (formDef?.systemFields || []).find((item) => item.key === 'work_center')
  if (!field) return false
  return !field.fieldType || field.fieldType === 'dropdown'
}

export function layoutHasPermitDetails(layout) {
  return (layout?.fields || []).some((field) => parseLayoutId(field.id).value === 'permit_details')
}

/**
 * Work Center choices for technician assignment.
 * A saved Forms Master list wins. Otherwise active company work centers are shown
 * so existing dropdowns stay available until a company configures the list.
 */
export async function resolveWorkCenterChoiceList(orgId, overlays = null, formId = JOB_NATURE_FORM_ID) {
  const targetFormId = formId || JOB_NATURE_FORM_ID
  const map = overlays || await loadFormFieldOptionOverlays(orgId, targetFormId)
  const overlay = overlayFor(map, targetFormId, WORK_REQUEST_WORK_CENTER_FIELD_ID)
  if (overlay.length) return { options: overlay, source: 'org' }
  if (targetFormId !== JOB_NATURE_FORM_ID) {
    const shared = overlayFor(map, JOB_NATURE_FORM_ID, WORK_REQUEST_WORK_CENTER_FIELD_ID)
    if (shared.length) return { options: shared, source: 'org' }
  }
  const company = await loadCompanyWorkCenterOptions(orgId)
  if (company.length) return { options: company, source: 'work_centers' }
  return { options: publicOptions(['General']), source: 'system' }
}

export async function resolvePermitTypeChoiceList(orgId, formId, overlays = null) {
  const map = overlays || await loadFormFieldOptionOverlays(orgId, formId)
  const overlay = overlayFor(map, formId, PERMIT_TYPES_FIELD_ID)
  if (overlay.length) return { options: overlay, source: 'org' }
  return { options: DEFAULT_PERMIT_TYPE_OPTIONS.map((item) => ({ ...item })), source: 'system' }
}

function withWorkCenterMaster(fields, choice) {
  if (!choice) return fields
  if (fields.some((field) => field.id === WORK_REQUEST_WORK_CENTER_FIELD_ID)) return fields
  const options = choice?.options || []
  const entry = {
    id: WORK_REQUEST_WORK_CENTER_FIELD_ID,
    label: 'Work Center',
    fieldType: 'dropdown',
    optionCount: options.length,
    source: choice?.source || 'system',
    options,
  }
  const priorityIndex = fields.findIndex((field) => (
    field.id === systemId('priority') || /priority/i.test(field.label || '')
  ))
  if (priorityIndex < 0) return [...fields, entry]
  const next = [...fields]
  next.splice(priorityIndex + 1, 0, entry)
  return next
}

function withPermitTypesMaster(layout, fields, choice) {
  if (!choice || !layoutHasPermitDetails(layout)) return fields
  if (fields.some((field) => field.id === PERMIT_TYPES_FIELD_ID)) return fields
  const options = choice.options || []
  return [...fields, {
    id: PERMIT_TYPES_FIELD_ID,
    label: 'Permit types',
    fieldType: 'dropdown',
    optionCount: options.length,
    source: choice.source || 'system',
    options,
  }]
}

function catalogMapFrom(rows) {
  const map = new Map()
  for (const row of rows || []) {
    if (row?.id) map.set(String(row.id), row)
  }
  return map
}

export function listConfigurableFieldsFromLayout(formId, layout, catalogFields, {
  overlays = new Map(),
  jobNatureField = null,
  workCenterChoice = null,
  permitTypeChoice = null,
} = {}) {
  const formDef = getFormDef(formId)
  const catalogById = catalogMapFrom(catalogFields)
  const fields = []
  for (const field of layout?.fields || []) {
    const meta = describeConfigurableField(field, formDef, catalogById)
    if (!meta) continue
    const resolved = meta.systemKey === 'work_center' && workCenterChoice?.options?.length
      ? { options: workCenterChoice.options, source: workCenterChoice.source }
      : resolveFieldOptions(field, meta, {
        formId,
        overlays,
        catalogById,
        jobNatureField,
      })
    fields.push({
      id: field.id,
      label: meta.label,
      fieldType: meta.fieldType,
      optionCount: resolved.options.length,
      source: resolved.source,
      options: resolved.options,
    })
  }
  return withPermitTypesMaster(
    layout,
    withWorkCenterMaster(fields, workCenterChoice),
    permitTypeChoice,
  )
}

export function countConfigurableFields(formId, layout, catalogFields) {
  const formDef = getFormDef(formId)
  const catalogById = catalogMapFrom(catalogFields)
  let count = 0
  let countedWorkCenter = false
  for (const field of layout?.fields || []) {
    if (!describeConfigurableField(field, formDef, catalogById)) continue
    count += 1
    if (parseLayoutId(field.id).value === 'work_center') countedWorkCenter = true
  }
  if (formUsesWorkCenterList(formDef) && !countedWorkCenter) count += 1
  if (layoutHasPermitDetails(layout)) count += 1
  return count
}

export function ensureFormLayout(formDef, layout, catalogFields) {
  if (layout) return layout
  return buildDefaultLayout(formDef, catalogFields)
}

async function upsertOverlay(orgId, formId, fieldId, options) {
  const payload = {
    org_id: orgId,
    form_id: formId,
    field_id: fieldId,
    options: publicOptions(options),
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabaseAdmin
    .from('org_form_field_options')
    .upsert(payload, { onConflict: 'org_id,form_id,field_id' })
  if (error) {
    if (isMissingFormFieldOptionsTable(error)) {
      throw httpError('Form option lists are not available yet. Restart the server to apply the latest schema.', 503)
    }
    throw error
  }
}

async function writeNamedJobNature(orgId, options) {
  const named = await resolveJobNatureField(orgId)
  if (!named?.id) return false
  const labels = publicOptions(options).map((item) => item.label || item.value)
  if (named.field_source === 'equipment') {
    await updateEquipmentFieldDropdownValues(orgId, named.id, labels)
    return true
  }
  const asset = await getAssetFieldById(orgId, named.id)
  if (asset) {
    await updateAssetFieldDropdownValues(orgId, named.id, labels)
    return true
  }
  const equipment = await getEquipmentFieldById(orgId, named.id)
  if (equipment) {
    await updateEquipmentFieldDropdownValues(orgId, named.id, labels)
    return true
  }
  return false
}

export async function saveFormMasterOptions(orgId, formId, fieldId, rawOptions) {
  const options = publicOptions(rawOptions)
  if (!options.length) throw httpError('Add at least one option')

  const parsed = parseLayoutId(fieldId)
  if (parsed.kind === 'catalog') {
    const asset = await getAssetFieldById(orgId, parsed.value)
    if (asset) {
      await updateAssetFieldDropdownValues(
        orgId,
        parsed.value,
        options.map((item) => item.label || item.value),
      )
      return { source: 'catalog' }
    }
  }

  if (
    (parsed.kind === 'system' && parsed.value === 'job_nature')
    || fieldId === JOB_NATURE_FIELD_ID
  ) {
    const wrote = await writeNamedJobNature(orgId, options)
    if (wrote) return { source: 'job_nature' }
  }

  await upsertOverlay(orgId, formId, fieldId, options)
  return { source: 'org' }
}

export function publicFormGroups() {
  return MODULE_FORM_GROUPS.map((group) => ({
    moduleId: group.moduleId,
    label: group.label,
    forms: group.forms.map((form) => ({
      formId: form.formId,
      label: form.label,
      permissionKey: form.permissionKey,
      moduleId: group.moduleId,
      moduleLabel: group.label,
    })),
  }))
}
