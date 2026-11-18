import { AsyncLocalStorage } from 'node:async_hooks'

const store = new AsyncLocalStorage()

/** Run work with an onProgress(done, total) callback in async context. */
export function runWithImportProgress(onProgress, fn) {
  return store.run({ onProgress }, fn)
}

/** Emit progress from bulk importers (no-op outside a worker progress scope). */
export function emitImportProgress(done, total) {
  const onProgress = store.getStore()?.onProgress
  if (typeof onProgress !== 'function') return
  const safeDone = Math.max(0, Number(done) || 0)
  const safeTotal = Math.max(0, Number(total) || 0)
  try {
    onProgress(safeDone, safeTotal)
  } catch (err) {
    console.warn('[importProgress] emit failed:', err.message)
  }
}
