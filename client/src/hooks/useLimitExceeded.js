import { useState, useCallback } from 'react'
import { playErrorSound } from '../lib/playErrorSound'
import { isLimitError, getLimitResourceLabel, getLimitOverflow } from '../lib/limitErrors'

export function useLimitExceeded() {
  const [resource, setResource] = useState(null)
  const [overflow, setOverflow] = useState(null)

  const dismiss = useCallback(() => {
    setResource(null)
    setOverflow(null)
  }, [])

  const trigger = useCallback((resourceLabel, extras = {}) => {
    playErrorSound()
    setResource(resourceLabel)
    setOverflow(extras.overflow ?? null)
  }, [])

  const tryHandleLimitError = useCallback((err, fallbackLabel) => {
    if (!isLimitError(err)) return false
    trigger(getLimitResourceLabel(err) || fallbackLabel, { overflow: getLimitOverflow(err) })
    return true
  }, [trigger])

  return {
    visible: Boolean(resource),
    resource,
    overflow,
    trigger,
    dismiss,
    tryHandleLimitError,
  }
}
