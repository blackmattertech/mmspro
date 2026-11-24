import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useOrg } from '../../hooks/useOrg'
import { usePermissions } from '../../hooks/usePermissions'
import { useOrgStatuses } from '../../hooks/useOrgStatuses'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { isCompanyAdmin, canManageOrg } from '../../lib/accountRoles'
import { orgPath } from '../../config/navigation'
import { STATUS_ENTITY_LABELS } from '../../lib/formMasterStatuses'
import { reorderItemsById } from '../../lib/assetFormSchema'
import PageBack from '../../components/shared/PageBack'
import { DataColumnHead, updateColumnFilter } from '../../components/shared/ListTableChrome'
import TableFilterToolbar from '../../components/shared/TableFilterToolbar'
import TableEmptyRow from '../../components/shared/TableEmptyRow'
import EditIcon from '../../components/ui/EditIcon'
import TrashIcon from '../../components/ui/TrashIcon'
import DuplicateRowButton from '../../components/ui/DuplicateRowButton'
import { createNestedClone, prepareNestedCloneCreate } from '../../lib/nestedClone'
import OrgStatusEditModal from '../../components/others/OrgStatusEditModal'
import {
  ACTIVE_STATUS_FILTER,
  TABLE_SORT_OPTIONS,
  applyTableFilters,
  compactFilters,
  selectFilterField,
} from '../../lib/tableFilters'
import { useConfirmDelete } from '../../hooks/useConfirmDelete'
import '../../components/shared/ListTableChrome.css'
import '../../components/shared/TableFilterToolbar.css'
import '../../components/workorders/WorkOrdersPage.css'
import '../../components/company/CompanyShared.css'
import '../../components/tasks/TaskMetaSettings.css'
import './Others.css'

const STATUS_MODULE_OPTIONS = Object.entries(STATUS_ENTITY_LABELS).map(([value, label]) => ({
  value,
  label,
}))

function DragHandle() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="4.5" cy="3.5" r="1" fill="currentColor" />
      <circle cx="9.5" cy="3.5" r="1" fill="currentColor" />
      <circle cx="4.5" cy="7" r="1" fill="currentColor" />
      <circle cx="9.5" cy="7" r="1" fill="currentColor" />
      <circle cx="4.5" cy="10.5" r="1" fill="currentColor" />
      <circle cx="9.5" cy="10.5" r="1" fill="currentColor" />
    </svg>
  )
}

