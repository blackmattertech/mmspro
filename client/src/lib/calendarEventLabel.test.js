import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  calendarEventLabel,
  calendarEventTooltip,
  calendarEventTooltipLines,
} from './calendarEventLabel.js'

describe('calendarEventLabel', () => {
  it('uses short description title without document number', () => {
    assert.equal(
      calendarEventLabel({
        source: 'work_order',
        title: 'Pump seal leak',
        document_number: 'WO-100',
      }),
      'Pump seal leak',
    )
  })

  it('falls back to source label when title is empty', () => {
    assert.equal(calendarEventLabel({ source: 'work_request', title: '' }), 'Work request')
  })
})

describe('calendarEventTooltip', () => {
  it('includes order from, order to, and work request details', () => {
    const lines = calendarEventTooltipLines({
      source: 'work_order',
      title: 'Pump seal leak',
      document_number: 'WO-100',
      work_request: 'WR-55',
      order_from: 'Production',
      order_to: 'Maintenance',
      plant: 'Plant A',
    })
    assert.deepEqual(lines, [
      'Work order',
      'Document: WO-100',
      'Work request: WR-55',
      'Order from: Production',
      'Order to: Maintenance',
      'Location: Plant A',
    ])
    assert.match(calendarEventTooltip({
      source: 'work_order',
      document_number: 'WO-100',
      work_request: 'WR-55',
      order_from: 'Production',
      order_to: 'Maintenance',
    }), /Order from: Production/)
  })

  it('omits duplicate work request when it matches document number', () => {
    const lines = calendarEventTooltipLines({
      source: 'work_request',
      document_number: 'WR-55',
      work_request: 'WR-55',
      order_from: 'Production',
      order_to: 'Maintenance',
    })
    assert.deepEqual(lines, [
      'Work request',
      'Document: WR-55',
      'Order from: Production',
      'Order to: Maintenance',
    ])
  })
})
