import { useMemo, useCallback } from 'react'
import { formatWorkOrderDate } from '../../lib/workOrderTableUtils'
import { stopTableRowClick, tableRowClickProps } from '../../lib/clickableTableRow'
import { useTablePagination } from '../../hooks/useTablePagination'
import { useTableColumnPrefs } from '../../hooks/useTableColumnPrefs'
import TablePagination from '../shared/TablePagination'
import TableColumnPicker from '../shared/TableColumnPicker'
import AssignedToCell from './AssignedToCell'
import EditIcon from '../ui/EditIcon'
import TrashIcon from '../ui/TrashIcon'
import '../shared/TableColumnPicker.css'

export const WORK_ORDER_COLUMN_CONFIG = {
  wo_number: { label: 'WO #', className: '' },
  summary: { label: 'Summary', className: 'wo-table__summary' },
  assignees: { label: 'Assigned to', className: 'wo-table__assignees' },
  assigned_with: { label: 'Assigned to', className: 'wo-table__assignees' },
  creator: { label: 'Created by', className: 'wo-table__creator' },
  created_at: { label: 'Created', className: '' },
  received_at: { label: 'Received', className: '' },
  scheduled_at: { label: 'Scheduled', className: '' },
  status: { label: 'Status', className: '' },
}

const COLUMN_CONFIG = WORK_ORDER_COLUMN_CONFIG

function buildColumnDefs(columnIds) {
  return columnIds.map((id) => ({
    id,
    label: COLUMN_CONFIG[id]?.label || id,
  }))
}

const APPROVABLE_STATUSES = new Set(['assigned', 'returned_rework'])

export default function WorkOrdersTable({
  orders,
  totalCount,
  pagination: paginationProp,
  serverPaged = false,
  columns,
  tableId,
  emptyTitle,
  emptyHint,
  onView,
  onApprove,
  onEdit,
  onDelete,
  canApproveOrder,
  canEdit = false,
  canDelete = false,
  approvingId = null,
  paginationResetKey = '',
}) {
  const columnDefs = useMemo(() => buildColumnDefs(columns), [columns])
  const {
    visibleColumnIds,
    toggleColumn,
    resetColumns,
  } = useTableColumnPrefs(tableId, columnDefs)

  const localPagination = useTablePagination(totalCount ?? orders.length, { resetKey: paginationResetKey })
  const pagination = paginationProp || localPagination
  const pagedOrders = serverPaged || paginationProp ? orders : pagination.paginate(orders)

  const renderCell = useCallback((order, column) => {
    switch (column) {
      case 'wo_number':
        return order.wo_number || '—'
      case 'summary':
        return (
          <span className="company-table__name">{order.summary || '—'}</span>
        )
      case 'assignees':
      case 'assigned_with':
        return (
          <AssignedToCell
            assignees={order.assignees}
            assignedDepartment={order.assigned_department}
            assignedLocation={order.assigned_location}
          />
        )
      case 'creator':
        return order.creator?.display_name || order.creator?.email || '—'
      case 'created_at':
      case 'received_at':
        return formatWorkOrderDate(order.created_at)
      case 'scheduled_at':
        return formatWorkOrderDate(order.scheduled_at)
      case 'status':
        return (
          <span className={`wo-status wo-status--${order.status}`}>
            {String(order.status || '').replace(/_/g, ' ')}
          </span>
        )
      default:
        return '—'
    }
  }, [])

  if (!orders.length) {
    return (
      <div className="company-empty">
        <p>{emptyTitle}</p>
        {emptyHint && <p className="wo-page__empty-hint">{emptyHint}</p>}
      </div>
    )
  }

  return (
    <div className="company-table-wrap">
      <div className="company-table-scroll">
      <div className="company-table-toolbar">
        <TableColumnPicker
          columnDefs={columnDefs}
          visibleColumnIds={visibleColumnIds}
          onToggle={toggleColumn}
          onReset={resetColumns}
        />
      </div>
      <table className="company-table master-table">
        <thead>
          <tr>
            {visibleColumnIds.map((column) => (
              <th key={column}>{COLUMN_CONFIG[column]?.label || column}</th>
            ))}
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {pagedOrders.map((order) => (
            <tr
              key={order.id}
              {...(onView ? tableRowClickProps({
                onOpen: () => onView(order.id),
                label: `View work order ${order.wo_number}`,
              }) : {})}
            >
              {visibleColumnIds.map((column) => (
                <td key={column} className={COLUMN_CONFIG[column]?.className}>
                  {renderCell(order, column)}
                </td>
              ))}
              <td onClick={stopTableRowClick}>
                <div className="company-table__actions">
                  {onApprove && (canApproveOrder
                    ? canApproveOrder(order)
                    : APPROVABLE_STATUSES.has(order.status)
                  ) && (
                    <button
                      type="button"
                      className="wo-table__approve"
                      onClick={() => onApprove(order)}
                      disabled={approvingId === order.id}
                    >
                      {approvingId === order.id ? 'Approving…' : 'Approve'}
                    </button>
                  )}
                  {onView && (
                    <button
                      type="button"
                      className="company-link"
                      onClick={() => onView(order.id)}
                    >
                      View
                    </button>
                  )}
                  {canEdit && (
                    <button
                      type="button"
                      className="company-btn company-btn--secondary company-btn--compact company-btn--icon"
                      onClick={() => onEdit?.(order)}
                      aria-label={`Edit ${order.wo_number}`}
                      title="Edit"
                    >
                      <EditIcon />
                    </button>
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      className="company-btn company-btn--danger company-btn--compact company-btn--icon"
                      onClick={() => onDelete?.(order)}
                      aria-label={`Delete ${order.wo_number}`}
                      title="Delete"
                    >
                      <TrashIcon />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <TablePagination {...pagination} />
      </div>
    </div>
  )
}
