import test from 'node:test'
import assert from 'node:assert/strict'
import {
  NESTED_CLONE_KINDS,
  assertNestedCloneChanged,
  buildNestedCloneDraft,
  findDuplicateOptionLabel,
  permissionsSignature,
  resolveNestedCloneUniqueKeys,
  slugifyCloneKey,
  toNestedCloneComparable,
} from './nestedClone.js'
import { slugifyStatusKey } from '../server/lib/orgStatusDefaults.js'

test('every kind has a comparable shape and a draft', () => {
  for (const kind of NESTED_CLONE_KINDS) {
    assert.equal(typeof toNestedCloneComparable(kind, {}), 'object', kind)
    assert.equal(buildNestedCloneDraft(kind, { id: 'src-1' }).clone_of_id, 'src-1', kind)
  }
})

test('slugifyCloneKey matches the server status key slug', () => {
  for (const name of ['In Progress', '  Waiting parts!! ', 'A/B-C', '', 'x'.repeat(120)]) {
    assert.equal(slugifyCloneKey(name), slugifyStatusKey(name))
  }
})

test('pm activity type: unchanged name is blocked, new name + description passes', () => {
  const source = { id: 'a', name: 'Lubrication', description: 'Grease points' }
  assert.equal(
    assertNestedCloneChanged('pm_activity_type', source, { name: ' lubrication ', description: 'Other' }).ok,
    false,
  )
  assert.equal(
    assertNestedCloneChanged('pm_activity_type', source, { name: 'Lubrication 2', description: 'Grease points' }).ok,
    false,
    'unique key changed but nothing else changed',
  )
  assert.equal(
    assertNestedCloneChanged('pm_activity_type', source, { name: 'Lubrication 2', description: 'Oil points' }).ok,
    true,
  )
})

test('task category / tag only need a new name', () => {
  assert.equal(assertNestedCloneChanged('task_category', { name: 'Safety', is_active: true }, { name: 'Safety', is_active: false }).ok, false)
  assert.equal(assertNestedCloneChanged('task_category', { name: 'Safety' }, { name: 'Safety 2' }).ok, true)
  assert.equal(assertNestedCloneChanged('task_tag', { name: 'Urgent' }, { name: 'URGENT' }).ok, false)
  assert.equal(assertNestedCloneChanged('task_tag', { name: 'Urgent' }, { name: 'Urgent 2' }).ok, true)
})

test('task status / priority need a new name and one other detail', () => {
  const status = { name: 'Blocked', color: '#ff0000', description: '', is_active: true, is_terminal: false }
  assert.equal(assertNestedCloneChanged('task_status', status, { ...status, name: 'Blocked 2' }).ok, false)
  assert.equal(assertNestedCloneChanged('task_status', status, { ...status, name: 'Blocked 2', is_terminal: true }).ok, true)
  assert.equal(assertNestedCloneChanged('task_status', status, { ...status, color: '#00ff00' }).ok, false)

  const priority = { name: 'Urgent', color: '#f00', icon: 'flag', description: '', is_active: true }
  assert.equal(assertNestedCloneChanged('task_priority', priority, { ...priority, name: 'Urgent 2', icon: 'minus' }).ok, true)
})

test('org status: key is derived from the name, so key+name move together', () => {
  const source = { id: 's', key: 'waiting_parts', name: 'Waiting parts', color: '#3B82F6', description: '', is_active: true, is_terminal: false }
  assert.deepEqual(resolveNestedCloneUniqueKeys('org_status', source), ['key', 'name'])
  assert.equal(toNestedCloneComparable('org_status', { name: 'Waiting Parts 2' }).key, 'waiting_parts_2')
  assert.equal(assertNestedCloneChanged('org_status', source, { ...source, key: undefined, color: '#ff0000' }).ok, false)
  assert.equal(
    assertNestedCloneChanged('org_status', source, { name: 'Waiting parts 2', color: '#ff0000', description: '', is_active: true, is_terminal: false }).ok,
    true,
  )
})

