import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useOrg } from '../../hooks/useOrg'
import { usePermissions } from '../../hooks/usePermissions'
import { useAuth } from '../../hooks/useAuth'
import { useTextFieldLimits } from '../../hooks/useTextFieldLimits'
import { orgPath } from '../../config/navigation'
import {
  getWorkRequestFormContext,
  createWorkRequest,
} from '../../lib/api-work-requests'
import { notifyTabCountsChanged } from '../../lib/tabCountEvents'
import WorkRequestSectionHead from '../../components/workrequests/WorkRequestSectionHead'
import WorkRequestBreakdownFields from '../../components/workrequests/WorkRequestBreakdownFields'
import WorkRequestAttachmentsField from '../../components/workrequests/WorkRequestAttachmentsField'
import FilterableSelect from '../../components/ui/FilterableSelect'
import SpellcheckInput from '../../components/shared/SpellcheckInput'
import FormLabel from '../../components/shared/FormLabel'
import { firstCharacterLimitMessage } from '../../lib/textFieldLimits'
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
import AssetPickerField from '../../components/forms/AssetPickerField'
import ChecklistOptIn from '../../components/forms/ChecklistOptIn'
import { findLayoutField, layoutHasSection, shouldRequire, systemId, parseLayoutId } from '../../lib/formLayoutIds'
import { missingRequiredLayoutValues, splitBoundValues } from '../../lib/formFieldSources'
import { readFieldValue } from '../../lib/manualWorkOrderWizard'
import { layoutHasOptionRules, isInterDepartmentRequestType, isSameDepartmentRequestType } from '../../lib/formOptionRules'
import { REQUEST_TYPE_OPTIONS } from '../../lib/systemFieldFallback'
import { layoutRequiresChecklist } from '../../lib/formSkips'
import { resolveFormActors, validateRepeatableGroups } from '../../lib/formFillership'
import { isEquipmentMasterField } from '../../lib/equipmentLayoutFields'
import { getEquipment } from '../../lib/api-equipment'

function selectedLayoutPriority(layout, values, fallback) {
  for (const field of layout?.fields || []) {
    const parsed = parseLayoutId(field?.id)
    const key = field?.bindKey || (parsed.kind === 'system' ? parsed.value : '')
    const label = String(field?.label || '').toLowerCase().replace(/[^a-z0-9]+/g, '')
    if (key !== 'priority' && label !== 'priority' && label !== 'jobpriority') continue
    const text = String(values?.[field.id] ?? '').trim().toLowerCase()
    if (text === 'high' || text === 'medium' || text === 'low') return text
  }
  return fallback
}

