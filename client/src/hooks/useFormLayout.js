import { useCallback, useEffect, useMemo, useState } from 'react'
import { getFormLayout } from '../lib/api-form-layouts'
import {
  formFieldClassName,
  parseLayoutId,
  normalizeColSpan,
  normalizeAssetLayout,
} from '../lib/formLayoutIds'
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

  const formDef = formId ? getFormDef(formId) : null

  const fallbackLayout = useMemo(() => {
    if (!formDef || !fallbackToDefault) return null
    return buildDefaultLayout(formDef, catalogFields)
  }, [formDef, fallbackToDefault, catalogFields])

  const resolvedLayout = useMemo(() => {
    const base = layout || fallbackLayout
    if (!base) return null
    return normalizeAssetLayout(base, { catalogFields })
  }, [layout, fallbackLayout, catalogFields])

  const visibleKeys = useMemo(() => {
    if (!resolvedLayout) return null
    const keys = new Set()
    for (const field of resolvedLayout.fields || []) {
      if (field.skipped) continue
      const parsed = parseLayoutId(field.id)
      if (parsed.kind === 'system') keys.add(parsed.value)
    }
    return keys
  }, [resolvedLayout])

  const isVisible = useCallback((key) => {
    if (!resolvedLayout) return true
    return Boolean(visibleKeys?.has(key))
  }, [resolvedLayout, visibleKeys])

  const colSpan = useCallback((key, fallback = 25) => {
    if (!resolvedLayout) return fallback
    const match = (resolvedLayout.fields || []).find((field) => parseLayoutId(field.id).value === key)
    return match ? normalizeColSpan(match.colSpan, fallback) : fallback
  }, [resolvedLayout])

  const fieldClass = useCallback((key, extras = '', fallbackSpan = 25) => {
    return formFieldClassName({ colSpan: resolvedLayout ? colSpan(key, fallbackSpan) : undefined }, extras)
  }, [colSpan, resolvedLayout])

  return {
    formId,
    formDef,
    layout: resolvedLayout,
    rawLayout: layout,
    catalogFields,
    loading,
    error,
    hasLayout: Boolean(resolvedLayout),
    isDefaultFallback: !layout && Boolean(resolvedLayout),
    isVisible,
    colSpan,
    fieldClass,
    reload: load,
  }
}
