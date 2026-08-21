import { supabaseAdmin } from '../services/supabase.js'
import { canManageOrg } from './accountRoles.js'

const WO_TABS = [
  ['assigned', 'work_orders_assigned'],
  ['received', 'work_orders_received'],
  ['manual', 'work_orders_manual'],
  ['scheduled', 'work_orders_scheduled'],
]

const WR_TABS = [
  ['my', 'work_request_my'],
  ['incoming', 'work_request_incoming'],
  ['outgoing', 'work_request_outgoing'],
  ['all', 'work_request_all'],
]

function notificationData(value) {
  if (!value || typeof value !== 'object') return {}
  return value
}

function pathWithOpen(slug, segment, id) {
  const path = `/${slug}/${segment}`
  return id ? `${path}?open=${encodeURIComponent(id)}` : path
}

function canReadModule(readable, moduleKey) {
  if (readable === 'all') return true
  if (!readable || !(readable instanceof Set)) return true
  if (readable.has(moduleKey)) return true
  if (moduleKey.startsWith('work_orders_') && readable.has('work_orders')) return true
  if (moduleKey.startsWith('work_request_') && readable.has('work_request')) return true
  return false
}

function pickSegment(readable, preferred, tabs, prefix) {
  const ids = [preferred, ...tabs.map(([id]) => id).filter((id) => id !== preferred)]
  for (const id of ids) {
    const tab = tabs.find((item) => item[0] === id)
    if (tab && canReadModule(readable, tab[1])) return `${prefix}/${id}`
  }
  return `${prefix}/${preferred}`
}

export function fallbackInboxUrl(slug, { url, data = {} } = {}) {
  if (url && url !== '/') return url
  if (!slug) return url || '/'
  if (data.task_id) return `/${slug}/tasks-and-followups/${data.task_id}`
  if (data.pm_plan_id && !data.work_order_id) return `/${slug}/work-orders/scheduled`
  if (data.work_order_id) return pathWithOpen(slug, 'work-orders/received', data.work_order_id)
  if (data.work_request_id) return pathWithOpen(slug, 'work-request/incoming', data.work_request_id)
  return `/${slug}/dashboard`
}

