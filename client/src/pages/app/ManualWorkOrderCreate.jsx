import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useOrg } from '../../hooks/useOrg'
import { useManualWorkOrderForm } from '../../hooks/useManualWorkOrderForm'
import { useWorkOrderToolbar } from '../../hooks/useWorkOrderToolbar'
import { usePermissions } from '../../hooks/usePermissions'
import { orgPath } from '../../config/navigation'
import { notifyTabCountsChanged } from '../../lib/tabCountEvents'
import WorkOrderFieldSettingsModal from '../../components/workorders/WorkOrderFieldSettingsModal'
import ManualWorkOrderWizard from '../../components/workorders/ManualWorkOrderWizard'
import PageBack from '../../components/shared/PageBack'
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
  const { canCreate, canUpdate } = usePermissions()
  const canManage = canUpdate('work_orders_manual') || canUpdate('work_orders')
  const canCreateWorkOrders = canCreate('work_orders_manual') || canCreate('work_orders')
  const canEditWorkOrders = canUpdate('work_orders_manual') || canUpdate('work_orders')
  const canUseForm = isEdit ? canEditWorkOrders : canCreateWorkOrders
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [formError, setFormError] = useState(null)
  const [formKey, setFormKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const draftRef = useRef(null)
  const submittingRef = useRef(false)
  const clientRequestIdRef = useRef(
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `manual-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  )

  const {
    settings,
    assignedEmployeeIds,
    setAssignedEmployeeIds,
    existingStatus,
    record,
    loading,
    saving,
    error,
    resetValues,
    loadSettings,
    saveSettings,
    submit,
  } = useManualWorkOrderForm({
    workOrderId: workOrderId || null,
    initialEquipmentId,
  })

  const goBack = useCallback(() => {
    if (org?.slug) navigate(orgPath(org.slug, 'work-orders/manual'))
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
    if (submittingRef.current) return
    const draft = draftRef.current
    if (!draft) return
    const problem = draft.validate?.(status)
    if (problem) {
      setFormError(problem)
      return
    }
    submittingRef.current = true
    setBusy(true)
    setFormError(null)
    let succeeded = false
    try {
      const submitStatus = status === 'created' ? 'completed' : status
      const saved = await submit(submitStatus, {
        skipSchemaValidation: true,
        requireAssignedDepartment: status !== 'draft',
        clientRequestId: status === 'draft'
          ? null
          : `${clientRequestIdRef.current}:${status}`,
        checklistTemplateId: (draft.checklistRequired || draft.checklistOn) ? draft.checklistId : null,
        assignedDepartmentId: draft.assignedDepartmentId || null,
        assignedLocationId: draft.assignedLocationId || null,
        equipmentId: draft.equipmentId || null,
        shortDescription: draft.shortDescription,
        problemDescription: draft.problemDescription,
        priority: draft.priority,
        assignedEmployeeIds: draft.assignedEmployeeIds,
        vendorId: draft.vendorId,
        vendorExpense: draft.vendorExpense,
        labourCount: draft.labourCount,
        workStartAt: draft.workStartAt,
        workEndAt: draft.workEndAt,
        jobDescription: draft.jobDescription,
        rootCause: draft.rootCause,
        actionTaken: draft.actionTaken,
        specialToolsUsed: draft.specialToolsUsed,
        safetyPrecautions: draft.safetyPrecautions,
        lessonsLearned: draft.lessonsLearned,
        executionRemarks: draft.executionRemarks,
        materialConsumed: draft.materialConsumed,
        permitRequired: draft.permitRequired,
        permitTypes: draft.permitTypes,
        permitNumber: draft.permitNumber,
        permitIssueAt: draft.permitIssueAt,
        permitExpiryAt: draft.permitExpiryAt,
        isBreakdown: draft.isBreakdown,
      })
      if (!saved?.id) return
      succeeded = true
      try {
        await draft.saveExtras?.(saved.id)
      } catch {
        // WO already created — extras failure must not look like a failed save
        // (retrying would create a duplicate).
      }
      notifyTabCountsChanged('work_orders')
      if (org?.slug) {
        navigate(orgPath(org.slug, 'work-orders/manual'), {
          replace: true,
          state: {
            success: isEdit
              ? (status === 'draft' ? 'Draft updated successfully.' : 'Work order updated successfully.')
              : (status === 'draft' ? 'Draft saved successfully.' : 'Manual work order saved successfully.'),
          },
        })
      }
    } catch {
      // The form hook surfaces the error.
    } finally {
      // Keep the lock after a successful create so a second tap cannot POST again
      // before navigation unmounts this page.
      if (!succeeded || status === 'draft') {
        submittingRef.current = false
        setBusy(false)
      }
    }
  }, [isEdit, navigate, org?.slug, submit])

  const handleReset = useCallback(() => {
    if (submittingRef.current || busy) return
    resetValues()
    setFormError(null)
    setFormKey((key) => key + 1)
    clientRequestIdRef.current = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `manual-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  }, [busy, resetValues])

  const toolbarActionsRef = useRef({ goBack, openSettings, handleSubmit, resetValues: handleReset })
  toolbarActionsRef.current = { goBack, openSettings, handleSubmit, resetValues: handleReset }

  const actionsLocked = saving || busy

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
              disabled={actionsLocked}
            >
              Reset
            </button>
          )}
          <button
            type="button"
            className="company-btn company-btn--secondary"
            onClick={() => toolbarActionsRef.current.handleSubmit('draft')}
            disabled={actionsLocked || !canUseForm}
          >
            {actionsLocked ? 'Saving...' : isEdit ? 'Save Draft' : 'Save as Draft'}
          </button>
          {canUseForm && (
            <button
              type="button"
              className="company-btn company-btn--primary wo-command__create"
              onClick={() => toolbarActionsRef.current.handleSubmit('created')}
              disabled={actionsLocked}
            >
              {!isEdit && !actionsLocked && <span className="wo-command__plus" aria-hidden="true">+</span>}
              {actionsLocked
                ? 'Saving...'
                : (isEdit ? 'Save Work Order' : 'Save Work Order')}
            </button>
          )}
        </>
      ),
    })
    return clearToolbar
  }, [actionsLocked, canManage, canUseForm, clearToolbar, existingStatus, isEdit, setToolbar])

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
      {(formError || error) && (
        <div className="wo-alert wo-alert--error" role="alert">{formError || error}</div>
      )}

      <ManualWorkOrderWizard
        key={formKey}
        draftRef={draftRef}
        saving={actionsLocked}
        record={record}
        initialEquipmentId={initialEquipmentId || record?.equipment_id || ''}
        initialAssigneeIds={assignedEmployeeIds}
        onAssigneeIdsChange={setAssignedEmployeeIds}
        onSaveCompleted={() => handleSubmit('created')}
      />

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
