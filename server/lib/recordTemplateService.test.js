import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isRecordTemplateModuleKey,
  normalizeTemplateName,
  validateTemplateName,
  recordTemplateModule,
  RECORD_TEMPLATE_MODULE_KEYS,
  RECORD_TEMPLATE_MAX_PER_MODULE,
} from '../shared/recordTemplates.js'
import {
  assetFieldValuesFromValueRows,
  buildPmPlanTemplatePayload,
  buildWorkRequestTemplatePayload,
  collectJsonFiles,
} from './recordTemplateService.js'
import { hasAnyModulePermission } from './orgPermissions.js'

test('record template module keys cover the four planned modules', () => {
  assert.deepEqual(RECORD_TEMPLATE_MODULE_KEYS, [
    'work_request',
    'work_orders_manual',
    'work_orders_scheduled',
    'tasks_followups',
  ])
  assert.equal(isRecordTemplateModuleKey('work_request'), true)
  assert.equal(isRecordTemplateModuleKey('support_tickets'), false)
  assert.equal(RECORD_TEMPLATE_MAX_PER_MODULE, 50)
})

test('template names are trimmed and length-validated', () => {
  assert.equal(normalizeTemplateName('  Pump seal leak  template  '), 'Pump seal leak template')
  assert.equal(validateTemplateName('AHU noise template'), 'AHU noise template')
  assert.throws(() => validateTemplateName('ab'), /between 3 and 120/)
})

test('module create permission keys are used for template access', () => {
  const wr = recordTemplateModule('work_request')
  const checks = wr.permissionKeys.map((key) => [key, 'create'])
  assert.equal(
    hasAnyModulePermission({
      is_org_admin: false,
      disabled_modules: [],
      permissions: [{ module_key: 'work_request_create', can_create: true }],
    }, checks),
    true,
  )
  assert.equal(
    hasAnyModulePermission({
      is_org_admin: false,
      disabled_modules: [],
      permissions: [{ module_key: 'work_request', can_read: true }],
    }, checks),
    false,
  )
})

test('collectJsonFiles builds attachment metadata for template snapshots', () => {
  const files = collectJsonFiles([
    {
      path: 'org/a/photo.jpg',
      name: 'photo.jpg',
      mime_type: 'image/jpeg',
      size: 1200,
      kind: 'image',
    },
    {
      files: [
        {
          storage_path: 'org/a/doc.pdf',
          file_name: 'doc.pdf',
          content_type: 'application/pdf',
          file_size: 4000,
        },
      ],
    },
  ], 'field-1')

  assert.equal(files.length, 2)
  assert.deepEqual(files[0], {
    path: 'org/a/photo.jpg',
    name: 'photo.jpg',
    mime_type: 'image/jpeg',
    size: 1200,
    bucket: 'work-order-assets',
    field_id: 'field-1',
    kind: 'image',
  })
  assert.equal(files[1].path, 'org/a/doc.pdf')
  assert.equal(files[1].name, 'doc.pdf')
  assert.equal(files[1].mime_type, 'application/pdf')
  assert.equal(files[1].field_id, 'field-1')
})

test('WR template payload omits identity, status, and approval fields', () => {
  const { payload, files } = buildWorkRequestTemplatePayload({
    id: 'wr-1',
    request_number: 'WR-0001',
    status: 'approved',
    approval_status: 'approved',
    requester_id: 'emp-1',
    short_description: 'Pump seal',
    problem_description: 'Leaking',
    priority: 'high',
    request_type: 'inter_department',
    order_from: { id: 'd1' },
    order_to: { id: 'd2' },
    equipment: { id: 'eq-1' },
    form_field_values: { f1: 'x' },
    checklist_template_id: 'cl-1',
  }, {
    loc_field: 'Plant A',
    photo: { files: [{ path: 'org/a/p.jpg', name: 'p.jpg', mime_type: 'image/jpeg', size: 10 }] },
  })
  assert.equal(payload.short_description, 'Pump seal')
  assert.equal(payload.equipment_id, 'eq-1')
  assert.equal(payload.order_from_department_id, 'd1')
  assert.equal(payload.checklist_template_id, 'cl-1')
  assert.equal(payload.form_values.loc_field, 'Plant A')
  assert.deepEqual(payload.form_values.photo, { files: [] })
  assert.equal(files.length, 1)
  assert.equal(files[0].field_id, 'photo')
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'request_number'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'status'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'requester_id'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'id'), false)
})

test('asset field values keep parent text used to prefill Equipment Location', () => {
  const values = assetFieldValuesFromValueRows([
    { field_id: 'loc', value_text: 'Admin' },
    { field_id: 'name', value_text: '  ELEDB-10  ' },
    { field_id: 'empty', value_text: '   ' },
    { field_id: 'tags', value_text: '', value_json: { values: ['A', 'B'] } },
    { field_id: '', value_text: 'skip' },
  ])
  assert.deepEqual(values, {
    loc: 'Admin',
    name: 'ELEDB-10',
    tags: 'A, B',
  })
})

test('PM template payload resets status and omits generation bookkeeping', () => {
  const payload = buildPmPlanTemplatePayload({
    id: 'plan-1',
    plan_number: 'PM-9',
    name: 'Monthly AHU',
    status: 'active',
    next_due_at: '2026-12-01',
    last_generated_at: '2026-11-01',
    last_generated_due_at: '2026-11-01',
    last_due_notice_on: '2026-10-30',
    technicians: [{ id: 'e1' }, { id: 'e2' }],
    schedule_type: 'calendar',
    is_recurring: true,
    start_date: '2026-01-15T00:00:00.000Z',
  })
  assert.equal(payload.name, 'Monthly AHU')
  assert.equal(payload.status, 'inactive')
  assert.deepEqual(payload.technician_ids, ['e1', 'e2'])
  assert.equal(payload.start_date, '2026-01-15')
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'plan_number'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'next_due_at'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'last_generated_at'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'id'), false)
})
