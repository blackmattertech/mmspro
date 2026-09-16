import { createTask } from './taskService.js'
import { ensureTaskMetaForOrg } from './taskMetaService.js'
import { ensureTaskCategoriesForOrg } from './taskCategoryService.js'
import { ensureTaskTagsForOrg } from './taskTagService.js'
import {
  buildWorkbook,
  cellToDate,
  matchChoice,
  parseList,
  runBulkImport,
} from './excelTemplate.js'
import {
  loadFormMasters,
  matchEmployees,
  optionalMatch,
  requireMatch,
  validValueColumns,
} from './formBulkLookups.js'
import {
  YES_NO,
  numberedGroupColumns,
  readNumberedGroup,
} from './formBulkColumns.js'

const REMINDER_SPECS = [
  { key: 'reminder_type', header: 'Type' },
  { key: 'custom_minutes_before', header: 'Custom Minutes' },
]
const LINK_SPECS = [
  { key: 'title', header: 'Title' },
  { key: 'url', header: 'URL' },
]
const REFERENCE_SPECS = [
  { key: 'reference_type', header: 'Type' },
  { key: 'reference_number', header: 'Number' },
  { key: 'reference_label', header: 'Label' },
]

const CORE_COLUMNS = [
  'Title',
  'Short Description',
  'Description',
  'Category',
  'Priority',
  'Status',
  'Visibility',
  'Recurring',
  'Start Date',
  'Due Date',
  'Start Time',
  'Due Time',
  'Department',
  'Location',
  'Assignees',
  'Tags',
  'Vendor',
  'Recurrence Frequency',
  'Recurrence Interval',
  'Recurrence Unit',
  'Recurrence Weekdays',
  'Recurrence Start',
  'Recurrence End',
  'Never Ends',
  'Follow-up Remarks',
  'Next Action',
  'Completion Remarks',
  ...numberedGroupColumns('Reminder', REMINDER_SPECS, 2),
  ...numberedGroupColumns('Link', LINK_SPECS, 2),
  ...numberedGroupColumns('Reference', REFERENCE_SPECS, 2),
]

const VISIBILITY = [
  { value: 'self', label: 'Self' },
  { value: 'team', label: 'Team' },
  { value: 'department', label: 'Department' },
  { value: 'location', label: 'Location' },
]

const TASK_TYPES = [
  { value: 'one_time', label: 'No' },
  { value: 'recurring', label: 'Yes' },
]

const FREQUENCIES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'half_yearly', label: 'Half-Yearly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'custom', label: 'Custom' },
]

const CUSTOM_UNITS = [
  { value: 'days', label: 'Days' },
  { value: 'weeks', label: 'Weeks' },
  { value: 'months', label: 'Months' },
]

const WEEKDAYS = [
  { value: '0', label: 'Sun' },
  { value: '1', label: 'Mon' },
  { value: '2', label: 'Tue' },
  { value: '3', label: 'Wed' },
  { value: '4', label: 'Thu' },
  { value: '5', label: 'Fri' },
  { value: '6', label: 'Sat' },
]

const REMINDER_TYPES = [
  { value: '1d', label: '1 Day Before' },
  { value: '3d', label: '3 Days Before' },
  { value: '7d', label: '7 Days Before' },
  { value: '15d', label: '15 Days Before' },
  { value: '30d', label: '30 Days Before' },
  { value: '60d', label: '60 Days Before' },
  { value: '90d', label: '90 Days Before' },
  { value: 'at_due', label: 'At Due Time' },
  { value: 'custom', label: 'Custom (minutes before)' },
]

const REFERENCE_TYPES = [
  { value: 'work_order', label: 'Work Order No.' },
  { value: 'purchase_order', label: 'PO No.' },
  { value: 'purchase_request', label: 'PR No.' },
  { value: 'vendor_ref', label: 'Vendor Ref.' },
  { value: 'contract', label: 'Contract No.' },
  { value: 'amc', label: 'AMC No.' },
  { value: 'document', label: 'Document No.' },
  { value: 'custom', label: 'Other Reference' },
]

function parseWeekdays(value) {
  return parseList(value).map((token) => {
    const match = matchChoice(token, WEEKDAYS)
    if (match == null) throw new Error(`Unknown weekday "${token}"`)
    return Number(match)
  })
}

