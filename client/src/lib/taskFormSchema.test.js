import test from 'node:test'
import assert from 'node:assert/strict'
import { buildTaskPayload } from './taskFormSchema.js'

test('buildTaskPayload omits external links and keeps reference remarks', () => {
  const payload = buildTaskPayload({
    title: 'Inspect pump',
    detailed_description: 'Check seals',
    visibility_type: 'self',
    task_type: 'one_time',
    category_id: 'cat-1',
    priority_id: 'pri-1',
    start_date: '2026-11-26',
    due_date: '2026-11-27',
    assignee_employee_ids: [],
    tag_ids: [],
    reminders: [],
    links: [{ title: 'Should not send', url: 'https://example.com' }],
    references: [{
      reference_type: 'work_order',
      reference_number: 'WO-1',
      reference_label: 'Urgent',
      reference_entity_id: '',
    }],
  })

  assert.equal('links' in payload, false)
  assert.deepEqual(payload.references, [{
    reference_type: 'work_order',
    reference_number: 'WO-1',
    reference_label: 'Urgent',
    reference_entity_id: '',
  }])
})
