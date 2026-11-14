import { useId, useMemo, useRef, useState } from 'react'
import './TableColumnPicker.css'

function orderedToggleable(columnDefs, visibleColumnIds, columnOrder) {
  const toggleable = columnDefs.filter((col) => !col.locked)
  const byId = new Map(toggleable.map((col) => [col.id, col]))
  const seen = new Set()
  const list = []
  const preferred = columnOrder?.length ? columnOrder : visibleColumnIds
  for (const id of preferred) {
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

/**
 * Inline or popover body for show/hide + drag reorder of table columns.
 * Matches the Work Orders “Show & reorder” control.
 */
export default function ColumnReorderPanel({
  columnDefs = [],
  visibleColumnIds = [],
  columnOrder,
  onToggle,
  onReset,
  onReorder,
  onMove,
  onSave,
  onMakeDefault,
  makingDefault = false,
  title,
  className = '',
  listClassName = '',
}) {
  const [savedFlash, setSavedFlash] = useState(false)
  const [defaultFlash, setDefaultFlash] = useState(false)
  const [dragId, setDragId] = useState(null)
  const [overId, setOverId] = useState(null)
  const dragRef = useRef(null)
  const columnsRef = useRef([])
  const listId = useId()
  const canDrag = typeof onReorder === 'function'
  const canMove = typeof onMove === 'function'
  const canReorder = canDrag || canMove

  const columns = useMemo(
    () => orderedToggleable(columnDefs, visibleColumnIds, columnOrder),
    [columnDefs, visibleColumnIds, columnOrder],
  )
  columnsRef.current = columns

  if (!columns.length) return null

  const applyReorder = (fromId, toId) => {
    if (!canDrag || !fromId || !toId || fromId === toId) return
    onReorder(moveById(columnsRef.current, fromId, toId).map((col) => col.id))
  }

  const endDrag = (commit) => {
    const drag = dragRef.current
    dragRef.current = null
    setDragId(null)
    setOverId(null)
    if (commit && drag?.id && drag.overId) applyReorder(drag.id, drag.overId)
  }

  const headTitle = title ?? (canReorder ? 'Show & reorder' : 'Show columns')

  return (
    <div
      className={`table-column-picker__panel${canReorder ? ' table-column-picker__panel--reorder' : ''} ${className}`.trim()}
      role="listbox"
      id={listId}
      aria-label="Table columns"
    >
      <div className="table-column-picker__menu-head">
        <span>{headTitle}</span>
        <span className="table-column-picker__menu-actions">
          {onSave ? (
            <button
              type="button"
              className="table-column-picker__reset"
              onClick={() => {
                const saved = onSave()
                if (saved === false) return
                setSavedFlash(true)
                window.setTimeout(() => setSavedFlash(false), 1200)
              }}
            >
              {savedFlash ? 'Saved' : 'Save'}
            </button>
          ) : null}
          {onMakeDefault ? (
            <button
              type="button"
              className="table-column-picker__reset"
              disabled={makingDefault}
              onClick={async () => {
                const saved = await onMakeDefault()
                if (saved === false) return
                setDefaultFlash(true)
                window.setTimeout(() => setDefaultFlash(false), 1400)
              }}
            >
              {makingDefault ? 'Saving…' : (defaultFlash ? 'Default set' : 'Make default')}
            </button>
          ) : null}
          <button
            type="button"
            className="table-column-picker__reset"
            onClick={() => onReset?.()}
          >
            Reset
          </button>
        </span>
      </div>
      {canReorder ? (
        <p className="table-column-picker__hint">
          Drag to reorder, or send a column to the top or bottom
        </p>
      ) : null}
      <ul className={`table-column-picker__list ${listClassName}`.trim()}>
        {columns.map((col) => {
          const checked = visibleColumnIds.includes(col.id)
          return (
            <li
              key={col.id}
              data-column-id={col.id}
              className={[
                'table-column-picker__item',
                dragId === col.id ? 'table-column-picker__item--dragging' : '',
                overId === col.id && dragId && dragId !== col.id ? 'table-column-picker__item--over' : '',
              ].filter(Boolean).join(' ')}
            >
              {canDrag ? (
                <span
                  className="table-column-picker__grip"
                  title="Drag to reorder"
                  aria-label={`Reorder ${col.label}`}
                  role="button"
                  tabIndex={0}
                  onPointerDown={(event) => {
                    if (event.button !== 0) return
                    event.preventDefault()
                    event.stopPropagation()
                    dragRef.current = { id: col.id, overId: col.id }
                    const trackOver = (moveEvent) => {
                      const hit = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)
                      const row = hit?.closest?.('[data-column-id]')
                      const nextOver = row?.getAttribute('data-column-id')
                      if (!dragRef.current || !nextOver || nextOver === dragRef.current.overId) return
                      dragRef.current.overId = nextOver
                      setOverId(nextOver)
                    }
                    let finishDrag
                    let cancelDrag
                    const finish = (commit) => {
                      window.removeEventListener('pointermove', trackOver)
                      window.removeEventListener('pointerup', finishDrag)
                      window.removeEventListener('pointercancel', cancelDrag)
                      endDrag(commit)
                    }
                    finishDrag = () => finish(true)
                    cancelDrag = () => finish(false)
                    window.addEventListener('pointermove', trackOver)
                    window.addEventListener('pointerup', finishDrag)
                    window.addEventListener('pointercancel', cancelDrag)
                    setDragId(col.id)
                    setOverId(col.id)
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
                  disabled={checked && visibleColumnIds.length <= 1}
                  onChange={() => onToggle?.(col.id)}
                />
                <span>{col.label}</span>
              </label>
              {canMove ? (
                <span className="table-column-picker__moves">
                  <button
                    type="button"
                    className="table-column-picker__move"
                    title="Send to top"
                    aria-label={`Send ${col.label} to top`}
                    onClick={() => onMove?.(col.id, 'top')}
                  >
                    Top
                  </button>
                  <button
                    type="button"
                    className="table-column-picker__move"
                    title="Send to bottom"
                    aria-label={`Send ${col.label} to bottom`}
                    onClick={() => onMove?.(col.id, 'bottom')}
                  >
                    Bottom
                  </button>
                </span>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
