import { supabaseAdmin } from '../services/supabase.js'
import { sendNotificationEmail } from '../services/email.js'

async function listActiveEmployees(orgId, applyFilter) {
  let query = supabaseAdmin
    .from('org_employees')
    .select('id, profile_id')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .not('profile_id', 'is', null)
  query = applyFilter(query)
  const { data, error } = await query
  if (error) throw error
  return data || []
}

/**
 * Resolve in-app notification profile ids for a warranty expiry alert.
 * Includes: creator, active employees in linked equipment department, org admins as fallback.
 */
export async function listWarrantyNotifyProfileIds(orgId, {
  createdByProfileId = null,
  equipmentId = null,
} = {}) {
  const profileIds = new Set()
  if (createdByProfileId) profileIds.add(createdByProfileId)

  let departmentId = null
  if (equipmentId) {
    const { data: equipment } = await supabaseAdmin
      .from('equipment')
      .select('id, department_id')
      .eq('org_id', orgId)
      .eq('id', equipmentId)
      .maybeSingle()
    departmentId = equipment?.department_id || null
  }

  if (departmentId) {
    const employees = await listActiveEmployees(orgId, (query) => query.eq('department_id', departmentId))
    for (const employee of employees) {
      if (employee.profile_id) profileIds.add(employee.profile_id)
    }
  }

  if (!profileIds.size) {
    const { data: admins } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('org_id', orgId)
      .eq('role', 'admin')
    for (const admin of admins || []) {
      if (admin.id) profileIds.add(admin.id)
    }
  }

  return [...profileIds]
}

/** Email the warranty contact when present (may not have a profile). */
export async function emailWarrantyContact(warranty, { title, body }) {
  const to = String(warranty?.contact_email || '').trim()
  if (!to) return
  await sendNotificationEmail({
    to,
    toName: warranty.contact_name || to,
    title,
    body,
  }).catch((err) => {
    console.error('[warrantyExpiry] contact email failed', err.message)
  })
}
