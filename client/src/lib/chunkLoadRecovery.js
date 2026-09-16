const STORAGE_KEY = 'mmspro-chunk-reload-at'
const COOLDOWN_MS = 10_000

const STALE_CHUNK_RE = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS for|Loading chunk [\w.-]+ failed|ChunkLoadError/i

export function isStaleChunkError(error) {
  if (!error) return false
  if (error.name === 'ChunkLoadError') return true
  return STALE_CHUNK_RE.test(String(error.message || error))
}

/** Reload once so a stale tab picks up a new index.html / chunk hashes. */
export function reloadOnStaleChunk() {
  if (typeof window === 'undefined') return false
  try {
    const last = Number(sessionStorage.getItem(STORAGE_KEY) || 0)
    if (Date.now() - last < COOLDOWN_MS) return false
    sessionStorage.setItem(STORAGE_KEY, String(Date.now()))
  } catch {
    // still reload
  }
  window.location.reload()
  return true
}

export function installChunkLoadRecovery() {
  if (typeof window === 'undefined') return
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault?.()
    reloadOnStaleChunk()
  })
  window.addEventListener('unhandledrejection', (event) => {
    if (!isStaleChunkError(event.reason)) return
    event.preventDefault()
    reloadOnStaleChunk()
  })
}
