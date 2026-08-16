const DEFAULT_STATUSES = [
  {
    name: 'Open',
    color: '#3B82F6',
    sort_order: 0,
    is_terminal: false,
    description: 'Tasks that are created but not yet started',
  },
  {
    name: 'In Progress',
    color: '#6366F1',
    sort_order: 1,
    is_terminal: false,
    description: 'Tasks that are currently being worked on',
  },
  {
    name: 'Waiting',
    color: '#F59E0B',
    sort_order: 2,
    is_terminal: false,
    description: 'Tasks that are on hold or waiting for something',
  },
  {
    name: 'Review',
    color: '#8B5CF6',
    sort_order: 3,
    is_terminal: false,
    description: 'Tasks that are under review or approval',
  },
  {
    name: 'Completed',
    color: '#10B981',
    sort_order: 4,
    is_terminal: true,
    description: 'Tasks that have been completed',
  },
  {
    name: 'Cancelled',
    color: '#EF4444',
    sort_order: 5,
    is_terminal: true,
    description: 'Tasks that have been cancelled',
  },
]

const DEFAULT_PRIORITIES = [
  {
    name: 'Critical',
    icon: 'alert',
    color: '#EF4444',
    sort_order: 0,
    description: 'Critical tasks that need immediate attention',
  },
  {
    name: 'High',
    icon: 'arrowUp',
    color: '#F97316',
    sort_order: 1,
    description: 'High priority tasks',
  },
  {
    name: 'Medium',
    icon: 'minus',
    color: '#F59E0B',
    sort_order: 2,
    description: 'Medium priority tasks',
  },
  {
    name: 'Low',
    icon: 'arrowDown',
    color: '#10B981',
    sort_order: 3,
    description: 'Low priority tasks',
  },
]

const DEFAULT_CATEGORIES = [
  'Procurement',
  'Vendor Follow-up',
  'Renewal',
  'Documentation',
  'Maintenance Planning',
  'Meeting',
  'Action',
  'Personal',
  'Others',
]

const DEFAULT_TAGS = [
  'Shutdown',
  'Vendor',
  'Safety',
  'Calibration',
  'Spare Parts',
  'Emergency',
  'Warranty',
  'AMC',
  'Inspection',
  'Documentation',
  'Compliance',
  'Meeting',
]

export { DEFAULT_STATUSES, DEFAULT_PRIORITIES, DEFAULT_CATEGORIES, DEFAULT_TAGS }
