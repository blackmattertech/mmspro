import test from 'node:test'
import assert from 'node:assert/strict'
import {
  wantsSyncImport,
} from './bulkImportEnqueue.js'
import {
  isJobQueueEnabled,
  resetJobQueueEnabledCache,
} from './redis.js'
import { getImportTemplate, IMPORT_BULK_REGISTRY } from './importBulkRegistry.js'
import { isTerminalImportStatus } from './importJobService.js'

test('wantsSyncImport reads query and body flags', () => {
  assert.equal(wantsSyncImport({ query: {}, body: {} }), false)
  assert.equal(wantsSyncImport({ query: { sync: '1' }, body: {} }), true)
  assert.equal(wantsSyncImport({ query: { sync: 'true' }, body: {} }), true)
  assert.equal(wantsSyncImport({ query: {}, body: { sync: true } }), true)
})

test('isJobQueueEnabled is false when REDIS_URL is unset', async () => {
  const previous = process.env.REDIS_URL
  delete process.env.REDIS_URL
  resetJobQueueEnabledCache()
  try {
    assert.equal(await isJobQueueEnabled(), false)
  } finally {
    if (previous == null) delete process.env.REDIS_URL
    else process.env.REDIS_URL = previous
    resetJobQueueEnabledCache()
  }
})

test('import registry covers core Excel templates', () => {
  for (const key of [
    'locations',
    'departments',
    'employees',
    'areas',
    'work_centers',
    'equipment',
    'vendors',
    'work_requests',
    'work_orders',
    'pm_plans',
    'tasks',
    'warranties',
    'meter_readings',
    'uoms',
    'asset_field_sections',
    'asset_field_parents',
    'asset_field_children',
  ]) {
    assert.equal(getImportTemplate(key).key, key)
    assert.ok(IMPORT_BULK_REGISTRY[key].failedFilename)
    assert.equal(typeof IMPORT_BULK_REGISTRY[key].run, 'function')
  }
  assert.throws(() => getImportTemplate('nope'), (err) => err.status === 400)
})

test('isTerminalImportStatus recognizes completed and failed', () => {
  assert.equal(isTerminalImportStatus('queued'), false)
  assert.equal(isTerminalImportStatus('active'), false)
  assert.equal(isTerminalImportStatus('completed'), true)
  assert.equal(isTerminalImportStatus('failed'), true)
})
