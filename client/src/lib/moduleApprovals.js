/** Keep in sync with server/lib/moduleApprovals.js */
export const APPROVAL_MODULES = [
  {
    id: 'work_request',
    label: 'Work Request',
    hint: 'When on, inter-department requests wait for the department head. When off, the request is created immediately and a work order is generated.',
  },
  {
    id: 'work_orders',
    label: 'Work Orders',
    hint: 'When on, work orders require department head approval.',
  },
  {
    id: 'work_orders_scheduled',
    label: 'PM Schedule',
    hint: 'When on, PM schedules require department head approval.',
  },
  {
    id: 'tasks_followups',
    label: 'Tasks & Follow-ups',
    hint: 'When on, tasks require department head approval.',
  },
  {
    id: 'warranty_manager',
    label: 'Warranty Manager',
    hint: 'When on, warranties require department head approval.',
  },
]
