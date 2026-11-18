import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildReadyReportName,
  readyReportStoragePaths,
} from './reportReadyService.js'

describe('buildReadyReportName', () => {
  it('combines title and period', () => {
    assert.equal(
      buildReadyReportName({ title: 'Work Orders', period: '01-Jan-2026 to 07-Jan-2026' }),
      'Work Orders (01-Jan-2026 to 07-Jan-2026)',
    )
  })

  it('falls back to Report when empty', () => {
    assert.equal(buildReadyReportName({}), 'Report')
  })

  it('prefers custom name', () => {
    assert.equal(
      buildReadyReportName({ customName: 'Plant A weekly', title: 'Work Orders', period: 'Week' }),
      'Plant A weekly (Week)',
    )
  })
})

describe('readyReportStoragePaths', () => {
  it('nests files under org/ready/id', () => {
    const paths = readyReportStoragePaths(
      'org-1',
      'ready-1',
      'Work Orders.pdf',
      'Work Orders.csv',
    )
    assert.equal(paths.pdfPath, 'org-1/ready/ready-1/Work_Orders.pdf')
    assert.equal(paths.csvPath, 'org-1/ready/ready-1/Work_Orders.csv')
  })
})
