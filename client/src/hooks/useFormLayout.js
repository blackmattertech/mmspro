import { useCallback, useEffect, useMemo, useState } from 'react'
import { getFormLayout } from '../lib/api-form-layouts'
import { formFieldClassName, parseLayoutId, systemId, normalizeColSpan } from '../lib/formLayoutIds'
import { getFormDef } from '../lib/formRegistry'

export function useFormLayout(formId) {
  const [layout, setLayout] = useState(null)
  const [catalogFields, setCatalogFields] = useState([])
  const [loading, setLoading] = useState(Boolean(formId))
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!formId) {
      setLayout(null)
      setCatalogFields([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await getFormLayout(formId)
      setLayout(data?.layout || null)
      setCatalogFields(data?.catalogFields || [])
    } catch (err) {
      setLayout(null)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [formId])

  useEffect(() => {
    load()
  }, [load])

  const visibleKeys = useMemo(() => {
    if (!layout) return null
    const keys = new Set()
    for (const field of layout.fields || []) {
      const parsed = parseLayoutId(field.id)
      if (parsed.kind === 'system') keys.add(parsed.value)
    }
    return keys
  }, [layout])

  const isVisible = useCallback((key) => {
    if (!layout) return true
    return visibleKeys?.has(key) || layout.fields?.some((field) => field.id === systemId(key))
  }, [layout, visibleKeys])

  const colSpan = useCallback((key, fallback = 25) => {
    if (!layout) return fallback
    const match = (layout.fields || []).find((field) => parseLayoutId(field.id).value === key)
    return match ? normalizeColSpan(match.colSpan, fallback) : fallback
  }, [layout])

  const fieldClass = useCallback((key, extras = '', fallbackSpan = 25) => {
    return formFieldClassName({ colSpan: layout ? colSpan(key, fallbackSpan) : undefined }, extras)
  }, [colSpan, layout])

  const formDef = formId ? getFormDef(formId) : null

  return {
    formId,
    formDef,
    layout,
    catalogFields,
    loading,
    error,
    hasLayout: Boolean(layout),
    isVisible,
    colSpan,
    fieldClass,
    reload: load,
  }
}
