import { supabaseAdmin } from '../services/supabase.js'
import {
  departmentFitsLocation,
  isMaintenanceDepartment,
} from './bulkMasterMatch.js'

const DEFAULT_MAINTENANCE_NAME = 'Maintenance'

function maintenanceCodeCandidates(location) {
  const locationCode = String(location?.code || 'LOC')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(0, 12) || 'LOC'
  const idCode = String(location?.id || '')
    .replace(/-/g, '')
    .slice(0, 8)
    .toUpperCase()
  return [
    `MNT-${locationCode}`,
    `MAINT-${locationCode}`,
    idCode ? `MNT-${idCode}` : null,
  ].filter(Boolean)
}

export async function ensureLocationMaintenanceDepartment(orgId, location) {
  if (!orgId || !location?.id) return null

  const { data: departments, error: listError } = await supabaseAdmin
    .from('departments')
    .select('id, name, code, location_id, all_locations, is_active')
    .eq('org_id', orgId)
    .eq('is_active', true)

  if (listError) throw listError

  const existing = (departments || []).find((department) => (
    isMaintenanceDepartment(department)
    && departmentFitsLocation(department, location.id)
  ))
  if (existing) return existing

  let lastError = null
  for (const code of maintenanceCodeCandidates(location)) {
    const { data, error } = await supabaseAdmin
      .from('departments')
      .insert({
        org_id: orgId,
        name: DEFAULT_MAINTENANCE_NAME,
        code,
        description: 'Default maintenance department',
        all_locations: false,
        location_id: location.id,
        is_active: true,
      })
      .select('id, name, code, location_id, all_locations, is_active')
      .single()

    if (!error) return data
    lastError = error
    if (error.code !== '23505') throw error
  }

  if (lastError) throw lastError
  return null
}
