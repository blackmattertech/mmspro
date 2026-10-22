import crypto from 'crypto'
import { Router } from 'express'
import { supabaseAdmin } from '../../services/supabase.js'
import { createCashfreeOrder, getCashfreeOrder } from '../../services/cashfree.js'
import { resolveCashfreeConfig } from '../../lib/platformIntegrations.js'
import { notifyDroppedCheckout, recordCheckoutSubscription, syncSubscriptionOrder } from '../../lib/platformSubscriptions.js'
import { parseLandingCompany, assertLandingEmailAvailable } from '../../lib/publicSignup.js'

const router = Router()

const PLAN_FIELDS = 'id, name, code, interval_type, duration_days, price, currency, description, is_active'

function isMissingPlansTable(error) {
  const message = String(error?.message || error?.code || '')
  return /platform_plans|PGRST205|schema cache|does not exist/i.test(message)
}

function returnUrlFor(req) {
  const origin = String(req.get('origin') || '').replace(/\/$/, '')
  const fallback = String(process.env.LANDING_PUBLIC_URL || 'http://localhost:5174').replace(/\/$/, '')
  const base = /^https?:\/\/[A-Za-z0-9.-]+(?::\d+)?$/i.test(origin) ? origin : fallback
  return `${base}/return?order_id={order_id}`
}

function orderIdFor(code) {
  const slug = String(code || 'plan').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 28) || 'plan'
  return `${slug}_${crypto.randomBytes(4).toString('hex')}`.slice(0, 45)
}

function payableAmount(price) {
  const amount = Number(price)
  if (!Number.isFinite(amount) || amount < 1) return null
  return Math.round(amount * 100) / 100
}

router.get('/', async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .from('platform_plans')
    .select(PLAN_FIELDS)
    .order('created_at', { ascending: true })
  if (error) {
    if (isMissingPlansTable(error)) return res.json({ plans: [] })
    return res.status(500).json({ error: error.message })
  }
  res.json({ plans: data || [] })
})

router.post('/orders/:orderId/dropped', async (req, res) => {
  const orderId = String(req.params.orderId || '')
  if (!/^[A-Za-z0-9_-]{3,45}$/.test(orderId)) {
    return res.status(400).json({ error: 'Unknown order.' })
  }
  const reason = String(req.body?.reason || '').trim().slice(0, 240)
  try {
    await notifyDroppedCheckout(orderId, {
      reason: reason || 'The customer closed checkout before paying.',
    })
    res.json({ ok: true })
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Could not record the checkout.' })
  }
})

router.get('/orders/:orderId', async (req, res) => {
  const orderId = String(req.params.orderId || '')
  if (!/^[A-Za-z0-9_-]{3,45}$/.test(orderId)) {
    return res.status(400).json({ error: 'Unknown order.' })
  }
  try {
    const order = await getCashfreeOrder(orderId)
    const synced = await syncSubscriptionOrder(orderId, order.status)
    res.json({
      ...order,
      welcomeEmailSent: synced?.welcome?.emailSent === true,
      welcomePending: synced?.welcome?.pending === true,
      welcomeEmailError: synced?.welcome?.error || null,
    })
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Could not load the order' })
  }
})

router.post('/:id/checkout', async (req, res) => {
  try {
    const { data: plan, error } = await supabaseAdmin
      .from('platform_plans')
      .select(PLAN_FIELDS)
      .eq('id', req.params.id)
      .maybeSingle()
    if (error) {
      if (isMissingPlansTable(error)) {
        return res.status(503).json({ error: 'Plans are not available yet.' })
      }
      throw error
    }
    if (!plan || plan.is_active === false) {
      return res.status(404).json({ error: 'This plan is not available.' })
    }
    const amount = payableAmount(plan.price)
    if (amount == null) {
      return res.status(400).json({ error: 'This plan does not have a payable price.' })
    }
    const config = await resolveCashfreeConfig()
    if (!config) return res.status(400).json({ error: 'Cashfree is not configured.' })

    const company = parseLandingCompany(req.body || {})
    await assertLandingEmailAvailable(company.email)
    const phoneDigits = String(company.phone || '').replace(/\D/g, '')
    const customerPhone = phoneDigits.length >= 10 ? phoneDigits.slice(-10) : '9999999999'
    const order = await createCashfreeOrder({
      orderId: orderIdFor(plan.code),
      amount,
      currency: plan.currency || 'INR',
      customerId: `buyer${crypto.randomBytes(8).toString('hex')}`,
      customerEmail: company.email,
      customerPhone,
      customerName: company.contactName,
      returnUrl: returnUrlFor(req),
    })
    if (!order?.payment_session_id) {
      return res.status(502).json({ error: 'Cashfree did not return a checkout session.' })
    }
    await recordCheckoutSubscription({
      plan,
      orderId: order.order_id,
      amount,
      environment: config.environment,
      signup: company,
    })
    res.json({
      paymentSessionId: order.payment_session_id,
      orderId: order.order_id,
      environment: config.environment,
    })
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Could not start checkout' })
  }
})

export default router
