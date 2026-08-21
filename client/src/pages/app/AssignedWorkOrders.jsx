import { useState, useCallback, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import { getAssignedWorkOrders, getAssignedWorkOrder } from '../../lib/api-work-orders'
import { useWorkOrderList } from '../../hooks/useWorkOrderList'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { useTablePagination } from '../../hooks/useTablePagination'
import { useOpenQueryId } from '../../hooks/useOpenQueryId'
import { applyWorkOrderFilters } from '../../lib/workOrderFilters'
import ReceivedWorkOrderDetailModal from '../../components/workorders/ReceivedWorkOrderDetailModal'
import WorkOrdersTable from '../../components/workorders/WorkOrdersTable'
import '../../components/company/CompanyShared.css'
import '../../components/workorders/WorkOrdersPage.css'

const ASSIGNED_COLUMNS = ['wo_number', 'summary', 'assignees', 'created_at', 'status']

export default function AssignedWorkOrders() {
  const [selectedId, setSelectedId, closeSelected] = useOpenQueryId()
  const { search, locationFilter, sortBy, advancedRules, fieldFilter, locations } = useOutletContext()
  const debouncedSearch = useDebouncedValue(search)
  const [listTotal, setListTotal] = useState(0)
  const pagination = useTablePagination(listTotal, {
    resetKey: `${debouncedSearch}|${locationFilter}|${fieldFilter?.field}|${fieldFilter?.value}|${sortBy}`,
  })
  const fetchOrders = useCallback(
    () => getAssignedWorkOrders({
      search: debouncedSearch,
      limit: pagination.pageSize,
      offset: pagination.offset,
    }),
    [debouncedSearch, pagination.pageSize, pagination.offset],
  )
  const { orders, total, loading, error } = useWorkOrderList(fetchOrders)
  useEffect(() => { setListTotal(total) }, [total])

  if (loading) {
    return <div className="company-loading">Loading...</div>
  }

  const filtered = applyWorkOrderFilters(orders, { search: '', locationFilter, sortBy, advancedRules, fieldFilter, locations })

  return (
    <>
      {error && <div className="wo-alert wo-alert--error" role="alert">{error}</div>}

      <WorkOrdersTable
        orders={filtered}
        totalCount={total}
        pagination={pagination}
        serverPaged
        columns={ASSIGNED_COLUMNS}
        tableId="work-orders-assigned"
        emptyTitle="No work orders assigned yet."
        emptyHint="Work orders you requested or created and assigned to someone else appear here."
        onView={setSelectedId}
        paginationResetKey={`${search}|${locationFilter}|${fieldFilter?.field}|${fieldFilter?.value}|${sortBy}`}
      />

      {selectedId && (
        <ReceivedWorkOrderDetailModal
          orderId={selectedId}
          fetchWorkOrder={getAssignedWorkOrder}
          onClose={closeSelected}
        />
      )}
    </>
  )
}
