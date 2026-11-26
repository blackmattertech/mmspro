import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ACTIVE_REPAIR_HOURS_FIELD_ID,
  BREAKDOWN_TIMES_FIELD_ID,
  OPERATIONAL_BREAKDOWN_HOURS_FIELD_ID,
  WO_EXECUTION_SECTION_ID,
  ensureWorkOrderReliabilityFields,
  validateBreakdownReliabilityHoursRequired,
  validateLayoutNumberMaxBounds,
} from './workOrderReliabilityFields.js'

function baseLayout() {
  return {
    v: 1,
    sections: [{ id: WO_EXECUTION_SECTION_ID, order: 0, label: 'Work execution' }],
    fields: [
      { id: 'system:work_stamps', sectionId: WO_EXECUTION_SECTION_ID, order: 0, colSpan: 100 },
      { id: BREAKDOWN_TIMES_FIELD_ID, sectionId: WO_EXECUTION_SECTION_ID, order: 1, colSpan: 100 },
      { id: 'system:labour_count', sectionId: WO_EXECUTION_SECTION_ID, order: 2, colSpan: 25 },
    ],
    groups: [],
  }
}

describe('ensureWorkOrderReliabilityFields', () => {
  it('inserts both custom number fields after breakdown times', () => {
    const next = ensureWorkOrderReliabilityFields(baseLayout(), 'work_orders.from_work_request')
    const ids = next.fields.map((field) => field.id)
    const breakdownAt = ids.indexOf(BREAKDOWN_TIMES_FIELD_ID)
    assert.equal(ids[breakdownAt + 1], OPERATIONAL_BREAKDOWN_HOURS_FIELD_ID)
    assert.equal(ids[breakdownAt + 2], ACTIVE_REPAIR_HOURS_FIELD_ID)
    assert.equal(next.fields[breakdownAt + 1].fieldType, 'number')
    assert.equal(next.fields[breakdownAt + 2].fieldType, 'number')
    assert.equal(next.fields[breakdownAt + 1].maxBound, 'breakdown_duration')
  })

  it('is idempotent', () => {
    const once = ensureWorkOrderReliabilityFields(baseLayout(), 'work_orders.manual')
    const twice = ensureWorkOrderReliabilityFields(once, 'work_orders.manual')
    const count = twice.fields.filter((field) => (
      field.id === OPERATIONAL_BREAKDOWN_HOURS_FIELD_ID
      || field.id === ACTIVE_REPAIR_HOURS_FIELD_ID
    )).length
    assert.equal(count, 2)
  })

  it('skips non-work-order forms', () => {
    const layout = baseLayout()
    const next = ensureWorkOrderReliabilityFields(layout, 'work_request.create')
    assert.equal(next, layout)
  })
})

describe('validateLayoutNumberMaxBounds', () => {
  const layout = ensureWorkOrderReliabilityFields(baseLayout(), 'work_orders.from_work_request')
  const period = {
    breakdownStartAt: '2026-11-20T11:00:00.000Z',
    breakdownEndAt: '2026-11-23T15:00:00.000Z',
  }

  it('rejects operational hours above calculated breakdown hours', () => {
    const message = validateLayoutNumberMaxBounds({
      layout,
      values: {
        [OPERATIONAL_BREAKDOWN_HOURS_FIELD_ID]: 100,
        [ACTIVE_REPAIR_HOURS_FIELD_ID]: 5,
      },
      ...period,
    })
    assert.match(message, /Operational Breakdown Hours/)
    assert.match(message, /Breakdown Hours/)
  })

  it('rejects active repair hours above operational breakdown hours', () => {
    const message = validateLayoutNumberMaxBounds({
      layout,
      values: {
        [OPERATIONAL_BREAKDOWN_HOURS_FIELD_ID]: 12,
        [ACTIVE_REPAIR_HOURS_FIELD_ID]: 15,
      },
      ...period,
    })
    assert.match(message, /Active Repair Hours/)
    assert.match(message, /Operational Breakdown Hours/)
  })

  it('accepts valid operational and active repair hours', () => {
    const message = validateLayoutNumberMaxBounds({
      layout,
      values: {
        [OPERATIONAL_BREAKDOWN_HOURS_FIELD_ID]: 12,
        [ACTIVE_REPAIR_HOURS_FIELD_ID]: 5,
      },
      ...period,
    })
    assert.equal(message, null)
  })

  it('requires breakdown period when operational hours are entered', () => {
    const message = validateLayoutNumberMaxBounds({
      layout,
      values: { [OPERATIONAL_BREAKDOWN_HOURS_FIELD_ID]: 4 },
    })
    assert.match(message, /Breakdown start and end/)
  })
})

describe('validateBreakdownReliabilityHoursRequired', () => {
  it('skips non-breakdown and non-completion statuses', () => {
    assert.equal(validateBreakdownReliabilityHoursRequired({
      isBreakdown: false,
      status: 'completed',
      values: {},
    }), null)
    assert.equal(validateBreakdownReliabilityHoursRequired({
      isBreakdown: true,
      status: 'in_progress',
      values: {},
    }), null)
  })

  it('requires both reliability hours on breakdown completion', () => {
    const message = validateBreakdownReliabilityHoursRequired({
      isBreakdown: true,
      status: 'completed',
      values: {},
    })
    assert.match(message, /Operational Breakdown Hours/)
    assert.match(message, /Active Repair Hours/)
  })

  it('accepts both hours on breakdown completion', () => {
    assert.equal(validateBreakdownReliabilityHoursRequired({
      isBreakdown: true,
      status: 'verified',
      values: {
        [OPERATIONAL_BREAKDOWN_HOURS_FIELD_ID]: 12,
        [ACTIVE_REPAIR_HOURS_FIELD_ID]: 5,
      },
    }), null)
  })
})
