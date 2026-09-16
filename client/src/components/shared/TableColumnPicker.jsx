import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import SettingsIcon from '../ui/SettingsIcon'
import './TableColumnPicker.css'

function orderedToggleable(columnDefs, visibleColumnIds) {
  const toggleable = columnDefs.filter((col) => !col.locked)
  const byId = new Map(toggleable.map((col) => [col.id, col]))
  const seen = new Set()
  const list = []
  for (const id of visibleColumnIds) {
    const col = byId.get(id)
    if (!col || seen.has(id)) continue
    list.push(col)
    seen.add(id)
  }
  for (const col of toggleable) {
    if (seen.has(col.id)) continue
    list.push(col)
  }
  return list
}

function moveById(list, fromId, toId) {
  const from = list.findIndex((col) => col.id === fromId)
  const to = list.findIndex((col) => col.id === toId)
  if (from < 0 || to < 0 || from === to) return list
  const next = list.slice()
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

function GripIcon() {
  return (
    <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor" aria-hidden="true">
      <circle cx="3.5" cy="3" r="1.25" />
      <circle cx="8.5" cy="3" r="1.25" />
      <circle cx="3.5" cy="8" r="1.25" />
      <circle cx="8.5" cy="8" r="1.25" />
      <circle cx="3.5" cy="13" r="1.25" />
      <circle cx="8.5" cy="13" r="1.25" />
    </svg>
  )
}

export default function TableColumnPicker({
  columnDefs = [],
  visibleColumnIds = [],
  onToggle,
  onReset,
  onReorder,
  className = '',
}) {
  const [open, setOpen] = useState(false)
  const [menuStyle, setMenuStyle] = useState(null)
  const [dragId, setDragId] = useState(null)
  const [overId, setOverId] = useState(null)
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  const listId = useId()
  const canReorder = typeof onReorder === 'function'

  const columns = useMemo(
    () => orderedToggleable(columnDefs, visibleColumnIds),
    [columnDefs, visibleColumnIds],
  )
  const hiddenCount = columns.filter((col) => !visibleColumnIds.includes(col.id)).length

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return

    const rect = trigger.getBoundingClientRect()
    const maxHeight = Math.max(160, window.innerHeight - rect.bottom - 16)

    setMenuStyle((prev) => {
      const next = {
        top: rect.bottom + 6,
        right: window.innerWidth - rect.right,
        maxHeight,
      }
      if (
        prev
        && prev.top === next.top
        && prev.right === next.right
        && prev.maxHeight === next.maxHeight
      ) {
        return prev
      }
      return next
    })
  }, [])

  useEffect(() => {
    if (!open) return undefined

    updateMenuPosition()
    setDragId(null)
    setOverId(null)

    const onPointerDown = (event) => {
      if (
        rootRef.current?.contains(event.target)
        || menuRef.current?.contains(event.target)
      ) {
        return
      }
      setOpen(false)
    }

    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
    }
  }, [open, updateMenuPosition])

  if (!columns.length) return null

  const applyReorder = (fromId, toId) => {
    if (!canReorder || !fromId || !toId || fromId === toId) return
    onReorder(moveById(columns, fromId, toId).map((col) => col.id))
  }

  return (
    <div className={`table-column-picker ${className}`.trim()} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`table-column-picker__trigger company-btn company-btn--secondary company-btn--compact company-btn--icon${open ? ' table-column-picker__trigger--open' : ''}`}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listId}
        aria-label="Configure columns"
        title="Configure columns"
        onClick={() => setOpen((value) => !value)}
      >
        <SettingsIcon />
        {hiddenCount > 0 && (
          <span className="table-column-picker__badge" aria-hidden="true">
            {hiddenCount}
          </span>
        )}
      </button>

      {open && menuStyle && createPortal(
        <div
          ref={menuRef}
          className={`table-column-picker__menu${canReorder ? ' table-column-picker__menu--reorder' : ''}`}
          role="listbox"
          id={listId}
          aria-label="Table columns"
          data-fixed-popover=""
          style={menuStyle}
        >
          <div className="table-column-picker__menu-head">
            <span>{canReorder ? 'Show & reorder' : 'Show columns'}</span>
            <button
              type="button"
              className="table-column-picker__reset"
              onClick={() => onReset?.()}
            >
              Reset
            </button>
          </div>
          {canReorder ? (
            <p className="table-column-picker__hint">Drag rows up or down to change column order</p>
          ) : null}
          <ul className="table-column-picker__list">
            {columns.map((col) => {
              const checked = visibleColumnIds.includes(col.id)
              return (
                <li
                  key={col.id}
                  className={[
                    'table-column-picker__item',
                    dragId === col.id ? 'table-column-picker__item--dragging' : '',
                    overId === col.id && dragId && dragId !== col.id ? 'table-column-picker__item--over' : '',
                  ].filter(Boolean).join(' ')}
                  onDragOver={(event) => {
                    if (!canReorder || !dragId) return
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'move'
                    if (overId !== col.id) setOverId(col.id)
                  }}
                  onDrop={(event) => {
                    event.preventDefault()
                    applyReorder(dragId, col.id)
                    setDragId(null)
                    setOverId(null)
                  }}
                >
                  {canReorder ? (
                    <span
                      className="table-column-picker__grip"
                      title="Drag to reorder"
                      aria-label={`Reorder ${col.label}`}
                      role="button"
                      tabIndex={0}
                      draggable
                      onDragStart={(event) => {
                        setDragId(col.id)
                        event.dataTransfer.effectAllowed = 'move'
                        event.dataTransfer.setData('text/plain', col.id)
                      }}
                      onDragEnd={() => {
                        setDragId(null)
                        setOverId(null)
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
                        event.preventDefault()
                        const index = columns.findIndex((item) => item.id === col.id)
                        const target = columns[index + (event.key === 'ArrowUp' ? -1 : 1)]
                        if (target) applyReorder(col.id, target.id)
                      }}
                    >
                      <GripIcon />
                    </span>
                  ) : null}
                  <label className="table-column-picker__option">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle?.(col.id)}
                    />
                    <span>{col.label}</span>
                  </label>
                </li>
              )
            })}
          </ul>
        </div>,
        document.body,
      )}
    </div>
  )
}
