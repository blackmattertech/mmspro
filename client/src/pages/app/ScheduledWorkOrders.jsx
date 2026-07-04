import { useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { getScheduledWorkOrders } from '../../lib/api-work-orders'
import { useWorkOrderList } from '../../hooks/useWorkOrderList'
import { applyWorkOrderFilters } from '../../lib/workOrderFilters'
import WorkOrdersTable from '../../components/workorders/WorkOrdersTable'
import '../../components/company/CompanyShared.css'
import '../../components/workorders/WorkOrdersPage.css'

const SCHEDULED_COLUMNS = ['wo_number', 'summary', 'scheduled_at', 'assignees', 'status']

export default function ScheduledWorkOrders() {
  const { search, locationFilter, advancedRules, locations } = useOutletContext()
  const fetchOrders = useCallback(() => getScheduledWorkOrders(), [])
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
        columns={SCHEDULED_COLUMNS}
        emptyTitle="No scheduled work orders yet."
        emptyHint="Recurring and preventive work orders will appear here once scheduling is enabled."
      />
    </>
  )
}
