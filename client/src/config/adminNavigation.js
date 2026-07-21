export const ADMIN_NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', path: '/admin/dashboard', icon: 'home' },
  { id: 'organizations', label: 'Organizations', path: '/admin/organizations', icon: 'buildings' },
  { id: 'users', label: 'Users', path: '/admin/users', icon: 'users' },
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
