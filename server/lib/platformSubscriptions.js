import { supabaseAdmin } from '../services/supabase.js'
import { getCashfreeOrder } from '../services/cashfree.js'
import { resolveCashfreeConfig } from './platformIntegrations.js'
import { registerLandingCompany } from './publicSignup.js'
import { isEmailConfigured, sendCheckoutDroppedEmail } from '../services/email.js'

const COLORS = ['#7C3AED', '#3B82F6', '#22C55E', '#F59E0B', '#E11D48', '#0F766E']

function isMissingSubscriptionsTable(error) {
  const message = String(error?.message || error?.code || '')
  return /platform_subscriptions|PGRST205|schema cache|does not exist/i.test(message)
    && !/signup|welcome_sent_at/i.test(message)
}

function isMissingSignupColumn(error) {
  const message = String(error?.message || error?.code || '')
  return /signup|welcome_sent_at|PGRST204/i.test(message)
}

function localStatus(remoteStatus) {
  const status = String(remoteStatus || '').toUpperCase()
  if (status === 'PAID' || status === 'ACTIVE' || status === 'EXPIRED') return status
  if (status === 'TERMINATED' || status === 'TERMINATION_REQUESTED') return 'TERMINATED'
  return null
}

function addDays(days) {
  const expires = new Date()
  expires.setDate(expires.getDate() + days)
  return expires.toISOString()
}

function statusUpdates(row, remoteStatus) {
  const status = localStatus(remoteStatus)
  if (!status || status === row.status) return null
  const updates = {
    status,
    updated_at: new Date().toISOString(),
  }
  if (status === 'PAID') {
    updates.paid_at = row.paid_at || updates.updated_at
    const days = Number(row.duration_days)
    if (!row.expires_at && Number.isFinite(days) && days > 0) updates.expires_at = addDays(days)
  }
  return updates
}

function isCurrentPaid(row, now) {
  if (row.status !== 'PAID') return false
  if (!row.expires_at) return true
  return new Date(row.expires_at).getTime() > now
}

function subscriptionBucket(row, now) {
  if (row.status === 'TERMINATED' || row.status === 'FAILED') return 'cancelled'
  if (row.status === 'EXPIRED') return 'expired'
  if (row.status === 'PAID') {
    if (row.expires_at && new Date(row.expires_at).getTime() <= now) return 'expired'
    return 'active'
  }
  return 'trial'
}

function cumulativeByMonth(rows, predicate) {
  const now = new Date()
  const series = []
  for (let index = 11; index >= 0; index -= 1) {
    const end = new Date(now.getFullYear(), now.getMonth() - index + 1, 1)
    series.push(rows.filter((row) => {
      const at = new Date(row.paid_at || row.created_at)
      return Number.isFinite(at.getTime()) && at < end && predicate(row)
    }).length)
  }
  return series
}

function summarize(rows, environment) {
  const now = Date.now()
  const current = rows.filter((row) => isCurrentPaid(row, now))
  const statusCounts = { active: 0, trial: 0, expired: 0, cancelled: 0 }
  for (const row of rows) statusCounts[subscriptionBucket(row, now)] += 1
  const counts = new Map()
  for (const row of current) {
    const label = row.plan_name || 'Plan'
    counts.set(label, (counts.get(label) || 0) + 1)
  }
  return {
    tableReady: true,
    environment,
    active: current.length,
    paid: rows.filter((row) => row.status === 'PAID').length,
    pending: rows.filter((row) => row.status === 'ACTIVE').length,
    statusCounts,
    sparklines: {
      active: cumulativeByMonth(rows, (row) => subscriptionBucket(row, now) === 'active'),
      paid: cumulativeByMonth(rows, (row) => row.status === 'PAID'),
    },
    slices: [...counts.entries()].map(([label, value], index) => ({
      key: label,
      label,
      value,
      color: COLORS[index % COLORS.length],
    })),
    recent: rows.slice(0, 8).map((row) => ({
      id: row.id,
      planName: row.plan_name,
      orderId: row.order_id,
      amount: row.amount,
      currency: row.currency || 'INR',
      status: row.status,
      environment: row.environment,
      paidAt: row.paid_at,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    })),
  }
}

