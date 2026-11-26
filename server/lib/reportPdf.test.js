import test from 'node:test'
import assert from 'node:assert/strict'
import { buildActivityFilterValues, buildReportPdfBuffer, reportPdfFilename } from './reportPdf.js'
import { columnsForReport } from './reportConstants.js'

const REPORT_KINDS = [
  'unified',
  'scheduled',
  'plant',
  'overdue',
  'work_request',
  'pm_plan',
  'meter_reading',
  'task',
  'warranty',
  'equipment',
]

/** A4 landscape MediaBox used by the work-order letterhead report layout. */
const LANDSCAPE_A4 = /\/MediaBox \[0 0 841\.89 595\.28\]/

function pdfContainsLiteral(pdf, text) {
  // PDFKit stores Title/Author as uncompressed string objects; content streams are flate-encoded.
  return pdf.toString('latin1').includes(`(${text})`)
}

test('buildActivityFilterValues resolves ids to labels and defaults to All', () => {
  const values = buildActivityFilterValues({
    date_from: '2026-01-01',
    date_to: '2026-01-31',
    order_to: 'dept-1',
    facility_id: 'loc-1',
    priority: 'high',
  }, {
    departments: [{ value: 'dept-1', label: 'Mechanical' }],
    locations: [{ value: 'loc-1', label: 'Plant A' }],
    priorities: [{ value: 'high', label: 'High' }],
  })

  assert.equal(values.fromDate, '01-Jan-2026')
  assert.equal(values.toDate, '31-Jan-2026')
  assert.equal(values.orderTo, 'Mechanical')
  assert.equal(values.facility, 'Plant A')
  assert.equal(values.priority, 'High')
  assert.equal(values.catalogSummary, 'All')
})

test('reportPdfFilename slugifies title and keeps display date range', () => {
  assert.equal(
    reportPdfFilename('Work Orders / Plant', '2026-01-01', '2026-01-31'),
    'work-orders-plant-01-Jan-2026-to-31-Jan-2026.pdf',
  )
})

for (const kind of REPORT_KINDS) {
  test(`buildReportPdfBuffer uses letterhead layout for ${kind} reports`, async () => {
    const columns = columnsForReport(kind).slice(0, 4).map((col) => col.id)
    const sampleRow = Object.fromEntries(columns.map((id) => [id, `${kind}-${id}`]))
    const expectedTitle = `${kind} report`.toUpperCase()
    const pdf = await buildReportPdfBuffer({
      orgName: 'Acme Manufacturing',
      address: '1 Industrial Road',
      department: 'Mechanical',
      title: `${kind} report`,
      kind,
      columns,
      rows: [sampleRow],
      activityFilters: {
        fromDate: '2026-01-01',
        toDate: '2026-01-31',
        facility: 'Plant A',
        orderTo: 'Mechanical',
      },
    })

    assert.ok(Buffer.isBuffer(pdf))
    assert.ok(pdf.length > 500, `expected non-trivial PDF for ${kind}`)
    assert.equal(pdf.subarray(0, 4).toString('latin1'), '%PDF')
    const body = pdf.toString('latin1')
    assert.match(body, LANDSCAPE_A4)
    assert.ok(pdfContainsLiteral(pdf, expectedTitle), `missing title ${expectedTitle}`)
    assert.ok(pdfContainsLiteral(pdf, 'Acme Manufacturing'), 'missing org author metadata')
  })
}

test('buildReportPdfBuffer still renders empty-state letterhead pages', async () => {
  const pdf = await buildReportPdfBuffer({
    orgName: 'Empty Org',
    title: 'Empty Report',
    kind: 'task',
    rows: [],
    columns: ['title', 'status'],
    activityFilters: { fromDate: '2026-02-01', toDate: '2026-02-28' },
  })
  assert.equal(pdf.subarray(0, 4).toString('latin1'), '%PDF')
  assert.match(pdf.toString('latin1'), LANDSCAPE_A4)
  assert.ok(pdfContainsLiteral(pdf, 'EMPTY REPORT'))
  assert.ok(pdfContainsLiteral(pdf, 'Empty Org'))
})

