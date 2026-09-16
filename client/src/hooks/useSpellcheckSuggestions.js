import { useEffect, useState } from 'react'
import { useDebouncedValue } from './useDebouncedValue'
import { findMisspellings, getSpellchecker, preloadSpellchecker } from '../lib/spellcheck'

export function useSpellcheckSuggestions(value, { enabled = false } = {}) {
  const debounced = useDebouncedValue(enabled ? (value ?? '') : '', 300)
  const [ready, setReady] = useState(() => Boolean(getSpellchecker()))
  const [items, setItems] = useState([])

  useEffect(() => {
    if (!enabled) {
      setItems([])
      return undefined
    }

    let cancelled = false
    preloadSpellchecker()
      .then(() => {
        if (!cancelled) setReady(true)
      })
      .catch(() => {
        if (!cancelled) setReady(false)
      })

    return () => {
      cancelled = true
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled || !ready) {
      setItems([])
      return
    }
    setItems(findMisspellings(debounced))
  }, [debounced, enabled, ready])

  return items
}
