import { useCallback, useEffect, useState } from 'react'
import {
  getTextFieldLimits,
  peekTextFieldLimits,
} from '../lib/api-text-field-limits'
import {
  DEFAULT_TEXT_FIELD_LIMITS,
  limitKeyFromField,
  resolveLimitKey,
} from '../lib/textFieldLimits'

export function useTextFieldLimits() {
  const peeked = peekTextFieldLimits()
  const [limits, setLimits] = useState(peeked?.limits || DEFAULT_TEXT_FIELD_LIMITS)
  const [fields, setFields] = useState(peeked?.fields || [])
  const [loading, setLoading] = useState(!peeked)
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getTextFieldLimits()
      setLimits(data.limits || DEFAULT_TEXT_FIELD_LIMITS)
      setFields(data.fields || [])
      return data
    } catch (err) {
      setError(err.message || 'Could not load character limits')
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await getTextFieldLimits()
        if (cancelled) return
        setLimits(data.limits || DEFAULT_TEXT_FIELD_LIMITS)
        setFields(data.fields || [])
      } catch (err) {
        if (!cancelled) setError(err.message || 'Could not load character limits')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const maxLength = useCallback((key) => {
    const resolved = resolveLimitKey(key)
    return limits[resolved] ?? DEFAULT_TEXT_FIELD_LIMITS[resolved]
  }, [limits])

  const maxLengthForField = useCallback((fieldOrName) => {
    const key = limitKeyFromField(fieldOrName)
    return key ? maxLength(key) : undefined
  }, [maxLength])

  return { limits, fields, maxLength, maxLengthForField, loading, error, reload }
}
