import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useOrg } from '../../hooks/useOrg'
import { useOrgStatuses } from '../../hooks/useOrgStatuses'
import { isCompanyAdmin, canManageOrg } from '../../lib/accountRoles'
import { orgPath } from '../../config/navigation'
import { reorderItemsById } from '../../lib/assetFormSchema'
import PageBack from '../../components/shared/PageBack'
import EditIcon from '../../components/ui/EditIcon'
import TrashIcon from '../../components/ui/TrashIcon'
import OrgStatusEditModal from '../../components/others/OrgStatusEditModal'
import '../../components/company/CompanyShared.css'
import '../../components/tasks/TaskMetaSettings.css'
import './Others.css'

const TYPE_LABELS = {
  work_request: 'Work Request',
  work_order: 'Work Order',
  task: 'Tasks & Follow-ups',
  pm_plan: 'Planned Maintenance',
}

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

export default function OthersStatusManage() {
  const { entityType } = useParams()
  const { org } = useOrg()
  const { role } = useAuth()
  const canManage = isCompanyAdmin(role) || canManageOrg(role)
  const label = TYPE_LABELS[entityType] || entityType
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
  const [localRows, setLocalRows] = useState([])
  const [draggingId, setDraggingId] = useState(null)
  const [dropTargetId, setDropTargetId] = useState(null)
  const [actionError, setActionError] = useState(null)

  useEffect(() => {
    setLocalRows(statuses)
  }, [statuses])

  const rows = draggingId ? localRows : statuses
  const backTo = org?.slug ? orgPath(org.slug, 'masters/others/status') : '#'

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
    if (!window.confirm(`Delete status "${row.name}"?`)) return
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

  return (
    <div className="company-page others-page">
      <header className="company-page__header">
        <PageBack to={backTo} label="Status" />
        <div className="others-manage__header-row">
          <div>
            <h1 className="company-page__title">{label} statuses</h1>
            <p className="company-page__subtitle">
              Active statuses appear in {label.toLowerCase()} status dropdowns and filters.
            </p>
          </div>
          {canManage && (
            <div className="others-manage__actions">
              <button
                type="button"
                className="company-btn company-btn--secondary"
                onClick={handleReset}
                disabled={saving}
              >
                Reset defaults
              </button>
              <button
                type="button"
                className="company-btn company-btn--primary"
                onClick={() => { setCreating(true); setEditItem(null) }}
                disabled={saving}
              >
                + Add status
              </button>
            </div>
          )}
        </div>
      </header>

      {!canManage && (
        <p className="company-readonly-note">
          Only company admins can create or edit statuses. You can view the list.
        </p>
      )}

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
                  <th className="task-meta-table__order-col">Order</th>
                  <th>Status</th>
                  <th>Key</th>
                  <th>State</th>
                  <th>Type</th>
                  {canManage && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={canManage ? 7 : 5} className="task-meta-table__empty">
                      No statuses yet. Add one to show it in dropdowns.
                    </td>
                  </tr>
                ) : rows.map((row, index) => {
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
                      <td className="task-meta-table__order-col">{index + 1}</td>
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
                              onClick={() => { setEditItem(row); setCreating(false) }}
                              aria-label={`Edit ${row.name}`}
                              disabled={saving}
                            >
                              <EditIcon />
                            </button>
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

      {(creating || editItem) && (
        <OrgStatusEditModal
          item={editItem}
          entityLabel={label}
          saving={saving}
          onClose={() => { setCreating(false); setEditItem(null) }}
          onSave={async (payload) => {
            if (editItem?.id) await update(editItem.id, payload)
            else await create(payload)
          }}
        />
      )}
    </div>
  )
}
