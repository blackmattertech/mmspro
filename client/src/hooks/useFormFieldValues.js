import { useCallback, useEffect, useState } from 'react'
import { getFormFieldValues, saveFormFieldValues } from '../lib/api-form-layouts'

export function useFormFieldValues(formId, recordId) {
  const [values, setValues] = useState({})
  const [loading, setLoading] = useState(() => Boolean(formId && recordId))

  const load = useCallback(async () => {
    if (!formId || !recordId) {
      setValues({})
      return
    }
    setLoading(true)
    try {
      const data = await getFormFieldValues(formId, recordId)
      setValues(data?.values || {})
    } catch {
      setValues({})
    } finally {
      setLoading(false)
    }
  }, [formId, recordId])

  useEffect(() => {
    load()
  }, [load])

  const setFieldValue = useCallback((fieldId, value) => {
    setValues((prev) => ({ ...prev, [fieldId]: value }))
  }, [])

  const save = useCallback(async (nextRecordId = recordId, nextValues = values) => {
    if (!formId || !nextRecordId) return {}
    const data = await saveFormFieldValues(formId, nextRecordId, nextValues)
    setValues(data?.values || nextValues)
    return data?.values || nextValues
  }, [formId, recordId, values])

  return { values, setValues, setFieldValue, loading, save, reload: load }
}
