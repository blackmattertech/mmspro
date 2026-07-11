import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOrg } from '../../hooks/useOrg'
import { useManualWorkOrderForm } from '../../hooks/useManualWorkOrderForm'
import { useWorkOrderToolbar } from '../../hooks/useWorkOrderToolbar'
import { usePermissions } from '../../hooks/usePermissions'
import { orgPath } from '../../config/navigation'
import WorkOrderForm from '../../components/workorders/WorkOrderForm'
import WorkOrderAssignmentCard from '../../components/workorders/WorkOrderAssignmentCard'
import WorkOrderFieldSettingsModal from '../../components/workorders/WorkOrderFieldSettingsModal'
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
  const { org, loading: orgLoading } = useOrg()
  const { setToolbar, clearToolbar } = useWorkOrderToolbar()
  const { canCreate, canUpdate } = usePermissions()
  const canManage = canUpdate('work_orders_manual') || canUpdate('work_orders')
  const canCreateWorkOrders = canCreate('work_orders_manual') || canCreate('work_orders')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsLoading, setSettingsLoading] = useState(false)

  const {
    schema,
    settings,
    values,
    assignedEmployeeIds,
    setAssignedEmployeeIds,
    assignToDepartment,
    setAssignToDepartment,
    setDepartmentTarget,
    loading,
    saving,
    error,
    setFieldValue,
    resetValues,
    loadSettings,
    saveSettings,
    submit,
  } = useManualWorkOrderForm()

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
      await submit(status)
      if (status === 'created' && org?.slug) {
        navigate(orgPath(org.slug, 'work-orders/manual'), {
          state: { success: 'Work order created successfully.' },
        })
      }
    } catch {
      // Error is surfaced by the form hook
    }
  }, [navigate, org?.slug, submit])

  useEffect(() => {
    const toolbarLeft = (
      <>
        <button
          type="button"
          className="company-btn company-btn--secondary"
          onClick={goBack}
          disabled={saving}
        >
          Cancel
        </button>
        {canManage && (
          <button
            type="button"
            className="wo-page__settings-btn"
            onClick={openSettings}
            aria-label="Form field settings"
            title="Form field settings"
          >
            <WorkOrderSettingsIcon />
          </button>
        )}
        <button
          type="button"
          className="company-btn company-btn--secondary"
          onClick={() => handleSubmit('draft')}
          disabled={saving || !canCreateWorkOrders}
        >
          {saving ? 'Saving...' : 'Save as Draft'}
        </button>
        <button
          type="button"
          className="company-btn company-btn--secondary"
          onClick={resetValues}
          disabled={saving}
        >
          Reset
        </button>
      </>
    )

    const toolbarRight = canCreateWorkOrders ? (
      <button
        type="button"
        className="company-btn company-btn--primary"
        onClick={() => handleSubmit('created')}
        disabled={saving}
      >
        {saving ? 'Creating...' : 'Create Work Order'}
      </button>
    ) : null

    setToolbar(toolbarLeft, toolbarRight)
    return clearToolbar
  }, [
    canCreateWorkOrders,
    canManage,
    clearToolbar,
    goBack,
    handleSubmit,
    openSettings,
    resetValues,
    saving,
    setToolbar,
  ])

  if (orgLoading || loading) {
    return <div className="company-loading">Loading...</div>
  }

  if (!canCreateWorkOrders) {
    return (
      <div className="company-empty">
        You do not have permission to create work orders.
      </div>
    )
  }

  return (
    <>
      {error && <div className="wo-alert wo-alert--error" role="alert">{error}</div>}

      <p className="wo-manual__intro">
        Fill in the details below to create a new manual work order.
      </p>

      <WorkOrderForm
        schema={schema}
        values={values}
        onChange={setFieldValue}
        disabled={saving}
      />

      <WorkOrderAssignmentCard
        value={assignedEmployeeIds}
        onChange={setAssignedEmployeeIds}
        assignToDepartment={assignToDepartment}
        onAssignToDepartmentChange={setAssignToDepartment}
        onDepartmentTargetChange={setDepartmentTarget}
        disabled={saving}
      />

      <p className="wo-footer__note wo-manual__note">
        Fields shown are based on your company&apos;s asset field configuration.
      </p>

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