async function loadReadableModules(userId, orgId) {
  const [{ data: profile }, { data: employee }] = await Promise.all([
    supabaseAdmin
      .from('profiles')
      .select('id, role')
      .eq('id', userId)
      .maybeSingle(),
    orgId
      ? supabaseAdmin
        .from('org_employees')
        .select('id, department_id, location_id, access_role_id')
        .eq('org_id', orgId)
        .eq('profile_id', userId)
        .eq('is_active', true)
        .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  if (canManageOrg(profile?.role)) return 'all'
  if (!employee?.access_role_id) return new Set()

  const { data: perms } = await supabaseAdmin
    .from('org_access_role_permissions')
    .select('module_key, can_read')
    .eq('role_id', employee.access_role_id)

  return new Set((perms || []).filter((row) => row.can_read).map((row) => row.module_key))
}

function workOrderSegmentForUser(userId, workOrder, readable) {
  const isOutgoing = workOrder.created_by === userId || workOrder.requester_id === userId
  const preferred = isOutgoing ? 'assigned' : 'received'
  return pickSegment(readable, preferred, WO_TABS, 'work-orders')
}

function workRequestSegmentForUser(userId, workRequest, readable) {
  const preferred = workRequest.requested_by === userId ? 'my' : 'incoming'
  return pickSegment(readable, preferred, WR_TABS, 'work-request')
}

/**
 * Build the in-app / push URL for one recipient from notification data.
 * Work the user requested or created opens Assigned; incoming work opens Received.
 */
export async function resolveInboxUrl(userId, orgId, slug, { url, data = {} } = {}) {
  if (url && url !== '/') return url
  if (!slug) return url || '/'

  const payload = notificationData(data)
  if (payload.task_id) return `/${slug}/tasks-and-followups/${payload.task_id}`
  if (payload.pm_plan_id && !payload.work_order_id) {
    return `/${slug}/work-orders/scheduled`
  }

  const readable = await loadReadableModules(userId, orgId)

  if (payload.work_order_id) {
    const { data: workOrder } = await supabaseAdmin
      .from('manual_work_orders')
      .select('id, created_by, requester_id')
      .eq('id', payload.work_order_id)
      .maybeSingle()

    if (workOrder) {
      const segment = workOrderSegmentForUser(userId, workOrder, readable)
      return pathWithOpen(slug, segment, payload.work_order_id)
    }
    return pathWithOpen(
      slug,
      pickSegment(readable, 'received', WO_TABS, 'work-orders'),
      payload.work_order_id,
    )
  }

  if (payload.work_request_id) {
    const { data: workRequest } = await supabaseAdmin
      .from('work_requests')
      .select('id, requested_by')
      .eq('id', payload.work_request_id)
      .maybeSingle()

    if (workRequest) {
      return pathWithOpen(
        slug,
        workRequestSegmentForUser(userId, workRequest, readable),
        payload.work_request_id,
      )
    }
    return pathWithOpen(
      slug,
      pickSegment(readable, 'incoming', WR_TABS, 'work-request'),
      payload.work_request_id,
    )
  }

  return `/${slug}/dashboard`
}

/**
 * Recompute inbox URLs for a user's existing notifications (fixes stale /received links).
 */
export async function enrichNotificationUrls(userId, orgId, slug, rows) {
  if (!rows?.length) return rows || []

  let resolvedSlug = slug
  if (!resolvedSlug && orgId) {
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('slug')
      .eq('id', orgId)
      .maybeSingle()
    resolvedSlug = org?.slug || null
  }
  if (!resolvedSlug) return rows

  const items = rows.map((row) => ({
    ...row,
    data: notificationData(row.data),
  }))

  const woIds = [...new Set(items.map((row) => row.data.work_order_id).filter(Boolean))]
  const wrIds = [...new Set(items.map((row) => row.data.work_request_id).filter(Boolean))]

  const readable = await loadReadableModules(userId, orgId)

  const [workOrdersResult, workRequestsResult] = await Promise.all([
    woIds.length
      ? supabaseAdmin
        .from('manual_work_orders')
        .select('id, created_by, requester_id')
        .in('id', woIds)
      : Promise.resolve({ data: [] }),
    wrIds.length
      ? supabaseAdmin
        .from('work_requests')
        .select('id, requested_by')
        .in('id', wrIds)
      : Promise.resolve({ data: [] }),
  ])

  const workOrders = new Map((workOrdersResult.data || []).map((row) => [row.id, row]))
  const workRequests = new Map((workRequestsResult.data || []).map((row) => [row.id, row]))

  return items.map((row) => {
    const data = row.data
    if (row.url && row.url !== '/' && !data.work_order_id && !data.work_request_id && !data.task_id) {
      return row
    }

    let nextUrl = row.url
    if (data.task_id) {
      nextUrl = `/${resolvedSlug}/tasks-and-followups/${data.task_id}`
    } else if (data.work_order_id) {
      const workOrder = workOrders.get(data.work_order_id)
      const segment = workOrder
        ? workOrderSegmentForUser(userId, workOrder, readable)
        : pickSegment(readable, 'received', WO_TABS, 'work-orders')
      nextUrl = pathWithOpen(resolvedSlug, segment, data.work_order_id)
    } else if (data.work_request_id) {
      const workRequest = workRequests.get(data.work_request_id)
      const segment = workRequest
        ? workRequestSegmentForUser(userId, workRequest, readable)
        : pickSegment(readable, 'incoming', WR_TABS, 'work-request')
      nextUrl = pathWithOpen(resolvedSlug, segment, data.work_request_id)
    }

    return nextUrl && nextUrl !== row.url ? { ...row, url: nextUrl } : row
  })
}
