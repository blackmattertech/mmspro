import { lazy } from 'react'
import { isStaleChunkError, reloadOnStaleChunk } from './chunkLoadRecovery'

const LONG_IDLE_MS = 10 * 60 * 1000
const IMPORT_TIMEOUT_MS = 12_000

function importWithIdleTimeout(importer) {
  const load = Promise.resolve().then(importer)
  const pageAge = typeof performance !== 'undefined' ? performance.now() : 0
  if (pageAge < LONG_IDLE_MS) return load

  return Promise.race([
    load,
    new Promise((_, reject) => {
      window.setTimeout(() => {
        reject(new Error('Failed to fetch dynamically imported module: idle timeout'))
      }, IMPORT_TIMEOUT_MS)
    }),
  ])
}

/** Code-split a route and recover when the tab is holding a stale JS chunk. */
export function lazyPage(importer) {
  return lazy(() =>
    importWithIdleTimeout(importer).catch((error) => {
      if (isStaleChunkError(error)) {
        reloadOnStaleChunk()
        return new Promise(() => {})
      }
      throw error
    }),
  )
}