test('role: permissions are compared by granted rights; employees are never part of the draft', () => {
  const permissions = [
    { module_key: 'assets', can_create: true, can_read: true, can_update: false, can_delete: false },
    { module_key: 'tasks', can_create: false, can_read: false, can_update: false, can_delete: false },
  ]
  assert.equal(permissionsSignature(permissions), 'assets:cr')

  const source = {
    id: 'r1',
    name: 'Supervisor',
    description: 'Shift lead',
    permissions,
    employee_count: 4,
    sample_employees: [{ id: 'e1' }],
    created_by: 'u1',
  }
  const draft = buildNestedCloneDraft('role', source)
  assert.deepEqual(Object.keys(draft).sort(), ['clone_of_id', 'description', 'name', 'permissions'])
  assert.notEqual(draft.permissions, permissions, 'permissions are copied, not shared')

  assert.equal(assertNestedCloneChanged('role', source, { name: 'Supervisor', description: 'x', permissions }).ok, false)
  assert.equal(assertNestedCloneChanged('role', source, { name: 'Supervisor B', description: 'Shift lead', permissions }).ok, false)
  assert.equal(
    assertNestedCloneChanged('role', source, {
      name: 'Supervisor B',
      description: 'Shift lead',
      permissions: [{ module_key: 'assets', can_create: true, can_read: true, can_update: true, can_delete: false }],
    }).ok,
    true,
  )
})

test('support ticket draft strips ticket identity; subject is the soft key', () => {
  const ticket = {
    id: 't1',
    ticket_number: 'MMS-SUP-0001',
    status: 'open',
    subject: 'Printer jammed',
    category: 'Bug',
    priority: 'high',
    related_module: null,
    asset_ref: null,
    description: '<p>Paper stuck in tray</p>',
    sla_due_at: '2026-01-01',
    assignee_name: 'Sam',
  }
  const draft = buildNestedCloneDraft('support_ticket', ticket)
  assert.equal(draft.ticket_number, undefined)
  assert.equal(draft.status, undefined)
  assert.equal(draft.sla_due_at, undefined)
  assert.equal(draft.assignee_name, undefined)
  assert.equal(draft.subject, 'Printer jammed')
  assert.equal(draft.clone_of_id, 't1')

  const same = { subject: 'printer jammed', category: 'Bug', priority: 'high', related_module: '', asset_ref: '', description: '<p>Paper stuck in tray</p>' }
  assert.equal(assertNestedCloneChanged('support_ticket', ticket, same).ok, false)
  assert.equal(assertNestedCloneChanged('support_ticket', ticket, { ...same, subject: 'Printer jammed again' }).ok, false)
  assert.equal(
    assertNestedCloneChanged('support_ticket', ticket, { ...same, subject: 'Printer jammed again', priority: 'low' }).ok,
    true,
  )
})

test('report schedule: no unique key, must differ in a delivery detail', () => {
  const row = {
    id: 'sch1',
    custom_report_id: 'c1',
    emails: ['b@x.com', 'a@x.com'],
    frequency: 'weekly',
    send_hour: 6,
    send_hour_2: null,
    weekday: 1,
    weekday_2: null,
    month_day: null,
    date_window: 'last_7_days',
    is_active: true,
    email_body_text: '',
    last_sent_at: '2026-01-01',
    next_run_at: '2026-01-08',
  }
  const draft = buildNestedCloneDraft('report_schedule', row)
  assert.equal(draft.last_sent_at, undefined)
  assert.equal(draft.next_run_at, undefined)
  assert.deepEqual(resolveNestedCloneUniqueKeys('report_schedule', row), [])

  const form = {
    custom_report_id: 'c1',
    emails: 'a@x.com, B@x.com',
    frequency: 'weekly',
    send_hour: 6,
    send_hour_2: null,
    weekday: 1,
    weekday_2: 4, // ignored for weekly
    month_day: 1, // ignored for weekly
    date_window: 'last_7_days',
    email_body_text: '',
  }
  assert.equal(assertNestedCloneChanged('report_schedule', row, form).ok, false)
  assert.equal(assertNestedCloneChanged('report_schedule', row, { ...form, send_hour: 7 }).ok, true)
  assert.equal(assertNestedCloneChanged('report_schedule', row, { ...form, emails: 'c@x.com' }).ok, true)
})

test('form option: label must change and be unique within the field', () => {
  const source = { label: 'Electrical', value: 'Electrical' }
  assert.equal(assertNestedCloneChanged('form_option', source, { label: ' electrical ', value: ' electrical ' }).ok, false)
  assert.equal(assertNestedCloneChanged('form_option', source, { label: 'Electrical 2', value: 'Electrical 2' }).ok, true)

  assert.equal(findDuplicateOptionLabel(['A', 'B', 'a ']), 'a')
  assert.equal(findDuplicateOptionLabel(['A', 'B', '', '']), null)
})
