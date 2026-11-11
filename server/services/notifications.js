import { getFirebaseMessaging, isFirebaseAdminConfigured } from './firebase.js'
import { supabaseAdmin } from './supabase.js'
import { runInBackground } from '../lib/jobQueue.js'
import { getPublicAppUrl } from '../lib/appUrl.js'
import { fallbackInboxUrl, resolveInboxUrl } from '../lib/notificationInboxUrl.js'
import { loadTimelineActors } from '../lib/timelineActors.js'
import { getSignedUrlForEmail } from '../lib/signedUrlCache.js'
import { isEmailConfigured, sendNotificationEmail } from './email.js'
import {
  buildNotificationEmailDetails,
  notificationEmailSubject,
} from '../lib/notificationEmailDetails.js'

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

const SHORT_DESCRIPTION_MAX = 200
const shortDescCache = new Map()
const shortDescInflight = new Map()

function clipText(value, max = SHORT_DESCRIPTION_MAX) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function alreadyIncludes(haystack, needle) {
  const sample = String(needle || '').slice(0, Math.min(40, String(needle || '').length)).toLowerCase()
  return Boolean(sample) && String(haystack || '').toLowerCase().includes(sample)
}

function shortDescKey(orgId, data = {}) {
  return [
    orgId || '',
    data.work_order_id || '',
    data.work_request_id || '',
    data.task_id || '',
  ].join(':')
}

async function readShortDescription(table, orgId, id, columns) {
  const { data, error } = await supabaseAdmin
    .from(table)
    .select(columns)
    .eq('org_id', orgId)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data
}

async function loadShortDescription(orgId, data = {}) {
  if (data.work_order_id) {
    const order = await readShortDescription(
      'manual_work_orders',
      orgId,
      data.work_order_id,
      'short_description, work_request_id',
    )
    const fromOrder = String(order?.short_description || '').trim()
    if (fromOrder) return fromOrder
    const requestId = data.work_request_id || order?.work_request_id
    if (requestId) {
      const request = await readShortDescription('work_requests', orgId, requestId, 'short_description')
      return String(request?.short_description || '').trim()
    }
    return ''
  }
  if (data.work_request_id) {
    const request = await readShortDescription('work_requests', orgId, data.work_request_id, 'short_description')
    return String(request?.short_description || '').trim()
  }
  if (data.task_id) {
    const task = await readShortDescription('tasks', orgId, data.task_id, 'short_description')
    return String(task?.short_description || '').trim()
  }
  return ''
}

async function resolveShortDescription(orgId, data = {}) {
  const explicit = clipText(data.short_description)
  if (explicit) return explicit
  if (!orgId || !(data.work_order_id || data.work_request_id || data.task_id)) return ''

  const key = shortDescKey(orgId, data)
  const hit = shortDescCache.get(key)
  if (hit && Date.now() - hit.at < 20_000) return hit.value

  let pending = shortDescInflight.get(key)
  if (!pending) {
    pending = loadShortDescription(orgId, data)
      .then((value) => {
        const text = clipText(value)
        shortDescCache.set(key, { at: Date.now(), value: text })
        if (shortDescCache.size > 200) {
          shortDescCache.delete(shortDescCache.keys().next().value)
        }
        return text
      })
      .finally(() => shortDescInflight.delete(key))
    shortDescInflight.set(key, pending)
  }
  return pending
}

export async function attachNotificationShortDescriptions(orgId, items = []) {
  if (!orgId || !items?.length) return items
  const pending = items.filter((item) => !clipText(item?.data?.short_description))
  if (!pending.length) return items

  const idsOf = (key) => [...new Set(pending.map((item) => item.data?.[key]).filter(Boolean))]
  const woIds = idsOf('work_order_id')
  const wrIds = idsOf('work_request_id')
  const taskIds = idsOf('task_id')

  const [ordersRes, requestsRes, tasksRes] = await Promise.all([
    woIds.length
      ? supabaseAdmin.from('manual_work_orders').select('id, short_description, work_request_id').eq('org_id', orgId).in('id', woIds)
      : Promise.resolve({ data: [] }),
    wrIds.length
      ? supabaseAdmin.from('work_requests').select('id, short_description').eq('org_id', orgId).in('id', wrIds)
      : Promise.resolve({ data: [] }),
    taskIds.length
      ? supabaseAdmin.from('tasks').select('id, short_description').eq('org_id', orgId).in('id', taskIds)
      : Promise.resolve({ data: [] }),
  ])

  const orders = new Map((ordersRes.data || []).map((row) => [row.id, row]))
  const requests = new Map((requestsRes.data || []).map((row) => [row.id, clipText(row.short_description)]))
  const tasks = new Map((tasksRes.data || []).map((row) => [row.id, clipText(row.short_description)]))

  const extraRequestIds = [...new Set(
    (ordersRes.data || [])
      .filter((row) => !clipText(row.short_description) && row.work_request_id && !requests.has(row.work_request_id))
      .map((row) => row.work_request_id),
  )]
  if (extraRequestIds.length) {
    const { data } = await supabaseAdmin
      .from('work_requests')
      .select('id, short_description')
      .eq('org_id', orgId)
      .in('id', extraRequestIds)
    for (const row of data || []) requests.set(row.id, clipText(row.short_description))
  }

  return items.map((item) => {
    if (clipText(item?.data?.short_description)) return item
    const data = item.data || {}
    const order = orders.get(data.work_order_id)
    const text = clipText(order?.short_description)
      || requests.get(data.work_request_id)
      || requests.get(order?.work_request_id)
      || tasks.get(data.task_id)
      || ''
    if (!text || alreadyIncludes(item.body, text)) return item
    return {
      ...item,
      data: { ...data, short_description: text },
    }
  })
}

