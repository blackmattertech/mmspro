import { useEffect, useState } from 'react'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import PageBack from '../shared/PageBack'
import { reorderItemsById } from '../../lib/assetFormSchema'
import { useTaskMeta } from '../../hooks/useTaskMeta'
import EditIcon from '../ui/EditIcon'
import TrashIcon from '../ui/TrashIcon'
import TaskMetaEditModal from './TaskMetaEditModal'
import TaskPriorityIcon from './TaskPriorityIcon'
import '../company/CompanyShared.css'
import './TaskMetaSettings.css'

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

function InfoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
      <path d="M12 11v6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <circle cx="12" cy="8" r="1" fill="currentColor" />
    </svg>
  )
}

function ResetIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 7V4h3M20 17v3h-3M7 20A8 8 0 1 0 7 4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function StatusSectionIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 6h16M4 12h10M4 18h14"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <circle cx="19" cy="12" r="2" fill="currentColor" />
    </svg>
  )
}

function PrioritySectionIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 4v16M6 4l10 5-10 5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ActiveBadge({ active }) {
  return (
    <span className={`task-meta-table__status-badge ${active ? 'task-meta-table__status-badge--active' : 'task-meta-table__status-badge--inactive'}`}>
      <span className="task-meta-table__status-dot" />
      {active ? 'Active' : 'Inactive'}
    </span>
  )
}

const TABLE_HEADER_HEIGHT = 48
const TABLE_ROW_HEIGHT = 52

