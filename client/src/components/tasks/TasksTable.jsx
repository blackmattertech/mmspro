import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOrg } from '../../hooks/useOrg'
import { orgPath } from '../../config/navigation'
import { stopTableRowClick, tableRowClickProps } from '../../lib/clickableTableRow'
import { formatTaskDateTime } from '../../lib/taskDateUtils'
import { VISIBILITY_OPTIONS } from '../../config/tasks'
import EditIcon from '../ui/EditIcon'
import TrashIcon from '../ui/TrashIcon'
import TaskAssigneeAvatars from './TaskAssigneeAvatars'
import './TaskAssigneeAvatars.css'
import TablePagination from '../shared/TablePagination'
import TableColumnPicker from '../shared/TableColumnPicker'
import { useTablePagination } from '../../hooks/useTablePagination'
import { useTableColumnPrefs } from '../../hooks/useTableColumnPrefs'

const TASK_COLUMNS = [
  { id: 'task_number', label: 'Task #' },
  { id: 'title', label: 'Task Title' },
  { id: 'category', label: 'Category' },
  { id: 'status', label: 'Status' },
  { id: 'priority', label: 'Priority' },
  { id: 'visibility', label: 'Task Type' },
  { id: 'tags', label: 'Tags', defaultVisible: false },
  { id: 'vendor', label: 'Vendor', defaultVisible: false },
  { id: 'assigned_to', label: 'Assigned To' },
  { id: 'department', label: 'Department' },
  { id: 'location', label: 'Location' },
  { id: 'start', label: 'Start Date & Time', defaultVisible: false },
  { id: 'due', label: 'Due Date & Time' },
  { id: 'task_type', label: 'Task Type', defaultVisible: false },
  { id: 'created_at', label: 'Created Date', defaultVisible: false },
  { id: 'updated_at', label: 'Last Updated', defaultVisible: false },
  { id: 'actions', label: 'Actions', locked: true },
]

function visibilityLabel(value) {
  return VISIBILITY_OPTIONS.find((opt) => opt.value === value)?.label || value || '—'
}

export default function TasksTable({
  tasks,
  canManage,
  onDelete,
  deleting,
  paginationResetKey = '',
}) {
  const navigate = useNavigate()
  const { org } = useOrg()

  const {
    visibleColumnIds,
    toggleColumn,
    resetColumns,
    columnDefs,
  } = useTableColumnPrefs('tasks-manager', TASK_COLUMNS)

  const pagination = useTablePagination(tasks.length, { resetKey: paginationResetKey })
  const pagedTasks = pagination.paginate(tasks)

  const openView = (task) => {
    if (!org?.slug || !task?.id) return
    navigate(orgPath(org.slug, `tasks-and-followups/${task.id}`))
  }

  const openEdit = (task) => {
    if (!org?.slug || !task?.id) return
    navigate(orgPath(org.slug, `tasks-and-followups/${task.id}/edit`))
  }

  const renderCell = (task, columnId) => {
    switch (columnId) {
      case 'task_number':
        return task.task_number || '—'
      case 'title':
        return <span className="company-table__name">{task.title}</span>
      case 'category':
        return task.category?.name || '—'
      case 'status':
        return task.status?.name || '—'
      case 'priority':
        return task.priority?.name || '—'
      case 'visibility':
        return visibilityLabel(task.visibility_type)
      case 'tags':
        return (task.tags_list || []).map((t) => t.name).join(', ') || '—'
      case 'vendor':
        return task.vendor?.name || '—'
      case 'assigned_to':
        return (
          <div className="tasks-table__assignees">
            <TaskAssigneeAvatars
              assignees={task.assignees}
              creator={task.creator}
              visibility_type={task.visibility_type}
              department={task.department}
              location={task.location}
              variant="list"
            />
          </div>
        )
      case 'department':
        return task.department?.name || '—'
      case 'location':
        return task.location?.name || '—'
      case 'start':
        return formatTaskDateTime(task.start_date, task.start_time)
      case 'due':
        return formatTaskDateTime(task.due_date, task.due_time)
      case 'task_type':
        return task.task_type === 'recurring' ? 'Recurring' : 'One-Time'
      case 'created_at':
        return task.created_at ? new Date(task.created_at).toLocaleString() : '—'
      case 'updated_at':
        return task.updated_at ? new Date(task.updated_at).toLocaleString() : '—'
      default:
        return '—'
    }
  }

  if (!tasks.length) {
    return <div className="company-empty">No tasks match your filters.</div>
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
              {visibleColumnIds.map((columnId) => {
                const col = TASK_COLUMNS.find((item) => item.id === columnId)
                return <th key={columnId}>{col?.label || columnId}</th>
              })}
            </tr>
          </thead>
          <tbody>
            {pagedTasks.map((task) => (
              <tr
                key={task.id}
                {...tableRowClickProps({
                  onOpen: () => openView(task),
                  label: `View ${task.title}`,
                })}
              >
                {visibleColumnIds.map((columnId) => {
                  if (columnId === 'actions') {
                    return (
                      <td key={columnId} onClick={stopTableRowClick}>
                        <div className="company-table__actions">
                          {canManage && (
                            <>
                              <button
                                type="button"
                                className="company-btn company-btn--secondary company-btn--compact company-btn--icon"
                                onClick={() => openEdit(task)}
                                aria-label={`Edit ${task.title}`}
                                title="Edit"
                              >
                                <EditIcon />
                              </button>
                              <button
                                type="button"
                                className="company-btn company-btn--danger company-btn--compact company-btn--icon"
                                onClick={() => onDelete?.(task)}
                                disabled={deleting}
                                aria-label={`Delete ${task.title}`}
                                title="Delete"
                              >
                                <TrashIcon />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    )
                  }
                  return <td key={columnId}>{renderCell(task, columnId)}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <TablePagination {...pagination} />
      </div>
    </div>
  )
}
