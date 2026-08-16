import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOrg } from '../../hooks/useOrg'
import { usePermissions } from '../../hooks/usePermissions'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { useTasksPage, useTaskPoll } from '../../hooks/useTasksPage'
import { orgPath } from '../../config/navigation'
import { TASK_TABS, VISIBILITY_OPTIONS } from '../../config/tasks'
import { TABLE_SORT_OPTIONS, applyTableFilters } from '../../lib/tableFilters'
import { deleteTask } from '../../lib/api-tasks'
import { invalidateTasksBootstrapCache } from '../../lib/tasksBootstrapCache'
import { useTablePagination } from '../../hooks/useTablePagination'
import TableFilterToolbar from '../../components/shared/TableFilterToolbar'
import TaskKanban from '../../components/tasks/TaskKanban'
import TaskKanbanSkeleton from '../../components/tasks/TaskKanbanSkeleton'
import TaskKanbanProgress from '../../components/tasks/TaskKanbanProgress'
import TasksTable from '../../components/tasks/TasksTable'
import TaskMetaSettingsModal from '../../components/tasks/TaskMetaSettingsModal'
import SettingsIcon from '../../components/ui/SettingsIcon'

const TaskVoiceAssistant = lazy(() => import('../../components/tasks/TaskVoiceAssistant'))
const VoiceAgentIcon = lazy(() => import('../../components/ui/VoiceAgentIcon'))
import '../../components/shared/TableFilterToolbar.css'
import '../../components/tasks/Tasks.css'

const TASK_FILTER_FIELDS = [
  { value: 'status', label: 'Status' },
  { value: 'priority', label: 'Priority' },
  { value: 'category', label: 'Category' },
  { value: 'tag', label: 'Tag' },
  { value: 'visibility', label: 'Visibility', placeholder: 'self, team, department…' },
]

const TASK_FIELD_FILTER_GETTERS = {
  status: (task) => task.status?.name,
  priority: (task) => task.priority?.name,
  category: (task) => task.category?.name,
  tag: (task) => (task.tags_list || []).map((tag) => tag.name).join(' '),
  visibility: (task) => (
    VISIBILITY_OPTIONS.find((opt) => opt.value === task.visibility_type)?.label
    || task.visibility_type
  ),
}

function filterTasks(tasks, { filterField, filterValue, sortBy }) {
  return applyTableFilters(tasks, {
    fieldFilter: { field: filterField, value: filterValue },
    fieldFilterGetters: TASK_FIELD_FILTER_GETTERS,
    sortBy,
    getName: (task) => task.title,
    getCreatedAt: (task) => task.created_at || task.due_at || null,
  })
}

