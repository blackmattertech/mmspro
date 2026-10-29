import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useOrg } from '../../hooks/useOrg'
import { useAuth } from '../../hooks/useAuth'
import { useManualWorkOrderForm } from '../../hooks/useManualWorkOrderForm'
import { useWorkOrderToolbar } from '../../hooks/useWorkOrderToolbar'
import { usePermissions } from '../../hooks/usePermissions'
import { orgPath } from '../../config/navigation'
import { notifyTabCountsChanged } from '../../lib/tabCountEvents'
import WorkOrderForm from '../../components/workorders/WorkOrderForm'
import WorkOrderOrderToField from '../../components/workorders/WorkOrderOrderToField'
import WorkOrderAssetPicker from '../../components/workorders/WorkOrderAssetPicker'
import WorkOrderFieldSettingsModal from '../../components/workorders/WorkOrderFieldSettingsModal'
import PageBack from '../../components/shared/PageBack'
import OrderedFormLayout from '../../components/forms/OrderedFormLayout'
import ChecklistOptIn from '../../components/forms/ChecklistOptIn'
import {
  augmentLayoutWithEquipmentCatalog,
  catalogRowFromEquipmentDetail,
  equipmentCatalogParents,
  equipmentValuesByFieldId,
  isEquipmentMasterField,
} from '../../lib/equipmentLayoutFields'
import { layoutWithoutAreasMaster, parseLayoutId } from '../../lib/formLayoutIds'
import { layoutOmittingStages } from '../../lib/workOrderForms'
import { fieldValuesFromEquipment } from '../../lib/workRequestAssetPicker'
import { getEquipment } from '../../lib/api-equipment'
import { useFormLayout } from '../../hooks/useFormLayout'
import { useFormFieldValues } from '../../hooks/useFormFieldValues'
import { resolveFormActors, validateRepeatableGroups } from '../../lib/formFillership'

const ASSET_PICKER_KEYS = new Set(['asset_picker', 'area_id', 'equipment_id'])

function isAssetPickerLayoutField(field) {
  if (!field) return false
  if (isEquipmentMasterField(field)) return true
  const parsed = parseLayoutId(field.id)
  if (parsed.kind === 'system' && ASSET_PICKER_KEYS.has(parsed.value)) return true
  if (field.masterSource === 'areas' || field.masterSource === 'equipment') return true
  if (field.bindKey === 'area_id' || field.bindKey === 'equipment_id') return true
  return false
}

function isEquipmentCatalogLayoutField(field, catalogById) {
  if (isAssetPickerLayoutField(field)) return true
  const parsed = parseLayoutId(field?.id)
  if (parsed.kind !== 'catalog') return false
  const source = catalogById.get(String(parsed.value))
  return source?.field_source === 'equipment'
}

const ORDER_TO_SYSTEM_KEYS = new Set([
  'assignment',
  'order_to_department_id',
  'assigned_department_id',
])

function isOrderToLayoutField(field) {
  if (!field) return false
  const parsed = parseLayoutId(field.id)
  if (parsed.kind === 'system' && ORDER_TO_SYSTEM_KEYS.has(parsed.value)) return true
  if (field.bindKey === 'order_to_department_id' || field.bindKey === 'assigned_department_id') return true
  return /order\s*to/i.test(String(field.label || ''))
}

function isWoAssetLayoutSection(sectionId, section, sourceLayout, catalogFields) {
  if (/asset/i.test(String(section?.label || ''))) return true
  const catalogById = new Map((catalogFields || []).map((row) => [String(row.id), row]))
  return (sourceLayout?.fields || []).some((field) => (
    field.sectionId === sectionId && isEquipmentCatalogLayoutField(field, catalogById)
  ))
}

function isHierarchySchemaField(field) {
  return field?.kind === 'parent' || field?.field_source === 'equipment'
}
import '../../components/company/CompanyShared.css'
import '../../components/workorders/ManualWorkOrder.css'
import '../../components/workorders/WorkOrdersPage.css'
import '../../components/workrequests/WorkRequests.css'

function WorkOrderSettingsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeMiterlimit="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2 12.8799V11.1199C2 10.0799 2.85 9.21994 3.9 9.21994C5.71 9.21994 6.45 7.93994 5.54 6.36994C5.02 5.46994 5.33 4.29994 6.24 3.77994L7.97 2.78994C8.76 2.31994 9.78 2.59994 10.25 3.38994L10.36 3.57994C11.26 5.14994 12.74 5.14994 13.65 3.57994L13.76 3.38994C14.23 2.59994 15.25 2.31994 16.04 2.78994L17.77 3.77994C18.68 4.29994 18.99 5.46994 18.47 6.36994C17.56 7.93994 18.3 9.21994 20.11 9.21994C21.15 9.21994 22.01 10.0699 22.01 11.1199V12.8799C22.01 13.9199 21.16 14.7799 20.11 14.7799C18.3 14.7799 17.56 16.0599 18.47 17.6299C18.99 18.5399 18.68 19.6999 17.77 20.2199L16.04 21.2099C15.25 21.6799 14.23 21.3999 13.76 20.6099L13.65 20.4199C12.75 18.8499 11.27 18.8499 10.36 20.4199L10.25 20.6099C9.78 21.3999 8.76 21.6799 7.97 21.2099L6.24 20.2199C5.33 19.6999 5.02 18.5299 5.54 17.6299C6.45 16.0599 5.71 14.7799 3.9 14.7799C2.85 14.7799 2 13.9199 2 12.8799Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeMiterlimit="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function ManualWorkOrderCreate() {
  const navigate = useNavigate()
  const { workOrderId } = useParams()
  const [searchParams] = useSearchParams()
  const initialEquipmentId = workOrderId ? '' : (searchParams.get('equipment_id') || '')
  const isEdit = Boolean(workOrderId)
  const { org, loading: orgLoading } = useOrg()
  const { setToolbar, clearToolbar } = useWorkOrderToolbar()
  const { canCreate, canUpdate, isOrgAdmin, session } = usePermissions()
  const { user } = useAuth()
  const canManage = canUpdate('work_orders_manual') || canUpdate('work_orders')
  const canCreateWorkOrders = canCreate('work_orders_manual') || canCreate('work_orders')
  const canEditWorkOrders = canUpdate('work_orders_manual') || canUpdate('work_orders')
  const canUseForm = isEdit ? canEditWorkOrders : canCreateWorkOrders
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [checklistOn, setChecklistOn] = useState(false)
  const [checklistId, setChecklistId] = useState('')
  const [settingsLoading, setSettingsLoading] = useState(false)

  const {
    schema,
    settings,
    values,
    assignedEmployeeIds,
    assignedDepartmentId,
    assignedDepartment,
    linkedEquipment,
    setDepartmentTarget,
    existingStatus,
    loading,
    saving,
    error,
    setFieldValue,
    resetValues,
    loadSettings,
    saveSettings,
    submit,
  } = useManualWorkOrderForm({
    workOrderId: workOrderId || null,
    initialEquipmentId,
  })
  const { layout, hasLayout, catalogFields } = useFormLayout('work_orders.manual')
  const extras = useFormFieldValues('work_orders.manual', workOrderId || null)
  const [equipmentId, setEquipmentId] = useState(initialEquipmentId || '')
  const [assetFieldValues, setAssetFieldValues] = useState({})
  const seededEquipmentRef = useRef(false)
  const extrasRef = useRef(extras)
  extrasRef.current = extras

  const effectiveLayout = useMemo(() => {
    const createLayout = layoutOmittingStages(layout, ['assignment', 'execution', 'closeout'])
    const augmented = layoutWithoutAreasMaster(augmentLayoutWithEquipmentCatalog(createLayout, catalogFields))
    if (!augmented?.fields?.length) return augmented
    const catalogById = new Map((catalogFields || []).map((row) => [String(row.id), row]))
    const hasAssetFields = augmented.fields.some((field) => isEquipmentCatalogLayoutField(field, catalogById))
    if (!hasAssetFields) return augmented
    return {
      ...augmented,
      fields: augmented.fields.filter((field) => {
        const parsed = parseLayoutId(field.id)
        if (parsed.kind !== 'catalog') return true
        const source = catalogById.get(String(parsed.value))
        return source?.field_source !== 'equipment'
      }),
    }
  }, [layout, catalogFields])

  const layoutHasOrderTo = useMemo(
    () => (effectiveLayout?.fields || []).some((field) => isOrderToLayoutField(field)),
    [effectiveLayout],
  )
  const showOrderToFallback = !hasLayout
  const layoutHasAssetSection = useMemo(() => {
    if (!layout) return false
    if ((layout.sections || []).some((section) => /asset/i.test(String(section.label || '')))) {
      return true
    }
    const catalogById = new Map((catalogFields || []).map((row) => [String(row.id), row]))
    return (layout.fields || []).some((field) => isEquipmentCatalogLayoutField(field, catalogById))
  }, [layout, catalogFields])

  const catalogById = useMemo(
    () => new Map((catalogFields || []).map((row) => [String(row.id), row])),
    [catalogFields],
  )

  const displaySchema = useMemo(() => {
    if (!schema?.sections) return schema
    return {
      ...schema,
      sections: schema.sections
        .map((section) => ({
          ...section,
          fields: (section.fields || []).filter((field) => !isHierarchySchemaField(field)),
        }))
        .filter((section) => (section.fields || []).length > 0),
    }
  }, [schema])

  const handleEquipmentIdChange = useCallback((id) => {
    const next = id || ''
    setEquipmentId(next)
    const field = (layout?.fields || []).find(isEquipmentMasterField)
    if (field) extrasRef.current.setFieldValue(field.id, next)
  }, [layout])

  useEffect(() => {
    if (seededEquipmentRef.current) return
    const field = (layout?.fields || []).find(isEquipmentMasterField)
    const fromExtras = field ? extras.values?.[field.id] : ''
    const next = fromExtras || linkedEquipment?.id || initialEquipmentId || ''
    if (!next) return
    seededEquipmentRef.current = true
    setEquipmentId(next)
  }, [layout, extras.values, linkedEquipment, initialEquipmentId])

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
        item.kind === 'parent'
        && (layoutCatalogIds.has(String(item.id)) || item.field_source === 'equipment')
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
      let detail = linkedEquipment?.id === equipmentId ? linkedEquipment : null
      try {
        if (!detail) detail = await getEquipment(equipmentId)
      } catch {
        return
      }
      if (cancelled || !detail) return
      const row = catalogRowFromEquipmentDetail(detail)
      const valuesMap = equipmentValuesByFieldId(row || detail)
      const fromRow = fieldValuesFromEquipment(
        { ...(row || detail), values: valuesMap },
        hydrateParents,
      )
      if (Object.keys(fromRow).length) {
        extras.setValues((prev) => ({ ...prev, ...fromRow }))
      }
    })()

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate when equipment selection changes
  }, [hasLayout, effectiveLayout, equipmentId, catalogFields, linkedEquipment])

  useEffect(() => {
    if (showOrderToFallback || layoutHasOrderTo || assignedDepartmentId) return
    const departmentId = linkedEquipment?.department_id || session?.department_id
    if (!departmentId) return
    setDepartmentTarget({
      departmentId,
      locationId: linkedEquipment?.location_id || session?.location_id || null,
      department: linkedEquipment?.departments || null,
    })
  }, [
    assignedDepartmentId,
    layoutHasOrderTo,
    linkedEquipment,
    session?.department_id,
    session?.location_id,
    setDepartmentTarget,
    showOrderToFallback,
  ])

  const formActors = useMemo(() => resolveFormActors({
    formId: 'work_orders.manual',
    isOrgAdmin,
    profileId: user?.id,
    employeeId: session?.employee_id,
    isDepartmentHead: session?.is_department_head,
    employeeDepartmentId: session?.department_id,
    canApproveIncoming: canUpdate('work_request_approve') || canUpdate('work_request_incoming'),
    isCreate: !isEdit,
    record: isEdit ? {
      created_by: values?.created_by,
      assignees: (assignedEmployeeIds || []).map((id) => ({ id })),
    } : null,
  }), [
    isOrgAdmin,
    user?.id,
    session?.employee_id,
    session?.is_department_head,
    session?.department_id,
    canUpdate,
    isEdit,
    values?.created_by,
    assignedEmployeeIds,
  ])

  const goBack = useCallback(() => {
    if (org?.slug) {
      navigate(orgPath(org.slug, 'work-orders/manual'))
    }
  }, [navigate, org?.slug])

  const openSettings = useCallback(async () => {
    setSettingsOpen(true)
    setSettingsLoading(true)
    try {
      await loadSettings()
    } finally {
      setSettingsLoading(false)
    }
  }, [loadSettings])

  const handleSubmit = useCallback(async (status) => {
    try {
      if (hasLayout) {
        const groupErrors = validateRepeatableGroups(layout, extras.values, { actors: formActors })
        if (groupErrors.length) {
          throw new Error(groupErrors[0])
        }
      }
      const saved = await submit(status, {
        checklistTemplateId: checklistOn ? checklistId : null,
        equipmentId: equipmentId || null,
        requireAssignedDepartment: showOrderToFallback || layoutHasOrderTo,
      })
      if (saved?.id) await extras.save(saved.id, extras.values)
      notifyTabCountsChanged('work_orders')
      if (org?.slug) {
        navigate(orgPath(org.slug, 'work-orders/manual'), {
          state: {
            success: isEdit
              ? (status === 'created' ? 'Work order updated successfully.' : 'Draft updated successfully.')
              : (status === 'created' ? 'Work order created successfully.' : 'Draft saved successfully.'),
          },
        })
      }
    } catch {
      // Error is surfaced by the form hook
    }
  }, [equipmentId, checklistId, checklistOn, extras, navigate, org?.slug, submit, isEdit, hasLayout, layout, formActors, showOrderToFallback, layoutHasOrderTo])

  const handleReset = useCallback(() => {
    resetValues()
    setEquipmentId('')
    setAssetFieldValues({})
    seededEquipmentRef.current = false
    extrasRef.current.setValues({})
  }, [resetValues])

  const toolbarActionsRef = useRef({ goBack, openSettings, handleSubmit, resetValues: handleReset })
  toolbarActionsRef.current = { goBack, openSettings, handleSubmit, resetValues: handleReset }

  useEffect(() => {
    setToolbar({
      back: (
        <PageBack onClick={() => toolbarActionsRef.current.goBack()} className="page-back--inline" />
      ),
      tools: canManage ? (
        <button
          type="button"
          className="wo-page__settings-btn"
          onClick={() => toolbarActionsRef.current.openSettings()}
          aria-label="Form field settings"
          title="Form field settings"
        >
          <WorkOrderSettingsIcon />
        </button>
      ) : null,
      actions: (
        <>
          {!isEdit && (
            <button
              type="button"
              className="company-btn company-btn--secondary"
              onClick={() => toolbarActionsRef.current.resetValues()}
              disabled={saving}
            >
              Reset
            </button>
          )}
          <button
            type="button"
            className="company-btn company-btn--secondary"
            onClick={() => toolbarActionsRef.current.handleSubmit('draft')}
            disabled={saving || !canUseForm}
          >
            {saving ? 'Saving...' : isEdit ? 'Save Draft' : 'Save as Draft'}
          </button>
          {canUseForm && (
            <button
              type="button"
              className="company-btn company-btn--primary wo-command__create"
              onClick={() => toolbarActionsRef.current.handleSubmit('created')}
              disabled={saving}
            >
              {!isEdit && <span className="wo-command__plus" aria-hidden="true">+</span>}
              {saving
                ? (isEdit ? 'Saving...' : 'Creating...')
                : (isEdit
                  ? (existingStatus === 'created' ? 'Save Changes' : 'Create Work Order')
                  : 'Create Work Order')}
            </button>
          )}
        </>
      ),
    })
    return clearToolbar
  }, [
    canManage,
    canUseForm,
    clearToolbar,
    existingStatus,
    isEdit,
    saving,
    setToolbar,
  ])

  if (orgLoading || loading) {
    return <div className="company-loading">Loading...</div>
  }

  if (!canUseForm) {
    return (
      <div className="company-empty">
        {isEdit
          ? 'You do not have permission to edit work orders.'
          : 'You do not have permission to create work orders.'}
      </div>
    )
  }

  let assetPickerShown = false
  const assetPicker = (
    <WorkOrderAssetPicker
      departmentId={assignedDepartmentId || ''}
      requireDepartment={showOrderToFallback || layoutHasOrderTo}
      equipmentId={equipmentId}
      onEquipmentIdChange={handleEquipmentIdChange}
      fieldValues={assetFieldValues}
      onFieldValuesChange={setAssetFieldValues}
      disabled={saving}
    />
  )

  return (
    <>
      {error && <div className="wo-alert wo-alert--error" role="alert">{error}</div>}

      {linkedEquipment && (
        <div className="wo-linked-equipment">
          <strong>{linkedEquipment.name || 'Asset'}</strong>
          <p>
            {[
              linkedEquipment.code,
              linkedEquipment.org_locations?.name,
              linkedEquipment.departments?.name,
              linkedEquipment.areas?.name,
            ].filter(Boolean).join(' · ') || 'Asset details will be saved with this work order.'}
          </p>
        </div>
      )}

      <div className="wo-form wr-create-form">
      {showOrderToFallback && (
        <WorkOrderOrderToField
          value={assignedDepartmentId}
          selected={assignedDepartment}
          onChange={setDepartmentTarget}
          disabled={saving}
        />
      )}

      {hasLayout && (
        <OrderedFormLayout
          formId="work_orders.manual"
          layout={effectiveLayout}
          catalogLookup={catalogFields}
          catalogValues={extras.values}
          onCatalogChange={extras.setFieldValue}
          masterValues={extras.values}
          onMasterChange={extras.setFieldValue}
          disabled={saving}
          actors={formActors}
          currentEmployeeId={!isEdit ? (session?.employee_id || null) : null}
          renderField={(key, props = {}) => {
            if (!ORDER_TO_SYSTEM_KEYS.has(key)) return null
            return (
              <WorkOrderOrderToField
                key={key}
                embedded
                className={props.className}
                value={assignedDepartmentId}
                selected={assignedDepartment}
                onChange={setDepartmentTarget}
                disabled={saving}
              />
            )
          }}
          omitField={(item) => isEquipmentCatalogLayoutField(item, catalogById)}
          renderSection={(id, children, section) => {
            const rest = (children || []).filter(Boolean)
            const showAssetPicker = !assetPickerShown && isWoAssetLayoutSection(
              id,
              section,
              layout,
              catalogFields,
            )
            if (showAssetPicker) assetPickerShown = true
            if (!rest.length && !showAssetPicker) return null
            return (
            <section key={id} className="wr-form-section" aria-labelledby={`${id}-title`}>
              {section.label ? (
                <header className="wr-form-section__head" id={`${id}-title`}>
                  <h3 className="wr-form-section__title">{section.label}</h3>
                  {section.badge}
                </header>
              ) : null}
              <div className="wr-form-section__body">
                {showAssetPicker ? (
                  <div className="wr-asset-picker">{assetPicker}</div>
                ) : null}
                {rest.length > 0 && (
                  <div className="company-form__grid company-form__grid--12">{rest}</div>
                )}
              </div>
            </section>
            )
          }}
        />
      )}

      {(!hasLayout || !layoutHasAssetSection) && (
        <section className="wr-form-section" aria-labelledby="wo-asset-title">
          <header className="wr-form-section__head" id="wo-asset-title">
            <h3 className="wr-form-section__title">Asset Information</h3>
          </header>
          <div className="wr-form-section__body">
            <div className="wr-asset-picker">{assetPicker}</div>
          </div>
        </section>
      )}

      {!hasLayout && (
        <WorkOrderForm
          schema={displaySchema}
          values={values}
          onChange={setFieldValue}
          disabled={saving}
        />
      )}

      {!isEdit && (
        <ChecklistOptIn
          formId="work_orders.manual"
          moduleKey="work_order"
          enabled={checklistOn}
          onEnabledChange={setChecklistOn}
          templateId={checklistId}
          onTemplateChange={setChecklistId}
          disabled={saving}
        />
      )}
      </div>

      {settingsOpen && (
        <WorkOrderFieldSettingsModal
          settings={settings}
          loading={settingsLoading}
          saving={saving}
          onClose={() => setSettingsOpen(false)}
          onSave={saveSettings}
        />
      )}
    </>
  )
}
