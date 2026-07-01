import { useMemo, useState } from 'react'
import { useDesignations } from '../../hooks/useDesignations'
import { useDepartments } from '../../hooks/useDepartments'
import GooToggle from '../ui/GooToggle'
import DesignationModal, { formatDesignationDepartments } from './DesignationModal'
import './CompanyShared.css'

function reorderList(items, fromId, toIndex) {
  const sorted = [...items].sort((a, b) => a.hierarchy - b.hierarchy)
  const fromIndex = sorted.findIndex((item) => item.id === fromId)
  if (fromIndex === -1) return sorted.map((item) => item.id)

  const next = [...sorted]
  const [moved] = next.splice(fromIndex, 1)
  const clamped = Math.max(0, Math.min(toIndex, next.length))
  next.splice(clamped, 0, moved)
  return next.map((item) => item.id)
}

function DragHandle() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="designation-drag-handle">
      <circle cx="4.5" cy="3.5" r="1" fill="currentColor" />
      <circle cx="9.5" cy="3.5" r="1" fill="currentColor" />
      <circle cx="4.5" cy="7" r="1" fill="currentColor" />
      <circle cx="9.5" cy="7" r="1" fill="currentColor" />
      <circle cx="4.5" cy="10.5" r="1" fill="currentColor" />
      <circle cx="9.5" cy="10.5" r="1" fill="currentColor" />
    </svg>
  )
}

