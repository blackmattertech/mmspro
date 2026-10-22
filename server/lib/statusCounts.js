import { supabaseAdmin } from '../services/supabase.js'

export function tallyStatusCounts(rows, getStatus = (row) => row?.status) {
  const map = new Map()
  for (const row of rows || []) {
    const key = String(getStatus(row) ?? '').trim()
    if (!key) continue
    map.set(key, (map.get(key) || 0) + 1)
  }
  return [...map.entries()].map(([status, count]) => ({ status, count }))
}

export function isMissingRpcError(error) {
  const message = String(error?.message || error?.code || '')
  return (
    error?.code === 'PGRST202'
    || error?.code === '42883'
    || /could not find the function|function .* does not exist/i.test(message)
  )
}

export function parseStatusCountPayload(data) {
  const parsed = typeof data === 'string' ? JSON.parse(data) : data
  if (!Array.isArray(parsed)) return []
  return parsed
    .map((row) => ({
      status: String(row?.status || '').trim(),
      count: Number(row.count) || 0,
    }))
    .filter((row) => row.status && row.count > 0)
}

export async function rpcJson(name, args) {
  const { data, error } = await supabaseAdmin.rpc(name, args)
  if (error) throw error
  if (data && typeof data === 'string') {
    try {
      return JSON.parse(data)
    } catch {
      return data
    }
  }
  return data
}

/**
 * Supabase builders are thenable. Awaiting one runs the query, so an async
 * builder must be returned as `{ query }` instead of the builder itself.
 */
async function resolveCountQuery(built) {
  let value = built
  if (value && typeof value.then === 'function' && typeof value.eq !== 'function') {
    value = await value
  }
  const query = value?.query && typeof value.query.eq === 'function' ? value.query : value
  // Keep the builder inside a plain object. Returning it from this async
  // function would await the thenable builder and run the query.
  return { query }
}

/**
 * Exact per-status counts via head COUNT queries (avoids PostgREST row caps).
 * @param {() => any} buildQuery - `.select(cols, { count: 'exact', head: true })` query, or `{ query }`
 * @param {string[]} statuses
 * @param {string} [statusCol='status']
 */
export async function countExactStatuses(buildQuery, statuses, statusCol = 'status') {
  const list = (statuses || []).filter(Boolean)
  if (!list.length) return []

  const entries = await Promise.all(
    list.map(async (status) => {
      const { query: base } = await resolveCountQuery(buildQuery())
      const { count, error } = await base.eq(statusCol, status)
      if (error) throw error
      return { status, count: count || 0 }
    }),
  )
  return entries.filter((row) => row.count > 0)
}

export async function countStatusesViaRpc(name, args, fallback) {
  try {
    return parseStatusCountPayload(await rpcJson(name, args))
  } catch (err) {
    if (!isMissingRpcError(err)) throw err
    if (typeof fallback === 'function') return fallback()
    throw err
  }
}

/**
 * Legacy helper. Prefer countStatusesViaRpc — this still pages when RPCs are missing.
 */
export async function fetchStatusCounts(query) {
  const map = new Map()
  const pageSize = 1000
  let from = 0

  for (;;) {
    const pageQuery = query.range(from, from + pageSize - 1)
    const { data, error } = await pageQuery
    if (error) throw error
    const rows = data || []
    for (const row of rows) {
      const key = String(row?.status ?? '').trim()
      if (!key) continue
      map.set(key, (map.get(key) || 0) + 1)
    }
    if (rows.length < pageSize) break
    from += pageSize
    if (from >= 100_000) break
  }

  return [...map.entries()].map(([status, count]) => ({ status, count }))
}
