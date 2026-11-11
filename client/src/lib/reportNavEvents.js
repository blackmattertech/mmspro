const listeners = new Set()

export function notifyCustomReportsChanged() {
  for (const listener of listeners) {
    try {
      listener()
    } catch {
      // ignore listener errors
    }
  }
}

export function onCustomReportsChanged(listener) {
  if (typeof listener !== 'function') return () => {}
  listeners.add(listener)
  return () => listeners.delete(listener)
}
