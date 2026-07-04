import { useState, useCallback } from 'react'
import { playErrorSound } from '../lib/playErrorSound'
import { isLimitError, getLimitResourceLabel } from '../lib/limitErrors'

export function useLimitExceeded() {
  const [resource, setResource] = useState(null)

  const dismiss = useCallback(() => setResource(null), [])

  const trigger = useCallback((resourceLabel) => {
    playErrorSound()
    setResource(resourceLabel)
  }, [])

  const tryHandleLimitError = useCallback((err, fallbackLabel) => {
    if (!isLimitError(err)) return false
    trigger(getLimitResourceLabel(err) || fallbackLabel)
    return true
  }, [trigger])

  return {
    visible: Boolean(resource),
    resource,
    trigger,
    dismiss,
    tryHandleLimitError,
  }
}