/** 1×1 PNG — enough to prove logo XObjects are reused across pages. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

function countPdfImages(pdf) {
  return (pdf.toString('latin1').match(/\/Subtype \/Image/g) || []).length
}

test('buildReportPdfBuffer reuses one logo XObject across multi-page column groups', async () => {
  // Many wide text columns force several landscape page groups → letterhead redraws.
  const columns = columnsForReport('unified').slice(0, 24).map((col) => col.id)
  const rows = Array.from({ length: 12 }, (_, i) => (
    Object.fromEntries(columns.map((id) => [id, `row-${i}-${id}`]))
  ))

  const pdf = await buildReportPdfBuffer({
    orgName: 'Logo Org',
    address: '1 Test Road',
    department: 'MAINTENANCE',
    logo: TINY_PNG,
    title: 'Activity Report',
    kind: 'unified',
    columns,
    rows,
    activityFilters: { fromDate: '01-Jan-2026', toDate: '31-Jan-2026' },
  })

  assert.equal(pdf.subarray(0, 4).toString('latin1'), '%PDF')
  const images = countPdfImages(pdf)
  // Without openImage reuse this would grow ~2 images per page (often 10+).
  assert.ok(images <= 4, `expected reused logo, got ${images} image XObjects`)
  assert.ok(pdf.length < 250_000, `expected compact PDF, got ${pdf.length} bytes`)
})

function pdfPageCount(pdf) {
  const match = pdf.toString('latin1').match(/\/Type\s*\/Pages[\s\S]*?\/Count\s+(\d+)/)
  return Number(match?.[1] || 0)
}

test('buildReportPdfBuffer does not create blank pages from footer text overflow', async () => {
  const columns = columnsForReport('unified').slice(0, 18).map((col) => col.id)
  const rows = Array.from({ length: 20 }, (_, i) => (
    Object.fromEntries(columns.map((id) => [id, `value-${i}-${id}`]))
  ))

  const pdf = await buildReportPdfBuffer({
    orgName: 'Footer Org',
    address: '2 Test Road',
    department: 'MAINTENANCE',
    logo: TINY_PNG,
    title: 'Activity Report',
    kind: 'unified',
    columns,
    rows,
    activityFilters: { fromDate: '01-Jan-2026', toDate: '31-Jan-2026' },
  })

  const pages = pdfPageCount(pdf)
  // 18 columns → about 2 column groups; 20 rows fit on a few pages each. Far below the
  // old footer bug (2 blank pages per content page → often 3× expected).
  assert.ok(pages >= 2, `expected multiple content pages, got ${pages}`)
  assert.ok(pages <= 12, `expected no footer blank pages, got ${pages}`)
})

test('buildReportPdfBuffer finishes a dense 33-row export in under 2 seconds', async () => {
  const columns = columnsForReport('unified').slice(0, 50).map((col) => col.id)
  const rows = Array.from({ length: 33 }, (_, i) => (
    Object.fromEntries(columns.map((id) => [id, `${id} sample text ${i}`.repeat(id.includes('description') ? 3 : 1)]))
  ))

  const started = Date.now()
  const pdf = await buildReportPdfBuffer({
    orgName: 'Speed Org',
    address: '3 Industrial Road, City - State',
    department: 'MAINTENANCE',
    logo: TINY_PNG,
    title: 'Activity Report',
    kind: 'unified',
    columns,
    rows,
    activityFilters: { fromDate: '10-Nov-2026', toDate: '16-Nov-2026' },
  })
  const elapsed = Date.now() - started

  assert.equal(pdf.subarray(0, 4).toString('latin1'), '%PDF')
  assert.ok(elapsed < 2000, `PDF build took ${elapsed}ms, expected <2000ms`)
  assert.ok(pdfPageCount(pdf) <= 20, `unexpected page count ${pdfPageCount(pdf)}`)
})
