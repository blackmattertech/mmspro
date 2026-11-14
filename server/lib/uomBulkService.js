import ExcelJS from 'exceljs'
import { supabaseAdmin } from '../services/supabase.js'
import { buildWorkbook, readTemplateRows } from './excelTemplate.js'
import { lookupUomKey, normalizeUomCode, normalizeUomName } from './uomMaster.js'

const TEMPLATE_COLUMNS = ['Code', 'Name', 'Active']

export function parseUomActive(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return true
  if (['yes', 'y', 'true', '1', 'active'].includes(raw)) return true
  if (['no', 'n', 'false', '0', 'inactive'].includes(raw)) return false
  const err = new Error('Active must be Yes or No')
  err.status = 400
  throw err
}

export function parseUomBulkRow(rowValues = {}) {
  return {
    code: normalizeUomCode(rowValues.Code),
    name: normalizeUomName(rowValues.Name),
    is_active: parseUomActive(rowValues.Active),
  }
}

export function buildUomsTemplate() {
  return buildWorkbook(
    TEMPLATE_COLUMNS,
    [{ header: 'Active', values: ['Yes', 'No'] }],
    {
      sampleRow: { Code: 'NOS', Name: 'Numbers', Active: 'Yes' },
    },
  )
}

export async function importUoms(orgId, buffer) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const rows = readTemplateRows(workbook, TEMPLATE_COLUMNS)

  const { data: existing, error } = await supabaseAdmin
    .from('org_uoms')
    .select('id, code, name, is_active')
    .eq('org_id', orgId)
  if (error) throw error

  const byCode = new Map()
  for (const row of existing || []) byCode.set(lookupUomKey(row.code), row)

  const results = { created: 0, updated: 0, failed: 0, errors: [] }
  for (const { rowNumber, rowValues } of rows) {
    try {
      const parsed = parseUomBulkRow(rowValues)
      const current = byCode.get(parsed.code)
      if (current) {
        const { error: updateError } = await supabaseAdmin
          .from('org_uoms')
          .update({
            name: parsed.name,
            is_active: parsed.is_active,
            updated_at: new Date().toISOString(),
          })
          .eq('id', current.id)
          .eq('org_id', orgId)
        if (updateError) throw updateError
        byCode.set(parsed.code, { ...current, ...parsed })
        results.updated += 1
      } else {
        const { data, error: insertError } = await supabaseAdmin
          .from('org_uoms')
          .insert({
            org_id: orgId,
            code: parsed.code,
            name: parsed.name,
            is_active: parsed.is_active,
          })
          .select('id, code, name, is_active')
          .single()
        if (insertError) {
          if (insertError.code === '23505') {
            throw Object.assign(new Error('This UOM code already exists'), { status: 400 })
          }
          throw insertError
        }
        byCode.set(parsed.code, data)
        results.created += 1
      }
    } catch (err) {
      results.failed += 1
      results.errors.push({ row: rowNumber, message: err.message || 'Could not import this row' })
    }
  }

  const parts = []
  if (results.created) parts.push(`${results.created} unit(s) created`)
  if (results.updated) parts.push(`${results.updated} unit(s) updated`)
  if (results.failed) parts.push(`${results.failed} row(s) failed`)
  results.summary = parts.join(', ') || 'No units imported'
  return results
}
