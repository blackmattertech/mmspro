import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useOrg } from '../../hooks/useOrg'
import { useAuth } from '../../hooks/useAuth'
import { useManualWorkOrderForm } from '../../hooks/useManualWorkOrderForm'
import { useWorkOrderToolbar } from '../../hooks/useWorkOrderToolbar'
import { usePermissions } from '../../hooks/usePermissions'
import { orgPath } from '../../config/navigation'
import WorkOrderForm from '../../components/workorders/WorkOrderForm'
import WorkOrderAssignmentCard from '../../components/workorders/WorkOrderAssignmentCard'
import WorkOrderFieldSettingsModal from '../../components/workorders/WorkOrderFieldSettingsModal'
import PageBack from '../../components/shared/PageBack'
import OrderedFormLayout from '../../components/forms/OrderedFormLayout'
import ChecklistOptIn from '../../components/forms/ChecklistOptIn'
import { useFormLayout } from '../../hooks/useFormLayout'
import { useFormFieldValues } from '../../hooks/useFormFieldValues'
import { resolveFormActors, validateRepeatableGroups } from '../../lib/formFillership'
import '../../components/company/CompanyShared.css'
import '../../components/workorders/ManualWorkOrder.css'
import '../../components/workorders/WorkOrdersPage.css'

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
    setAssignedEmployeeIds,
    assignToDepartment,
    setAssignToDepartment,
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
  const { layout, hasLayout } = useFormLayout('work_orders.manual')
  const extras = useFormFieldValues('work_orders.manual', workOrderId || null)
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
      })
      if (saved?.id) await extras.save(saved.id, extras.values)
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
  }, [checklistId, checklistOn, extras, navigate, org?.slug, submit, isEdit, hasLayout, layout, formActors])

  const toolbarActionsRef = useRef({ goBack, openSettings, handleSubmit, resetValues })
  toolbarActionsRef.current = { goBack, openSettings, handleSubmit, resetValues }

  useEffect(() => {
    const toolbarLeft = (
      <>
        <PageBack onClick={() => toolbarActionsRef.current.goBack()} className="page-back--inline" />
        {canManage && (
          <button
            type="button"
            className="wo-page__settings-btn"
            onClick={() => toolbarActionsRef.current.openSettings()}
            aria-label="Form field settings"
            title="Form field settings"
          >
            <WorkOrderSettingsIcon />
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
      </>
    )

    const toolbarRight = canUseForm ? (
      <button
        type="button"
        className="company-btn company-btn--primary"
        onClick={() => toolbarActionsRef.current.handleSubmit('created')}
        disabled={saving}
      >
        {saving
          ? (isEdit ? 'Saving...' : 'Creating...')
          : (isEdit
            ? (existingStatus === 'created' ? 'Save Changes' : 'Create Work Order')
            : 'Create Work Order')}
      </button>
    ) : null

    setToolbar(toolbarLeft, toolbarRight)
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

  return (
    <>
      {error && <div className="wo-alert wo-alert--error" role="alert">{error}</div>}

      {linkedEquipment && (
        <div className="wo-linked-equipment">
          <strong>{linkedEquipment.name || 'Equipment'}</strong>
          <p>
            {[
              linkedEquipment.code,
              linkedEquipment.org_locations?.name,
              linkedEquipment.departments?.name,
              linkedEquipment.areas?.name,
            ].filter(Boolean).join(' · ') || 'Equipment details will be saved with this work order.'}
          </p>
        </div>
      )}

      {hasLayout && (
        <OrderedFormLayout
          formId="work_orders.manual"
          layout={layout}
          catalogLookup={[]}
          catalogValues={extras.values}
          onCatalogChange={extras.setFieldValue}
          masterValues={extras.values}
          onMasterChange={extras.setFieldValue}
          disabled={saving}
          actors={formActors}
          renderField={() => null}
        />
      )}

      <WorkOrderForm
        schema={schema}
        values={values}
        onChange={setFieldValue}
        disabled={saving}
      />

      {schema?.show_assignment !== false && (
        <WorkOrderAssignmentCard
          value={assignedEmployeeIds}
          onChange={setAssignedEmployeeIds}
          assignToDepartment={assignToDepartment}
          onAssignToDepartmentChange={setAssignToDepartment}
          onDepartmentTargetChange={setDepartmentTarget}
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
