import IORedis from 'ioredis'

let sharedConnection = null
let enabledCache = null
let pingPromise = null

export function getRedisUrl() {
  return String(process.env.REDIS_URL || '').trim() || null
}

/** Build BullMQ-compatible ioredis options for Upstash / standard Redis. */
export function redisConnectionOptions(url = getRedisUrl()) {
  if (!url) return null
  return {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    // Upstash TLS URLs use rediss://
  }
}

export function createRedisConnection(url = getRedisUrl()) {
  const trimmed = String(url || '').trim()
  if (!trimmed) return null
  const options = redisConnectionOptions(trimmed)
  return new IORedis(trimmed, options)
}

export function getSharedRedisConnection() {
  if (sharedConnection) return sharedConnection
  sharedConnection = createRedisConnection()
  return sharedConnection
}

/**
 * True when REDIS_URL is set and Redis accepts a ping.
 * Result is cached after the first successful check; failures stay retryable.
 */
export async function isJobQueueEnabled() {
  if (enabledCache === true) return true
  if (!getRedisUrl()) {
    enabledCache = false
    return false
  }
  if (!pingPromise) {
    pingPromise = (async () => {
      const client = getSharedRedisConnection()
      if (!client) {
        enabledCache = false
        return false
      }
      try {
        const pong = await client.ping()
        enabledCache = pong === 'PONG'
        return enabledCache
      } catch (err) {
        console.warn('[redis] ping failed — job queue disabled:', err.message)
        enabledCache = null
        pingPromise = null
        try {
          await client.quit()
        } catch {
          /* ignore */
        }
        sharedConnection = null
        return false
      }
    })()
  }
  return pingPromise
}

/** Test helper — reset cached enablement state. */
export function resetJobQueueEnabledCache() {
  enabledCache = null
  pingPromise = null
}

export async function closeRedisConnections() {
  if (!sharedConnection) return
  try {
    await sharedConnection.quit()
  } catch {
    try {
      sharedConnection.disconnect()
    } catch {
      /* ignore */
    }
  }
  sharedConnection = null
  enabledCache = null
  pingPromise = null
}
