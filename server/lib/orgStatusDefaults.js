export const ORG_STATUS_ENTITY_TYPES = [
  {
    key: 'work_request',
    label: 'Work Request',
    description: 'Statuses used on work requests and their filters.',
  },
  {
    key: 'work_order',
    label: 'Work Order',
    description: 'Statuses for received, assigned, scheduled, and manual work orders.',
  },
  {
    key: 'task',
    label: 'Tasks & Follow-ups',
    description: 'Statuses available when creating or updating tasks.',
  },
  {
    key: 'pm_plan',
    label: 'Planned Maintenance',
    description: 'Active, inactive, overdue, and custom statuses for PM plans.',
  },
]

export const DEFAULT_ORG_STATUSES = {
  work_request: [
    { key: 'draft', name: 'Draft', color: '#94A3B8', sort_order: 0, is_terminal: false, description: 'Saved but not submitted' },
    { key: 'submitted', name: 'Submitted', color: '#3B82F6', sort_order: 1, is_terminal: false, description: 'Submitted for processing' },
    { key: 'pending_approval', name: 'Pending approval', color: '#F59E0B', sort_order: 2, is_terminal: false, description: 'Waiting for approval' },
    { key: 'approved', name: 'Approved', color: '#10B981', sort_order: 3, is_terminal: true, description: 'Approved and converted to work order' },
    { key: 'rejected', name: 'Rejected', color: '#EF4444', sort_order: 4, is_terminal: true, description: 'Rejected by approver' },
    { key: 'need_info', name: 'Need info', color: '#8B5CF6', sort_order: 5, is_terminal: false, description: 'More information requested' },
    { key: 'cancelled', name: 'Cancelled', color: '#6B7280', sort_order: 6, is_terminal: true, description: 'Cancelled' },
  ],
  work_order: [
    { key: 'draft', name: 'Draft', color: '#94A3B8', sort_order: 0, is_terminal: false, description: 'Draft work order' },
    { key: 'assigned', name: 'Assigned', color: '#3B82F6', sort_order: 1, is_terminal: false, description: 'Assigned to technicians' },
    { key: 'accepted', name: 'Accepted', color: '#06B6D4', sort_order: 2, is_terminal: false, description: 'Accepted by technician' },
    { key: 'started', name: 'Started', color: '#6366F1', sort_order: 3, is_terminal: false, description: 'Work started' },
    { key: 'in_progress', name: 'In progress', color: '#8B5CF6', sort_order: 4, is_terminal: false, description: 'Work in progress' },
    { key: 'waiting_material', name: 'Waiting material', color: '#F59E0B', sort_order: 5, is_terminal: false, description: 'Waiting for material' },
    { key: 'waiting_shutdown', name: 'Waiting shutdown', color: '#F97316', sort_order: 6, is_terminal: false, description: 'Waiting for shutdown' },
    { key: 'on_hold', name: 'On hold', color: '#EAB308', sort_order: 7, is_terminal: false, description: 'On hold' },
    { key: 'completed', name: 'Completed', color: '#10B981', sort_order: 8, is_terminal: false, description: 'Work completed' },
    { key: 'verified', name: 'Verified', color: '#14B8A6', sort_order: 9, is_terminal: false, description: 'Verified by supervisor' },
    { key: 'closed', name: 'Closed', color: '#6B7280', sort_order: 10, is_terminal: true, description: 'Closed' },
    { key: 'returned_rework', name: 'Returned / rework', color: '#EF4444', sort_order: 11, is_terminal: false, description: 'Returned for rework' },
  ],
  pm_plan: [
    { key: 'inactive', name: 'Inactive', color: '#94A3B8', sort_order: 0, is_terminal: false, description: 'Plan is inactive' },
    { key: 'active', name: 'Active', color: '#10B981', sort_order: 1, is_terminal: false, description: 'Plan is active' },
    { key: 'overdue', name: 'Overdue', color: '#EF4444', sort_order: 2, is_terminal: false, description: 'Next due date has passed' },
  ],
}

export const ORG_STATUS_TABLE_TYPES = Object.keys(DEFAULT_ORG_STATUSES)

export function slugifyStatusKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64) || 'status'
}