function routingFieldValues(layout, { requestType, orderFromId, orderToId }) {
  const patch = {}
  for (const field of layout?.fields || []) {
    if (!field?.id) continue
    const parsed = parseLayoutId(field.id)
    const key = field.bindKey || (parsed.kind === 'system' ? parsed.value : '')
    const label = String(field.label || '')
    if ((key === 'request_type' || /request\s*type/i.test(label)) && requestType) {
      patch[field.id] = requestType
    }
    if ((key === 'order_from_department_id' || /order\s*from/i.test(label)) && orderFromId) {
      patch[field.id] = orderFromId
    }
    if ((key === 'order_to_department_id' || /order\s*to/i.test(label)) && orderToId) {
      patch[field.id] = orderToId
    }
  }
  return patch
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
    <div className={`wr-page__header-actions wr-form__actions${className ? ` ${className}` : ''}`}>
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
      <button
        type="submit"
        form={formId}
        className="company-btn company-btn--primary"
        disabled={saving || !canSubmitAssets}
      >
        {saving && saveMode === 'submit' ? 'Submitting…' : 'Submit'}
      </button>
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
  const { layout, catalogFields, isVisible, fieldClass, hasLayout } = useFormLayout('work_request.create', {
    fallbackToDefault: true,
  })
  const checklistRequired = layoutRequiresChecklist(layout)
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

  const maintenanceSchema = ctx?.maintenance_form_schema || { sections: [] }
  const jobNatureOptions = ctx?.job_natures || []
  const isBreakdown = String(jobNature || '').trim().toLowerCase() === 'breakdown'
  // useFormLayout already runs normalizeAssetLayout
  const effectiveLayout = layout

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

  const previousOrderToId = useRef('')

  useEffect(() => {
    const previous = previousOrderToId.current
    previousOrderToId.current = orderToId
    if (!previous || previous === orderToId) return
    setAssetFieldValues({})
    setEquipmentId('')
    setPinnedEquipment(null)
  }, [orderToId])

  const assetRequired = shouldRequire(effectiveLayout || layout, systemId('asset_picker'), true)
  const canSubmitAssets = useMemo(() => {
    if (hasLayout && !assetRequired) return true
    return Boolean(equipmentId)
  }, [assetRequired, equipmentId, hasLayout])

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
        if (checklistRequired && !checklistId) {
          setError('Select a checklist.')
          return
        }
        const limitError = firstCharacterLimitMessage([
          { key: 'short_description', label: 'Short description', value: shortDescription },
          { key: 'problem_description', label: 'Detailed description', value: problem },
          { key: 'remarks', label: 'Remark', value: remarks },
        ], maxLength)
        if (limitError) {
          setError(limitError)
          return
        }
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
            setError('Select an asset before submitting.')
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
        const formLayout = effectiveLayout || layout
        const layoutShort = String(readFieldValue(formLayout, extras.values, [
          'short_description',
          'shortdescription',
        ]) || '').trim()
        const layoutProblem = String(readFieldValue(formLayout, extras.values, [
          'problem_description',
          'detaileddescription',
          'problemdetaileddescription',
        ]) || '').trim()
        const created = await createWorkRequest({
          ...buildPayload(saveAs, uploaded),
          short_description: String(shortDescription || layoutShort).trim(),
          problem_description: String(problem || layoutProblem).trim(),
          priority: selectedLayoutPriority(formLayout, extras.values, priority),
          equipment_id: equipmentId || native.equipment_id || null,
          order_from_department_id: fromId,
          order_to_department_id: toId,
          request_type: requestType || native.request_type || 'inter_department',
          checklist_template_id: (checklistRequired || checklistOn) ? (checklistId || null) : null,
        })
        if (created?.id) {
          const uploadedExtras = await persistFormFileValues(org.id, created.id, extraValues, 'work-requests')
          await extras.save(created.id, {
            ...uploadedExtras,
            ...routingFieldValues(effectiveLayout || layout, {
              requestType: requestType || native.request_type,
              orderFromId: fromId,
              orderToId: toId,
            }),
          })
        }
        if (org?.slug) {
          const message = saveAs === 'draft'
            ? 'Work request saved as draft.'
            : 'Work request submitted successfully.'
          notifyTabCountsChanged('work_requests')
          const segment = saveAs === 'draft' ? 'work-request/drafts' : 'work-request/my'
          navigate(orgPath(org.slug, segment), { state: { success: message } })
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
      checklistRequired,
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
      maxLength,
      navigate,
      orderToId,
      org?.id,
      org?.slug,
      priority,
      problem,
      remarks,
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

  const mountAssetPicker = ({ className = '', required = false, field } = {}) => (
    <AssetPickerField
      key={field?.id || 'asset_picker'}
      className={className}
      departmentId={orderToId}
      requireDepartment
      catalogSource="work_request"
      searchEnabled
      equipmentId={equipmentId}
      onEquipmentIdChange={setEquipmentId}
      fieldValues={assetFieldValues}
      onFieldValuesChange={setAssetFieldValues}
      disabled={saving}
      required={required}
      emptyDepartmentMessage="Select Order to to see assets for that department."
    />
  )

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
            options={REQUEST_TYPE_OPTIONS}
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
    if (key === 'asset_picker' || key === 'area_id' || key === 'equipment_id') {
      return mountAssetPicker({ className, required, field: meta.field })
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
          <p className="company-form__hint">
            One-line summary used in work request lists, tables, and notifications.
          </p>
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
          <p className="company-form__hint">
            Full details for reviewers and technicians: symptoms, impact, and any safety notes.
          </p>
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
              currentEmployeeId={session?.employee_id || null}
              renderField={renderWrField}
              assetPicker={({ className, field, required }) => (
                mountAssetPicker({ className, required: Boolean(required), field })
              )}
              renderSection={(id, children, section) => {
                const nodes = (children || []).filter(Boolean)
                if (!nodes.length) return null
                return (
                  <section key={id} className="wr-form-section" aria-labelledby={`${id}-title`}>
                    {section.label ? (
                      <header className="wr-form-section__head" id={`${id}-title`}>
                        <h3 className="wr-form-section__title">{section.label}</h3>
                        {section.badge}
                      </header>
                    ) : null}
                    <div className="wr-form-section__body">
                      <div className="company-form__grid company-form__grid--12">{nodes}</div>
                    </div>
                  </section>
                )
              }}
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
                    options={REQUEST_TYPE_OPTIONS}
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
              {mountAssetPicker({ required: true })}
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
                  <p className="company-form__hint">
                    One-line summary used in work request lists, tables, and notifications.
                  </p>
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
                  <p className="company-form__hint">
                    Full details for reviewers and technicians: symptoms, impact, and any safety notes.
                  </p>
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
            required={checklistRequired}
            enabled={checklistRequired || checklistOn}
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
