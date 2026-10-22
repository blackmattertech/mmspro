import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useOrg } from '../../hooks/useOrg'
import { usePermissions } from '../../hooks/usePermissions'
import { useAuth } from '../../hooks/useAuth'
import { useTextFieldLimits } from '../../hooks/useTextFieldLimits'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { orgPath } from '../../config/navigation'
import {
  getWorkRequestFormContext,
  getWorkRequestEquipmentCatalog,
  createWorkRequest,
} from '../../lib/api-work-requests'
import WorkRequestAssetFields from '../../components/workrequests/WorkRequestAssetFields'
import WorkRequestSectionHead from '../../components/workrequests/WorkRequestSectionHead'
import WorkRequestBreakdownFields from '../../components/workrequests/WorkRequestBreakdownFields'
import WorkRequestAttachmentsField from '../../components/workrequests/WorkRequestAttachmentsField'
import FilterableSelect from '../../components/ui/FilterableSelect'
import SpellcheckInput from '../../components/shared/SpellcheckInput'
import FormLabel from '../../components/shared/FormLabel'
import {
  clearBreakdownFieldValues,
  missingRequiredBreakdownFields,
} from '../../lib/workRequestBreakdownFields'
import { departmentsForEmployeeLocation } from '../../lib/departmentLocation'
import { uploadWorkOrderFile } from '../../lib/workOrderAssets'
import { persistFormFileValues, revokeWorkOrderFilePreviews } from '../../lib/workOrderFileValues'
import { createId } from '../../lib/id'
import '../../components/company/CompanyShared.css'
import '../../components/assets/AssetsFields.css'
import '../../components/workorders/WorkOrdersPage.css'
import '../../components/workorders/ManualWorkOrder.css'
import '../../components/workrequests/WorkRequests.css'
import { useFormLayout } from '../../hooks/useFormLayout'
import { useFormFieldValues } from '../../hooks/useFormFieldValues'
import OrderedFormLayout from '../../components/forms/OrderedFormLayout'
import ChecklistOptIn from '../../components/forms/ChecklistOptIn'
import { findLayoutField, layoutHasSection, shouldRequire, systemId, parseLayoutId } from '../../lib/formLayoutIds'
import { missingRequiredLayoutValues, splitBoundValues } from '../../lib/formFieldSources'
import { layoutHasOptionRules, isInterDepartmentRequestType, isSameDepartmentRequestType } from '../../lib/formOptionRules'
import { resolveFormActors, validateRepeatableGroups } from '../../lib/formFillership'
import {
  augmentLayoutWithEquipmentCatalog,
  catalogRowFromEquipmentDetail,
  equipmentCatalogParents,
  equipmentValuesByFieldId,
  isEquipmentMasterField,
} from '../../lib/equipmentLayoutFields'
import { getEquipment } from '../../lib/api-equipment'
import { fieldValuesFromEquipment, flattenAssetSections, getEquipmentFieldRole } from '../../lib/workRequestAssetPicker'

function formatEquipmentLabel(row) {
  return row?.name || row?.id || ''
}

function departmentSearchLabel(department) {
  return [
    department?.name,
    department?.code,
    department?.location_name,
  ].filter(Boolean).join(' ')
}

function WorkRequestFormActions({
  saving,
  saveMode,
  canSaveDraft,
  canSubmitAssets,
  onCancel,
  onSaveDraft,
  formId = 'wr-create-form',
  className = '',
}) {
  return (
    <div className={`wr-page__header-actions${className ? ` ${className}` : ''}`}>
      <div className="wr-page__bar-actions">
        <button
          type="button"
          className="company-btn company-btn--secondary wr-form__btn--ghost"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </button>
        <button
          type="button"
          className="company-btn company-btn--secondary wr-form__btn--draft"
          onClick={onSaveDraft}
          disabled={saving || !canSaveDraft}
        >
          {saving && saveMode === 'draft' ? 'Saving…' : 'Save as Draft'}
        </button>
      </div>
      <div className="wr-page__bar-actions">
        <button
          type="submit"
          form={formId}
          className="company-btn company-btn--primary"
          disabled={saving || !canSubmitAssets}
        >
          {saving && saveMode === 'submit' ? 'Submitting…' : 'Submit'}
        </button>
      </div>
    </div>
  )
}