function MetaDragTable({
  kind,
  rows,
  onReorder,
  onEdit,
  onDelete,
  saving,
}) {
  const [localRows, setLocalRows] = useState(rows)
  const [draggingId, setDraggingId] = useState(null)
  const [dropTargetId, setDropTargetId] = useState(null)
  const isPriority = kind === 'priority'

  useEffect(() => {
    setLocalRows(rows)
  }, [rows])

  const handleDragStart = (event, id) => {
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
      await onReorder(next.map((row) => row.id))
    } catch {
      setLocalRows(rows)
    }
  }

  const handleDragEnd = () => {
    setDraggingId(null)
    setDropTargetId(null)
  }

  const tableMinHeight = TABLE_HEADER_HEIGHT + Math.max(localRows.length, 1) * TABLE_ROW_HEIGHT

  return (
    <div className="company-table-wrap task-meta-section__table-wrap">
      <div
        className="company-table-scroll task-meta-section__table-scroll"
        style={{ minHeight: tableMinHeight }}
      >
        <table className="company-table master-table task-meta-table">
          <thead>
            <tr>
              <th className="task-meta-table__drag-col" aria-label="Reorder" />
              <th className="task-meta-table__order-col">Order</th>
              <th>{isPriority ? 'Priority Name' : 'Status Name'}</th>
              {isPriority && <th>Icon</th>}
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {localRows.length === 0 ? (
              <tr>
                <td colSpan={isPriority ? 6 : 5} className="task-meta-table__empty">
                  No {isPriority ? 'priorities' : 'statuses'} yet. Use the button above to add one.
                </td>
              </tr>
            ) : null}
            {localRows.map((row, index) => {
              const color = row.color || '#6B7280'
              const isDragging = draggingId === row.id
              const isDropTarget = dropTargetId === row.id && draggingId !== row.id
              const isActive = row.is_active !== false

              return (
                <tr
                  key={row.id}
                  className={[
                    isDragging ? 'task-meta-table__row--dragging' : '',
                    isDropTarget ? 'task-meta-table__row--drop-target' : '',
                  ].filter(Boolean).join(' ')}
                  onDragOver={(event) => handleDragOver(event, row.id)}
                  onDrop={(event) => handleDrop(event, row.id)}
                >
                  <td className="task-meta-table__drag-col">
                    <span
                      className="task-meta-table__drag"
                      draggable={!saving}
                      onDragStart={(event) => handleDragStart(event, row.id)}
                      onDragEnd={handleDragEnd}
                      aria-label={`Drag to reorder ${row.name}`}
                      title="Drag to reorder"
                    >
                      <DragHandle />
                    </span>
                  </td>
                  <td className="task-meta-table__order-col">{index + 1}</td>
                  <td>
                    <span className="task-meta-table__name">
                      <span className="task-meta-table__dot" style={{ background: color }} />
                      {row.name}
                    </span>
                  </td>
                  {isPriority && (
                    <td>
                      <span className="task-meta-table__icon-cell" style={{ color }}>
                        <TaskPriorityIcon icon={row.icon} size={18} color={color} />
                      </span>
                    </td>
                  )}
                  <td><ActiveBadge active={isActive} /></td>
                  <td>
                    <div className="company-table__actions">
                      <button
                        type="button"
                        className="company-btn company-btn--secondary company-btn--compact company-btn--icon"
                        onClick={() => onEdit(row)}
                        aria-label={`Edit ${row.name}`}
                        title="Edit"
                        disabled={saving}
                      >
                        <EditIcon />
                      </button>
                      <button
                        type="button"
                        className="company-btn company-btn--danger company-btn--compact company-btn--icon"
                        onClick={() => onDelete(row)}
                        aria-label={`Delete ${row.name}`}
                        title="Delete"
                        disabled={saving}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function TaskMetaSettingsModal({ onClose }) {
  const handleBackdropClick = useBackdropClose(onClose)
  const {
    statuses,
    priorities,
    categories,
    tags,
    loading,
    saving,
    error,
    createStatus,
    updateStatus,
    deleteStatus,
    reorderStatuses,
    createPriority,
    updatePriority,
    deletePriority,
    reorderPriorities,
    createCategory,
    updateCategory,
    deleteCategory,
    createTag,
    updateTag,
    deleteTag,
    resetAll,
  } = useTaskMeta({ includeInactive: true })

  const [editState, setEditState] = useState(null)

  const openCreate = (kind) => setEditState({ kind, item: null })
  const openEdit = (kind, item) => setEditState({ kind, item })

  const handleSave = async (payload) => {
    if (!editState) return
    const { kind, item } = editState
    if (item?.id) {
      if (kind === 'status') await updateStatus(item.id, payload)
      else if (kind === 'priority') await updatePriority(item.id, payload)
      else if (kind === 'category') await updateCategory(item.id, payload)
      else if (kind === 'tag') await updateTag(item.id, payload)
    } else if (kind === 'status') {
      await createStatus({ ...payload, sort_order: statuses.length })
    } else if (kind === 'priority') {
      await createPriority({ ...payload, sort_order: priorities.length })
    } else if (kind === 'category') {
      await createCategory({ ...payload, sort_order: categories.length })
    } else if (kind === 'tag') {
      await createTag({ ...payload, sort_order: tags.length })
    }
  }

  const handleDelete = async (kind, row) => {
    if (!window.confirm(`Delete "${row.name}"? This cannot be undone.`)) return
    if (kind === 'status') await deleteStatus(row.id)
    else if (kind === 'priority') await deletePriority(row.id)
    else if (kind === 'category') await deleteCategory(row.id)
    else if (kind === 'tag') await deleteTag(row.id)
  }

  const handleReset = async () => {
    if (!window.confirm('Reset statuses, priorities, categories, and tags to defaults?')) return
    await resetAll()
  }

  return (
    <div className="company-modal-overlay task-meta-settings-overlay" onMouseDown={handleBackdropClick}>
      <div
        className="company-modal company-modal--wide task-meta-settings-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="task-meta-settings-title"
      >
        <div className="company-modal__header">
          <div className="modal__header-main">
            <PageBack onClick={onClose} className="page-back--header" label="Tasks & Follow-ups" />
            <div>
              <h2 id="task-meta-settings-title">Task Masters</h2>
              <p className="company-page__subtitle">
                Manage statuses, priorities, categories, and tags.
              </p>
            </div>
          </div>
          <button type="button" className="company-modal__close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="task-meta-settings-modal__body">
          {error && <div className="company-alert" role="alert">{error}</div>}
          {loading ? (
            <div className="company-loading">Loading settings…</div>
          ) : (
            <>
              <section className="task-meta-section">
                <div className="task-meta-section__header">
                  <div className="task-meta-section__lead">
                    <span className="task-meta-section__icon task-meta-section__icon--status">
                      <StatusSectionIcon />
                    </span>
                    <div>
                      <h3 className="task-meta-section__title">Status Management</h3>
                      <p className="task-meta-section__subtitle">
                        Define workflow stages for tasks in your organization.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="company-btn company-btn--primary company-btn--compact task-meta-section__add"
                    onClick={() => openCreate('status')}
                    disabled={saving}
                  >
                    + New Status
                  </button>
                </div>
                <MetaDragTable
                  kind="status"
                  rows={statuses}
                  saving={saving}
                  onReorder={reorderStatuses}
                  onEdit={(row) => openEdit('status', row)}
                  onDelete={(row) => handleDelete('status', row)}
                />
              </section>

              <section className="task-meta-section task-meta-section--priority">
                <div className="task-meta-section__header">
                  <div className="task-meta-section__lead">
                    <span className="task-meta-section__icon task-meta-section__icon--priority">
                      <PrioritySectionIcon />
                    </span>
                    <div>
                      <h3 className="task-meta-section__title">Priority Management</h3>
                      <p className="task-meta-section__subtitle">
                        Set urgency levels used when creating and sorting tasks.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="company-btn company-btn--primary company-btn--compact task-meta-section__add"
                    onClick={() => openCreate('priority')}
                    disabled={saving}
                  >
                    + New Priority
                  </button>
                </div>
                <MetaDragTable
                  kind="priority"
                  rows={priorities}
                  saving={saving}
                  onReorder={reorderPriorities}
                  onEdit={(row) => openEdit('priority', row)}
                  onDelete={(row) => handleDelete('priority', row)}
                />
              </section>

              <section className="task-meta-section">
                <div className="task-meta-section__header">
                  <div className="task-meta-section__lead">
                    <div>
                      <h3 className="task-meta-section__title">Category Management</h3>
                      <p className="task-meta-section__subtitle">Configurable task categories.</p>
                    </div>
                  </div>
                  <button type="button" className="company-btn company-btn--primary company-btn--compact" onClick={() => openCreate('category')} disabled={saving}>+ New Category</button>
                </div>
                <div className="company-table-wrap">
                  <table className="company-table">
                    <thead><tr><th>Name</th><th>Active</th><th>Actions</th></tr></thead>
                    <tbody>
                      {categories.map((row) => (
                        <tr key={row.id}>
                          <td>{row.name}</td>
                          <td><ActiveBadge active={row.is_active} /></td>
                          <td>
                            <button type="button" className="company-btn company-btn--secondary company-btn--compact" onClick={() => openEdit('category', row)}>Edit</button>
                            <button type="button" className="company-btn company-btn--danger company-btn--compact" onClick={() => handleDelete('category', row)}>Delete</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="task-meta-section">
                <div className="task-meta-section__header">
                  <div className="task-meta-section__lead">
                    <div>
                      <h3 className="task-meta-section__title">Tag Management</h3>
                      <p className="task-meta-section__subtitle">Multi-select tags for search and filtering.</p>
                    </div>
                  </div>
                  <button type="button" className="company-btn company-btn--primary company-btn--compact" onClick={() => openCreate('tag')} disabled={saving}>+ New Tag</button>
                </div>
                <div className="company-table-wrap">
                  <table className="company-table">
                    <thead><tr><th>Name</th><th>Active</th><th>Actions</th></tr></thead>
                    <tbody>
                      {tags.map((row) => (
                        <tr key={row.id}>
                          <td>{row.name}</td>
                          <td><ActiveBadge active={row.is_active} /></td>
                          <td>
                            <button type="button" className="company-btn company-btn--secondary company-btn--compact" onClick={() => openEdit('tag', row)}>Edit</button>
                            <button type="button" className="company-btn company-btn--danger company-btn--compact" onClick={() => handleDelete('tag', row)}>Delete</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </div>

        <div className="task-meta-settings-modal__footer">
          <p className="task-meta-settings-modal__hint">
            <InfoIcon />
            Drag and drop to reorder items
          </p>
          <button
            type="button"
            className="company-btn company-btn--secondary company-btn--compact"
            onClick={handleReset}
            disabled={saving || loading}
          >
            <ResetIcon />
            Reset to Default
          </button>
        </div>
      </div>

      {editState && (
        <TaskMetaEditModal
          kind={editState.kind}
          item={editState.item}
          saving={saving}
          onClose={() => setEditState(null)}
          onSave={handleSave}
        />
      )}
    </div>
  )
}
