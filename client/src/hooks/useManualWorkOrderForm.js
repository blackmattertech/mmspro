import { useState, useEffect, useCallback, useRef } from 'react'
import { useOrg } from './useOrg'
import {
  getManualWorkOrderForm,
  getManualWorkOrderFormSettings,
  updateManualWorkOrderFormSettings,
  createManualWorkOrder,
  updateManualWorkOrder,
  updateManualWorkOrderValues,
  getManualWorkOrder,
} from '../lib/api-work-orders'
import { uploadWorkOrderFile, validateWorkOrderFile } from '../lib/workOrderAssets'
import {
  getWorkOrderFiles,
  revokeWorkOrderFilePreviews,
  workOrderFilesValue,
} from '../lib/workOrderFileValues'
import {
  collectFieldsToClearOnChange,
  filterVisibleFields,
  flattenSchemaFields,
} from '../lib/assetFieldDependencies'
import {
  clearFormDraft,
  manualWorkOrderDraftKey,
  readFormDraft,
  serializeWorkOrderValues,
  writeFormDraft,
} from '../lib/formDraftStorage'
import { seedDateFieldDefaults } from '../lib/dateInputDefaults'

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

function isFieldValueEmpty(field, value) {
  if (FILE_FIELD_TYPES.has(field.field_type)) {
    return getWorkOrderFiles(value).length === 0
  }
  if (field.field_type === 'checkbox') {
    if (Array.isArray(value)) return value.length === 0
    return !value
  }
  return value === null || value === undefined || String(value).trim() === ''
}

/** Required + currently visible (dependency met) fields that are still empty. */
function findMissingRequiredFields(schema, values) {
  const missing = []
  for (const section of schema?.sections || []) {
    for (const field of filterVisibleFields(section.fields, values)) {
      if (field.is_required && isFieldValueEmpty(field, values[field.id])) {
        missing.push(field.name)
      }
    }
  }
  return missing
}

function formValuesFromDetail(detail) {
  const next = {}
  for (const section of detail?.sections || []) {
    for (const field of section.fields || []) {
      if (field.field_type === 'checkbox') {
        if (Array.isArray(field.value_json?.values)) {
          next[field.id] = field.value_json.values
        } else {
          next[field.id] = Boolean(field.value_json?.checked)
        }
      } else if (FILE_FIELD_TYPES.has(field.field_type)) {
        next[field.id] = workOrderFilesValue(field.value_json?.files || [])
      } else if (field.field_type === 'number') {
        next[field.id] = field.value_json?.number ?? field.value_text ?? ''
      } else {
        next[field.id] = field.value_text ?? ''
      }
    }
  }
  return next
}

