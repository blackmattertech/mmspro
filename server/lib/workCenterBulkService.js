import { supabaseAdmin } from '../services/supabase.js'
import {
  buildWorkbook,
  readTemplateRows,
  normalizeName,
} from './excelTemplate.js'
import ExcelJS from 'exceljs'

const TEMPLATE_COLUMNS = ['Name', 'Code', 'Location', 'Description', 'Active']

async function loadLocations(orgId, locationId = null) {
  let query = supabaseAdmin
    .from('org_locations')
    .select('id, name, is_active')
    .eq('org_id', orgId)
    .order('name')
  if (locationId) query = query.eq('id', locationId)
  const { data, error } = await query
  if (error) throw error
  return (data || []).filter((row) => row.is_active !== false)
}

export async function buildWorkCentersTemplate(orgId, { locationId } = {}) {
  const locations = await loadLocations(orgId, locationId)
  return buildWorkbook(
    TEMPLATE_COLUMNS,
    [
      {
        header: 'Location',
        values: ['No location', ...locations.map((l) => l.name)],
      },
      {
        header: 'Active',
        values: ['Yes', 'No'],
      },
    ],
    {
      sampleRow: {
        Name: 'General',
        Code: 'GEN',
        Location: locations[0]?.name || 'No location',
        Description: 'Default work center',
        Active: 'Yes',
      },
    },
  )
}

function parseActive(value) {
  const raw = normalizeName(value)
  if (!raw) return true
  if (['yes', 'y', 'true', '1', 'active'].includes(raw)) return true
  if (['no', 'n', 'false', '0', 'inactive'].includes(raw)) return false
  throw new Error('Active must be Yes or No')
}

function resolveLocationId(raw, locations, { forcedLocationId = null } = {}) {
  if (forcedLocationId) return forcedLocationId
  const locRaw = String(raw || '').trim()
  const locNorm = normalizeName(locRaw)
  if (!locRaw || locNorm === 'no location' || locNorm === 'none') return null
  const location = locations.find((l) => normalizeName(l.name) === locNorm)
  if (!location) throw new Error(`Unknown location "${locRaw}"`)
  return location.id
}

async function upsertWorkCenter(orgId, payload, indexes) {
  const { name, code, description, location_id, is_active } = payload
  const normalizedCode = code ? normalizeName(code) : ''
  const nameKey = `${normalizeName(name)}|${location_id || ''}`
  const existing = (
    (normalizedCode && indexes.byCode.get(normalizedCode))
    || indexes.byNameLoc.get(nameKey)
    || null
  )

  if (existing) {
    const nextCode = code || existing.code || null
    const { error } = await supabaseAdmin
      .from('work_centers')
      .update({
        name,
        code: nextCode,
        description,
        location_id,
        is_active,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .eq('org_id', orgId)

    if (error) {
      if (error.code === '23505') throw new Error('Work center code already exists')
      throw error
    }

    if (existing.code) indexes.byCode.delete(normalizeName(existing.code))
    indexes.byNameLoc.delete(`${normalizeName(existing.name)}|${existing.location_id || ''}`)
    const next = {
      ...existing,
      name,
      code: nextCode,
      description,
      location_id,
      is_active,
    }
    if (next.code) indexes.byCode.set(normalizeName(next.code), next)
    indexes.byNameLoc.set(`${normalizeName(next.name)}|${next.location_id || ''}`, next)
    return { action: 'updated', id: existing.id }
  }

  const { data, error } = await supabaseAdmin
    .from('work_centers')
    .insert({
      org_id: orgId,
      name,
      code: code || null,
      description,
      location_id,
      is_active,
    })
    .select('id, name, code, location_id, description, is_active')
    .single()

  if (error) {
    if (error.code === '23505') throw new Error('Work center code already exists')
    throw error
  }

  if (data.code) indexes.byCode.set(normalizeName(data.code), data)
  indexes.byNameLoc.set(`${normalizeName(data.name)}|${data.location_id || ''}`, data)
  return { action: 'created', id: data.id }
}

export async function bulkImportWorkCenters(orgId, buffer, { locationId } = {}) {
  const locations = await loadLocations(orgId, locationId)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const rows = readTemplateRows(workbook, TEMPLATE_COLUMNS)

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('work_centers')
    .select('id, name, code, location_id, description, is_active')
    .eq('org_id', orgId)
  if (existingError) throw existingError

  const indexes = {
    byCode: new Map(),
    byNameLoc: new Map(),
  }
  for (const row of existing || []) {
    if (row.code) indexes.byCode.set(normalizeName(row.code), row)
    indexes.byNameLoc.set(`${normalizeName(row.name)}|${row.location_id || ''}`, row)
  }

  const results = { created: 0, updated: 0, failed: 0, errors: [], preview: [] }
  const MAX_PREVIEW = 250

  for (const { rowNumber, rowValues } of rows) {
    try {
      if (!rowValues.Name?.trim()) throw new Error('Name is required')
      const name = rowValues.Name.trim()
      const code = rowValues.Code?.trim() ? rowValues.Code.trim().toUpperCase() : null
      const description = rowValues.Description?.trim() || null
      const is_active = parseActive(rowValues.Active)
      const location_id = resolveLocationId(rowValues.Location, locations, {
        forcedLocationId: locationId || null,
      })
      if (locationId && location_id && location_id !== locationId) {
        throw new Error('Location is outside your access scope')
      }

      const saved = await upsertWorkCenter(orgId, {
        name,
        code,
        description,
        location_id,
        is_active,
      }, indexes)

      if (saved.action === 'updated') results.updated += 1
      else results.created += 1

      if (results.preview.length < MAX_PREVIEW) {
        results.preview.push({
          row: rowNumber,
          name,
          code: code || '',
          location: rowValues.Location?.trim() || 'No location',
        })
      }
    } catch (err) {
      results.failed += 1
      results.errors.push({ row: rowNumber, message: err.message })
    }
  }

  return results
}
