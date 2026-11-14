import { uniqueNameOptions } from './tableFilters.js'

/**
 * Build work-order advanced-filter fields from masters + current page rows.
 * High-cardinality keys (WO #, description, WR #) come from page rows only —
 * never from a separate unbounded list prefetch.
 */
export function buildWorkOrderFilterFields({
  pageRows = [],
  statusOptions = [],
  statusFallback = [],
  priorityOptions = [],
  locations = [],
  workCenters = [],
  employees = [],
} = {}) {
  return [
    {
      id: 'wo_number',
      label: 'WO #',
      type: 'select',
      emptyLabel: 'All WO #',
      options: uniqueNameOptions(pageRows, (row) => row.wo_number),
    },
    {
      id: 'summary',
      label: 'Short description',
      type: 'select',
      emptyLabel: 'All descriptions',
      options: uniqueNameOptions(pageRows, (row) => row.short_description || row.summary),
    },
    {
      id: 'status',
      label: 'Status',
      type: 'select',
      emptyLabel: 'All Status',
      options: statusOptions.length ? statusOptions : statusFallback,
    },
    {
      id: 'priority',
      label: 'Priority',
      type: 'select',
      emptyLabel: 'All Priorities',
      options: priorityOptions,
    },
    {
      id: 'location',
      label: 'Location',
      type: 'select',
      emptyLabel: 'All Locations',
      options: (locations || []).map((loc) => ({ value: loc.id, label: loc.name })),
    },
    {
      id: 'work_center',
      label: 'Work center',
      type: 'select',
      emptyLabel: 'All Work Centers',
      options: (workCenters || []).map((center) => ({ value: center.name, label: center.name })),
    },
    {
      id: 'assignee',
      label: 'Assignee',
      type: 'select',
      emptyLabel: 'All Assignees',
      options: uniqueNameOptions(employees),
    },
    {
      id: 'creator',
      label: 'Created by',
      type: 'select',
      emptyLabel: 'All creators',
      options: uniqueNameOptions(employees),
    },
    {
      id: 'work_request',
      label: 'Work request',
      type: 'select',
      emptyLabel: 'All work requests',
      options: uniqueNameOptions(pageRows, (row) => row.work_request_number),
    },
    { id: 'created', label: 'Created', type: 'date-range', fromKey: 'created_from', toKey: 'created_to' },
  ]
}

/**
 * Build work-request advanced-filter fields from departments + current page rows.
 */
export function buildWorkRequestFilterFields({
  pageRows = [],
  departments = [],
  priorityOptions = [],
  statusOptions = [],
  includeStatus = true,
} = {}) {
  const fields = [
    {
      id: 'wr_number',
      label: 'WR #',
      type: 'select',
      emptyLabel: 'All WR #',
      options: uniqueNameOptions(pageRows, (row) => row.request_number || row.wr_number),
    },
    {
      id: 'problem',
      label: 'Short description',
      type: 'select',
      emptyLabel: 'All descriptions',
      options: uniqueNameOptions(pageRows, (row) => row.short_description || row.problem_description),
    },
    {
      id: 'type',
      label: 'Type',
      type: 'select',
      emptyLabel: 'All Types',
      options: [
        { value: 'inter_department', label: 'Inter department' },
        { value: 'intra_department', label: 'Intra department' },
        { value: 'user_self', label: 'Self' },
      ],
    },
    {
      id: 'order_from',
      label: 'From Department',
      type: 'select',
      emptyLabel: 'All Departments',
      options: (departments || []).map((dept) => ({ value: dept.name, label: dept.name })),
    },
    {
      id: 'order_to',
      label: 'To Department',
      type: 'select',
      emptyLabel: 'All Departments',
      options: (departments || []).map((dept) => ({ value: dept.name, label: dept.name })),
    },
    {
      id: 'priority',
      label: 'Priority',
      type: 'select',
      emptyLabel: 'All Priorities',
      options: priorityOptions,
    },
  ]
  if (includeStatus) {
    fields.push({
      id: 'status',
      label: 'Status',
      type: 'select',
      emptyLabel: 'All Status',
      options: statusOptions,
    })
  }
  fields.push({ id: 'request_date', label: 'Requested Date', type: 'date-range' })
  return fields
}
