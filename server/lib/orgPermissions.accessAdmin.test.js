import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getScopedLocationId,
  hasModulePermission,
  isOrgAdminAccessRoleName,
} from './orgPermissions.js'

test('isOrgAdminAccessRoleName matches Admin case-insensitively', () => {
  assert.equal(isOrgAdminAccessRoleName('Admin'), true)
  assert.equal(isOrgAdminAccessRoleName(' admin '), true)
  assert.equal(isOrgAdminAccessRoleName('ADMIN'), true)
  assert.equal(isOrgAdminAccessRoleName('Location Head'), false)
  assert.equal(isOrgAdminAccessRoleName(''), false)
  assert.equal(isOrgAdminAccessRoleName(null), false)
})

test('is_org_admin session grants module update without role matrix rows', () => {
  const session = {
    is_org_admin: true,
    disabled_modules: [],
    permissions: [],
  }
  assert.equal(hasModulePermission(session, 'work_orders', 'update'), true)
  assert.equal(hasModulePermission(session, 'work_request_incoming', 'update'), true)
  assert.equal(hasModulePermission(session, 'equipment', 'update'), true)
})

test('getScopedLocationId treats access-role Admin as unscoped even without is_org_admin', () => {
  assert.equal(
    getScopedLocationId({
      is_org_admin: false,
      location_id: 'loc-1',
      access_role: { name: 'Admin' },
    }),
    null,
  )
  assert.equal(
    getScopedLocationId({
      is_org_admin: false,
      location_id: 'loc-1',
      access_role: { name: 'Technician' },
    }),
    'loc-1',
  )
})