function pushBodyWithShortDescription(body, short) {
  const summary = String(body || '').trim()
  const text = clipText(short)
  if (!text || alreadyIncludes(summary, text)) return summary
  return summary ? `${summary}\n${text}` : text
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

  let shortDescription = ''
  try {
    shortDescription = await resolveShortDescription(profile?.org_id, data)
  } catch (err) {
    console.warn('Notification short description failed:', err.message)
  }
  const storedData = shortDescription
    ? { ...data, short_description: shortDescription }
    : data

  const { data: row, error } = await supabaseAdmin
    .from('user_notifications')
    .insert({
      user_id: userId,
      org_id: profile?.org_id || null,
      title,
      body: body || '',
      url: resolvedUrl,
      data: storedData,
    })
    .select('id')
    .single()

  const saved = {
    id: row?.id || null,
    url: resolvedUrl,
    email: profile?.email,
    name: profile?.full_name,
    org_id: profile?.org_id,
    data: storedData,
    short_description: shortDescription,
  }

  if (error) {
    console.warn('Failed to persist in-app notification:', error.message)
    return saved
  }
  return saved
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
  const base = getPublicAppUrl()
  if (!path || path === '/') return base || '/'
  if (path.startsWith('http')) return path
  if (!base) return path
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

function shouldEmailNotification(data = {}) {
  const type = String(data.type || '').toLowerCase()
  return type.startsWith('work_order')
    || type.startsWith('work_request')
    || type.startsWith('task')
    || type.startsWith('pm_')
    || Boolean(data.work_order_id || data.work_request_id || data.task_id || data.pm_plan_id)
}

const emailDetailsCache = new Map()

async function resolveEmailDetails(orgId, data = {}) {
  if (Array.isArray(data.details) && data.details.length) {
    return data.details
  }
  const key = [
    orgId || '',
    data.work_order_id || '',
    data.work_request_id || '',
    data.task_id || '',
    data.pm_plan_id || '',
    data.type || '',
  ].join(':')
  const hit = emailDetailsCache.get(key)
  if (hit && Date.now() - hit.at < 20_000) return hit.details
  try {
    const details = await buildNotificationEmailDetails(orgId, data)
    emailDetailsCache.set(key, { at: Date.now(), details })
    if (emailDetailsCache.size > 200) {
      const oldest = emailDetailsCache.keys().next().value
      emailDetailsCache.delete(oldest)
    }
    return details
  } catch (err) {
    console.warn('Notification email details failed:', err.message)
    return []
  }
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
  if (!(await isEmailConfigured()) || !shouldEmailNotification(data)) return null
  const recipient = await resolveNotificationRecipient(userId, hint)
  if (!recipient?.email) return null
  let actor = null
  try {
    actor = await loadEmailActor(hint.org_id, data.actor_id)
  } catch (err) {
    console.warn('Notification actor lookup failed:', err.message)
  }
  const message = String(data.message || '').trim()
  const details = await resolveEmailDetails(hint.org_id, data)
  return sendNotificationEmail({
    to: recipient.email,
    toName: recipient.name,
    title,
    subject: notificationEmailSubject(title, details),
    body,
    actionUrl: publicAppUrl(url),
    actor,
    message,
    details,
  })
}

async function sendPush(userId, { title, body, data = {}, url = '/', notificationId }) {
  const fcm = await getFirebaseMessaging()
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
  const storedData = saved?.data || data
  try {
    await sendPush(userId, {
      title,
      body: pushBodyWithShortDescription(body, saved?.short_description),
      data: storedData,
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
