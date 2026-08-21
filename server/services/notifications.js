import { fcm, isFirebaseAdminConfigured } from './firebase.js'
import { supabaseAdmin } from './supabase.js'
import { runInBackground } from '../lib/jobQueue.js'
import { fallbackInboxUrl, resolveInboxUrl } from '../lib/notificationInboxUrl.js'
import { loadTimelineActors } from '../lib/timelineActors.js'
import { getSignedUrlForEmail } from '../lib/signedUrlCache.js'
import { isEmailConfigured, sendNotificationEmail } from './email.js'

const USER_ASSETS_BUCKET = 'user-assets'
const ORG_ASSETS_BUCKET = 'org-assets'

function asFcmData(data = {}) {
  const out = {}
  for (const [key, value] of Object.entries(data)) {
    if (value == null) continue
    out[key] = typeof value === 'string' ? value : JSON.stringify(value)
  }
  return out
}

const orgSlugCache = new Map()

async function orgSlug(orgId) {
  if (!orgId) return null
  if (orgSlugCache.has(orgId)) return orgSlugCache.get(orgId)
  const { data } = await supabaseAdmin
    .from('organizations')
    .select('slug')
    .eq('id', orgId)
    .maybeSingle()
  const slug = data?.slug || null
  orgSlugCache.set(orgId, slug)
  return slug
}

async function persistInAppNotification(userId, { title, body, data = {}, url = '/' }) {
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('org_id, email, full_name')
    .eq('id', userId)
    .maybeSingle()

  const slug = await orgSlug(profile?.org_id)
  let resolvedUrl = fallbackInboxUrl(slug, { url, data })
  try {
    resolvedUrl = await resolveInboxUrl(userId, profile?.org_id, slug, { url, data })
  } catch (err) {
    console.warn('Failed to resolve notification URL:', err.message)
  }

  const { data: row, error } = await supabaseAdmin
    .from('user_notifications')
    .insert({
      user_id: userId,
      org_id: profile?.org_id || null,
      title,
      body: body || '',
      url: resolvedUrl,
      data,
    })
    .select('id')
    .single()

  if (error) {
    console.warn('Failed to persist in-app notification:', error.message)
    return { id: null, url: resolvedUrl, email: profile?.email, name: profile?.full_name, org_id: profile?.org_id }
  }
  return { ...row, url: resolvedUrl, email: profile?.email, name: profile?.full_name, org_id: profile?.org_id }
}

const DEFAULT_NOTIFICATION_SOUND = 'https://ik.imagekit.io/w2lf8dznx/notification'
const REMINDER_SOUND = 'https://ik.imagekit.io/w2lf8dznx/reminder'

function soundForPayload({ title = '', data = {} } = {}) {
  const type = String(data.type || '').toLowerCase()
  if (type.includes('reminder') || String(title).toLowerCase().includes('reminder')) {
    return REMINDER_SOUND
  }
  return DEFAULT_NOTIFICATION_SOUND
}

