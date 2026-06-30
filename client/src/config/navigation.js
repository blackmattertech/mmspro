const APP_SEGMENTS = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    segment: 'dashboard',
    icon: 'home',
  },
  {
    id: 'work-orders',
    label: 'Work Orders',
    icon: 'document',
    children: [
      { label: 'Received', segment: 'work-orders/received' },
      { label: 'Assigned', segment: 'work-orders/assigned' },
      { label: 'Scheduled', segment: 'work-orders/scheduled' },
      { label: 'Manual', segment: 'work-orders/manual' },
    ],
  },
  {
    id: 'calendar',
    label: 'Calendar',
    segment: 'calendar',
    icon: 'calendar',
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: 'chart',
    children: [
      { label: 'Daily Logs', segment: 'reports/daily-logs' },
      { label: 'Plant Wise Report', segment: 'reports/plant-wise' },
      { label: 'Open Logs', segment: 'reports/open-logs' },
      { label: 'Completed Logs', segment: 'reports/completed-logs' },
      { label: 'Overdue Workorders', segment: 'reports/overdue' },
    ],
  },
  {
    id: 'masters',
    label: 'Masters',
    icon: 'list',
    children: [
      { label: 'Company', segment: 'masters/company' },
      { label: 'Assets', segment: 'masters/assets' },
      { label: 'Order', segment: 'masters/order' },
      { label: 'Activity', segment: 'masters/activity' },
    ],
  },
  {
    id: 'configuration',
    label: 'Configuration',
    icon: 'settings',
    children: [
      { label: 'Employees', segment: 'configuration/employees' },
      { label: 'Roles & Access', segment: 'configuration/roles' },
      { label: 'Permission', segment: 'configuration/permission' },
      { label: 'Settings', segment: 'configuration/settings' },
    ],
  },
]

export function orgPath(orgSlug, segment = 'dashboard') {
  return `/${orgSlug}/${segment}`
}

export function getNavItems(orgSlug) {
  return APP_SEGMENTS.map((item) => {
    if (item.children) {
      return {
        ...item,
        children: item.children.map((child) => ({
          ...child,
          path: orgPath(orgSlug, child.segment),
        })),
      }
    }
    return {
      ...item,
      path: orgPath(orgSlug, item.segment),
    }
  })
}
