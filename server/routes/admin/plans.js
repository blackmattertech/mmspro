import { Router } from 'express'
import { supabaseAdmin } from '../../services/supabase.js'

const router = Router()

const INTERVALS = ['trial', 'monthly', 'quarterly', 'half_yearly', 'yearly', 'custom']

function isMissingPlansTable(error) {
  const message = String(error?.message || error?.code || '')
  return /platform_plans|PGRST205|schema cache|does not exist/i.test(message)
}

function missingTableError() {
  const error = new Error('Apply supabase-patches/85-platform-plans.sql before managing plans.')
  error.status = 503
  return error
}

function slugify(name) {
  const base = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return base || 'plan'
}

function parsePlan(body, { partial = false } = {}) {
  const updates = {}
  if (!partial || body.name !== undefined) {
    const name = String(body.name ?? '').trim()
    if (!name) {
      const error = new Error('Plan name is required.')
      error.status = 400
      throw error
    }
    updates.name = name
  }
  if (!partial || body.interval_type !== undefined) {
    const interval = String(body.interval_type || '').trim()
    if (!INTERVALS.includes(interval)) {
      const error = new Error('Choose a plan type: trial, monthly, quarterly, half yearly, yearly, or custom.')
      error.status = 400
      throw error
    }
    updates.interval_type = interval
  }
  if (!partial || body.duration_days !== undefined) {
    const days = Number.parseInt(body.duration_days, 10)
    if (!Number.isFinite(days) || days < 1 || days > 3650) {
      const error = new Error('Validity must be between 1 and 3650 days.')
      error.status = 400
      throw error
    }
    updates.duration_days = days
  }
  if (!partial || body.price !== undefined) {
    if (body.price === '' || body.price == null) {
      updates.price = null
    } else {
      const price = Number(body.price)
      if (!Number.isFinite(price) || price < 0) {
        const error = new Error('Price must be zero or a positive amount.')
        error.status = 400
        throw error
      }
      updates.price = price
    }
  }
  if (!partial || body.description !== undefined) {
    updates.description = String(body.description ?? '').trim() || null
  }
  if (!partial || body.is_active !== undefined) {
    updates.is_active = body.is_active !== false
  }
  return updates
}

async function uniqueCode(name, ignoreId) {
  const base = slugify(name)
  let code = base
  for (let attempt = 2; attempt < 50; attempt += 1) {
    let query = supabaseAdmin.from('platform_plans').select('id').eq('code', code)
    if (ignoreId) query = query.neq('id', ignoreId)
    const { data, error } = await query.maybeSingle()
    if (error) throw error
    if (!data) return code
    code = `${base}-${attempt}`
  }
  return `${base}-${Date.now()}`
}

function isMissingSubscriptionsTable(error) {
  const message = String(error?.message || error?.code || '')
  return /platform_subscriptions|PGRST205|schema cache|does not exist/i.test(message)
    && !/platform_plans/i.test(message)
}

function isSubscriber(row, now) {
  if (row.status !== 'PAID') return false
  if (!row.expires_at) return true
  return new Date(row.expires_at).getTime() > now
}

function monthBuckets(rows, valueOf) {
  const now = new Date()
  return Array.from({ length: 6 }, (_, index) => {
    const start = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1)
    const end = new Date(now.getFullYear(), now.getMonth() - (4 - index), 1)
    return rows.reduce((sum, row) => {
      const at = new Date(row.paid_at || row.created_at)
      if (!Number.isFinite(at.getTime()) || at < start || at >= end) return sum
      return sum + valueOf(row)
    }, 0)
  })
}

function periodDelta(series) {
  const prior = series.slice(0, 3).reduce((sum, value) => sum + value, 0)
  const recent = series.slice(3).reduce((sum, value) => sum + value, 0)
  if (!prior) return null
  return Math.round(((recent - prior) / prior) * 100)
}

function matchPlanId(row, plans) {
  if (row.plan_id && plans.some((plan) => plan.id === row.plan_id)) return row.plan_id
  const byCode = row.plan_code && plans.find((plan) => plan.code === row.plan_code)
  if (byCode) return byCode.id
  const byName = plans.find((plan) => plan.name === row.plan_name)
  return byName?.id || null
}