export async function buildTasksTemplate(orgId) {
  await Promise.all([
    ensureTaskMetaForOrg(orgId),
    ensureTaskCategoriesForOrg(orgId),
    ensureTaskTagsForOrg(orgId),
  ])
  const masters = await loadFormMasters(orgId)
  return buildWorkbook(CORE_COLUMNS, [
    { header: 'Visibility', values: VISIBILITY.map((row) => row.label) },
    { header: 'Recurring', values: TASK_TYPES.map((row) => row.label) },
    { header: 'Recurrence Frequency', values: FREQUENCIES.map((row) => row.label) },
    { header: 'Recurrence Unit', values: CUSTOM_UNITS.map((row) => row.label) },
    { header: 'Recurrence Weekdays', values: WEEKDAYS.map((row) => row.label) },
    { header: 'Never Ends', values: YES_NO.map((row) => row.label) },
    { header: 'Reminder Type', values: REMINDER_TYPES.map((row) => row.label) },
    { header: 'Reference Type', values: REFERENCE_TYPES.map((row) => row.label) },
    { header: 'Category', values: masters.taskCategories.map((row) => row.name) },
    { header: 'Priority', values: masters.taskPriorities.map((row) => row.name) },
    { header: 'Status', values: masters.taskStatuses.map((row) => row.name) },
    { header: 'Tags', values: masters.taskTags.map((row) => row.name) },
    { header: 'Vendor', values: masters.vendors.map((row) => row.name) },
    ...validValueColumns(masters),
  ], {
    sampleRow: {
      Title: 'Follow up on spare parts',
      'Short Description': 'Vendor delivery follow-up',
      Description: 'Confirm vendor delivery date for pump seals',
      Visibility: 'Self',
      Recurring: 'No',
      'Start Date': '2026-09-16',
      'Due Date': '2026-09-20',
      'Reminder 1 Type': '1 Day Before',
      'Link 1 Title': 'Vendor portal',
      'Link 1 URL': 'https://example.com',
      'Reference 1 Type': 'Work Order No.',
      'Reference 1 Number': 'WO-1001',
    },
  })
}

export async function bulkImportTasks(orgId, profileId, buffer) {
  await Promise.all([
    ensureTaskMetaForOrg(orgId),
    ensureTaskCategoriesForOrg(orgId),
    ensureTaskTagsForOrg(orgId),
  ])
  const masters = await loadFormMasters(orgId)
  return runBulkImport(buffer, CORE_COLUMNS, async (row) => {
    const category = requireMatch(masters.taskCategories, row.Category, 'Category', ['name'])
    const priority = requireMatch(masters.taskPriorities, row.Priority, 'Priority', ['name'])
    const status = optionalMatch(masters.taskStatuses, row.Status, 'Status', ['name'])
    const visibility = matchChoice(row.Visibility, VISIBILITY) || 'self'
    const taskType = matchChoice(row.Recurring, TASK_TYPES) || 'one_time'
    const department = optionalMatch(masters.departments, row.Department, 'Department', ['name', 'code'])
    const location = optionalMatch(masters.locations, row.Location, 'Location', ['name'])
    const vendor = optionalMatch(masters.vendors, row.Vendor, 'Vendor', ['name', 'vendor_code'])
    const assignees = row.Assignees ? matchEmployees(masters.employees, row.Assignees) : []
    const tagNames = parseList(row.Tags)
    const tags = tagNames.map((name) => requireMatch(masters.taskTags, name, 'Tag', ['name']))
    const neverEnds = matchChoice(row['Never Ends'], YES_NO) === 'true'

    const reminders = readNumberedGroup(row, 'Reminder', REMINDER_SPECS, 2).map((item) => ({
      reminder_type: matchChoice(item.reminder_type, REMINDER_TYPES) || item.reminder_type,
      custom_minutes_before: item.custom_minutes_before ? Number(item.custom_minutes_before) : null,
    }))
    const links = readNumberedGroup(row, 'Link', LINK_SPECS, 2)
    const references = readNumberedGroup(row, 'Reference', REFERENCE_SPECS, 2).map((item) => ({
      reference_type: matchChoice(item.reference_type, REFERENCE_TYPES) || item.reference_type,
      reference_number: item.reference_number,
      reference_label: item.reference_label,
    }))

    const created = await createTask(orgId, profileId, {
      title: row.Title,
      short_description: row['Short Description'] || undefined,
      detailed_description: row.Description,
      category_id: category.id,
      priority_id: priority.id,
      status_id: status?.id || undefined,
      visibility_type: visibility,
      task_type: taskType,
      start_date: cellToDate(row['Start Date']) || row['Start Date'],
      due_date: cellToDate(row['Due Date']) || row['Due Date'],
      start_time: row['Start Time'] || null,
      due_time: row['Due Time'] || null,
      department_id: department?.id || null,
      location_id: location?.id || null,
      vendor_id: vendor?.id || null,
      assignee_employee_ids: assignees.map((employee) => employee.id),
      tag_ids: tags.map((tag) => tag.id),
      reminders,
      links,
      references,
      follow_up_remarks: row['Follow-up Remarks'] || undefined,
      next_action: row['Next Action'] || undefined,
      completion_remarks: row['Completion Remarks'] || undefined,
      recurrence: taskType === 'recurring'
        ? {
          frequency: matchChoice(row['Recurrence Frequency'], FREQUENCIES) || 'weekly',
          custom_interval: Number(row['Recurrence Interval']) || 1,
          custom_unit: matchChoice(row['Recurrence Unit'], CUSTOM_UNITS) || 'weeks',
          weekdays: row['Recurrence Weekdays'] ? parseWeekdays(row['Recurrence Weekdays']) : [],
          recurrence_start_date: cellToDate(row['Recurrence Start']) || row['Recurrence Start'] || null,
          recurrence_end_date: cellToDate(row['Recurrence End']) || row['Recurrence End'] || null,
          never_ends: neverEnds,
        }
        : undefined,
    })

    return {
      name: created.task_number || created.title,
      category: category.name,
      priority: priority.name,
      visibility,
    }
  })
}