function emptySummary(environment = 'sandbox') {
  return {
    tableReady: false,
    environment,
    active: 0,
    paid: 0,
    pending: 0,
    statusCounts: { active: 0, trial: 0, expired: 0, cancelled: 0 },
    sparklines: { active: [], paid: [] },
    slices: [],
    recent: [],
  }
}

export async function recordCheckoutSubscription({ plan, orderId, amount, environment, signup }) {
  const payload = {
    plan_id: plan.id,
    plan_name: plan.name,
    plan_code: plan.code,
    order_id: orderId,
    amount,
    currency: plan.currency || 'INR',
    status: 'ACTIVE',
    environment: environment === 'production' ? 'production' : 'sandbox',
    duration_days: plan.duration_days,
  }
  if (signup) payload.signup = signup

  const { error } = await supabaseAdmin.from('platform_subscriptions').insert(payload)
  if (!error) return true
  if (signup && (isMissingSignupColumn(error) || isMissingSubscriptionsTable(error))) {
    const err = new Error('Apply supabase-patches/87-subscription-signup.sql before taking company payments.')
    err.status = 503
    throw err
  }
  if (isMissingSubscriptionsTable(error)) {
    console.warn('Apply supabase-patches/86-platform-subscriptions.sql to store Cashfree subscriptions.')
    return false
  }
  console.warn('Could not store Cashfree subscription:', error.message)
  if (signup) {
    const err = new Error('Could not save the company details for this payment.')
    err.status = 500
    throw err
  }
  return false
}

function welcomeResult(signup) {
  if (signup?.emailSent === true) return { emailSent: true }
  if (signup?.emailSent === false) return { emailSent: false }
  return { pending: true }
}

/**
 * After a paid checkout, create the company once and email the temporary password.
 */
