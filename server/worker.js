import 'dotenv/config'
import './lib/serverLog.js'
import { startWorkers, stopWorkers } from './lib/workers/startWorkers.js'
import { closeQueues } from './lib/queues.js'
import { closeRedisConnections } from './lib/redis.js'
import { ensureSchemaPatches } from './lib/runSchemaPatches.js'

async function main() {
  await ensureSchemaPatches()
  const ok = await startWorkers()
  if (!ok) {
    console.error('[worker] Could not start BullMQ workers. Set REDIS_URL (Upstash) and retry.')
    process.exit(1)
  }
  console.log('[worker] MMS Pro job worker running')
}

async function shutdown(signal) {
  console.log(`[worker] ${signal} received — shutting down`)
  await stopWorkers()
  await closeQueues()
  await closeRedisConnections()
  process.exit(0)
}

process.on('SIGINT', () => { shutdown('SIGINT') })
process.on('SIGTERM', () => { shutdown('SIGTERM') })

main().catch((err) => {
  console.error('[worker] failed to start:', err.message)
  process.exit(1)
})
