import { useState, useCallback } from 'react'
import { useLocation, useOutletContext } from 'react-router-dom'
import { getManualWorkOrders, getManualWorkOrder } from '../../lib/api-work-orders'
import { useWorkOrderList } from '../../hooks/useWorkOrderList'
import { applyWorkOrderFilters } from '../../lib/workOrderFilters'
import ReceivedWorkOrderDetailModal from '../../components/workorders/ReceivedWorkOrderDetailModal'
import WorkOrdersTable from '../../components/workorders/WorkOrdersTable'
import '../../components/company/CompanyShared.css'
import '../../components/workorders/WorkOrdersPage.css'

const MANUAL_COLUMNS = ['wo_number', 'summary', 'assignees', 'creator', 'created_at', 'status']

export default function ManualWorkOrders() {
  const location = useLocation()
  const [selectedId, setSelectedId] = useState(null)
  const { search, locationFilter, advancedRules, locations } = useOutletContext()
  const fetchManualOrders = useCallback(() => getManualWorkOrders(), [])
  const { orders, loading, error } = useWorkOrderList(fetchManualOrders)
  const successMessage = location.state?.success

  if (loading) {
    return <div className="company-loading">Loading...</div>
  }

  const filteredOrders = applyWorkOrderFilters(orders, {
    search,
    locationFilter,
    advancedRules,
    locations,
  })

  return (
    <>
      {successMessage && (
        <div className="wo-alert wo-alert--success" role="status">{successMessage}</div>
      )}
      {error && <div className="wo-alert wo-alert--error" role="alert">{error}</div>}

      <p className="wo-page__result-count">
        {filteredOrders.length} work order{filteredOrders.length === 1 ? '' : 's'}
      </p>

      <WorkOrdersTable
        orders={filteredOrders}
        columns={MANUAL_COLUMNS}
        emptyTitle="No manual work orders yet."
        emptyHint="Click + Add Work Order to create a manual work order."
        onView={setSelectedId}
      />

      {selectedId && (
        <ReceivedWorkOrderDetailModal
          orderId={selectedId}
          fetchWorkOrder={getManualWorkOrder}
          onClose={() => setSelectedId(null)}
        />
      )}
    </>
  )
}
