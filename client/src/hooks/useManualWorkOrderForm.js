import { useState, useEffect, useCallback, useRef } from 'react'
import { useOrg } from './useOrg'
import {
  getManualWorkOrderForm,
  getManualWorkOrderFormSettings,
  updateManualWorkOrderFormSettings,
  createManualWorkOrder,
  updateManualWorkOrderValues,
} from '../lib/api-work-orders'
import { uploadWorkOrderFile, validateWorkOrderFile } from '../lib/workOrderAssets'
import {
  getWorkOrderFiles,
  revokeWorkOrderFilePreviews,
  workOrderFilesValue,
} from '../lib/workOrderFileValues'
import {
  collectFieldsToClearOnChange,
  flattenSchemaFields,
} from '../lib/assetFieldDependencies'
import {
  clearFormDraft,
  manualWorkOrderDraftKey,
  readFormDraft,
  serializeWorkOrderValues,
  writeFormDraft,
} from '../lib/formDraftStorage'

const FILE_FIELD_TYPES = new Set(['file', 'image'])

function buildFieldTypeMap(schema) {
  const map = new Map()
  for (const section of schema?.sections || []) {
    for (const field of section.fields) {
      map.set(field.id, field.field_type)
    }
  }
  return map
}

function revokePreviewUrls(values) {
  for (const val of Object.values(values)) {
    revokeWorkOrderFilePreviews(val)
  }
}

export function useManualWorkOrderForm() {
  const { org } = useOrg()
  const [schema, setSchema] = useState({ sections: [] })
  const [settings, setSettings] = useState({ sections: [] })
  const [values, setValues] = useState({})
  const [assignedEmployeeIds, setAssignedEmployeeIds] = useState([])
  const [formOpen, setFormOpen] = useState(true)
  const valuesRef = useRef(values)
  const draftHydratedRef = useRef(false)
  valuesRef.current = values

  const draftKey = manualWorkOrderDraftKey(org?.id)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  const loadForm = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const data = await getManualWorkOrderForm()
      setSchema(data)
    } catch (err) {
      setError(err.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  const loadSettings = useCallback(async () => {
    try {
      const data = await getManualWorkOrderFormSettings()
      setSettings(data)
      return data
    } catch (err) {
      setError(err.message)
      throw err
    }
  }, [])

  useEffect(() => {
    loadForm()
  }, [loadForm])

  useEffect(() => {
    if (!draftKey || loading) return
    const draft = readFormDraft(draftKey)
    if (draft) {
      if (draft.values) setValues(draft.values)
      if (Array.isArray(draft.assignedEmployeeIds)) {
        setAssignedEmployeeIds(draft.assignedEmployeeIds)
      }
      if (draft.formOpen !== undefined) setFormOpen(draft.formOpen)
    }
    draftHydratedRef.current = true
  }, [draftKey, loading])

  useEffect(() => {
    if (!draftKey || !draftHydratedRef.current) return
    const serialized = serializeWorkOrderValues(values)
    const hasContent = Object.keys(serialized).length > 0
      || assignedEmployeeIds.length > 0
      || formOpen
    if (!hasContent) {
      clearFormDraft(draftKey)
      return
    }
    writeFormDraft(draftKey, {
      values: serialized,
      assignedEmployeeIds,
      formOpen,
    })
  }, [draftKey, values, assignedEmployeeIds, formOpen])

  useEffect(() => () => revokePreviewUrls(valuesRef.current), [])

  const setFieldValue = (fieldId, value) => {
    setValues((prev) => {
      const existing = prev[fieldId]
      revokeWorkOrderFilePreviews(existing)

      const next = { ...prev, [fieldId]: value }
      const allFields = flattenSchemaFields(schema)
      const fieldsToClear = collectFieldsToClearOnChange(fieldId, allFields, next)

      for (const dependentId of fieldsToClear) {
        revokeWorkOrderFilePreviews(next[dependentId])
        delete next[dependentId]
      }

      return next
    })
  }

  const resetValues = () => {
    revokePreviewUrls(values)
    setValues({})
    setAssignedEmployeeIds([])
    setSuccess(null)
    setError(null)
    if (draftKey) clearFormDraft(draftKey)
  }

  const saveSettings = async (updates) => {
    setSaving(true)
    setError(null)
    try {
      const data = await updateManualWorkOrderFormSettings(updates)
      setSettings(data)
      await loadForm({ silent: true })
      return data
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setSaving(false)
    }
  }

  const submit = async (status = 'created') => {
    if (!org?.id) {
      setError('Organization not loaded')
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const fieldTypes = buildFieldTypeMap(schema)
      const textValues = {}
      const fileEntries = []

      for (const [fieldId, val] of Object.entries(values)) {
        const fieldType = fieldTypes.get(fieldId)
        if (!fieldType) continue

        if (FILE_FIELD_TYPES.has(fieldType)) {
          for (const item of getWorkOrderFiles(val)) {
            if (item?.file instanceof File) {
              fileEntries.push({ fieldId, fieldType, file: item.file })
            }
          }
        } else {
          textValues[fieldId] = val
        }
      }

      for (const { fieldType, file } of fileEntries) {
        const validationError = validateWorkOrderFile(file, fieldType)
        if (validationError) throw new Error(validationError)
      }

      const workOrder = await createManualWorkOrder({
        status,
        values: textValues,
        assignedEmployeeIds,
      })

      if (fileEntries.length) {
        const uploadsByField = new Map()
        for (const { fieldId, fieldType, file } of fileEntries) {
          const uploaded = await uploadWorkOrderFile(org.id, workOrder.id, fieldId, file, fieldType)
          if (!uploadsByField.has(fieldId)) uploadsByField.set(fieldId, [])
          uploadsByField.get(fieldId).push(uploaded)
        }

        const fileValues = {}
        for (const [fieldId, uploaded] of uploadsByField) {
          fileValues[fieldId] = workOrderFilesValue(uploaded)
        }
        await updateManualWorkOrderValues(workOrder.id, fileValues)
      }

      revokePreviewUrls(values)
      setValues({})
      setAssignedEmployeeIds([])
      if (draftKey) clearFormDraft(draftKey)

      if (status === 'created') {
        setSuccess('Work order created successfully.')
      } else {
        setSuccess('Draft saved successfully.')
      }
      return workOrder
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setSaving(false)
    }
  }

  return {
    schema,
    settings,
    values,
    assignedEmployeeIds,
    setAssignedEmployeeIds,
    formOpen,
    setFormOpen,
    loading,
    saving,
    error,
    success,
    setFieldValue,
    resetValues,
    loadSettings,
    saveSettings,
    submit,
    reload: loadForm,
  }
}
