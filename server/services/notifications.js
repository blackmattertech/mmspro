import { fcm } from './firebase.js'
import { supabaseAdmin } from './supabase.js'

/**
 * Send a push notification to a single user (all their devices)
 * @param {string} userId
 * @param {{ title: string, body: string, data?: object, url?: string }} payload
 */
export const notifyUser = async (userId, { title, body, data = {}, url = '/' }) => {
  if (!fcm) {
    console.warn('Firebase Admin is not configured — skipping push notification')
    return null
  }
  // Get all FCM tokens for this user
  const { data: rows } = await supabaseAdmin
    .from('fcm_tokens')
    .select('token')
    .eq('user_id', userId)

  if (!rows?.length) return

  const tokens = rows.map(r => r.token)

  const message = {
    notification: { title, body },
    data: { ...data, url },
    tokens,
  }

  const response = await fcm.sendEachForMulticast(message)

  // Clean up stale tokens (device uninstalled app etc.)
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
 * Send a push notification to all users in an org
 * @param {string} orgId
 * @param {{ title: string, body: string, data?: object }} payload
 */
export const notifyOrg = async (orgId, payload) => {
  const { data: profiles } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('org_id', orgId)

  if (!profiles?.length) return

  await Promise.all(profiles.map(p => notifyUser(p.id, payload)))
}
