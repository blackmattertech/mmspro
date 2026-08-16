import { fcm, isFirebaseAdminConfigured } from './firebase.js'
import { supabaseAdmin } from './supabase.js'
import { runInBackground } from '../lib/jobQueue.js'

function asFcmData(data = {}) {
  const out = {}
  for (const [key, value] of Object.entries(data)) {
    if (value == null) continue
    out[key] = typeof value === 'string' ? value : JSON.stringify(value)
  }
  return out
}

function inboxUrl(slug, { url, data = {} }) {
  if (url && url !== '/') return url
  if (!slug) return url || '/'
  if (data.task_id) return `/${slug}/tasks-and-followups/${data.task_id}`
  if (data.work_request_id) return `/${slug}/work-request/incoming`
  if (data.work_order_id) return `/${slug}/work-orders/received`
  return `/${slug}/dashboard`
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
    .select('org_id')
    .eq('id', userId)
    .maybeSingle()

  const resolvedUrl = inboxUrl(await orgSlug(profile?.org_id), { url, data })

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
    return { id: null, url: resolvedUrl }
  }
  return { ...row, url: resolvedUrl }
}

function publicAppUrl(path) {
  const base = (process.env.APP_PUBLIC_URL || process.env.CLIENT_URL || '').replace(/\/$/, '')
  if (!path || path === '/') return base || '/'
  if (path.startsWith('http')) return path
  if (!base) return path
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
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
 * Save an in-app notification and send a push to all of the user's devices.
 */
export const notifyUser = async (userId, { title, body, data = {}, url = '/' }) => {
  const saved = await persistInAppNotification(userId, { title, body, data, url })
  try {
    await sendPush(userId, {
      title,
      body,
      data,
      url: saved?.url || url,
      notificationId: saved?.id,
    })
  } catch (err) {
    console.warn('Push send failed:', err.message)
  }
  return saved
}

/**
 * Notify every user in an organization (in-app + push).
 */
export const notifyOrg = async (orgId, payload) => {
  const { data: profiles } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('org_id', orgId)

  if (!profiles?.length) return

  runInBackground(async () => {
    await Promise.all(profiles.map((profile) => notifyUser(profile.id, payload)))
  })
}

export { isFirebaseAdminConfigured }
