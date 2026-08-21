import { supabaseAdmin } from '../services/supabase.js'
import { getSignedUrls } from './signedUrlCache.js'
import { formatAccountRole } from './accountRoles.js'

const USER_ASSETS_BUCKET = 'user-assets'
const ORG_ASSETS_BUCKET = 'org-assets'

export async function loadTimelineActors(orgId, profileIds) {
  const ids = [...new Set((profileIds || []).filter(Boolean))]
  if (!orgId || !ids.length) return new Map()

  const [profilesResult, employeesResult] = await Promise.all([
    supabaseAdmin
      .from('profiles')
      .select('id, full_name, email, avatar_url, role')
      .in('id', ids),
    supabaseAdmin
      .from('org_employees')
      .select(`
        id, name, emp_id, email, photo_url, profile_id, department_id,
        access_role:access_role_id(id, name),
        departments(id, name, code)
      `)
      .eq('org_id', orgId)
      .in('profile_id', ids)
      .eq('is_active', true),
  ])

  if (profilesResult.error) throw profilesResult.error
  if (employeesResult.error) throw employeesResult.error

  const employeeByProfile = new Map()
  for (const employee of employeesResult.data || []) {
    if (employee.profile_id && !employeeByProfile.has(employee.profile_id)) {
      employeeByProfile.set(employee.profile_id, employee)
    }
  }

  const [photoUrls, avatarUrls] = await Promise.all([
    getSignedUrls(ORG_ASSETS_BUCKET, (employeesResult.data || []).map((row) => row.photo_url)),
    getSignedUrls(USER_ASSETS_BUCKET, (profilesResult.data || []).map((row) => row.avatar_url)),
  ])

  const actors = new Map()
  for (const profile of profilesResult.data || []) {
    const employee = employeeByProfile.get(profile.id)
    const photoSigned = employee?.photo_url ? photoUrls.get(employee.photo_url) : null
    const avatarSigned = profile.avatar_url ? avatarUrls.get(profile.avatar_url) : null
    const department = employee?.departments
      ? {
        id: employee.departments.id,
        name: employee.departments.name,
        code: employee.departments.code,
      }
      : null
    const name = employee?.name || profile.full_name?.trim() || profile.email || 'Unknown'
    const role = employee?.access_role?.name?.trim()
      || formatAccountRole(profile.role)
      || null

    actors.set(profile.id, {
      id: profile.id,
      name,
      full_name: name,
      email: employee?.email || profile.email || null,
      role,
      department,
      department_name: department?.name || null,
      photo_url: employee?.photo_url || null,
      avatar_url: profile.avatar_url || null,
      photo_signed_url: photoSigned || avatarSigned || null,
    })
  }

  return actors
}
