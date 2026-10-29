import { useCallback, useEffect, useMemo, useState } from 'react'
import { getFormLayout } from '../lib/api-form-layouts'
import { formFieldClassName, parseLayoutId, normalizeColSpan } from '../lib/formLayoutIds'
import { buildDefaultLayout, getFormDef } from '../lib/formRegistry'

export function useFormLayout(formId, { fallbackToDefault = false } = {}) {
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
      if (field.skipped) continue
      const parsed = parseLayoutId(field.id)
      if (parsed.kind === 'system') keys.add(parsed.value)
    }
    return keys
  }, [layout])

  const isVisible = useCallback((key) => {
    if (!layout) return true
    return Boolean(visibleKeys?.has(key))
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
  const resolvedLayout = layout || (formDef && fallbackToDefault
    ? buildDefaultLayout(formDef, catalogFields)
    : null)

  const resolvedVisibleKeys = useMemo(() => {
    if (!resolvedLayout) return null
    const keys = new Set()
    for (const field of resolvedLayout.fields || []) {
      if (field.skipped) continue
      const parsed = parseLayoutId(field.id)
      if (parsed.kind === 'system') keys.add(parsed.value)
    }
    return keys
  }, [resolvedLayout])

  const resolvedIsVisible = useCallback((key) => {
    if (!resolvedLayout) return true
    return Boolean(resolvedVisibleKeys?.has(key))
  }, [resolvedLayout, resolvedVisibleKeys])

  const resolvedColSpan = useCallback((key, fallback = 25) => {
    if (!resolvedLayout) return fallback
    const match = (resolvedLayout.fields || []).find((field) => parseLayoutId(field.id).value === key)
    return match ? normalizeColSpan(match.colSpan, fallback) : fallback
  }, [resolvedLayout])

  const resolvedFieldClass = useCallback((key, extras = '', fallbackSpan = 25) => {
    return formFieldClassName({ colSpan: resolvedLayout ? resolvedColSpan(key, fallbackSpan) : undefined }, extras)
  }, [resolvedColSpan, resolvedLayout])

  return {
    formId,
    formDef,
    layout: resolvedLayout,
    catalogFields,
    loading,
    error,
    hasLayout: Boolean(resolvedLayout),
    isDefaultFallback: !layout && Boolean(resolvedLayout),
    isVisible: fallbackToDefault ? resolvedIsVisible : isVisible,
    colSpan: fallbackToDefault ? resolvedColSpan : colSpan,
    fieldClass: fallbackToDefault ? resolvedFieldClass : fieldClass,
    reload: load,
  }
}
