import { formatAssignees, formatWorkOrderDate } from '../../lib/workOrderTableUtils'

const COLUMN_CONFIG = {
  wo_number: { label: 'WO #', className: '' },
  summary: { label: 'Summary', className: 'wo-table__summary' },
  assignees: { label: 'Assigned to', className: 'wo-table__assignees' },
  assigned_with: { label: 'Assigned with', className: 'wo-table__assignees' },
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
}) {
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
        return formatAssignees(order.assignees)
      case 'creator':
        return order.creator?.email || '—'
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
          {orders.map((order) => (
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
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
