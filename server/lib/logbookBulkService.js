import ExcelJS from 'exceljs'
import { supabaseAdmin } from '../services/supabase.js'
import { buildWorkbook, normalizeName, readTemplateRows } from './excelTemplate.js'
import { addMeterReading, loadLogbookAssetFields } from './logbookService.js'

const READING_HEADER = 'Meter reading'
const PAGE_SIZE = 1000
const LIST_CAP = 5000

function httpError(message, status = 400) {
  const err = new Error(message)
  err.status = status
  return err
}

function fieldValueText(row, fieldId) {
  const match = (row?.field_values || []).find((item) => item.field_id === fieldId)
  if (!match) return ''
  const text = String(match.value_text || '').trim()
  if (text) return text
  const values = match.value_json?.values
  if (Array.isArray(values)) {
    return values.map((value) => String(value || '').trim()).filter(Boolean).join(', ')
  }
  const nested = match.value_json?.value ?? match.value_json?.label ?? match.value_json?.name
  return nested == null ? '' : String(nested).trim()
}

function identityColumns(assetFields) {
  const fields = (assetFields || []).filter((field) => (
    field?.id
    && field?.name
    && field.field_type !== 'image'
    && field.field_type !== 'file'
  ))
  if (!fields.length) {
    return [
      { id: 'name', header: 'Asset' },
      { id: 'code', header: 'Code' },
    ]
  }
  const used = new Map()
  return fields.map((field) => {
    let header = String(field.name).trim() || 'Field'
    if (normalizeName(header) === normalizeName(READING_HEADER)) header = `${header} (asset)`
    const key = normalizeName(header)
    const count = used.get(key) || 0
    used.set(key, count + 1)
    if (count) header = `${header} (${count + 1})`
    return { id: `field:${field.id}`, fieldId: field.id, header }
  })
}

function identityText(asset, column) {
  if (column.fieldId) return fieldValueText(asset, column.fieldId)
  if (column.id === 'code') return asset.code || ''
  return asset.name || ''
}

function assetLabel(asset, columns) {
  const parts = columns.map((column) => identityText(asset, column)).map((part) => part.trim()).filter(Boolean)
  if (parts.length) return parts.join(' · ')
  return [asset.name, asset.code].map((part) => String(part || '').trim()).filter(Boolean).join(' · ')
}

async function loadMeterAssets(orgId, locationId) {
  const rows = []
  for (let offset = 0; offset < LIST_CAP; offset += PAGE_SIZE) {
    let query = supabaseAdmin
      .from('equipment')
      .select('id, name, code, location_id')
      .eq('org_id', orgId)
      .eq('reading_required', true)
      .order('name', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
    if (locationId) query = query.eq('location_id', locationId)
    const { data, error } = await query
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < PAGE_SIZE) break
  }
  if (!rows.length) return rows

  const values = []
  for (let index = 0; index < rows.length; index += 200) {
    const ids = rows.slice(index, index + 200).map((row) => row.id)
    const { data, error } = await supabaseAdmin
      .from('equipment_values')
      .select('equipment_id, field_id, value_text, value_json')
      .eq('org_id', orgId)
      .in('equipment_id', ids)
    if (error) throw error
    values.push(...(data || []))
  }
  const byEquipment = new Map()
  for (const item of values) {
    const list = byEquipment.get(item.equipment_id) || []
    list.push(item)
    byEquipment.set(item.equipment_id, list)
  }
  for (const row of rows) row.field_values = byEquipment.get(row.id) || []
  return rows
}

function matchAsset(assets, columns, rowValues) {
  const provided = columns.filter((column) => String(rowValues[column.header] || '').trim())
  if (!provided.length) throw httpError('Enter the asset columns so this reading can be matched.')
  const matches = assets.filter((asset) => provided.every((column) => (
    normalizeName(identityText(asset, column)) === normalizeName(rowValues[column.header])
  )))
  if (!matches.length) throw httpError('No asset with Reading required matches this row.')
  if (matches.length > 1) throw httpError('This row matches more than one asset. Fill in more asset columns.')
  return matches[0]
}

function parseReading(value) {
  const text = String(value || '').trim().replace(/,/g, '')
  if (!text) return null
  const reading = Number(text)
  if (!Number.isFinite(reading) || reading < 0) {
    throw httpError('Meter reading must be a number zero or greater.')
  }
  return reading
}

export async function buildMeterReadingTemplate(orgId, { locationId = null } = {}) {
  const [assetFields, assets] = await Promise.all([
    loadLogbookAssetFields(orgId),
    loadMeterAssets(orgId, locationId),
  ])
  const columns = identityColumns(assetFields)
  const headers = [...columns.map((column) => column.header), READING_HEADER]
  const sampleRows = assets.map((asset) => {
    const row = { [READING_HEADER]: '' }
    for (const column of columns) row[column.header] = identityText(asset, column)
    return row
  })
  const validColumns = columns.map((column) => {
    const seen = new Set()
    const values = []
    for (const asset of assets) {
      const text = identityText(asset, column).trim()
      const key = normalizeName(text)
      if (!text || seen.has(key)) continue
      seen.add(key)
      values.push(text)
    }
    values.sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }))
    return { header: column.header, values }
  })
  return buildWorkbook(headers, validColumns, { sampleRows })
}

export async function bulkImportMeterReadings(orgId, userId, buffer, { locationId = null } = {}) {
  const [assetFields, assets] = await Promise.all([
    loadLogbookAssetFields(orgId),
    loadMeterAssets(orgId, locationId),
  ])
  const columns = identityColumns(assetFields)
  const headers = [...columns.map((column) => column.header), READING_HEADER]
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const rows = readTemplateRows(workbook, headers)
  const results = { created: 0, failed: 0, errors: [], preview: [] }
  const base = Date.now()
  let stampOffset = 0

  for (const { rowNumber, rowValues } of rows) {
    if (!String(rowValues[READING_HEADER] || '').trim()) continue
    try {
      const reading = parseReading(rowValues[READING_HEADER])
      const asset = matchAsset(assets, columns, rowValues)
      await addMeterReading(
        orgId,
        asset.id,
        { reading },
        userId,
        { readingAt: new Date(base + stampOffset).toISOString() },
      )
      stampOffset += 1
      results.created += 1
      if (results.preview.length < 250) {
        results.preview.push({
          row: rowNumber,
          name: assetLabel(asset, columns),
          reading: String(reading),
        })
      }
    } catch (err) {
      results.failed += 1
      results.errors.push({
        row: rowNumber,
        message: err.message || 'Import failed',
      })
    }
  }

  if (!results.created && !results.failed) {
    throw httpError('Enter a meter reading on at least one row.')
  }
  return results
}
