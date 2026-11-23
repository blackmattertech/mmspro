import test from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import {
  TEMPLATE_SHEET,
  VALID_VALUES_SHEET,
  buildWorkbook,
  excelColumnLetter,
  loadExcelWorkbook,
  runBulkImport,
} from './excelTemplate.js'

test('excelColumnLetter maps indexes to Excel letters', () => {
  assert.equal(excelColumnLetter(1), 'A')
  assert.equal(excelColumnLetter(26), 'Z')
  assert.equal(excelColumnLetter(27), 'AA')
  assert.equal(excelColumnLetter(28), 'AB')
})

test('buildWorkbook adds dropdown validations for matching and appliesTo columns', async () => {
  const buffer = await buildWorkbook(
    ['Request Type', 'Order From Department', 'Order To Department', 'Asset', 'Notes'],
    [
      { header: 'Request Type', values: ['Inter-department', 'Self'] },
      {
        header: 'Department',
        values: ['Production (PRD)', 'Electrical (ELE)'],
        appliesTo: ['Order From Department', 'Order To Department'],
      },
      { header: 'Asset', values: ['PMP-01 — Pump'] },
    ],
    {
      sampleRow: {
        'Request Type': 'Inter-department',
        Notes: 'free text',
      },
      dataRows: 50,
    },
  )

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const template = workbook.getWorksheet(TEMPLATE_SHEET)
  const valid = workbook.getWorksheet(VALID_VALUES_SHEET)
  assert.ok(template)
  assert.ok(valid)

  const model = template.dataValidations?.model || {}
  const cells = Object.keys(model)
  assert.ok(cells.includes('A2'), 'Request Type dropdown on column A')
  assert.ok(cells.includes('B2'), 'Order From Department dropdown on column B')
  assert.ok(cells.includes('C2'), 'Order To Department dropdown on column C')
  assert.ok(cells.includes('D2'), 'Asset dropdown on column D')
  assert.ok(!cells.some((cell) => cell.startsWith('E')), 'Notes stays free text')

  const requestTypeRule = model.A2
  assert.equal(requestTypeRule.type, 'list')
  assert.equal(requestTypeRule.allowBlank, true)
  assert.match(String(requestTypeRule.formulae?.[0] || ''), /Valid values/)
  assert.match(String(model.B2.formulae?.[0] || ''), /\$B\$2/)
})

test('buildWorkbook wires yes/no style columns used by company masters', async () => {
  const buffer = await buildWorkbook(
    ['Name', 'Code', 'Primary'],
    [{ header: 'Primary', values: ['Yes', 'No'] }],
    { sampleRow: { Name: 'Plant A', Code: 'PA', Primary: 'No' } },
  )
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const template = workbook.getWorksheet(TEMPLATE_SHEET)
  const model = template.dataValidations?.model || {}
  assert.ok(model.C2, 'Primary column has a dropdown')
  assert.match(String(model.C2.formulae?.[0] || ''), /Valid values/)
})

async function withUnprefixedLastModifiedBy(buffer) {
  const zip = await JSZip.loadAsync(buffer)
  const core = await zip.file('docProps/core.xml').async('string')
  zip.file(
    'docProps/core.xml',
    core.replace(/<\/dc:creator>/, '</dc:creator><lastModifiedBy>Excel User</lastModifiedBy>'),
  )
  return Buffer.from(await zip.generateAsync({ type: 'uint8array' }))
}

test('loadExcelWorkbook accepts Excel-saved core.xml with unprefixed lastModifiedBy', async () => {
  const original = await buildWorkbook(
    ['Title', 'Priority'],
    [],
    { sampleRow: { Title: 'Follow up', Priority: 'High' } },
  )
  const broken = await withUnprefixedLastModifiedBy(original)

  await assert.rejects(
    async () => {
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(broken)
    },
    /lastModifiedBy|Unexpected xml node/,
  )

  const workbook = await loadExcelWorkbook(broken)
  const sheet = workbook.getWorksheet(TEMPLATE_SHEET)
  assert.equal(sheet.getRow(2).getCell(1).value, 'Follow up')
  assert.equal(sheet.getRow(2).getCell(2).value, 'High')
})

test('runBulkImport reads rows from workbooks Excel rewrote with lastModifiedBy', async () => {
  const original = await buildWorkbook(
    ['Title'],
    [],
    { sampleRow: { Title: 'Import me' } },
  )
  const broken = await withUnprefixedLastModifiedBy(original)
  const seen = []
  const result = await runBulkImport(broken, ['Title'], async (row) => {
    seen.push(row.Title)
    return { title: row.Title }
  })
  assert.equal(result.created, 1)
  assert.equal(result.failed, 0)
  assert.deepEqual(seen, ['Import me'])
})
