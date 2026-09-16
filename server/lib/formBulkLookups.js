import { supabaseAdmin } from '../services/supabase.js'
import { findByNameOrCode, parseList } from './excelTemplate.js'

export async function loadFormMasters(orgId) {
  const [
    locations,
    departments,
    areas,
    equipment,
    employees,
    vendors,
    activityTypes,
    checklists,
    taskCategories,
    taskPriorities,
    taskTags,
    taskStatuses,
  ] = await Promise.all([
    supabaseAdmin.from('org_locations').select('id, name, is_active').eq('org_id', orgId).order('name'),
    supabaseAdmin.from('departments').select('id, name, code, location_id, is_active').eq('org_id', orgId).order('name'),
    supabaseAdmin.from('areas').select('id, name, location_id, department_id, is_active').eq('org_id', orgId).order('name'),
    supabaseAdmin.from('equipment').select('id, name, code, location_id, department_id, area_id').eq('org_id', orgId).order('name'),
    supabaseAdmin.from('org_employees').select('id, name, emp_id, location_id, department_id, is_active').eq('org_id', orgId).order('name'),
    supabaseAdmin.from('vendors').select('id, name, vendor_code').eq('org_id', orgId).order('name'),
    supabaseAdmin.from('pm_activity_types').select('id, name, is_active').eq('org_id', orgId).order('name'),
    supabaseAdmin.from('checklist_templates').select('id, name, version, is_active').eq('org_id', orgId).order('name'),
    supabaseAdmin.from('task_categories').select('id, name, is_active').eq('org_id', orgId).order('name'),
    supabaseAdmin.from('task_priorities').select('id, name, is_active').eq('org_id', orgId).order('name'),
    supabaseAdmin.from('task_tags').select('id, name, is_active').eq('org_id', orgId).order('name'),
    supabaseAdmin.from('task_statuses').select('id, name, is_active').eq('org_id', orgId).order('sort_order').order('name'),
  ])

  const errors = [
    locations.error, departments.error, areas.error, equipment.error, employees.error,
    vendors.error, activityTypes.error, checklists.error, taskCategories.error,
    taskPriorities.error, taskTags.error, taskStatuses.error,
  ].filter(Boolean)
  if (errors[0]) throw errors[0]

  const active = (rows) => (rows || []).filter((row) => row.is_active !== false)

  return {
    locations: active(locations.data),
    departments: active(departments.data),
    areas: active(areas.data),
    equipment: equipment.data || [],
    employees: active(employees.data),
    vendors: vendors.data || [],
    activityTypes: active(activityTypes.data),
    checklists: active(checklists.data),
    taskCategories: active(taskCategories.data),
    taskPriorities: active(taskPriorities.data),
    taskTags: active(taskTags.data),
    taskStatuses: active(taskStatuses.data),
  }
}

export function requireMatch(list, value, label, fields) {
  const text = String(value || '').trim()
  if (!text) throw new Error(`${label} is required`)
  const match = findByNameOrCode(list, text, fields)
  if (!match) throw new Error(`Unknown ${label.toLowerCase()} "${text}"`)
  return match
}

export function optionalMatch(list, value, label, fields) {
  const text = String(value || '').trim()
  if (!text) return null
  const match = findByNameOrCode(list, text, fields)
  if (!match) throw new Error(`Unknown ${label.toLowerCase()} "${text}"`)
  return match
}

export function matchEmployees(employees, value) {
  return parseList(value).map((token) => requireMatch(
    employees,
    token,
    'Technician / assignee',
    ['name', 'emp_id'],
  ))
}

export function equipmentLabel(row) {
  if (!row) return ''
  return row.code ? `${row.code} — ${row.name}` : row.name
}

export function validValueColumns(masters, extras = []) {
  return [
    { header: 'Location', values: masters.locations.map((row) => row.name) },
    { header: 'Department', values: masters.departments.map((row) => row.code ? `${row.name} (${row.code})` : row.name) },
    { header: 'Area', values: masters.areas.map((row) => row.name) },
    { header: 'Equipment', values: masters.equipment.map(equipmentLabel) },
    { header: 'Employees', values: masters.employees.map((row) => row.emp_id ? `${row.name} (${row.emp_id})` : row.name) },
    ...extras,
  ]
}
