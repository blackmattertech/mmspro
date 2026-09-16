import { createWorkRequest, jobNatureOptionsFromField, resolveJobNatureField } from './workRequestService.js'
import { loadOrgFields } from './equipmentFieldService.js'
import { buildManualWorkOrderFormSchema } from './manualWorkOrderForm.js'
import {
  buildWorkbook,
  matchChoice,
  runBulkImport,
} from './excelTemplate.js'
import {
  loadFormMasters,
  optionalMatch,
  validValueColumns,
} from './formBulkLookups.js'
import {
  formFieldsFromOrgFields,
  formFieldsFromSchema,
  mapFormFieldColumns,
  sampleMappedRow,
  validColumnsForFormFields,
  valuesFromMappedRow,
} from './formBulkColumns.js'

const CORE_COLUMNS = [
  'Request Type',
  'Order From Department',
  'Order To Department',
  'Equipment',
  'Short Description',
  'Problem Description',
  'Priority',
  'Job Nature',
  'Save As',
]

const STATIC_EXTRA_COLUMNS = ['Remarks']

const REQUEST_TYPES = [
  { value: 'inter_department', label: 'Inter-department' },
  { value: 'intra_department', label: 'Intra-department' },
  { value: 'user_self', label: 'Self' },
  { value: 'manual', label: 'Manual' },
]

const PRIORITIES = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

const SAVE_AS = [
  { value: 'submit', label: 'Submit' },
  { value: 'draft', label: 'Draft' },
]

async function loadWorkRequestFormColumns(orgId) {
  const [assetFields, maintenanceSchema] = await Promise.all([
    loadOrgFields(orgId),
    buildManualWorkOrderFormSchema(orgId),
  ])
  return mapFormFieldColumns([
    ...formFieldsFromOrgFields(assetFields),
    ...formFieldsFromSchema(maintenanceSchema),
  ])
}

export async function buildWorkRequestsTemplate(orgId) {
  const [masters, mapped, jobNatureField] = await Promise.all([
    loadFormMasters(orgId),
    loadWorkRequestFormColumns(orgId),
    resolveJobNatureField(orgId),
  ])
  const extraColumns = [...STATIC_EXTRA_COLUMNS, ...mapped.map((row) => row.column)]
  const jobNatures = jobNatureOptionsFromField(jobNatureField).map((row) => row.label || row.value)
  return buildWorkbook([...CORE_COLUMNS, ...extraColumns], [
    { header: 'Request Type', values: REQUEST_TYPES.map((row) => row.label) },
    { header: 'Priority', values: PRIORITIES.map((row) => row.label) },
    { header: 'Save As', values: SAVE_AS.map((row) => row.label) },
    { header: 'Job Nature', values: jobNatures },
    ...validColumnsForFormFields(mapped),
    ...validValueColumns(masters),
  ], {
    sampleRow: {
      'Request Type': 'Inter-department',
      'Short Description': 'Motor vibration',
      'Problem Description': 'Unusual vibration on pump motor during start-up',
      Priority: 'Medium',
      'Job Nature': 'Breakdown',
      Remarks: 'Observed during morning round',
      'Save As': 'Submit',
      ...sampleMappedRow(mapped),
    },
  })
}

export async function bulkImportWorkRequests(orgId, profileId, email, buffer, { isOrgAdmin = false } = {}) {
  const [masters, mapped] = await Promise.all([
    loadFormMasters(orgId),
    loadWorkRequestFormColumns(orgId),
  ])
  const extraColumns = [...STATIC_EXTRA_COLUMNS, ...mapped.map((row) => row.column)]
  return runBulkImport(buffer, CORE_COLUMNS, async (row) => {
    const requestType = matchChoice(row['Request Type'], REQUEST_TYPES)
    if (!requestType) throw new Error('Request Type is required')

    const fromDept = optionalMatch(masters.departments, row['Order From Department'], 'Order from department', ['name', 'code'])
    const toDept = optionalMatch(masters.departments, row['Order To Department'], 'Order to department', ['name', 'code'])
    const equipment = optionalMatch(masters.equipment, row.Equipment, 'Equipment', ['name', 'code'])
    const saveAs = matchChoice(row['Save As'], SAVE_AS) || 'submit'
    const priority = matchChoice(row.Priority, PRIORITIES)
    const formFieldValues = valuesFromMappedRow(row, mapped)

    const created = await createWorkRequest(orgId, profileId, email, {
      request_type: requestType,
      order_from_department_id: fromDept?.id || null,
      order_to_department_id: toDept?.id || null,
      equipment_id: equipment?.id || null,
      short_description: row['Short Description'],
      problem_description: row['Problem Description'],
      priority,
      job_nature: row['Job Nature'] || undefined,
      remarks: row.Remarks || undefined,
      save_as: saveAs === 'draft' ? 'draft' : undefined,
      form_field_values: formFieldValues,
    }, { isOrgAdmin })

    return {
      name: created.request_number || created.short_description || row['Short Description'],
      from: fromDept?.name || '',
      to: toDept?.name || '',
      type: requestType,
    }
  }, { extraColumns })
}
