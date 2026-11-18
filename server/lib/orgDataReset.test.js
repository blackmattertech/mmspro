import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ORG_RESET_TARGETS,
  assertOrgResetTarget,
  getOrgResetTarget,
  hashOrgResetOtp,
  generateOrgResetOtpCode,
} from './orgDataReset.js'

test('ORG_RESET_TARGETS only uses allowlisted module ids from the plan', () => {
  const ids = ORG_RESET_TARGETS.map((t) => t.id)
  assert.deepEqual(ids, [
    'logbook',
    'warranty_manager',
    'support_tickets',
    'tasks_followups',
    'work_request',
    'work_orders',
    'work_orders_scheduled',
    'equipment',
    'reports',
    'import_jobs',
    'vendors',
    'work_centers',
    'uoms',
    'others',
  ])
  assert.equal(getOrgResetTarget('company'), null)
  assert.equal(getOrgResetTarget('assets'), null)
  assert.equal(getOrgResetTarget('roles_access'), null)
})

test('assertOrgResetTarget rejects unknown modules', () => {
  assert.throws(() => assertOrgResetTarget('company'), (err) => err.status === 400)
  assert.equal(assertOrgResetTarget('equipment').label, 'Assets')
})

test('equipment reset tables are asset-owned only', () => {
  const equipment = assertOrgResetTarget('equipment')
  assert.deepEqual(equipment.tables.map((t) => t.name), [
    'equipment_meter_readings',
    'equipment_values',
    'equipment',
  ])
  assert.ok(equipment.sideEffectNotes.some((n) => /equipment links become empty/i.test(n)))
})

test('work order reset is non-PM only and PM reset is PM only', () => {
  assert.equal(assertOrgResetTarget('work_orders').woFilter, 'non_pm')
  assert.equal(assertOrgResetTarget('work_orders_scheduled').woFilter, 'pm')
})

test('every target table declares a supported delete mode', () => {
  const modes = new Set(['org_id', 'org_id_no_id', 'wo_children', 'wo_rows'])
  for (const target of ORG_RESET_TARGETS) {
    for (const table of target.tables) {
      assert.ok(modes.has(table.mode), `${target.id}.${table.name} mode ${table.mode}`)
      if (table.mode === 'wo_children') {
        assert.equal(table.parent, 'work_order_id')
      }
    }
  }
})

test('OTP hash is stable and code is six digits', () => {
  const a = hashOrgResetOtp('123456', 'org-1')
  const b = hashOrgResetOtp('123456', 'org-1')
  const c = hashOrgResetOtp('123456', 'org-2')
  assert.equal(a, b)
  assert.notEqual(a, c)
  const code = generateOrgResetOtpCode()
  assert.match(code, /^\d{6}$/)
})
