import { useState, useCallback, useMemo, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import { getReceivedWorkOrders, getReceivedWorkOrder } from '../../lib/api-work-orders'
import { useWorkOrderList } from '../../hooks/useWorkOrderList'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { useTablePagination } from '../../hooks/useTablePagination'
import { applyWorkOrderFilters } from '../../lib/workOrderFilters'
import ReceivedWorkOrderDetailModal from '../../components/workorders/ReceivedWorkOrderDetailModal'
import WorkOrdersTable from '../../components/workorders/WorkOrdersTable'
import '../../components/company/CompanyShared.css'
import '../../components/workorders/WorkOrdersPage.css'

const RECEIVED_COLUMNS = ['wo_number', 'summary', 'assignees', 'creator', 'received_at', 'status']

export default function ReceivedWorkOrders() {
  const [selectedId, setSelectedId] = useState(null)
  const { search, locationFilter, sortBy, advancedRules, fieldFilter, locations } = useOutletContext()
  const debouncedSearch = useDebouncedValue(search)
  const [listTotal, setListTotal] = useState(0)
  const pagination = useTablePagination(listTotal, {
    resetKey: `${debouncedSearch}|${locationFilter}|${fieldFilter?.field}|${fieldFilter?.value}|${sortBy}`,
  })
  const fetchOrders = useCallback(
    () => getReceivedWorkOrders({
      search: debouncedSearch,
      limit: pagination.pageSize,
      offset: pagination.offset,
    }),
    [debouncedSearch, pagination.pageSize, pagination.offset],
  )
  const { orders, total, loading, error } = useWorkOrderList(fetchOrders)
  useEffect(() => { setListTotal(total) }, [total])

  const filtered = useMemo(
    () => applyWorkOrderFilters(orders, { search: '', locationFilter, sortBy, advancedRules, fieldFilter, locations }),
    [orders, search, locationFilter, sortBy, advancedRules, fieldFilter, locations],
  )

  if (loading) {
    return <div className="company-loading">Loading...</div>
  }

  return (
    <>
      {error && <div className="wo-alert wo-alert--error" role="alert">{error}</div>}

      <p className="wo-page__result-count">
        {total} work order{total === 1 ? '' : 's'}
      </p>

      <WorkOrdersTable
        orders={filtered}
        totalCount={total}
        pagination={pagination}
        serverPaged
        columns={RECEIVED_COLUMNS}
        tableId="work-orders-received"
        emptyTitle="No work orders received yet."
        emptyHint="Work orders assigned to you, your location, or your department appear here."
        onView={setSelectedId}
        paginationResetKey={`${search}|${locationFilter}|${fieldFilter?.field}|${fieldFilter?.value}|${sortBy}`}
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
