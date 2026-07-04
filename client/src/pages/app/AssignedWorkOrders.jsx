import { useState, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { getAssignedWorkOrders, getAssignedWorkOrder } from '../../lib/api-work-orders'
import { useWorkOrderList } from '../../hooks/useWorkOrderList'
import { applyWorkOrderFilters } from '../../lib/workOrderFilters'
import ReceivedWorkOrderDetailModal from '../../components/workorders/ReceivedWorkOrderDetailModal'
import WorkOrdersTable from '../../components/workorders/WorkOrdersTable'
import '../../components/company/CompanyShared.css'
import '../../components/workorders/WorkOrdersPage.css'

const ASSIGNED_COLUMNS = ['wo_number', 'summary', 'assignees', 'created_at', 'status']

export default function AssignedWorkOrders() {
  const [selectedId, setSelectedId] = useState(null)
  const { search, locationFilter, advancedRules, locations } = useOutletContext()
  const fetchOrders = useCallback(() => getAssignedWorkOrders(), [])
  const { orders, loading, error } = useWorkOrderList(fetchOrders)

  if (loading) {
    return <div className="company-loading">Loading...</div>
  }

  const filtered = applyWorkOrderFilters(orders, { search, locationFilter, advancedRules, locations })

  return (
    <>
      {error && <div className="wo-alert wo-alert--error" role="alert">{error}</div>}

      <p className="wo-page__result-count">
        {filtered.length} work order{filtered.length === 1 ? '' : 's'}
      </p>

      <WorkOrdersTable
        orders={filtered}
        columns={ASSIGNED_COLUMNS}
        emptyTitle="No work orders assigned to others yet."
        emptyHint="When you create a work order and assign it to someone else, it will appear here."
        onView={setSelectedId}
      />

      {selectedId && (
        <ReceivedWorkOrderDetailModal
          orderId={selectedId}
          fetchWorkOrder={getAssignedWorkOrder}
          onClose={() => setSelectedId(null)}
        />
      )}
    </>
  )
}
