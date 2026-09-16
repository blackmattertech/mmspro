import { supabaseAdmin } from '../services/supabase.js'
import { generateWorkOrderNumber } from './workOrderService.js'
import { buildManualWorkOrderFormSchema } from './manualWorkOrderForm.js'
import {
  buildWorkbook,
  matchChoice,
  runBulkImport,
} from './excelTemplate.js'
import {
  loadFormMasters,
  matchEmployees,
  optionalMatch,
  validValueColumns,
} from './formBulkLookups.js'
import {
  formFieldsFromSchema,
  mapFormFieldColumns,
  sampleMappedRow,
  validColumnsForFormFields,
  valuesFromMappedRow,
} from './formBulkColumns.js'
import { clipToLimit, clipTrimmedToLimit, getTextFieldLimitsMap } from './textFieldLimits.js'

const CORE_COLUMNS = [
  'Short Description',
  'Problem Description',
  'Priority',
  'Location',
  'Department',
  'Equipment',
  'Work Center',
  'Assigned To',
  'Status',
]

const STATIC_EXTRA_COLUMNS = [
  'Special Instructions',
  'Planned Start',
  'Planned End',
]

const PRIORITIES = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

const STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'assigned', label: 'Assigned' },
]

function normalizeValue(fieldType, raw) {
  if (raw === null || raw === undefined || raw === '') return { value_text: null, value_json: null }

  if (fieldType === 'checkbox' && Array.isArray(raw)) {
    const values = raw.map((item) => String(item ?? '').trim()).filter(Boolean)
    if (!values.length) return { value_text: null, value_json: null }
    return { value_text: values.join(', '), value_json: { values } }
  }

  if (fieldType === 'checkbox') {
    const checked = Boolean(raw)
    return { value_text: checked ? 'true' : 'false', value_json: { checked } }
  }

  if (fieldType === 'number') {
    const num = Number(raw)
    if (Number.isNaN(num)) throw new Error('Invalid number value')
    return { value_text: String(num), value_json: { number: num } }
  }

  if (Array.isArray(raw)) {
    const joined = raw.map((item) => String(item ?? '').trim()).filter(Boolean).join(', ')
    if (!joined) return { value_text: null, value_json: null }
    return { value_text: joined, value_json: { values: raw } }
  }

  return { value_text: String(raw), value_json: null }
}

async function upsertWorkOrderFieldValues(orgId, workOrderId, values, fields) {
  const typeById = new Map(fields.map((field) => [field.id, field.field_type]))
  const valueRows = []
  for (const [fieldId, raw] of Object.entries(values || {})) {
    if (!typeById.has(fieldId)) continue
    const normalized = normalizeValue(typeById.get(fieldId), raw)
    if (normalized.value_text === null && normalized.value_json === null) continue
    valueRows.push({
      org_id: orgId,
      work_order_id: workOrderId,
      field_id: fieldId,
      ...normalized,
      updated_at: new Date().toISOString(),
    })
  }
  if (!valueRows.length) return
  const { error } = await supabaseAdmin
    .from('manual_work_order_values')
    .upsert(valueRows, { onConflict: 'work_order_id,field_id' })
  if (error) throw error
}

async function loadWorkOrderFormColumns(orgId) {
  const schema = await buildManualWorkOrderFormSchema(orgId)
  const fields = formFieldsFromSchema(schema)
  return { fields, mapped: mapFormFieldColumns(fields) }
}

export async function buildWorkOrdersTemplate(orgId) {
  const [masters, form] = await Promise.all([
    loadFormMasters(orgId),
    loadWorkOrderFormColumns(orgId),
  ])
  const extraColumns = [...STATIC_EXTRA_COLUMNS, ...form.mapped.map((row) => row.column)]
  return buildWorkbook([...CORE_COLUMNS, ...extraColumns], [
    { header: 'Priority', values: PRIORITIES.map((row) => row.label) },
    { header: 'Status', values: STATUSES.map((row) => row.label) },
    ...validColumnsForFormFields(form.mapped),
    ...validValueColumns(masters),
  ], {
    sampleRow: {
      'Short Description': 'Replace bearing on conveyor',
      'Problem Description': 'Noise from drive-end bearing',
      Priority: 'Medium',
      'Work Center': 'General',
      'Special Instructions': 'Isolate power before starting',
      Status: 'Assigned',
      ...sampleMappedRow(form.mapped),
    },
  })
}

export async function bulkImportWorkOrders(orgId, profileId, buffer) {
  const [masters, fieldLimits, form] = await Promise.all([
    loadFormMasters(orgId),
    getTextFieldLimitsMap(orgId),
    loadWorkOrderFormColumns(orgId),
  ])
  const extraColumns = [...STATIC_EXTRA_COLUMNS, ...form.mapped.map((row) => row.column)]
  return runBulkImport(buffer, CORE_COLUMNS, async (row) => {
    const shortDescription = clipTrimmedToLimit(fieldLimits, 'short_description', row['Short Description']) || ''
    const problem = clipTrimmedToLimit(fieldLimits, 'problem_description', row['Problem Description']) || ''
    if (!shortDescription && !problem) throw new Error('Short description is required')

    const location = optionalMatch(masters.locations, row.Location, 'Location', ['name'])
    const department = optionalMatch(masters.departments, row.Department, 'Department', ['name', 'code'])
    const equipment = optionalMatch(masters.equipment, row.Equipment, 'Equipment', ['name', 'code'])
    const assignees = row['Assigned To'] ? matchEmployees(masters.employees, row['Assigned To']) : []
    const priority = matchChoice(row.Priority, PRIORITIES) || 'medium'
    const status = matchChoice(row.Status, STATUSES) || (assignees.length ? 'assigned' : 'draft')
    const fieldValues = valuesFromMappedRow(row, form.mapped)

    let woNumber = null
    if (status === 'assigned' && department?.id) {
      woNumber = await generateWorkOrderNumber(orgId, department.id)
    }

    const { data: workOrder, error } = await supabaseAdmin
      .from('manual_work_orders')
      .insert({
        org_id: orgId,
        status,
        wo_number: woNumber,
        source_type: 'manual',
        created_by: profileId,
        supervisor_id: profileId,
        assigned_department_id: department?.id || null,
        assigned_location_id: location?.id || department?.location_id || null,
        priority,
        problem_description: problem || null,
        short_description: shortDescription || clipToLimit(fieldLimits, 'short_description', problem),
        work_center: String(row['Work Center'] || '').trim() || null,
        equipment_id: equipment?.id || null,
        special_instructions: String(row['Special Instructions'] || '').trim() || null,
        planned_start_at: row['Planned Start'] || null,
        planned_end_at: row['Planned End'] || null,
      })
      .select('id, wo_number, short_description')
      .single()

    if (error) throw error

    if (assignees.length) {
      const { error: assignError } = await supabaseAdmin.from('manual_work_order_assignees').insert(
        assignees.map((employee) => ({
          org_id: orgId,
          work_order_id: workOrder.id,
          employee_id: employee.id,
        })),
      )
      if (assignError) throw assignError
    }

    await upsertWorkOrderFieldValues(orgId, workOrder.id, fieldValues, form.fields)

    return {
      name: workOrder.wo_number || workOrder.short_description,
      department: department?.name || '',
      location: location?.name || '',
      status,
    }
  }, { extraColumns })
}