export function useManualWorkOrderForm({ workOrderId = null } = {}) {
  const { org } = useOrg()
  const isEdit = Boolean(workOrderId)
  const [schema, setSchema] = useState({ sections: [] })
  const [settings, setSettings] = useState({ sections: [] })
  const [values, setValues] = useState({})
  const [assignedEmployeeIds, setAssignedEmployeeIds] = useState([])
  const [assignToDepartment, setAssignToDepartment] = useState(false)
  const [assignedDepartmentId, setAssignedDepartmentId] = useState(null)
  const [assignedLocationId, setAssignedLocationId] = useState(null)
  const [existingStatus, setExistingStatus] = useState(null)
  const [formOpen, setFormOpen] = useState(true)
  const valuesRef = useRef(values)
  const draftHydratedRef = useRef(false)
  const dateDefaultsSeededRef = useRef(false)
  const editHydratedRef = useRef(false)
  valuesRef.current = values

  const draftKey = !isEdit ? manualWorkOrderDraftKey(org?.id) : null

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
    if (!isEdit || !workOrderId || loading || editHydratedRef.current) return

    let cancelled = false
    ;(async () => {
      try {
        const detail = await getManualWorkOrder(workOrderId)
        if (cancelled) return
        setExistingStatus(detail.status || 'draft')
        setValues(formValuesFromDetail(detail))
        const assigneeIds = (detail.assignees || []).map((a) => a.id).filter(Boolean)
        setAssignedEmployeeIds(assigneeIds)
        setAssignedDepartmentId(detail.assigned_department_id || detail.assigned_department?.id || null)
        setAssignedLocationId(detail.assigned_location_id || detail.assigned_location?.id || null)
        setAssignToDepartment(Boolean(
          (detail.assigned_department_id || detail.assigned_department?.id)
          && !assigneeIds.length,
        ))
        editHydratedRef.current = true
        draftHydratedRef.current = true
      } catch (err) {
        if (!cancelled) setError(err.message)
      }
    })()

    return () => { cancelled = true }
  }, [isEdit, workOrderId, loading])

  useEffect(() => {
    if (isEdit || !draftKey || loading) return
    const draft = readFormDraft(draftKey)
    if (draft) {
      if (draft.values) setValues(draft.values)
      if (Array.isArray(draft.assignedEmployeeIds)) {
        setAssignedEmployeeIds(draft.assignedEmployeeIds)
      }
      if (typeof draft.assignToDepartment === 'boolean') {
        setAssignToDepartment(draft.assignToDepartment)
      }
      if (draft.assignedDepartmentId) setAssignedDepartmentId(draft.assignedDepartmentId)
      if (draft.assignedLocationId) setAssignedLocationId(draft.assignedLocationId)
      if (draft.formOpen !== undefined) setFormOpen(draft.formOpen)
    }
    draftHydratedRef.current = true
  }, [draftKey, loading, isEdit])

  useEffect(() => {
    if (isEdit || !draftHydratedRef.current || loading || dateDefaultsSeededRef.current) return
    dateDefaultsSeededRef.current = true
    setValues((prev) => seedDateFieldDefaults(flattenSchemaFields(schema), prev))
  }, [schema, loading, isEdit])

  useEffect(() => {
    if (isEdit || !draftKey || !draftHydratedRef.current) return
    const serialized = serializeWorkOrderValues(values)
    const hasContent = Object.keys(serialized).length > 0
      || assignedEmployeeIds.length > 0
      || assignToDepartment
      || formOpen
    if (!hasContent) {
      clearFormDraft(draftKey)
      return
    }
    writeFormDraft(draftKey, {
      values: serialized,
      assignedEmployeeIds,
      assignToDepartment,
      assignedDepartmentId,
      assignedLocationId,
      formOpen,
    })
  }, [draftKey, values, assignedEmployeeIds, assignToDepartment, assignedDepartmentId, assignedLocationId, formOpen, isEdit])

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
    setValues(seedDateFieldDefaults(flattenSchemaFields(schema), {}))
    setAssignedEmployeeIds([])
    setAssignToDepartment(false)
    setAssignedDepartmentId(null)
    setAssignedLocationId(null)
    setSuccess(null)
    setError(null)
    if (draftKey) clearFormDraft(draftKey)
  }

  const setDepartmentTarget = useCallback(({ departmentId, locationId }) => {
    setAssignedDepartmentId(departmentId || null)
    setAssignedLocationId(locationId || null)
  }, [])

  const saveSettings = async (updates, { sectionIds } = {}) => {
    setSaving(true)
    setError(null)
    try {
      const data = await updateManualWorkOrderFormSettings(updates, { sectionIds })
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
    if (status === 'created' && !assignedLocationId && !assignedEmployeeIds.length) {
      setError('Select a location (or specific employees) before creating the work order')
      return
    }
    if (status === 'created') {
      const missing = findMissingRequiredFields(schema, values)
      if (missing.length) {
        setError(`Fill the mandatory field${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}`)
        return
      }
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

      const payload = {
        status,
        values: textValues,
        assignedEmployeeIds,
        assignedDepartmentId: assignedDepartmentId || null,
        assignedLocationId: assignedLocationId || null,
      }

      const workOrder = isEdit
        ? await updateManualWorkOrder(workOrderId, payload)
        : await createManualWorkOrder(payload)

      if (fileEntries.length) {
        const uploadsByField = new Map()
        for (const { fieldId, fieldType, file } of fileEntries) {
          const uploaded = await uploadWorkOrderFile(org.id, workOrder.id, fieldId, file, fieldType)
          if (!uploadsByField.has(fieldId)) uploadsByField.set(fieldId, [])
          uploadsByField.get(fieldId).push(uploaded)
        }

        const fileValues = {}
        for (const [fieldId, uploaded] of uploadsByField) {
          const existingFiles = getWorkOrderFiles(values[fieldId]).filter((item) => item?.path && !item?.file)
          fileValues[fieldId] = workOrderFilesValue([...existingFiles, ...uploaded])
        }
        await updateManualWorkOrderValues(workOrder.id, fileValues)
      }

      revokePreviewUrls(values)
      if (!isEdit) {
        setValues(seedDateFieldDefaults(flattenSchemaFields(schema), {}))
        setAssignedEmployeeIds([])
        setAssignToDepartment(false)
        setAssignedDepartmentId(null)
        setAssignedLocationId(null)
        if (draftKey) clearFormDraft(draftKey)
      } else {
        setExistingStatus(status)
      }

      if (status === 'created') {
        setSuccess(isEdit ? 'Work order updated successfully.' : 'Work order created successfully.')
      } else {
        setSuccess(isEdit ? 'Draft updated successfully.' : 'Draft saved successfully.')
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
    assignToDepartment,
    setAssignToDepartment,
    setDepartmentTarget,
    formOpen,
    setFormOpen,
    isEdit,
    existingStatus,
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
