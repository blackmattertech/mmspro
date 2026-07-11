/**
 * Account roles on profiles.role (not custom org access roles).
 *
 * super_admin — platform /admin panel
 * admin       — company admin
 * user        — everyone else
 */
export const ACCOUNT_ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  USER: 'user',
}

export const ACCOUNT_ROLE_LABELS = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  user: 'User',
}

export function isSuperAdmin(role) {
  return role === ACCOUNT_ROLES.SUPER_ADMIN
}

export function isCompanyAdmin(role) {
  return role === ACCOUNT_ROLES.ADMIN
}

/** Company Admin (and Super Admin if linked to an org) can manage company settings. */
export function canManageOrg(role) {
  return role === ACCOUNT_ROLES.ADMIN || role === ACCOUNT_ROLES.SUPER_ADMIN
}

export function formatAccountRole(role) {
  if (!role) return ''
  return ACCOUNT_ROLE_LABELS[role] || role
}
