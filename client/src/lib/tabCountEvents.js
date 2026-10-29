export const TAB_COUNTS_EVENT = 'mmspro:tab-counts'

export function notifyTabCountsChanged(module) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(TAB_COUNTS_EVENT, { detail: { module } }))
}
