import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOrg } from '../../hooks/useOrg'
import { orgPath } from '../../config/navigation'
import { stopTableRowClick, tableRowClickProps } from '../../lib/clickableTableRow'
import { formatTaskDateTime } from '../../lib/taskDateUtils'
import { formatDisplayDateTime } from '../../lib/displayDate'
import { VISIBILITY_OPTIONS } from '../../config/tasks'
import EditIcon from '../ui/EditIcon'
import TrashIcon from '../ui/TrashIcon'
import DuplicateRowButton from '../ui/DuplicateRowButton'
import SaveAsTemplateButton from '../templates/SaveAsTemplateButton'
import TaskAssigneeAvatars from './TaskAssigneeAvatars'
import './TaskAssigneeAvatars.css'
import TablePagination from '../shared/TablePagination'
import TableEmptyRow from '../shared/TableEmptyRow'
import TableColumnPicker from '../shared/TableColumnPicker'
import { VirtualTableBody } from '../shared/VirtualTableBody'
import { useTablePagination } from '../../hooks/useTablePagination'
import { useTableColumnPrefs } from '../../hooks/useTableColumnPrefs'
import RecordPdfButton from '../shared/RecordPdfButton'
import { DataColumnHead, updateColumnFilter } from '../shared/ListTableChrome'
import { rowMatchesColumnFilters } from '../../lib/tableFilters'
import '../shared/ListTableChrome.css'

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
  totalCount,
  pagination: paginationProp,
  serverPaged = false,
  canManage,
  canDuplicate = false,
  onDuplicate,
  canSaveTemplate = false,
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
    columnOrder,
    reorderColumns,
    moveColumn,
    saveColumns,
    makeDefaultColumns,
    makingDefault,
  } = useTableColumnPrefs('tasks-manager', TASK_COLUMNS)

  const [columnFilters, setColumnFilters] = useState({})
  const filteredTasks = useMemo(() => (tasks || []).filter((task) => rowMatchesColumnFilters(task, columnFilters, (row, key) => {
    if (key === 'task_number') return row.task_number
    if (key === 'title') return row.title
    if (key === 'category') return row.category?.name
    if (key === 'status') return row.status?.name
    if (key === 'priority') return row.priority?.name
    if (key === 'visibility' || key === 'task_type') return row.visibility_type || row.task_type
    if (key === 'tags') return (row.tags || []).map((tag) => tag.name).join(' ')
    if (key === 'vendor') return row.vendor?.name
    if (key === 'assigned_to') return (row.assignees || []).map((person) => person.name).join(' ')
    if (key === 'department') return row.department?.name
    if (key === 'location') return row.location?.name
    if (key === 'start') return row.start_at
    if (key === 'due') return row.due_at || row.due_date
    return ''
  })), [tasks, columnFilters])
  const localPagination = useTablePagination(totalCount ?? filteredTasks.length, { resetKey: paginationResetKey })
  const pagination = paginationProp || localPagination
  const pagedTasks = serverPaged || paginationProp ? filteredTasks : pagination.paginate(filteredTasks)

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
        return task.created_at ? (formatDisplayDateTime(task.created_at) || '—') : '—'
      case 'updated_at':
        return task.updated_at ? (formatDisplayDateTime(task.updated_at) || '—') : '—'
      default:
        return '—'
    }
  }

  return (
    <div>
      <div className="company-table-toolbar">
        <TableColumnPicker
          columnDefs={columnDefs}
          visibleColumnIds={visibleColumnIds}
          columnOrder={columnOrder}
          onToggle={toggleColumn}
          onReset={resetColumns}
          onReorder={reorderColumns}
          onMove={moveColumn}
          onSave={saveColumns}
                  onMakeDefault={makeDefaultColumns}
                  makingDefault={makingDefault}
        />
      </div>
      <div className="company-table-wrap">
      <div className="company-table-scroll">
        <table className="company-table master-table">
          <thead>
            <tr>
              {visibleColumnIds.map((columnId) => {
                if (columnId === 'actions') return <th key={columnId}>Actions</th>
                const col = TASK_COLUMNS.find((item) => item.id === columnId)
                return (
                  <DataColumnHead
                    key={columnId}
                    columnId={columnId}
                    label={col?.label || columnId}
                    filters={columnFilters}
                    onFilter={(id, value) => updateColumnFilter(setColumnFilters, id, value)}
                  />
                )
              })}
            </tr>
          </thead>
          {pagedTasks.length === 0 ? (
            <tbody>
              <TableEmptyRow colSpan={visibleColumnIds.length}>
                No tasks match your filters.
              </TableEmptyRow>
            </tbody>
          ) : (
            <VirtualTableBody
              items={pagedTasks}
              renderRow={(task) => (
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
                            <RecordPdfButton moduleKey="task" recordId={task.id} filename={`${task.task_number || 'task'}.pdf`} />
                            {canDuplicate && onDuplicate && (
                              <DuplicateRowButton
                                onClick={() => onDuplicate(task)}
                                label={`Duplicate ${task.title}`}
                              />
                            )}
                            {canSaveTemplate ? (
                              <SaveAsTemplateButton
                                moduleKey="tasks_followups"
                                sourceRecordId={task.id}
                                defaultName={task.title || task.task_number || 'Task'}
                                className="company-btn company-btn--secondary company-btn--compact"
                                label="Template"
                              />
                            ) : null}
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
              )}
            />
          )}
        </table>
      </div>
      <TablePagination {...pagination} />
      </div>
    </div>
  )
}
