import { useState, useCallback, useMemo } from 'react'
import { useOutletContext } from 'react-router-dom'
import { getReceivedWorkOrders, getReceivedWorkOrder } from '../../lib/api-work-orders'
import { useWorkOrderList } from '../../hooks/useWorkOrderList'
import { applyWorkOrderFilters } from '../../lib/workOrderFilters'
import ReceivedWorkOrderDetailModal from '../../components/workorders/ReceivedWorkOrderDetailModal'
import WorkOrdersTable from '../../components/workorders/WorkOrdersTable'
import '../../components/company/CompanyShared.css'
import '../../components/workorders/WorkOrdersPage.css'

const RECEIVED_COLUMNS = ['wo_number', 'summary', 'assigned_with', 'creator', 'received_at', 'status']

export default function ReceivedWorkOrders() {
  const [selectedId, setSelectedId] = useState(null)
  const { search, locationFilter, advancedRules, locations } = useOutletContext()
  const fetchOrders = useCallback(() => getReceivedWorkOrders(), [])
  const { orders, loading, error } = useWorkOrderList(fetchOrders)

  const filtered = useMemo(
    () => applyWorkOrderFilters(orders, { search, locationFilter, advancedRules, locations }),
    [orders, search, locationFilter, advancedRules, locations],
  )

  if (loading) {
    return <div className="company-loading">Loading...</div>
  }

  return (
    <>
      {error && <div className="wo-alert wo-alert--error" role="alert">{error}</div>}

      <p className="wo-page__result-count">
        {filtered.length} work order{filtered.length === 1 ? '' : 's'}
      </p>

      <WorkOrdersTable
        orders={filtered}
        columns={RECEIVED_COLUMNS}
        emptyTitle="No work orders received yet."
        emptyHint="Work orders assigned to you, your location, or your department appear here."
        onView={setSelectedId}
      />

      {selectedId && (
        <ReceivedWorkOrderDetailModal
          orderId={selectedId}
          fetchWorkOrder={getReceivedWorkOrder}
          onClose={() => setSelectedId(null)}
        />
      )}
    </>
  )
}
