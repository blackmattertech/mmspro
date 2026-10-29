export const ADMIN_NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', path: '/admin/dashboard', icon: 'home' },
  { id: 'organizations', label: 'Organizations', path: '/admin/organizations', icon: 'buildings' },
  { id: 'default', label: 'Default', path: '/admin/default', icon: 'star' },
  { id: 'reports', label: 'Reports', path: '/admin/reports', icon: 'chart' },
  { id: 'plans', label: 'Plans', path: '/admin/plans', icon: 'plans' },
  { id: 'users', label: 'Users', path: '/admin/users', icon: 'users' },
  { id: 'integrations', label: 'Integrations', path: '/admin/integrations', icon: 'plug' },
]

/** Flatten admin nav for quick-access shortcuts. */
export function getAdminShortcutOptions() {
  return ADMIN_NAV_ITEMS.map((item) => ({
    id: item.id,
    label: item.label,
    path: item.path,
    icon: item.icon,
    group: null,
  }))
}
