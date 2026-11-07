import { invalidateReferenceCache } from './referenceDataCache'

export const TAB_COUNTS_EVENT = 'mmspro:tab-counts'

export function notifyTabCountsChanged(module) {
  if (typeof window === 'undefined') return
  try {
    invalidateReferenceCache('tab-counts')
  } catch {
    // cache helper may be unavailable in tests
  }
  window.dispatchEvent(new CustomEvent(TAB_COUNTS_EVENT, { detail: { module } }))
}

/** Same-session activity bus — aliases tab count notify for list refresh listeners. */
export function notifyActivity(module) {
  notifyTabCountsChanged(module)
}
