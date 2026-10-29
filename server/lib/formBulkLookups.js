import { supabaseAdmin } from '../services/supabase.js'
import { findByNameOrCode, parseList } from './excelTemplate.js'

async function fetchAllRows(buildQuery, { pageSize = 1000, maxRows = 50000 } = {}) {
  const rows = []
  let from = 0
  while (from < maxRows) {
    const to = Math.min(from + pageSize - 1, maxRows - 1)
    const { data, error } = await buildQuery().range(from, to)
    if (error) throw error
    const page = data || []
    rows.push(...page)
    if (page.length < pageSize) break
    from += pageSize
  }
  return rows
}

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
    fetchAllRows(() => supabaseAdmin.from('org_locations').select('id, name, is_active').eq('org_id', orgId).order('name')),
    fetchAllRows(() => supabaseAdmin.from('departments').select('id, name, code, location_id, is_active').eq('org_id', orgId).order('name')),
    fetchAllRows(() => supabaseAdmin.from('areas').select('id, name, location_id, department_id, is_active').eq('org_id', orgId).order('name')),
    fetchAllRows(() => supabaseAdmin.from('equipment').select('id, name, code, location_id, department_id, area_id').eq('org_id', orgId).order('name')),
    fetchAllRows(() => supabaseAdmin.from('org_employees').select('id, name, emp_id, location_id, department_id, is_active').eq('org_id', orgId).order('name')),
    fetchAllRows(() => supabaseAdmin.from('vendors').select('id, name, vendor_code').eq('org_id', orgId).order('name')),
    fetchAllRows(() => supabaseAdmin.from('pm_activity_types').select('id, name, is_active').eq('org_id', orgId).order('name')),
    fetchAllRows(() => supabaseAdmin.from('checklist_templates').select('id, name, version, is_active').eq('org_id', orgId).order('name')),
    fetchAllRows(() => supabaseAdmin.from('task_categories').select('id, name, is_active').eq('org_id', orgId).order('name')),
    fetchAllRows(() => supabaseAdmin.from('task_priorities').select('id, name, is_active').eq('org_id', orgId).order('name')),
    fetchAllRows(() => supabaseAdmin.from('task_tags').select('id, name, is_active').eq('org_id', orgId).order('name')),
    fetchAllRows(() => supabaseAdmin.from('task_statuses').select('id, name, is_active').eq('org_id', orgId).order('sort_order').order('name')),
  ])

  const active = (rows) => (rows || []).filter((row) => row.is_active !== false)

  return {
    locations: active(locations),
    departments: active(departments),
    areas: active(areas),
    equipment: equipment || [],
    employees: active(employees),
    vendors: vendors || [],
    activityTypes: active(activityTypes),
    checklists: active(checklists),
    taskCategories: active(taskCategories),
    taskPriorities: active(taskPriorities),
    taskTags: active(taskTags),
    taskStatuses: active(taskStatuses),
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
    { header: 'Asset', values: masters.equipment.map(equipmentLabel) },
    { header: 'Employees', values: masters.employees.map((row) => row.emp_id ? `${row.name} (${row.emp_id})` : row.name) },
    ...extras,
  ]
}