function summarizePlans(plans, subscriptions) {
  const now = Date.now()
  const paid = subscriptions.filter((row) => row.status === 'PAID')
  const subscribers = subscriptions.filter((row) => isSubscriber(row, now))
  const revenueOf = (row) => Number(row.amount) || 0
  const byPlan = new Map(plans.map((plan) => [plan.id, { subscribers: 0, paid: 0, revenue: 0 }]))

  for (const row of subscribers) {
    const id = matchPlanId(row, plans)
    const bucket = id && byPlan.get(id)
    if (bucket) bucket.subscribers += 1
  }
  for (const row of paid) {
    const id = matchPlanId(row, plans)
    const bucket = id && byPlan.get(id)
    if (!bucket) continue
    bucket.paid += 1
    bucket.revenue += revenueOf(row)
  }

  const revenue = paid.reduce((sum, row) => sum + revenueOf(row), 0)
  const subscriberSeries = monthBuckets(subscribers, () => 1)
  const revenueSeries = monthBuckets(paid, revenueOf)
  const averageSeries = monthBuckets(paid, revenueOf).map((amount, index) => {
    const count = monthBuckets(paid, () => 1)[index]
    return count ? Math.round((amount / count) * 100) / 100 : 0
  })
  const ranked = [...byPlan.entries()].sort((left, right) => (
    right[1].subscribers - left[1].subscribers || right[1].revenue - left[1].revenue
  ))
  const popularId = ranked.find(([, bucket]) => bucket.subscribers > 0)?.[0] || null
  const popular = popularId ? plans.find((plan) => plan.id === popularId) : null

  return {
    stats: {
      subscribers: subscribers.length,
      revenue,
      average_purchase: paid.length ? Math.round((revenue / paid.length) * 100) / 100 : 0,
      popular_plan: popular
        ? { id: popular.id, name: popular.name, subscribers: byPlan.get(popular.id)?.subscribers || 0 }
        : null,
      subscriber_series: subscriberSeries,
      revenue_series: revenueSeries,
      average_series: averageSeries,
      subscriber_delta: periodDelta(subscriberSeries),
      revenue_delta: periodDelta(revenueSeries),
      average_delta: periodDelta(averageSeries),
    },
    usage: byPlan,
  }
}

router.get('/', async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .from('platform_plans')
    .select('id, name, code, interval_type, duration_days, price, currency, description, is_active, created_at, updated_at')
    .order('created_at', { ascending: false })
  if (error) {
    if (isMissingPlansTable(error)) {
      return res.json({ tableReady: false, plans: [], stats: null })
    }
    return res.status(500).json({ error: error.message })
  }

  const plans = data || []
  let usage = new Map()
  let stats = {
    subscribers: 0,
    revenue: 0,
    average_purchase: 0,
    popular_plan: null,
    subscriber_series: [0, 0, 0, 0, 0, 0],
    revenue_series: [0, 0, 0, 0, 0, 0],
    average_series: [0, 0, 0, 0, 0, 0],
    subscriber_delta: null,
    revenue_delta: null,
    average_delta: null,
  }
  const subscriptions = await supabaseAdmin
    .from('platform_subscriptions')
    .select('plan_id, plan_name, plan_code, amount, status, paid_at, expires_at, created_at')
    .order('created_at', { ascending: false })
    .limit(2000)
  if (subscriptions.error && !isMissingSubscriptionsTable(subscriptions.error)) {
    return res.status(500).json({ error: subscriptions.error.message })
  }
  if (!subscriptions.error) {
    const summary = summarizePlans(plans, subscriptions.data || [])
    stats = summary.stats
    usage = summary.usage
  }

  res.json({
    tableReady: true,
    stats,
    plans: plans.map((plan) => {
      const bucket = usage.get(plan.id) || { subscribers: 0, paid: 0, revenue: 0 }
      return {
        ...plan,
        subscribers: bucket.subscribers,
        revenue: bucket.revenue,
        average_purchase: bucket.paid ? Math.round((bucket.revenue / bucket.paid) * 100) / 100 : 0,
      }
    }),
  })
})

router.post('/', async (req, res) => {
  try {
    const fields = parsePlan(req.body || {})
    const code = await uniqueCode(fields.name)
    const { data, error } = await supabaseAdmin
      .from('platform_plans')
      .insert({ ...fields, code, currency: 'INR' })
      .select('id, name, code, interval_type, duration_days, price, currency, description, is_active, created_at, updated_at')
      .single()
    if (error) {
      if (isMissingPlansTable(error)) throw missingTableError()
      throw error
    }
    res.status(201).json(data)
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Could not create plan' })
  }
})

router.patch('/:id', async (req, res) => {
  try {
    const fields = parsePlan(req.body || {}, { partial: true })
    if (fields.name) fields.code = await uniqueCode(fields.name, req.params.id)
    fields.updated_at = new Date().toISOString()
    const { data, error } = await supabaseAdmin
      .from('platform_plans')
      .update(fields)
      .eq('id', req.params.id)
      .select('id, name, code, interval_type, duration_days, price, currency, description, is_active, created_at, updated_at')
      .maybeSingle()
    if (error) {
      if (isMissingPlansTable(error)) throw missingTableError()
      throw error
    }
    if (!data) return res.status(404).json({ error: 'Plan not found' })
    res.json(data)
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Could not update plan' })
  }
})

router.delete('/:id', async (req, res) => {
  const { error } = await supabaseAdmin.from('platform_plans').delete().eq('id', req.params.id)
  if (error) {
    if (isMissingPlansTable(error)) return res.status(503).json({ error: missingTableError().message })
    return res.status(500).json({ error: error.message })
  }
  res.json({ ok: true })
})

export default router