export async function fulfillPaidSignup(orderId) {
  const { data: row, error } = await supabaseAdmin
    .from('platform_subscriptions')
    .select('id, status, signup, welcome_sent_at')
    .eq('order_id', orderId)
    .maybeSingle()
  if (error) {
    if (isMissingSubscriptionsTable(error) || isMissingSignupColumn(error)) return { skipped: true }
    throw error
  }
  if (!row || row.status !== 'PAID' || !row.signup) return { skipped: true }
  if (row.welcome_sent_at) {
    const age = Date.now() - new Date(row.welcome_sent_at).getTime()
    const unfinished = row.signup?.emailSent !== true && row.signup?.emailSent !== false
    if (!unfinished || age < 2 * 60 * 1000) return welcomeResult(row.signup)
    await supabaseAdmin
      .from('platform_subscriptions')
      .update({ welcome_sent_at: null, updated_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('welcome_sent_at', row.welcome_sent_at)
  }

  const claimedAt = new Date().toISOString()
  const { data: claimed, error: claimError } = await supabaseAdmin
    .from('platform_subscriptions')
    .update({ welcome_sent_at: claimedAt, updated_at: claimedAt })
    .eq('id', row.id)
    .is('welcome_sent_at', null)
    .select('id')
    .maybeSingle()
  if (claimError) throw claimError
  if (!claimed) return { pending: true }

  try {
    const result = await registerLandingCompany(row.signup)
    const signup = { ...row.signup, emailSent: result.emailSent }
    const { error: saveError } = await supabaseAdmin
      .from('platform_subscriptions')
      .update({ signup, updated_at: new Date().toISOString() })
      .eq('id', row.id)
    if (saveError) console.warn('Could not record welcome email result:', saveError.message)
    console.log(`Paid signup fulfilled: ${orderId} | ${result.email} | email_sent: ${result.emailSent}`)
    return { emailSent: result.emailSent, email: result.email }
  } catch (fulfillError) {
    if (fulfillError.status === 409) {
      const signup = { ...row.signup, emailSent: false }
      await supabaseAdmin
        .from('platform_subscriptions')
        .update({ signup, updated_at: new Date().toISOString() })
        .eq('id', row.id)
      return { emailSent: false, error: fulfillError.message }
    }
    await supabaseAdmin
      .from('platform_subscriptions')
      .update({ welcome_sent_at: null, updated_at: new Date().toISOString() })
      .eq('id', row.id)
    throw fulfillError
  }
}

const DROP_REASONS = {
  ACTIVE: 'The customer left checkout before paying.',
  EXPIRED: 'The checkout expired before payment.',
  TERMINATED: 'The payment was cancelled.',
  FAILED: 'The payment failed.',
}

const notifyingDrops = new Set()
const STALE_CHECKOUT_MS = 30 * 60 * 1000

function checkoutAgeMs(createdAt) {
  const at = new Date(createdAt).getTime()
  if (!Number.isFinite(at)) return 0
  return Date.now() - at
}

/**
 * Emails every super admin once when a landing checkout is not paid.
 * Company details come from the signup saved before Cashfree opened.
 */
export async function notifyDroppedCheckout(orderId, { reason } = {}) {
  if (!orderId || notifyingDrops.has(orderId)) return { skipped: true }
  notifyingDrops.add(orderId)
  try {
    const { data: row, error } = await supabaseAdmin
      .from('platform_subscriptions')
      .select('id, status, signup, plan_name, amount, currency, order_id')
      .eq('order_id', orderId)
      .maybeSingle()
    if (error) {
      if (isMissingSubscriptionsTable(error) || isMissingSignupColumn(error)) return { skipped: true }
      throw error
    }
    if (!row?.signup || row.status === 'PAID' || row.signup.dropNotifiedAt) return { skipped: true }

    const happened = String(reason || DROP_REASONS[row.status] || 'The payment was not completed.').slice(0, 240)
    const claimedSignup = {
      ...row.signup,
      dropNotifiedAt: new Date().toISOString(),
      dropReason: happened,
    }
    const { data: claimed, error: claimError } = await supabaseAdmin
      .from('platform_subscriptions')
      .update({ signup: claimedSignup, updated_at: claimedSignup.dropNotifiedAt })
      .eq('id', row.id)
      .filter('signup->>dropNotifiedAt', 'is', null)
      .select('id')
      .maybeSingle()
    if (claimError) throw claimError
    if (!claimed) return { skipped: true }

    const { data: admins, error: adminError } = await supabaseAdmin
      .from('profiles')
      .select('email')
      .eq('role', 'super_admin')
    if (adminError) throw adminError

    const recipients = [...new Set((admins || []).map((admin) => String(admin.email || '').trim().toLowerCase()).filter(Boolean))]
    const details = {
      company: row.signup,
      planName: row.plan_name,
      amount: row.amount,
      currency: row.currency,
      orderId: row.order_id,
      reason: happened,
    }

    if (!recipients.length || !(await isEmailConfigured())) {
      console.log(`\n[Checkout dropped]\n  ${happened}\n  ${row.plan_name} · ${row.order_id}\n  ${JSON.stringify(row.signup)}\n`)
      return { sent: false }
    }

    const results = await Promise.all(recipients.map((email) => sendCheckoutDroppedEmail(email, details)))
    const sent = results.filter(Boolean).length
    if (!sent) {
      const retrySignup = { ...row.signup }
      delete retrySignup.dropNotifiedAt
      delete retrySignup.dropReason
      await supabaseAdmin
        .from('platform_subscriptions')
        .update({ signup: retrySignup, updated_at: new Date().toISOString() })
        .eq('id', row.id)
      console.warn(`Checkout drop email failed → ${recipients.join(', ')}`)
      return { sent: false }
    }

    console.log(`Checkout drop emailed: ${row.order_id} | ${row.signup.email} | admins: ${sent}`)
    return { sent: true }
  } finally {
    notifyingDrops.delete(orderId)
  }
}

async function attachWelcome(orderId, row) {
  if (row?.status !== 'PAID') return row
  try {
    const welcome = await fulfillPaidSignup(orderId)
    return { ...row, welcome }
  } catch (fulfillError) {
    console.error('Paid signup email failed:', orderId, fulfillError.message)
    return { ...row, welcome: { emailSent: false, error: fulfillError.message } }
  }
}

export async function syncSubscriptionOrder(orderId, remoteStatus) {
  const { data: row, error } = await supabaseAdmin
    .from('platform_subscriptions')
    .select('id, status, paid_at, expires_at, duration_days')
    .eq('order_id', orderId)
    .maybeSingle()
  if (error) {
    if (isMissingSubscriptionsTable(error)) return null
    throw error
  }
  if (!row) return null
  const updates = statusUpdates(row, remoteStatus)
  const next = updates ? { ...row, ...updates } : row
  if (updates) {
    const { error: updateError } = await supabaseAdmin
      .from('platform_subscriptions')
      .update(updates)
      .eq('id', row.id)
    if (updateError) console.warn('Could not update Cashfree subscription:', updateError.message)
  }
  if (next.status !== 'PAID') {
    try {
      await notifyDroppedCheckout(orderId)
    } catch (dropError) {
      console.error('Checkout drop email failed:', orderId, dropError.message)
    }
  }
  return attachWelcome(orderId, next)
}

export async function loadSubscriptionDashboard({ sync = true } = {}) {
  const { data, error } = await supabaseAdmin
    .from('platform_subscriptions')
    .select('id, plan_name, order_id, amount, currency, status, environment, duration_days, paid_at, expires_at, created_at')
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) {
    if (isMissingSubscriptionsTable(error)) return emptySummary()
    throw error
  }

  let environment = 'sandbox'
  try {
    const config = await resolveCashfreeConfig()
    if (config?.environment === 'production') environment = 'production'
  } catch {
    environment = 'sandbox'
  }

  if (sync) await syncOpenCheckouts(data || [], environment)
  return summarize(data || [], environment)
}

async function syncOpenCheckouts(rows, environment) {
  const open = rows
    .filter((row) => row.status === 'ACTIVE' && (row.environment || 'sandbox') === environment)
    .slice(0, 15)

  await Promise.all(open.map(async (row) => {
    try {
      const remote = await getCashfreeOrder(row.order_id)
      const updates = statusUpdates(row, remote.status)
      if (!updates) {
        if (row.status === 'ACTIVE' && checkoutAgeMs(row.created_at) >= STALE_CHECKOUT_MS) {
          await notifyDroppedCheckout(row.order_id, {
            reason: 'The customer left checkout without paying.',
          })
        }
        return
      }
      const { error: updateError } = await supabaseAdmin
        .from('platform_subscriptions')
        .update(updates)
        .eq('id', row.id)
      if (!updateError) Object.assign(row, updates)
      if (row.status === 'PAID') {
        try {
          await fulfillPaidSignup(row.order_id)
        } catch (fulfillError) {
          console.error('Paid signup email failed:', row.order_id, fulfillError.message)
        }
      } else {
        try {
          await notifyDroppedCheckout(row.order_id)
        } catch (dropError) {
          console.error('Checkout drop email failed:', row.order_id, dropError.message)
        }
      }
    } catch (syncError) {
      console.warn('Cashfree subscription sync failed:', row.order_id, syncError.message)
    }
  }))
}

export function scheduleSubscriptionSync() {
  setImmediate(() => {
    loadSubscriptionDashboard({ sync: true }).catch((error) => {
      console.warn('Subscription sync failed:', error.message)
    })
  })
}
