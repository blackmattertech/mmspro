import { createPmPlan, ensureActivityTypesForOrg } from './pmService.js'
import {
  buildWorkbook,
  cellToDate,
  matchChoice,
  runBulkImport,
} from './excelTemplate.js'
import {
  loadFormMasters,
  matchEmployees,
  optionalMatch,
  requireMatch,
  validValueColumns,
} from './formBulkLookups.js'
import { YES_NO } from './formBulkColumns.js'

const COLUMNS = [
  'Name',
  'Department',
  'Activity Type',
  'Work Center',
  'Priority',
  'Status',
  'Location',
  'Area',
  'Equipment',
  'Schedule Type',
  'Interval Type',
  'Interval Value',
  'Start Date',
  'End Date',
  'Grace Period (days)',
  'Generate Before Due',
  'Last Reading',
  'Last Service Date',
  'Reading Value',
  'Whichever Comes First',
  'Technicians',
  'Checklist Template',
]

const PRIORITIES = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

const STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
]

const SCHEDULE_TYPES = [
  { value: 'calendar', label: 'Calendar Based' },
  { value: 'reading', label: 'Meter Based' },
  { value: 'both', label: 'Calendar + Meter Based' },
]

const CALENDAR_UNITS = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Monthly' },
  { value: 'quarter', label: 'Quarterly' },
  { value: 'half_yearly', label: 'Half Yearly' },
  { value: 'yearly', label: 'Yearly' },
]

export async function buildPmPlansTemplate(orgId) {
  await ensureActivityTypesForOrg(orgId)
  const masters = await loadFormMasters(orgId)
  return buildWorkbook(COLUMNS, [
    { header: 'Priority', values: PRIORITIES.map((row) => row.label) },
    { header: 'Status', values: STATUSES.map((row) => row.label) },
    { header: 'Schedule Type', values: SCHEDULE_TYPES.map((row) => row.label) },
    { header: 'Interval Type', values: CALENDAR_UNITS.map((row) => row.label) },
    { header: 'Whichever Comes First', values: YES_NO.map((row) => row.label) },
    { header: 'Activity Type', values: masters.activityTypes.map((row) => row.name) },
    { header: 'Checklist Template', values: masters.checklists.map((row) => row.name) },
    ...validValueColumns(masters),
  ], {
    sampleRow: {
      Name: 'Monthly pump inspection',
      'Work Center': 'General',
      Priority: 'Medium',
      Status: 'Inactive',
      'Schedule Type': 'Calendar Based',
      'Interval Type': 'Monthly',
      'Interval Value': '1',
      'Start Date': '2026-09-16',
      'Generate Before Due': '1',
      'Whichever Comes First': 'Yes',
    },
  })
}

export async function bulkImportPmPlans(orgId, profileId, buffer) {
  await ensureActivityTypesForOrg(orgId)
  const masters = await loadFormMasters(orgId)
  return runBulkImport(buffer, COLUMNS, async (row) => {
    const department = requireMatch(masters.departments, row.Department, 'Department', ['name', 'code'])
    const activity = requireMatch(masters.activityTypes, row['Activity Type'], 'Activity type', ['name'])
    const equipment = requireMatch(masters.equipment, row.Equipment, 'Equipment', ['name', 'code'])
    const location = optionalMatch(masters.locations, row.Location, 'Location', ['name'])
    const area = optionalMatch(masters.areas, row.Area, 'Area', ['name'])
    const checklist = optionalMatch(masters.checklists, row['Checklist Template'], 'Checklist template', ['name'])
    const technicians = row.Technicians ? matchEmployees(masters.employees, row.Technicians) : []
    const scheduleType = matchChoice(row['Schedule Type'], SCHEDULE_TYPES) || 'calendar'
    const status = matchChoice(row.Status, STATUSES) || 'inactive'
    const whichever = matchChoice(row['Whichever Comes First'], YES_NO)

    const created = await createPmPlan(orgId, profileId, {
      name: row.Name,
      department_id: department.id,
      location_id: location?.id || department.location_id || null,
      area_id: area?.id || null,
      equipment_id: equipment.id,
      activity_type_id: activity.id,
      work_center: String(row['Work Center'] || '').trim() || 'General',
      priority: matchChoice(row.Priority, PRIORITIES) || 'medium',
      status,
      schedule_type: scheduleType,
      calendar_unit: matchChoice(row['Interval Type'], CALENDAR_UNITS) || 'month',
      every_n: Number(row['Interval Value']) || 1,
      start_date: cellToDate(row['Start Date']) || row['Start Date'] || null,
      end_date: cellToDate(row['End Date']) || row['End Date'] || null,
      grace_days: row['Grace Period (days)'] === '' ? null : Number(row['Grace Period (days)']),
      generate_before_days: Number(row['Generate Before Due']) || 1,
      last_reading: row['Last Reading'] === '' ? null : Number(row['Last Reading']),
      last_service_date: cellToDate(row['Last Service Date']) || row['Last Service Date'] || null,
      reading_interval: row['Reading Value'] === '' ? null : Number(row['Reading Value']),
      whichever_comes_first: whichever == null ? undefined : whichever === 'true',
      checklist_template_id: checklist?.id || null,
      technician_ids: technicians.map((row) => row.id),
    })

    return {
      name: created.plan_number || created.name,
      activity: activity.name,
      equipment: equipment.name,
      status,
    }
  })
}