export default function OthersStatusManage({
  entityType: entityTypeProp = null,
  backTo: backToProp = null,
  backLabel = 'Forms Master',
} = {}) {
  const { requestDelete, deleteModal } = useConfirmDelete()
  const params = useParams()
  const navigate = useNavigate()
  const entityType = entityTypeProp || params.entityType
  const { org } = useOrg()
  const { role } = useAuth()
  const { canCreate, canUpdate, canDelete, isOrgAdmin } = usePermissions()
  const canManage = (
    isOrgAdmin
    || isCompanyAdmin(role)
    || canManageOrg(role)
    || canUpdate('assets')
    || canCreate('others')
    || canUpdate('others')
    || canDelete('others')
  )
  const label = STATUS_ENTITY_LABELS[entityType] || entityType
  const {
    statuses,
    loading,
    error,
    saving,
    create,
    update,
    remove,
    reorder,
    reset,
  } = useOrgStatuses(entityType, { includeInactive: true })

  const [editItem, setEditItem] = useState(null)
  const [creating, setCreating] = useState(false)
  const [clone, setClone] = useState(null)
  const [localRows, setLocalRows] = useState([])
  const [draggingId, setDraggingId] = useState(null)
  const [dropTargetId, setDropTargetId] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [search, setSearch] = useState('')
  const [columnFilters, setColumnFilters] = useState({})
  const [sortBy, setSortBy] = useState('name_asc')
  const debouncedSearch = useDebouncedValue(search.trim())
  const listFilters = useMemo(() => compactFilters(columnFilters) || {}, [columnFilters])

  useEffect(() => {
    setLocalRows(statuses)
  }, [statuses])

  useEffect(() => {
    setSearch('')
    setColumnFilters({})
    setSortBy('name_asc')
    setActionError(null)
  }, [entityType])

  const sourceRows = draggingId ? localRows : statuses
  const cloneKind = entityType === 'task' ? 'task_status' : 'org_status'
  const closeEditor = () => { setCreating(false); setEditItem(null); setClone(null) }

  const filterFields = useMemo(() => ([
    selectFilterField(
      'type',
      'Type',
      [
        { value: 'system', label: 'System' },
        { value: 'custom', label: 'Custom' },
      ],
      'All types',
    ),
    ACTIVE_STATUS_FILTER,
  ]), [])

  const filteredRows = useMemo(() => {
    const query = debouncedSearch.toLowerCase()
    let list = sourceRows
    if (query) {
      list = list.filter((row) => {
        const haystack = [row.name, row.key, row.is_system ? 'system' : 'custom'].join(' ').toLowerCase()
        return haystack.includes(query)
      })
    }
    if (listFilters.type === 'system') list = list.filter((row) => row.is_system)
    else if (listFilters.type === 'custom') list = list.filter((row) => !row.is_system)
    else if (listFilters.type) {
      const needle = String(listFilters.type).toLowerCase()
      list = list.filter((row) => (row.is_system ? 'system' : 'custom').includes(needle))
    }
    if (listFilters.status === 'active' || listFilters.state === 'active') {
      list = list.filter((row) => row.is_active !== false)
    } else if (listFilters.status === 'inactive' || listFilters.state === 'inactive') {
      list = list.filter((row) => row.is_active === false)
    } else if (listFilters.state) {
      const needle = String(listFilters.state).toLowerCase()
      list = list.filter((row) => (row.is_active === false ? 'inactive' : 'active').includes(needle))
    }
    if (listFilters.name) {
      const needle = String(listFilters.name).toLowerCase()
      list = list.filter((row) => String(row.name || '').toLowerCase().includes(needle))
    }
    if (listFilters.key) {
      const needle = String(listFilters.key).toLowerCase()
      list = list.filter((row) => String(row.key || '').toLowerCase().includes(needle))
    }
    // Keep drag order when unsorted search is empty; otherwise apply name/date sort.
    if (!draggingId && (debouncedSearch || Object.keys(listFilters).length || sortBy !== 'name_asc')) {
      return applyTableFilters(list, {
        sortBy,
        getName: (row) => row.name || row.key,
        getCreatedAt: (row) => row.created_at || row.updated_at || row.sort_order,
      })
    }
    return list
  }, [sourceRows, debouncedSearch, listFilters, sortBy, draggingId])

  const openDuplicate = (row) => {
    const next = createNestedClone(cloneKind, row)
    if (!next) return
    setActionError(null)
    setEditItem(null)
    setCreating(false)
    setClone(next)
  }
  const backTo = backToProp
    || (org?.slug ? orgPath(org.slug, 'masters/forms') : '#')

  const handleModuleChange = (nextType) => {
    if (!nextType || nextType === entityType || !org?.slug) return
    navigate(orgPath(org.slug, `masters/forms/status/${nextType}`))
  }

  const handleDragStart = (event, id) => {
    if (!canManage) return
    setLocalRows(statuses)
    setDraggingId(id)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', id)
  }

  const handleDragOver = (event, targetId) => {
    if (!draggingId || draggingId === targetId) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDropTargetId(targetId)
  }

  const handleDrop = async (event, targetId) => {
    event.preventDefault()
    if (!draggingId || draggingId === targetId) return
    const toIndex = localRows.findIndex((row) => row.id === targetId)
    const next = reorderItemsById(localRows, draggingId, toIndex)
    setLocalRows(next)
    setDraggingId(null)
    setDropTargetId(null)
    try {
      await reorder(next.map((row) => row.id))
    } catch (err) {
      setActionError(err.message)
      setLocalRows(statuses)
    }
  }

  const handleDelete = async (row) => {
    if (row.is_system) {
      setActionError('System statuses cannot be deleted. Deactivate them instead.')
      return
    }
    if (!(await requestDelete({ title: 'Delete status', message: `Delete status "${row.name}"?` }))) return
    try {
      await remove(row.id)
    } catch (err) {
      setActionError(err.message)
    }
  }

  const handleReset = async () => {
    if (!window.confirm(`Reset ${label} statuses to defaults? Custom statuses stay; system ones are restored.`)) return
    try {
      await reset()
    } catch (err) {
      setActionError(err.message)
    }
  }

  const rowsForDisplay = filteredRows
  const orderIndexById = useMemo(() => {
    const map = new Map()
    sourceRows.forEach((row, index) => map.set(row.id, index + 1))
    return map
  }, [sourceRows])

  return (
    <div className="company-page others-page">
      <header className="company-page__header">
        <PageBack to={backTo} label={backLabel} />
        <h1 className="company-page__title">{label} statuses</h1>
        <p className="company-page__subtitle">
          Active statuses appear in {label.toLowerCase()} status dropdowns and filters.
        </p>
      </header>

      <div className="company-page__content">
        <div className="company-panel">
          <div className="company-panel__toolbar company-panel__toolbar--filters">
            <TableFilterToolbar
              search={{
                value: search,
                onChange: setSearch,
                placeholder: 'Search status name or key…',
                ariaLabel: 'Search statuses',
              }}
              filter={{
                fields: filterFields,
                values: columnFilters,
                onChange: setColumnFilters,
              }}
              sort={{ value: sortBy, onChange: setSortBy, options: TABLE_SORT_OPTIONS }}
              actions={(
                <>
                  <label className="company-form__field company-form__field--inline others-status-module">
                    <span className="company-form__label">Module</span>
                    <select
                      className="company-form__input"
                      value={entityType || ''}
                      onChange={(event) => handleModuleChange(event.target.value)}
                      aria-label="Status module"
                    >
                      {STATUS_MODULE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  {canManage && (
                    <button
                      type="button"
                      className="company-btn company-btn--secondary"
                      onClick={handleReset}
                      disabled={saving}
                    >
                      Reset defaults
                    </button>
                  )}
                  {canManage && (
                    <button
                      type="button"
                      className="company-btn company-btn--primary"
                      onClick={() => { setCreating(true); setEditItem(null); setClone(null) }}
                      disabled={saving}
                    >
                      + Add status
                    </button>
                  )}
                </>
              )}
            />
          </div>

          {(error || actionError) && (
            <div className="company-alert">{error || actionError}</div>
          )}

          {loading ? (
            <div className="company-loading">Loading statuses…</div>
          ) : (
            <div className="company-table-wrap">
              <div className="company-table-scroll">
                <table className="company-table master-table task-meta-table">
                  <thead>
                    <tr>
                      {canManage && <th className="task-meta-table__drag-col" aria-label="Reorder" />}
                      <DataColumnHead columnId="order" label="Order" className="task-meta-table__order-col" filters={columnFilters} onFilter={(id, value) => updateColumnFilter(setColumnFilters, id, value)} />
                      <DataColumnHead columnId="name" label="Status" filters={columnFilters} onFilter={(id, value) => updateColumnFilter(setColumnFilters, id, value)} />
                      <DataColumnHead columnId="key" label="Key" filters={columnFilters} onFilter={(id, value) => updateColumnFilter(setColumnFilters, id, value)} />
                      <DataColumnHead columnId="state" label="State" filters={columnFilters} onFilter={(id, value) => updateColumnFilter(setColumnFilters, id, value)} />
                      <DataColumnHead columnId="type" label="Type" filters={columnFilters} onFilter={(id, value) => updateColumnFilter(setColumnFilters, id, value)} />
                      {canManage && <th>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rowsForDisplay.length === 0 ? (
                      <TableEmptyRow colSpan={canManage ? 7 : 5}>
                        {statuses.length === 0
                          ? 'No statuses yet. Add one to show it in dropdowns.'
                          : 'No statuses match your search.'}
                      </TableEmptyRow>
                    ) : rowsForDisplay.map((row) => {
                      const color = row.color || '#6B7280'
                      const isActive = row.is_active !== false
                      return (
                        <tr
                          key={row.id}
                          className={[
                            draggingId === row.id ? 'task-meta-table__row--dragging' : '',
                            dropTargetId === row.id && draggingId !== row.id ? 'task-meta-table__row--drop-target' : '',
                          ].filter(Boolean).join(' ')}
                          onDragOver={(event) => handleDragOver(event, row.id)}
                          onDrop={(event) => handleDrop(event, row.id)}
                        >
                          {canManage && (
                            <td className="task-meta-table__drag-col">
                              <span
                                className="task-meta-table__drag"
                                draggable={!saving}
                                onDragStart={(event) => handleDragStart(event, row.id)}
                                onDragEnd={() => { setDraggingId(null); setDropTargetId(null) }}
                                aria-label={`Drag to reorder ${row.name}`}
                                title="Drag to reorder"
                              >
                                <DragHandle />
                              </span>
                            </td>
                          )}
                          <td className="task-meta-table__order-col">{orderIndexById.get(row.id) || '—'}</td>
                          <td>
                            <span className="task-meta-table__name">
                              <span className="task-meta-table__dot" style={{ background: color }} />
                              {row.name}
                            </span>
                          </td>
                          <td>
                            <code className="company-code">
                              {entityType === 'task' ? '—' : row.key}
                            </code>
                          </td>
                          <td>
                            <span className={`task-meta-table__status-badge ${isActive ? 'task-meta-table__status-badge--active' : 'task-meta-table__status-badge--inactive'}`}>
                              <span className="task-meta-table__status-dot" />
                              {isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td>{row.is_system ? 'System' : 'Custom'}</td>
                          {canManage && (
                            <td>
                              <div className="company-table__actions">
                                <button
                                  type="button"
                                  className="company-btn company-btn--secondary company-btn--compact company-btn--icon"
                                  onClick={() => { setEditItem(row); setCreating(false); setClone(null) }}
                                  aria-label={`Edit ${row.name}`}
                                  disabled={saving}
                                >
                                  <EditIcon />
                                </button>
                                <DuplicateRowButton
                                  onClick={() => openDuplicate(row)}
                                  disabled={saving}
                                  label={`Duplicate ${row.name}`}
                                />
                                {!row.is_system && (
                                  <button
                                    type="button"
                                    className="company-btn company-btn--danger company-btn--compact company-btn--icon"
                                    onClick={() => handleDelete(row)}
                                    aria-label={`Delete ${row.name}`}
                                    disabled={saving}
                                  >
                                    <TrashIcon />
                                  </button>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {(creating || editItem || clone) && (
        <OrgStatusEditModal
          key={editItem?.id ?? (clone ? `clone-${clone.source.id}` : 'new')}
          item={editItem || clone?.draft || null}
          cloneSourceName={clone?.source?.name || null}
          entityLabel={label}
          saving={saving}
          onClose={closeEditor}
          onSave={async (payload) => {
            if (editItem?.id) await update(editItem.id, payload)
            else await create(prepareNestedCloneCreate(cloneKind, clone, payload))
          }}
        />
      )}
      {deleteModal}
    </div>
  )
}
