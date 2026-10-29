/**
 * How a built-in field should appear when its section is reused on a form
 * that does not own that field.
 * Keep in sync with client/src/lib/systemFieldFallback.js.
 */
export const SYSTEM_FIELD_MASTERS = {
  order_from_department_id: 'departments',
  order_to_department_id: 'departments',
  department_id: 'departments',
  location_id: 'locations',
  area_id: 'areas',
  equipment_id: 'equipment',
  vendor_id: 'vendors',
  activity_type_id: 'activity_types',
  checklist_template_id: 'checklists',
  technician_ids: 'employees_multi',
  assignee_ids: 'employees_multi',
  work_center: 'work_centers',
}

export const SYSTEM_FIELD_OPTIONS = {
  request_type: [
    { value: 'inter_department', label: 'Inter Department' },
    { value: 'intra_department', label: 'Intra Department' },
    { value: 'user_self', label: 'User Self Request' },
    { value: 'manual', label: 'Manual Work Request' },
  ],
  priority: [
    { value: 'high', label: 'High' },
    { value: 'medium', label: 'Medium' },
    { value: 'low', label: 'Low' },
  ],
}

export const LOCKED_ENUM_FIELD_KEYS = new Set(['request_type'])