export default function TasksManager() {
  const navigate = useNavigate()
  const { org } = useOrg()
  const { canCreate, canUpdate, canDelete, isOrgAdmin, role } = usePermissions()
  const isAdmin = isOrgAdmin || role === 'owner' || role === 'admin'

  const [tab, setTab] = useState('assigned_to_me')
  const [viewMode, setViewMode] = useState('kanban')
  const [search, setSearch] = useState('')
  const [filterField, setFilterField] = useState('')
  const [filterValue, setFilterValue] = useState('')
  const [sortBy, setSortBy] = useState('newest')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [dueTodayOnly, setDueTodayOnly] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const debouncedSearch = useDebouncedValue(search.trim())

  const [listTotal, setListTotal] = useState(0)
  const filterResetKey = `${tab}|${debouncedSearch}|${filterField}|${filterValue}|${sortBy}|${overdueOnly}|${dueTodayOnly}`
  const pagination = useTablePagination(listTotal, { resetKey: filterResetKey })

  const filters = useMemo(() => ({
    tab,
    search: debouncedSearch || undefined,
    overdue: overdueOnly ? 'true' : undefined,
    due_today: dueTodayOnly ? 'true' : undefined,
    ...(viewMode === 'table'
      ? { limit: pagination.pageSize, offset: pagination.offset }
      : {}),
  }), [tab, debouncedSearch, overdueOnly, dueTodayOnly, viewMode, pagination.pageSize, pagination.offset])

  const {
    items,
    total,
    board,
    loading,
    error,
    reload,
  } = useTasksPage(filters, {
    mode: viewMode === 'kanban' ? 'kanban' : 'list',
  })
  useEffect(() => { setListTotal(total) }, [total])

  const pollReload = useCallback(() => reload({ silent: true }), [reload])
  useTaskPoll(pollReload, 30000, true)

  const filteredItems = useMemo(
    () => filterTasks(items, { filterField, filterValue, sortBy }),
    [items, filterField, filterValue, sortBy],
  )

  const filteredBoard = useMemo(() => {
    if (!board) return null
    return {
      ...board,
      columns: (board.columns || []).map((column) => ({
        ...column,
        tasks: filterTasks(column.tasks || [], { filterField, filterValue, sortBy }),
      })),
    }
  }, [board, filterField, filterValue, sortBy])

  const openCreate = () => {
    if (!org?.slug) return
    navigate(orgPath(org.slug, 'tasks-and-followups/create'))
  }

  const openTask = (task) => {
    if (!org?.slug || !task?.id) return
    navigate(orgPath(org.slug, `tasks-and-followups/${task.id}`))
  }

  const handleDelete = async (task) => {
    if (!window.confirm(`Delete task "${task.title}"?`)) return
    setDeleting(true)
    try {
      await deleteTask(task.id)
      invalidateTasksBootstrapCache()
      await reload()
    } catch (err) {
      window.alert(err.message)
    } finally {
      setDeleting(false)
    }
  }

  const handleStatusChanged = () => {
    invalidateTasksBootstrapCache()
    reload({ silent: true })
  }


  return (
    <>
      <header className="company-page__header tasks-page__header">
        <div>
          <h1 className="company-page__title">Tasks & Follow-ups</h1>
          <p className="company-page__subtitle">
            Manage assignments, track progress, and collaborate with your team.
          </p>
        </div>
        <div className="tasks-page__actions">
          <button
            type="button"
            className="company-btn company-btn--secondary tasks-voice-btn"
            onClick={() => setVoiceOpen(true)}
            aria-label="Open AI Summary"
            title="AI Summary"
          >
            <Suspense fallback={<span className="voice-agent-icon" style={{ width: 40, height: 40 }} aria-hidden="true" />}>
              <VoiceAgentIcon size={40} />
            </Suspense>
            <span>AI Summary</span>
          </button>
          <div className="tasks-view-toggle" role="group" aria-label="View mode">
            <button
              type="button"
              className={`tasks-view-toggle__btn${viewMode === 'kanban' ? ' tasks-view-toggle__btn--active' : ''}`}
              onClick={() => setViewMode('kanban')}
            >
              Kanban
            </button>
            <button
              type="button"
              className={`tasks-view-toggle__btn${viewMode === 'table' ? ' tasks-view-toggle__btn--active' : ''}`}
              onClick={() => setViewMode('table')}
            >
              Table
            </button>
          </div>
          {canCreate('tasks_followups') && (
            <button type="button" className="company-btn company-btn--primary" onClick={openCreate}>
              + New Task
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              className={`tasks-meta-settings-btn${settingsOpen ? ' tasks-meta-settings-btn--active' : ''}`}
              onClick={() => setSettingsOpen(true)}
              aria-label="Status and Priority settings"
              aria-expanded={settingsOpen}
              title="Status & Priority"
            >
              <SettingsIcon size={18} />
            </button>
          )}
        </div>
      </header>

      <div className="company-page__content">
        <div className={`company-panel${viewMode === 'kanban' ? ' company-panel--kanban' : ''}`}>
          <div className="tasks-page__tabs-row">
            <nav className="wo-page__tabs" aria-label="Task views">
              {TASK_TABS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`wo-page__tab${tab === item.id ? ' wo-page__tab--active' : ''}`}
                  onClick={() => setTab(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </nav>

            <div className="tasks-page__tabs-row-end">
              {viewMode === 'kanban' && filteredBoard && (
                <TaskKanbanProgress board={filteredBoard} />
              )}

              <div className="tasks-page__quick-filters" role="group" aria-label="Quick filters">
                <button
                  type="button"
                  className={`tasks-page__pill${dueTodayOnly ? ' tasks-page__pill--active' : ''}`}
                  onClick={() => setDueTodayOnly((value) => !value)}
                  aria-pressed={dueTodayOnly}
                >
                  Due today
                </button>
                <button
                  type="button"
                  className={`tasks-page__pill${overdueOnly ? ' tasks-page__pill--active' : ''}`}
                  onClick={() => setOverdueOnly((value) => !value)}
                  aria-pressed={overdueOnly}
                >
                  Overdue
                </button>
              </div>
            </div>
          </div>

          <div className="company-panel__toolbar company-panel__toolbar--filters">
            <TableFilterToolbar
              search={{
                value: search,
                onChange: setSearch,
                placeholder: 'Search tasks, tags, assignees…',
                ariaLabel: 'Search tasks',
              }}
              filter={{
                fields: TASK_FILTER_FIELDS,
                field: filterField,
                onFieldChange: setFilterField,
                value: filterValue,
                onValueChange: setFilterValue,
              }}
              sort={{ value: sortBy, onChange: setSortBy, options: TABLE_SORT_OPTIONS }}
            />
          </div>

          {error && <div className="company-alert" role="alert">{error}</div>}

          {viewMode === 'kanban' ? (
            loading ? (
              <TaskKanbanSkeleton columns={filteredBoard?.columns?.length || board?.columns?.length || 5} />
            ) : (
              <TaskKanban
                board={filteredBoard}
                onOpenTask={openTask}
                onStatusChanged={handleStatusChanged}
              />
            )
          ) : loading ? (
            <div className="company-loading">Loading tasks…</div>
          ) : (
            <TasksTable
              tasks={filteredItems}
              totalCount={total}
              pagination={pagination}
              serverPaged
              canManage={canUpdate('tasks_followups') || canDelete('tasks_followups')}
              onDelete={canDelete('tasks_followups') ? handleDelete : undefined}
              deleting={deleting}
              paginationResetKey={filterResetKey}
            />
          )}
        </div>
      </div>

      {settingsOpen && (
        <TaskMetaSettingsModal onClose={() => setSettingsOpen(false)} />
      )}
      {voiceOpen && (
        <Suspense fallback={null}>
          <TaskVoiceAssistant
            onClose={() => setVoiceOpen(false)}
            onOpenTask={(task) => {
              setVoiceOpen(false)
              openTask(task)
            }}
          />
        </Suspense>
      )}
    </>
  )
}
