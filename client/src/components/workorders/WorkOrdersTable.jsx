import { formatWorkOrderDate } from '../../lib/workOrderTableUtils'
import { useTablePagination } from '../../hooks/useTablePagination'
import TablePagination from '../shared/TablePagination'
import AssignedToCell from './AssignedToCell'
import EditIcon from '../ui/EditIcon'
import TrashIcon from '../ui/TrashIcon'

const COLUMN_CONFIG = {
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

export default function WorkOrdersTable({
  orders,
  columns,
  emptyTitle,
  emptyHint,
  onView,
  onEdit,
  onDelete,
  canEdit = false,
  canDelete = false,
  paginationResetKey = '',
}) {
  const pagination = useTablePagination(orders.length, { resetKey: paginationResetKey })
  const pagedOrders = pagination.paginate(orders)

  if (!orders.length) {
    return (
      <div className="company-empty">
        <p>{emptyTitle}</p>
        {emptyHint && <p className="wo-page__empty-hint">{emptyHint}</p>}
      </div>
    )
  }

  const renderCell = (order, column) => {
    switch (column) {
      case 'wo_number':
        return (
          <button
            type="button"
            className="company-link"
            onClick={() => onView?.(order.id)}
          >
            {order.wo_number}
          </button>
        )
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
          <span className={`wo-status wo-status--${order.status}`}>{order.status}</span>
        )
      default:
        return '—'
    }
  }

  return (
    <div className="company-table-wrap">
      <table className="company-table master-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{COLUMN_CONFIG[column]?.label || column}</th>
            ))}
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {pagedOrders.map((order) => (
            <tr key={order.id}>
              {columns.map((column) => (
                <td key={column} className={COLUMN_CONFIG[column]?.className}>
                  {renderCell(order, column)}
                </td>
              ))}
              <td>
                <div className="company-table__actions">
                  <button
                    type="button"
                    className="company-link"
                    onClick={() => onView?.(order.id)}
                  >
                    View
                  </button>
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
      <TablePagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        pageSize={pagination.pageSize}
        pageSizeOptions={pagination.pageSizeOptions}
        totalCount={orders.length}
        rangeStart={pagination.rangeStart}
        rangeEnd={pagination.rangeEnd}
        onPageChange={pagination.setPage}
        onPageSizeChange={pagination.setPageSize}
      />
    </div>
  )
}