function publicAppUrl(path) {
  const base = (process.env.APP_PUBLIC_URL || process.env.CLIENT_URL || '').replace(/\/$/, '')
  if (!path || path === '/') return base || '/'
  if (path.startsWith('http')) return path
  if (!base) return path
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

function shouldEmailNotification(data = {}) {
  const type = String(data.type || '').toLowerCase()
  return type.startsWith('work_order')
    || type.startsWith('work_request')
    || Boolean(data.work_order_id || data.work_request_id)
}

async function resolveNotificationRecipient(userId, hint = {}) {
  const hinted = String(hint.email || '').trim()
  if (hinted) {
    return { email: hinted, name: hint.name || null }
  }

  const { data: employee } = await supabaseAdmin
    .from('org_employees')
    .select('email, name')
    .eq('profile_id', userId)
    .not('email', 'is', null)
    .limit(1)
    .maybeSingle()

  const employeeEmail = String(employee?.email || '').trim()
  if (employeeEmail) {
    return { email: employeeEmail, name: employee.name || hint.name || null }
  }
  return null
}

async function loadEmailActor(orgId, actorId) {
  if (!orgId || !actorId) return null
  const actors = await loadTimelineActors(orgId, [actorId])
  const actor = actors.get(actorId)
  if (!actor) return null

  let photoUrl = null
  try {
    photoUrl = actor.photo_url
      ? await getSignedUrlForEmail(ORG_ASSETS_BUCKET, actor.photo_url)
      : actor.avatar_url
        ? await getSignedUrlForEmail(USER_ASSETS_BUCKET, actor.avatar_url)
        : actor.photo_signed_url || null
  } catch {
    photoUrl = actor.photo_signed_url || null
  }

  return {
    name: actor.name,
    department: actor.department_name || actor.department?.name || actor.role || null,
    photoUrl,
  }
}

async function sendWorkNotificationEmail(userId, { title, body, data = {}, url = '/' }, hint = {}) {
  if (!isEmailConfigured || !shouldEmailNotification(data)) return null
  const recipient = await resolveNotificationRecipient(userId, hint)
  if (!recipient?.email) return null
  let actor = null
  try {
    actor = await loadEmailActor(hint.org_id, data.actor_id)
  } catch (err) {
    console.warn('Notification actor lookup failed:', err.message)
  }
  const message = String(data.message || '').trim()
  return sendNotificationEmail({
    to: recipient.email,
    toName: recipient.name,
    title,
    body,
    actionUrl: publicAppUrl(url),
    actor,
    message,
  })
}

async function sendPush(userId, { title, body, data = {}, url = '/', notificationId }) {
  if (!fcm) return null

  const { data: rows } = await supabaseAdmin
    .from('fcm_tokens')
    .select('token')
    .eq('user_id', userId)

  if (!rows?.length) return null

  const tokens = rows.map((row) => row.token)
  const payloadData = asFcmData({
    ...data,
    url: url || '/',
    notification_id: notificationId || '',
    title,
    body: body || '',
    sound: soundForPayload({ title, data }),
  })

  const response = await fcm.sendEachForMulticast({
    data: payloadData,
    webpush: {
      fcmOptions: { link: publicAppUrl(url) },
      headers: { Urgency: 'high' },
    },
    tokens,
  })

  const staleTokens = []
  response.responses.forEach((res, idx) => {
    if (!res.success && res.error?.code === 'messaging/registration-token-not-registered') {
      staleTokens.push(tokens[idx])
    }
  })

  if (staleTokens.length) {
    await supabaseAdmin
      .from('fcm_tokens')
      .delete()
      .in('token', staleTokens)
  }

  return response
}

/**
 * Save an in-app notification, send a push, and email work order / work request alerts.
 */
export const notifyUser = async (userId, { title, body, data = {}, url = '/' }) => {
  if (!userId) return null
  const saved = await persistInAppNotification(userId, { title, body, data, url })
  const resolvedUrl = saved?.url || url
  try {
    await sendPush(userId, {
      title,
      body,
      data,
      url: resolvedUrl,
      notificationId: saved?.id,
    })
  } catch (err) {
    console.warn('Push send failed:', err.message)
  }
  try {
    await sendWorkNotificationEmail(userId, {
      title,
      body,
      data,
      url: resolvedUrl,
    }, { email: saved?.email, name: saved?.name, org_id: saved?.org_id })
  } catch (err) {
    console.warn('Notification email failed:', err.message)
  }
  return saved
}

export async function notifyUsers(userIds, payload) {
  const ids = [...new Set((userIds || []).filter(Boolean))]
  if (!ids.length) return
  runInBackground(async () => {
    await Promise.all(ids.map((id) => notifyUser(id, payload)))
  })
}

export async function notifyEmployees(orgId, employeeIds, payload) {
  const ids = [...new Set((employeeIds || []).filter(Boolean))]
  if (!orgId || !ids.length) return
  const { data, error } = await supabaseAdmin
    .from('org_employees')
    .select('profile_id')
    .eq('org_id', orgId)
    .in('id', ids)
    .not('profile_id', 'is', null)
  if (error) throw error
  await notifyUsers((data || []).map((row) => row.profile_id), payload)
}

async function loadRolePermissionIndex(roleIds) {
  const ids = [...new Set((roleIds || []).filter(Boolean))]
  if (!ids.length) return new Map()
  const { data, error } = await supabaseAdmin
    .from('org_access_role_permissions')
    .select('role_id, module_key, can_read, can_update')
    .in('role_id', ids)
  if (error) throw error
  const map = new Map()
  for (const row of data || []) {
    if (!map.has(row.role_id)) map.set(row.role_id, new Map())
    map.get(row.role_id).set(row.module_key, row)
  }
  return map
}

function roleAllows(permIndex, roleId, checks) {
  const modules = permIndex.get(roleId)
  if (!modules) return false
  return (checks || []).some(([moduleKey, action]) => {
    const row = modules.get(moduleKey)
    if (!row) return false
    return action === 'update' ? Boolean(row.can_update) : Boolean(row.can_read)
  })
}

/**
 * Notify org admins and employees who have any of the given module permissions.
 * Optional department / location limits keep technicians and other plants out.
 */
export async function notifyByModule(orgId, checks, payload, {
  departmentId = null,
  locationId = null,
  excludeTechnicianRoles = false,
} = {}) {
  if (!orgId || !checks?.length) return

  const [{ data: admins }, { data: employees }] = await Promise.all([
    supabaseAdmin
      .from('profiles')
      .select('id, role')
      .eq('org_id', orgId)
      .in('role', ['admin', 'super_admin']),
    supabaseAdmin
      .from('org_employees')
      .select('profile_id, department_id, location_id, access_role_id, access_role:access_role_id(name)')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .not('profile_id', 'is', null),
  ])

  const permIndex = await loadRolePermissionIndex(
    (employees || []).map((row) => row.access_role_id),
  )

  const ids = new Set((admins || []).map((row) => row.id))
  for (const employee of employees || []) {
    if (departmentId && employee.department_id !== departmentId) continue
    if (locationId && employee.location_id && employee.location_id !== locationId) continue
    if (excludeTechnicianRoles) {
      const roleName = String(employee.access_role?.name || '').trim().toLowerCase()
      if (roleName.includes('technician')) continue
    }
    if (roleAllows(permIndex, employee.access_role_id, checks)) {
      ids.add(employee.profile_id)
    }
  }

  await notifyUsers([...ids], payload)
}

export async function notifyWorkOrderParties(orgId, workOrder, payload, { actorId = null } = {}) {
  if (!orgId || !workOrder?.id) return

  const { data: links } = await supabaseAdmin
    .from('manual_work_order_assignees')
    .select('employee_id')
    .eq('org_id', orgId)
    .eq('work_order_id', workOrder.id)

  const employeeIds = (links || []).map((row) => row.employee_id).filter(Boolean)
  const { data: employees } = employeeIds.length
    ? await supabaseAdmin
      .from('org_employees')
      .select('profile_id')
      .eq('org_id', orgId)
      .in('id', employeeIds)
      .not('profile_id', 'is', null)
    : { data: [] }

  const ids = new Set([
    ...(employees || []).map((row) => row.profile_id),
    workOrder.created_by,
    workOrder.supervisor_id,
    workOrder.requester_id,
  ].filter(Boolean))
  if (actorId) ids.delete(actorId)

  await notifyUsers([...ids], payload)
}

/**
 * Notify every user in an organization (in-app + push + email for work orders / work requests).
 */
export const notifyOrg = async (orgId, payload) => {
  const { data: profiles } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('org_id', orgId)

  if (!profiles?.length) return
  await notifyUsers(profiles.map((profile) => profile.id), payload)
}

export { isFirebaseAdminConfigured }