export default function DesignationsTab({ canManage }) {
  const [departmentFilter, setDepartmentFilter] = useState('')
  const { departments } = useDepartments()
  const {
    designations,
    loading,
    saving,
    error,
    create,
    update,
    remove,
    reorder,
    toggleActive,
    setHierarchy,
  } = useDesignations(departmentFilter)

  const activeDepartments = departments.filter((d) => d.is_active !== false)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [togglingId, setTogglingId] = useState(null)
  const [draggingId, setDraggingId] = useState(null)
  const [dropTargetId, setDropTargetId] = useState(null)
  const [hierarchyDraft, setHierarchyDraft] = useState({})

  const sortedDesignations = useMemo(
    () => [...designations].sort((a, b) => a.hierarchy - b.hierarchy),
    [designations],
  )

  const activeCount = designations.filter((d) => d.is_active !== false).length

  const openCreate = () => {
    setEditing(null)
    setModalOpen(true)
  }

  const openEdit = (item) => {
    setEditing(item)
    setModalOpen(true)
  }

  const handleSave = async (payload) => {
    try {
      if (editing) await update(editing.id, payload)
      else await create(payload)
      setModalOpen(false)
    } catch {
      // keep modal open
    }
  }

  const handleDelete = async (item) => {
    if (!window.confirm(`Delete designation "${item.name}"?`)) return
    await remove(item.id)
  }

  const handleToggle = async (item, isActive) => {
    setTogglingId(item.id)
    try {
      await toggleActive(item.id, isActive)
    } catch {
      // error shown in tab
    } finally {
      setTogglingId(null)
    }
  }

  const applyReorder = async (fromId, toIndex) => {
    const ids = reorderList(sortedDesignations, fromId, toIndex)
    try {
      await reorder(ids)
    } catch {
      // error shown in tab
    }
  }

  const handleDragStart = (event, id) => {
    if (!canManage) return
    setDraggingId(id)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', id)
  }

  const handleDragOver = (event, targetId) => {
    if (!canManage || !draggingId || draggingId === targetId) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDropTargetId(targetId)
  }

  const handleDrop = async (event, targetId) => {
    event.preventDefault()
    if (!canManage || !draggingId || draggingId === targetId) return

    const toIndex = sortedDesignations.findIndex((item) => item.id === targetId)
    await applyReorder(draggingId, toIndex)
    setDraggingId(null)
    setDropTargetId(null)
  }

  const handleDragEnd = () => {
    setDraggingId(null)
    setDropTargetId(null)
  }

  const handleHierarchyFocus = (id, value) => {
    setHierarchyDraft((prev) => ({ ...prev, [id]: String(value) }))
  }

  const handleHierarchyBlur = async (item) => {
    const draft = hierarchyDraft[item.id]
    setHierarchyDraft((prev) => {
      const next = { ...prev }
      delete next[item.id]
      return next
    })

    if (draft === undefined) return

    const parsed = parseInt(draft, 10)
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > sortedDesignations.length) return
    if (parsed === item.hierarchy) return

    try {
      await setHierarchy(item.id, parsed)
    } catch {
      // error shown in tab
    }
  }

  return (
    <div className="company-panel">
      <div className="company-panel__toolbar">
        <div className="company-panel__filters">
          <label className="company-filter">
            <span>Department</span>
            <select
              className="company-form__input company-form__input--select"
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
            >
              <option value="">All departments</option>
              {activeDepartments.map((dept) => (
                <option key={dept.id} value={dept.id}>{dept.name}</option>
              ))}
            </select>
          </label>
          <p className="company-panel__count">
            {activeCount} active · {designations.length} total designation(s)
          </p>
        </div>
        {canManage && (
          <button type="button" className="company-btn company-btn--primary" onClick={openCreate}>
            + Add Designation
          </button>
        )}
      </div>

      {error && <div className="company-alert">{error}</div>}

      {loading ? (
        <div className="company-loading">Loading designations...</div>
      ) : designations.length === 0 ? (
        <div className="company-empty">No designations yet. Add roles like Manager, Supervisor, Technician.</div>
      ) : (
        <div className="company-table-wrap">
          <table className="company-table master-table">
            <thead>
              <tr>
                <th>Hierarchy</th>
                <th>Name</th>
                <th>Departments</th>
                <th>Description</th>
                {canManage && <th>Active</th>}
                {canManage && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {sortedDesignations.map((item) => {
                const isActive = item.is_active !== false
                const isDragging = draggingId === item.id
                const isDropTarget = dropTargetId === item.id && draggingId !== item.id

                return (
                  <tr
                    key={item.id}
                    className={[
                      !isActive ? 'company-table__row--inactive' : '',
                      isDragging ? 'designation-row--dragging' : '',
                      isDropTarget ? 'designation-row--drop-target' : '',
                    ].filter(Boolean).join(' ') || undefined}
                    onDragOver={(event) => handleDragOver(event, item.id)}
                    onDrop={(event) => handleDrop(event, item.id)}
                  >
                    <td>
                      <div className="designation-hierarchy">
                        {canManage && (
                          <span
                            className="designation-hierarchy__handle"
                            draggable
                            onDragStart={(event) => handleDragStart(event, item.id)}
                            onDragEnd={handleDragEnd}
                            aria-label={`Drag to reorder ${item.name}`}
                          >
                            <DragHandle />
                          </span>
                        )}
                        {canManage ? (
                          <input
                            type="number"
                            className="designation-hierarchy__input"
                            min={1}
                            max={sortedDesignations.length}
                            value={hierarchyDraft[item.id] ?? item.hierarchy}
                            onChange={(e) => handleHierarchyFocus(item.id, e.target.value)}
                            onBlur={() => handleHierarchyBlur(item)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') e.currentTarget.blur()
                            }}
                            aria-label={`Hierarchy for ${item.name}`}
                          />
                        ) : (
                          <span className="designation-hierarchy__value">{item.hierarchy}</span>
                        )}
                      </div>
                    </td>
                    <td><span className="company-table__name">{item.name}</span></td>
                    <td>{formatDesignationDepartments(item)}</td>
                    <td>{item.description || '—'}</td>
                    {canManage && (
                      <td>
                        <GooToggle
                          checked={isActive}
                          disabled={togglingId === item.id || saving}
                          onChange={(checked) => handleToggle(item, checked)}
                          ariaLabel={`${isActive ? 'Disable' : 'Enable'} ${item.name}`}
                        />
                      </td>
                    )}
                    {canManage && (
                      <td>
                        <div className="company-table__actions">
                          <button type="button" className="company-link" onClick={() => openEdit(item)}>
                            Edit
                          </button>
                          <button
                            type="button"
                            className="company-link company-link--danger"
                            onClick={() => handleDelete(item)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <DesignationModal
          key={editing?.id ?? 'new'}
          designation={editing}
          departments={activeDepartments}
          saving={saving}
          onClose={() => setModalOpen(false)}
          onSave={handleSave}
        />
      )}
    </div>
  )
}