export default function WorkRequestCreate() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const prefillEquipmentId = searchParams.get('equipment_id') || ''
  const { org } = useOrg()
  const { user } = useAuth()
  const { isOrgAdmin, session, canUpdate } = usePermissions()
  const { maxLength } = useTextFieldLimits()
  const { layout, catalogFields, isVisible, fieldClass, hasLayout } = useFormLayout('work_request.create')
  const extras = useFormFieldValues('work_request.create', null)
  const formActors = useMemo(() => resolveFormActors({
    formId: 'work_request.create',
    isOrgAdmin,
    profileId: user?.id,
    employeeId: session?.employee_id,
    isDepartmentHead: session?.is_department_head,
    employeeDepartmentId: session?.department_id,
    canApproveIncoming: canUpdate('work_request_approve') || canUpdate('work_request_incoming'),
    isCreate: true,
  }), [isOrgAdmin, user?.id, session?.employee_id, session?.is_department_head, session?.department_id, canUpdate])
  const showSection = (key) => !layout || layoutHasSection(layout, systemId(key))
  const [ctx, setCtx] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMode, setSaveMode] = useState(null)
  const [error, setError] = useState(null)

  const [requestType, setRequestType] = useState('inter_department')
  const [checklistOn, setChecklistOn] = useState(false)
  const [checklistId, setChecklistId] = useState('')
  const [orderFromId, setOrderFromId] = useState('')
  const [orderToId, setOrderToId] = useState('')
  const [catalogEquipment, setCatalogEquipment] = useState([])
  const [equipmentQuery, setEquipmentQuery] = useState('')
  const debouncedEquipmentQuery = useDebouncedValue(equipmentQuery.trim())
  const [equipmentLoading, setEquipmentLoading] = useState(false)
  const [equipmentEmpty, setEquipmentEmpty] = useState(false)
  const [assetFieldValues, setAssetFieldValues] = useState({})
  const [equipmentId, setEquipmentId] = useState(prefillEquipmentId)
  const [pinnedEquipment, setPinnedEquipment] = useState(null)
  const [shortDescription, setShortDescription] = useState('')
  const [problem, setProblem] = useState('')
  const [jobNature, setJobNature] = useState('')
  const [maintenanceFieldValues, setMaintenanceFieldValues] = useState({})
  const [priority, setPriority] = useState('medium')
  const [remarks, setRemarks] = useState('')
  const [attachmentFiles, setAttachmentFiles] = useState([])
  const attachmentFilesRef = useRef(attachmentFiles)
  attachmentFilesRef.current = attachmentFiles

  const assetSections = ctx?.asset_sections || []
  const maintenanceSchema = ctx?.maintenance_form_schema || { sections: [] }
  const jobNatureOptions = ctx?.job_natures || []
  const hasAssetFields = assetSections.some((s) => (s.fields || []).length > 0)
  const isBreakdown = String(jobNature || '').trim().toLowerCase() === 'breakdown'

  const effectiveLayout = useMemo(() => {
    const augmented = augmentLayoutWithEquipmentCatalog(layout, catalogFields)
    if (!augmented?.fields?.length) return augmented
    const hasAssetPicker = augmented.fields.some((field) => {
      const parsed = parseLayoutId(field.id)
      return parsed.kind === 'system' && parsed.value === 'asset_picker'
    })
    if (!hasAssetPicker) return augmented
    const catalogById = new Map((catalogFields || []).map((row) => [String(row.id), row]))
    return {
      ...augmented,
      fields: augmented.fields.filter((field) => {
        const parsed = parseLayoutId(field.id)
        if (parsed.kind === 'master' && parsed.value === 'areas') return false
        if (field.bindKey === 'area_id') return false
        if (parsed.kind === 'catalog') {
          const source = catalogById.get(String(parsed.value))
          if (getEquipmentFieldRole(source) === 'area') return false
        }
        const label = String(field.label || '').trim().toLowerCase()
        if (label === 'area' && parsed.kind !== 'system') return false
        return true
      }),
    }
  }, [layout, catalogFields])

  useEffect(() => {
    if (isBreakdown) return
    setMaintenanceFieldValues((prev) => clearBreakdownFieldValues(maintenanceSchema, prev))
  }, [isBreakdown, maintenanceSchema])

  useEffect(() => () => revokeWorkOrderFilePreviews(attachmentFilesRef.current), [])

  const goBack = useCallback(() => {
    if (org?.slug) {
      navigate(orgPath(org.slug, 'work-request/my'))
    }
  }, [navigate, org?.slug])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await getWorkRequestFormContext()
        if (cancelled) return
        setCtx(data)
        const fromId = data.order_from_department?.id || data.employee?.department_id || ''
        setOrderFromId(fromId)
        if (!prefillEquipmentId) {
          setOrderToId('')
          setRequestType('inter_department')
        }
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [prefillEquipmentId])

  const allDepartments = ctx?.departments || []
  const scopeLocationId = ctx?.employee?.location_id || null
  const orderFromSelectable = Boolean(ctx?.order_from_selectable)
  const orderFrom = ctx?.order_from_department

  const orderFromOptions = useMemo(() => {
    const list = (orderFromSelectable || !scopeLocationId)
      ? allDepartments
      : departmentsForEmployeeLocation(allDepartments, scopeLocationId)
    const selected = orderFrom?.id
      ? (list.find((department) => department.id === orderFrom.id) ? null : orderFrom)
      : null
    return selected ? [selected, ...list] : list
  }, [allDepartments, orderFrom, orderFromSelectable, scopeLocationId])

  const effectiveOrderFromId = orderFromId || orderFrom?.id
  const orderToLocationId = useMemo(() => {
    const fromDept = orderFromOptions.find((department) => department.id === effectiveOrderFromId)
      || allDepartments.find((department) => department.id === effectiveOrderFromId)
    if (fromDept?.all_locations) return scopeLocationId
    return fromDept?.location_id || scopeLocationId
  }, [allDepartments, effectiveOrderFromId, orderFromOptions, scopeLocationId])

  const departmentOptions = useMemo(() => {
    let list = !orderToLocationId
      ? allDepartments
      : departmentsForEmployeeLocation(allDepartments, orderToLocationId)
    if (isInterDepartmentRequestType(requestType) && effectiveOrderFromId) {
      list = list.filter((department) => department.id !== effectiveOrderFromId)
    }
    const pinnedDeptId = pinnedEquipment?.department_id
    if (
      pinnedDeptId
      && pinnedDeptId !== effectiveOrderFromId
      && !list.some((department) => department.id === pinnedDeptId)
    ) {
      const match = allDepartments.find((department) => department.id === pinnedDeptId)
      const extra = match || {
        id: pinnedDeptId,
        name: pinnedEquipment.departments?.name || 'Department',
        location_id: pinnedEquipment.location_id || null,
      }
      list = [extra, ...list]
    }
    return list
  }, [allDepartments, effectiveOrderFromId, orderToLocationId, pinnedEquipment, requestType])

  const layoutMasterValues = useMemo(() => {
    const next = {}
    for (const field of effectiveLayout?.fields || []) {
      if (!field?.id) continue
      const parsed = parseLayoutId(field.id)
      if (parsed.kind !== 'master' && parsed.kind !== 'field') continue
      if (extras.values[field.id] != null && extras.values[field.id] !== '') {
        next[field.id] = extras.values[field.id]
      }
      const bind = field.bindKey || ''
      const label = String(field.label || '')
      if ((bind === 'request_type' || /request\s*type/i.test(label)) && requestType) {
        next[field.id] = requestType
      }
      if (
        (bind === 'order_from_department_id' || /order\s*from/i.test(label))
        && effectiveOrderFromId
      ) {
        next[field.id] = effectiveOrderFromId
      }
      if ((bind === 'order_to_department_id' || /order\s*to/i.test(label)) && orderToId) {
        next[field.id] = orderToId
      }
      if ((bind === 'equipment_id' || isEquipmentMasterField(field)) && equipmentId) {
        next[field.id] = equipmentId
      }
      if (parsed.kind === 'master' && parsed.value === 'locations' && pinnedEquipment?.location_id) {
        next[field.id] = pinnedEquipment.location_id
      }
      if (parsed.kind === 'master' && parsed.value === 'areas' && pinnedEquipment?.area_id) {
        next[field.id] = pinnedEquipment.area_id
      }
    }
    return next
  }, [extras.values, effectiveLayout, requestType, effectiveOrderFromId, orderToId, equipmentId, pinnedEquipment])

  const effectiveOrderFromName = useMemo(() => {
    return orderFromOptions.find((d) => d.id === effectiveOrderFromId)?.name
      || orderFrom?.name
      || '—'
  }, [effectiveOrderFromId, orderFrom?.name, orderFromOptions])

  const useLayoutOptionRules = hasLayout && layoutHasOptionRules(effectiveLayout || layout)
  const lockOrderTo = !useLayoutOptionRules
    && isSameDepartmentRequestType(requestType)

  useEffect(() => {
    if (!ctx || !effectiveOrderFromId) return
    if (lockOrderTo) {
      setOrderToId(effectiveOrderFromId)
    }
  }, [ctx, lockOrderTo, effectiveOrderFromId, requestType])

  useEffect(() => {
    if (lockOrderTo || !orderToId || !departmentOptions.length) return
    if (pinnedEquipment?.department_id && orderToId === pinnedEquipment.department_id) return
    if (!departmentOptions.some((department) => department.id === orderToId)) {
      setOrderToId('')
    }
  }, [departmentOptions, lockOrderTo, orderToId, pinnedEquipment])

  useEffect(() => {
    if (!prefillEquipmentId) return undefined
    let cancelled = false
    getEquipment(prefillEquipmentId)
      .then((row) => {
        if (!cancelled && row) setPinnedEquipment(row)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [prefillEquipmentId])

  const equipmentOptions = useMemo(() => {
    if (!pinnedEquipment) return catalogEquipment
    const shaped = catalogRowFromEquipmentDetail(pinnedEquipment)
    if (catalogEquipment.some((row) => row.id === pinnedEquipment.id)) return catalogEquipment
    return shaped ? [shaped, ...catalogEquipment] : catalogEquipment
  }, [catalogEquipment, pinnedEquipment])

  useEffect(() => {
    if (!pinnedEquipment || !ctx) return
    const fromId = orderFromId || ctx.order_from_department?.id || ctx.employee?.department_id || ''
    const toId = pinnedEquipment.department_id || ''
    if (!toId) return
    if (fromId && toId === fromId) setRequestType('intra_department')
    setOrderToId((current) => current || toId)
    if (pinnedEquipment.id) {
      setEquipmentId((current) => current || pinnedEquipment.id)
    }
  }, [pinnedEquipment, ctx, orderFromId])

  useEffect(() => {
    if (!pinnedEquipment) return
    const fields = flattenAssetSections(assetSections)
    if (!fields.length) return
    const fromRow = fieldValuesFromEquipment(catalogRowFromEquipmentDetail(pinnedEquipment), fields)
    if (!Object.keys(fromRow).length) return
    setAssetFieldValues((prev) => {
      const next = { ...prev }
      let changed = false
      for (const [fieldId, value] of Object.entries(fromRow)) {
        if (next[fieldId] == null || next[fieldId] === '') {
          next[fieldId] = value
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [pinnedEquipment, assetSections])

  const previousOrderToId = useRef('')

  useEffect(() => {
    const previous = previousOrderToId.current
    previousOrderToId.current = orderToId
    if (!previous || previous === orderToId) {
      if (!orderToId) {
        setCatalogEquipment([])
        setEquipmentEmpty(false)
      }
      return
    }
    setAssetFieldValues({})
    setEquipmentQuery('')
    setEquipmentId('')
    setPinnedEquipment(null)
  }, [orderToId])

  useEffect(() => {
    if (!orderToId) return undefined

    let cancelled = false
    ;(async () => {
      setEquipmentLoading(true)
      try {
        const catalog = await getWorkRequestEquipmentCatalog(orderToId, {
          search: debouncedEquipmentQuery || undefined,
          limit: 50,
        })
        if (cancelled) return
        setCatalogEquipment(catalog.equipment || [])
        setEquipmentEmpty(!catalog.has_assets)
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setEquipmentLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [orderToId, debouncedEquipmentQuery])

  useEffect(() => {
    if (!hasLayout || !effectiveLayout) return undefined

    const layoutCatalogIds = new Set(
      (effectiveLayout.fields || [])
        .map((field) => {
          const parsed = parseLayoutId(field.id)
          return parsed.kind === 'catalog' ? parsed.value : null
        })
        .filter(Boolean),
    )
    const autoParents = equipmentCatalogParents(catalogFields)
    const hydrateParents = autoParents.length
      ? autoParents
      : (catalogFields || []).filter((item) => (
        item.kind === 'parent' && layoutCatalogIds.has(String(item.id))
      ))
    const autoIds = hydrateParents.map((row) => row.id)

    if (!equipmentId) {
      if (autoIds.length) {
        extras.setValues((prev) => {
          const next = { ...prev }
          let changed = false
          for (const id of autoIds) {
            if (next[id] != null && next[id] !== '') {
              delete next[id]
              changed = true
            }
          }
          return changed ? next : prev
        })
      }
      return undefined
    }

    let cancelled = false
    ;(async () => {
      let row = catalogEquipment.find((item) => item.id === equipmentId)
        || (pinnedEquipment?.id === equipmentId ? catalogRowFromEquipmentDetail(pinnedEquipment) : null)
      let valuesMap = equipmentValuesByFieldId(row)
      if (!Object.keys(valuesMap).length) {
        try {
          const detail = await getEquipment(equipmentId)
          if (cancelled || !detail) return
          valuesMap = equipmentValuesByFieldId(detail)
          row = {
            ...detail,
            values: valuesMap,
            name: detail.name,
            code: detail.code,
            area_id: detail.area_id,
          }
        } catch {
          return
        }
      } else if (row) {
        row = { ...row, values: valuesMap }
      }
      if (cancelled || !row) return

      const fromRow = fieldValuesFromEquipment(row, hydrateParents)
      if (Object.keys(fromRow).length) {
        extras.setValues((prev) => ({ ...prev, ...fromRow }))
      }
    })()

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate when equipment selection changes
  }, [hasLayout, effectiveLayout, equipmentId, catalogEquipment, catalogFields, pinnedEquipment])

  const assetRequired = shouldRequire(layout, systemId('asset_picker'), true)
  const hasPinnedEquipment = pinnedEquipment?.id && pinnedEquipment.id === equipmentId
  const canSubmitAssets = useMemo(() => {
    if (hasLayout && !assetRequired) return true
    if (!equipmentId) return false
    if (pinnedEquipment?.id === equipmentId) return true
    if (equipmentEmpty) return false
    return equipmentOptions.some((row) => row.id === equipmentId)
  }, [assetRequired, equipmentEmpty, equipmentId, equipmentOptions, hasLayout, pinnedEquipment])

  const canSaveDraft = hasLayout
    ? true
    : Boolean(orderToId && effectiveOrderFromId)

  const buildPayload = useCallback(
    (saveAs, attachments = []) => ({
      save_as: saveAs,
      request_type: requestType,
      order_from_department_id: effectiveOrderFromId || null,
      order_to_department_id: orderToId,
      equipment_id: equipmentId || null,
      short_description: shortDescription,
      problem_description: problem,
      job_nature: jobNature || null,
      is_breakdown: String(jobNature || '').trim().toLowerCase() === 'breakdown',
      priority,
      remarks,
      attachments,
      form_field_values: maintenanceFieldValues,
    }),
    [
      effectiveOrderFromId,
      equipmentId,
      jobNature,
      maintenanceFieldValues,
      orderToId,
      priority,
      problem,
      remarks,
      shortDescription,
      requestType,
    ],
  )

  const persist = useCallback(
    async (saveAs) => {
      const { native, extras: extraValues } = splitBoundValues(
        'work_request.create',
        extras.values,
        effectiveLayout || layout,
      )
      const fromId = effectiveOrderFromId || native.order_from_department_id || null
      const toId = orderToId || native.order_to_department_id || null
      if (saveAs === 'submit') {
        if (hasLayout) {
          const missing = missingRequiredLayoutValues(effectiveLayout || layout, {
            systemValues: {
              request_type: requestType,
              order_from_department_id: fromId,
              order_to_department_id: toId,
              asset_picker: equipmentId || native.equipment_id,
              short_description: shortDescription,
              problem_description: problem,
              job_nature: jobNature,
              priority,
              remarks,
              attachments: attachmentFiles,
              breakdown: isBreakdown ? maintenanceFieldValues : true,
            },
            masterValues: extras.values,
            catalogValues: extras.values,
          })
          if (missing.length) {
            setError(`Please fill in: ${missing.join(', ')}`)
            return
          }
          const groupErrors = validateRepeatableGroups(effectiveLayout || layout, extras.values, {
            actors: formActors,
          })
          if (groupErrors.length) {
            setError(groupErrors[0])
            return
          }
        } else {
          if (!shortDescription.trim()) {
            setError('Short description is required.')
            return
          }
          if (!problem.trim()) {
            setError('Problem description is required.')
            return
          }
          if (jobNatureOptions.length && !jobNature) {
            setError('Job nature is required.')
            return
          }
          if (!equipmentId) {
            setError('Select an asset / equipment before submitting.')
            return
          }
        }
        if (isInterDepartmentRequestType(requestType) && toId && fromId && toId === fromId) {
          setError('Inter-department requests must select a different Order To department.')
          return
        }
        const missingBreakdown = missingRequiredBreakdownFields(
          maintenanceSchema,
          isBreakdown,
          maintenanceFieldValues,
        )
        if ((!hasLayout || isVisible('breakdown')) && missingBreakdown.length) {
          setError(`Complete breakdown fields: ${missingBreakdown.join(', ')}`)
          return
        }
      }
      if (!hasLayout) {
        if (!orderToId) {
          setError('Select an Order to department before saving.')
          return
        }
        if (!effectiveOrderFromId) {
          setError('Select an Order from department before saving.')
          return
        }
      }
      setSaving(true)
      setSaveMode(saveAs)
      setError(null)
      try {
        const draftKey = createId()
        const uploaded = []
        for (const item of attachmentFiles) {
          const file = item?.file instanceof File ? item.file : item
          const meta = await uploadWorkOrderFile(
            org.id,
            `work-requests/${draftKey}`,
            'attachments',
            file,
            'file',
          )
          uploaded.push(meta)
        }
        const created = await createWorkRequest({
          ...buildPayload(saveAs, uploaded),
          equipment_id: equipmentId || native.equipment_id || null,
          order_from_department_id: fromId,
          order_to_department_id: toId,
          request_type: requestType || native.request_type || 'inter_department',
          checklist_template_id: checklistOn ? (checklistId || null) : null,
        })
        if (created?.id) {
          const uploadedExtras = await persistFormFileValues(org.id, created.id, extraValues, 'work-requests')
          await extras.save(created.id, uploadedExtras)
        }
        if (org?.slug) {
          const message = saveAs === 'draft'
            ? 'Work request saved as draft.'
            : 'Work request submitted successfully.'
          navigate(orgPath(org.slug, 'work-request/my'), { state: { success: message } })
        }
      } catch (err) {
        setError(err.message)
      } finally {
        setSaving(false)
        setSaveMode(null)
      }
    },
    [
      attachmentFiles,
      checklistId,
      checklistOn,
      buildPayload,
      effectiveOrderFromId,
      equipmentId,
      extras,
      formActors,
      hasLayout,
      isBreakdown,
      isVisible,
      jobNature,
      jobNatureOptions.length,
      layout,
      effectiveLayout,
      maintenanceFieldValues,
      maintenanceSchema,
      navigate,
      orderToId,
      org?.id,
      org?.slug,
      problem,
      requestType,
      shortDescription,
    ],
  )

  const handleSubmit = useCallback(
    (e) => {
      e.preventDefault()
      persist('submit')
    },
    [persist],
  )

  const handleSaveDraft = useCallback(() => {
    persist('draft')
  }, [persist])

  if (loading) {
    return <div className="company-loading">Loading...</div>
  }

  if (!ctx) {
    return <div className="wo-alert wo-alert--error">{error || 'Unable to load form.'}</div>
  }

  const renderWrField = (key, meta = {}) => {
    const className = meta.className || fieldClass(key)
    const required = Boolean(meta.required)
    if (key === 'request_type') {
      return (
        <label key={key} className={className}>
          <span className="company-form__label">Request type</span>
          <FilterableSelect
            value={requestType}
            onChange={(type) => {
              setRequestType(type)
              if (isSameDepartmentRequestType(type)) {
                setOrderToId(effectiveOrderFromId || '')
              } else {
                setOrderToId('')
              }
            }}
            options={ctx.request_types || []}
            getOptionValue={(t) => t.value}
            getOptionLabel={(t) => t.label}
            placeholder="Select type"
            required={required}
            allowEmpty={!required}
            className="company-form__input--select"
          />
        </label>
      )
    }
    if (key === 'order_from_department_id') {
      return (
        <label key={key} className={className}>
          <span className="company-form__label">Order from</span>
          <FilterableSelect
            value={orderFromId}
            onChange={(id) => {
              setOrderFromId(id)
              if (lockOrderTo) setOrderToId(id)
              else setOrderToId('')
            }}
            options={orderFromOptions}
            getOptionValue={(d) => d.id}
            getOptionLabel={(d) => d.name}
            getOptionSearchLabel={departmentSearchLabel}
            placeholder="Select Department"
            required={required}
            allowEmpty={!required}
            className="company-form__input--select"
          />
        </label>
      )
    }
    if (key === 'order_to_department_id') {
      return (
        <label key={key} className={className}>
          <span className="company-form__label">Order to</span>
          {lockOrderTo ? (
            <div className="wr-form__input-readonly">{effectiveOrderFromName}</div>
          ) : (
            <FilterableSelect
              value={orderToId}
              onChange={setOrderToId}
              options={departmentOptions}
              getOptionValue={(d) => d.id}
              getOptionLabel={(d) => d.name}
              getOptionSearchLabel={departmentSearchLabel}
              placeholder="Select Department"
              required={required}
              disabled={!effectiveOrderFromId}
              className="company-form__input--select"
            />
          )}
        </label>
      )
    }
    if (key === 'asset_picker') {
      return (
        <div key={key} className={`wr-asset-picker${className ? ` ${className}` : ''}`}>
          {equipmentLoading && (
            <p className="wo-manual__intro" style={{ marginTop: 0 }}>Loading assets…</p>
          )}
          {!equipmentLoading && equipmentEmpty && orderToId && !hasPinnedEquipment && (
            <div className="wo-alert wo-alert--error" role="alert">
              No assets are available for the selected department.
            </div>
          )}
          {!equipmentLoading && (!equipmentEmpty || hasPinnedEquipment) && hasAssetFields && (
            <WorkRequestAssetFields
              sections={assetSections}
              equipment={equipmentOptions}
              fieldValues={assetFieldValues}
              onFieldValuesChange={setAssetFieldValues}
              equipmentId={equipmentId}
              onEquipmentIdChange={setEquipmentId}
              seedAreaId={pinnedEquipment?.id === equipmentId ? (pinnedEquipment.area_id || '') : ''}
              loading={equipmentLoading}
              disabled={saving}
            />
          )}
          {!equipmentLoading && (!equipmentEmpty || hasPinnedEquipment) && !hasAssetFields && (
            <label className="company-form__field company-form__field--full">
              <span className="company-form__label">Equipment / asset</span>
              <FilterableSelect
                value={equipmentId}
                onChange={setEquipmentId}
                options={equipmentOptions}
                getOptionValue={(row) => row.id}
                getOptionLabel={formatEquipmentLabel}
                placeholder="Select asset"
                className="company-form__input--select"
                onQueryChange={setEquipmentQuery}
                required={required}
              />
            </label>
          )}
        </div>
      )
    }
    if (key === 'short_description') {
      return (
        <label key={key} className={className}>
          <FormLabel limit={maxLength('short_description')}>Short description</FormLabel>
          <SpellcheckInput
            className="company-form__input"
            value={shortDescription}
            onChange={(e) => setShortDescription(e.target.value)}
            placeholder="Brief summary shown in lists and tables"
            maxLength={maxLength('short_description')}
            required={required}
          />
        </label>
      )
    }
    if (key === 'problem_description') {
      return (
        <label key={key} className={className}>
          <FormLabel limit={maxLength('problem_description')}>Problem description</FormLabel>
          <SpellcheckInput
            multiline
            className="company-form__input company-form__textarea"
            rows={4}
            value={problem}
            onChange={(e) => setProblem(e.target.value)}
            placeholder="Describe the issue or maintenance need"
            maxLength={maxLength('problem_description')}
            required={required}
          />
        </label>
      )
    }
    if (key === 'job_nature') {
      return (
        <label key={key} className={className}>
          <span className="company-form__label">Job nature</span>
          <FilterableSelect
            value={jobNature}
            onChange={setJobNature}
            options={jobNatureOptions}
            getOptionValue={(option) => option.value}
            getOptionLabel={(option) => option.label}
            placeholder={jobNatureOptions.length ? 'Select job nature' : 'No job natures configured'}
            emptyLabel="Select job nature…"
            allowEmpty
            disabled={saving || !jobNatureOptions.length}
            className="company-form__input--select"
            required={required}
          />
        </label>
      )
    }
    if (key === 'priority') {
      return (
        <label key={key} className={className}>
          <span className="company-form__label">Priority</span>
          <FilterableSelect
            value={priority}
            onChange={setPriority}
            options={ctx.priorities || []}
            getOptionValue={(p) => p.value}
            getOptionLabel={(p) => p.label}
            placeholder="Select priority"
            allowEmpty={!required}
            className="company-form__input--select"
            required={required}
          />
        </label>
      )
    }
    if (key === 'attachments') {
      return (
        <WorkRequestAttachmentsField
          key={key}
          files={attachmentFiles}
          onChange={setAttachmentFiles}
          disabled={saving}
        />
      )
    }
    if (key === 'breakdown') {
      return (
        <WorkRequestBreakdownFields
          key={key}
          schema={maintenanceSchema}
          isBreakdown={isBreakdown}
          values={maintenanceFieldValues}
          onChange={setMaintenanceFieldValues}
          disabled={saving}
        />
      )
    }
    if (key === 'remarks') {
      return (
        <label key={key} className={className}>
          <FormLabel limit={maxLength('remarks')}>Remarks</FormLabel>
          <SpellcheckInput
            multiline
            className="company-form__input company-form__textarea"
            rows={3}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Optional additional notes"
            maxLength={maxLength('remarks')}
          />
        </label>
      )
    }
    return null
  }

  return (
    <>
      {error && <div className="wo-alert wo-alert--error" role="alert">{error}</div>}

      <WorkRequestFormActions
        saving={saving}
        saveMode={saveMode}
        canSaveDraft={canSaveDraft}
        canSubmitAssets={canSubmitAssets}
        onCancel={goBack}
        onSaveDraft={handleSaveDraft}
      />

      <form id="wr-create-form" className="wo-form wr-create-form" onSubmit={handleSubmit}>
          {hasLayout ? (
            <OrderedFormLayout
              formId="work_request.create"
              layout={effectiveLayout}
              catalogLookup={catalogFields}
              catalogValues={extras.values}
              onCatalogChange={extras.setFieldValue}
              masterValues={layoutMasterValues}
              onMasterChange={(id, value) => {
                extras.setFieldValue(id, value)
                const field = findLayoutField(effectiveLayout, id)
                if (field?.bindKey === 'order_from_department_id') setOrderFromId(value || '')
                if (field?.bindKey === 'order_to_department_id') setOrderToId(value || '')
                if (field?.bindKey === 'equipment_id' || isEquipmentMasterField(field)) {
                  setEquipmentId(value || '')
                }
                if (field?.bindKey === 'request_type') setRequestType(value || 'inter_department')
              }}
              disabled={saving}
              actors={formActors}
              renderField={renderWrField}
              renderSection={(id, children, section) => (
                <section key={id} className="wr-form-section" aria-labelledby={`${id}-title`}>
                  {section.label ? (
                    <header className="wr-form-section__head" id={`${id}-title`}>
                      <h3 className="wr-form-section__title">{section.label}</h3>
                      {section.badge}
                    </header>
                  ) : null}
                  <div className="wr-form-section__body">
                    <div className="company-form__grid company-form__grid--12">{children}</div>
                  </div>
                </section>
              )}
            />
          ) : (
          <>
          {showSection('wr_request') && (
          <section className="wo-section" aria-labelledby="wr-section-request">
            <WorkRequestSectionHead
              id="wr-section-request"
              title="Request information"
              description="Type and department routing"
            />
            <div className="wo-section__body">
              <div className="company-form__grid">
                {isVisible('request_type') && (
                <label className={fieldClass('request_type')}>
                  <span className="company-form__label">Request type</span>
                  <FilterableSelect
                    value={requestType}
                    onChange={(type) => {
                      setRequestType(type)
                      if (isSameDepartmentRequestType(type)) {
                        setOrderToId(effectiveOrderFromId || '')
                      } else {
                        setOrderToId('')
                      }
                    }}
                    options={ctx.request_types || []}
                    getOptionValue={(t) => t.value}
                    getOptionLabel={(t) => t.label}
                    placeholder="Select type"
                    required
                    allowEmpty={false}
                    className="company-form__input--select"
                  />
                </label>
                )}
                {isVisible('order_from_department_id') && (
                <label className={fieldClass('order_from_department_id')}>
                  <span className="company-form__label">Order from</span>
                  <FilterableSelect
                    value={orderFromId}
                    onChange={(id) => {
                      setOrderFromId(id)
                      if (lockOrderTo) setOrderToId(id)
                      else setOrderToId('')
                    }}
                    options={orderFromOptions}
                    getOptionValue={(d) => d.id}
                    getOptionLabel={(d) => d.name}
                    getOptionSearchLabel={departmentSearchLabel}
                    placeholder="Select Department"
                    required
                    allowEmpty={false}
                    className="company-form__input--select"
                  />
                </label>
                )}
                {isVisible('order_to_department_id') && (
                <label className={fieldClass('order_to_department_id')}>
                  <span className="company-form__label">Order to</span>
                  {lockOrderTo ? (
                    <div className="wr-form__input-readonly">{effectiveOrderFromName}</div>
                  ) : (
                    <FilterableSelect
                      value={orderToId}
                      onChange={setOrderToId}
                      options={departmentOptions}
                      getOptionValue={(d) => d.id}
                      getOptionLabel={(d) => d.name}
                      getOptionSearchLabel={departmentSearchLabel}
                      placeholder="Select Department"
                      required
                      disabled={!effectiveOrderFromId}
                      className="company-form__input--select"
                    />
                  )}
                </label>
                )}
              </div>
            </div>
          </section>
          )}

          {showSection('wr_asset') && (
          <section className="wo-section" aria-labelledby="wr-section-asset">
            <WorkRequestSectionHead
              id="wr-section-asset"
              title="Asset information"
            />
            <div className="wo-section__body">
              {equipmentLoading && (
                <p className="wo-manual__intro" style={{ marginTop: 0 }}>Loading assets…</p>
              )}
              {!equipmentLoading && equipmentEmpty && orderToId && !hasPinnedEquipment && (
                <div className="wo-alert wo-alert--error" role="alert">
                  No assets are available for the selected department.
                </div>
              )}
              {!equipmentLoading && (!equipmentEmpty || hasPinnedEquipment) && hasAssetFields && (
                <WorkRequestAssetFields
                  sections={assetSections}
                  equipment={equipmentOptions}
                  fieldValues={assetFieldValues}
                  onFieldValuesChange={setAssetFieldValues}
                  equipmentId={equipmentId}
                  onEquipmentIdChange={setEquipmentId}
                  seedAreaId={pinnedEquipment?.id === equipmentId ? (pinnedEquipment.area_id || '') : ''}
                  loading={equipmentLoading}
                  disabled={saving}
                />
              )}
              {!equipmentLoading && (!equipmentEmpty || hasPinnedEquipment) && !hasAssetFields && (
                <>
                  <label className="company-form__field company-form__field--full">
                    <span className="company-form__label">Equipment / asset</span>
                    <FilterableSelect
                      value={equipmentId}
                      onChange={setEquipmentId}
                      options={equipmentOptions}
                      getOptionValue={(row) => row.id}
                      getOptionLabel={formatEquipmentLabel}
                      placeholder="Select asset"
                      className="company-form__input--select"
                      onQueryChange={setEquipmentQuery}
                    />
                  </label>
                </>
              )}
            </div>
          </section>
          )}

          {showSection('wr_details') && (
          <section className="wo-section" aria-labelledby="wr-section-maintenance">
            <WorkRequestSectionHead
              id="wr-section-maintenance"
              title="Maintenance information"
              description="Short summary, problem details, priority, and notes"
            />
            <div className="wo-section__body">
              <div className="company-form__grid">
                {isVisible('short_description') && (
                <label className={fieldClass('short_description', 'company-form__field--full')}>
                  <FormLabel limit={maxLength('short_description')}>Short description</FormLabel>
                  <SpellcheckInput
                    className="company-form__input"
                    value={shortDescription}
                    onChange={(e) => setShortDescription(e.target.value)}
                    placeholder="Brief summary shown in lists and tables"
                    maxLength={maxLength('short_description')}
                  />
                </label>
                )}
                {isVisible('problem_description') && (
                <label className={fieldClass('problem_description', 'company-form__field--full')}>
                  <FormLabel limit={maxLength('problem_description')}>Problem description</FormLabel>
                  <SpellcheckInput
                    multiline
                    className="company-form__input company-form__textarea"
                    rows={4}
                    value={problem}
                    onChange={(e) => setProblem(e.target.value)}
                    placeholder="Describe the issue or maintenance need"
                    maxLength={maxLength('problem_description')}
                  />
                </label>
                )}
                <div className="wr-form__meta-row">
                  {isVisible('job_nature') && (
                  <label className={fieldClass('job_nature')}>
                    <span className="company-form__label">Job nature</span>
                    <FilterableSelect
                      value={jobNature}
                      onChange={setJobNature}
                      options={jobNatureOptions}
                      getOptionValue={(option) => option.value}
                      getOptionLabel={(option) => option.label}
                      placeholder={jobNatureOptions.length ? 'Select job nature' : 'No job natures configured'}
                      emptyLabel="Select job nature…"
                      allowEmpty
                      disabled={saving || !jobNatureOptions.length}
                      className="company-form__input--select"
                    />
                  </label>
                  )}
                  {isVisible('priority') && (
                  <label className={fieldClass('priority')}>
                    <span className="company-form__label">Priority</span>
                    <FilterableSelect
                      value={priority}
                      onChange={setPriority}
                      options={ctx.priorities || []}
                      getOptionValue={(p) => p.value}
                      getOptionLabel={(p) => p.label}
                      placeholder="Select priority"
                      allowEmpty={false}
                      className="company-form__input--select"
                    />
                  </label>
                  )}
                  {showSection('wr_attachments') && isVisible('attachments') && (
                  <WorkRequestAttachmentsField
                    files={attachmentFiles}
                    onChange={setAttachmentFiles}
                    disabled={saving}
                  />
                  )}
                </div>
                {showSection('wr_breakdown') && (
                <WorkRequestBreakdownFields
                  schema={maintenanceSchema}
                  isBreakdown={isBreakdown}
                  values={maintenanceFieldValues}
                  onChange={setMaintenanceFieldValues}
                  disabled={saving}
                />
                )}
                {isVisible('remarks') && (
                <label className={fieldClass('remarks', 'company-form__field--full')}>
                  <FormLabel limit={maxLength('remarks')}>Remarks</FormLabel>
                  <SpellcheckInput
                    multiline
                    className="company-form__input company-form__textarea"
                    rows={3}
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="Optional additional notes"
                    maxLength={maxLength('remarks')}
                  />
                </label>
                )}
              </div>
            </div>
          </section>
          )}
          </>
          )}
          <ChecklistOptIn
            formId="work_request.create"
            moduleKey="work_request"
            enabled={checklistOn}
            onEnabledChange={setChecklistOn}
            templateId={checklistId}
            onTemplateChange={setChecklistId}
            disabled={saving}
          />
          <WorkRequestFormActions
            saving={saving}
            saveMode={saveMode}
            canSaveDraft={canSaveDraft}
            canSubmitAssets={canSubmitAssets}
            onCancel={goBack}
            onSaveDraft={handleSaveDraft}
            className="wr-form__actions--in-form"
          />
        </form>
    </>
  )
}
