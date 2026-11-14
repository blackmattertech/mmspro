import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import SettingsIcon from '../ui/SettingsIcon'
import ColumnReorderPanel from './ColumnReorderPanel'
import './TableColumnPicker.css'

export default function TableColumnPicker({
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
  className = '',
}) {
  const [open, setOpen] = useState(false)
  const [menuStyle, setMenuStyle] = useState(null)
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  const canReorder = typeof onReorder === 'function' || typeof onMove === 'function'
  const toggleableCount = columnDefs.filter((col) => !col.locked).length
  const hiddenCount = columnDefs
    .filter((col) => !col.locked)
    .filter((col) => !visibleColumnIds.includes(col.id)).length

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

  if (!toggleableCount) return null

  return (
    <div className={`table-column-picker ${className}`.trim()} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`table-column-picker__trigger company-btn company-btn--secondary company-btn--compact company-btn--icon${open ? ' table-column-picker__trigger--open' : ''}`}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Configure columns"
        title="Columns"
        data-tooltip="Columns"
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
          data-fixed-popover=""
          style={menuStyle}
        >
          <ColumnReorderPanel
            columnDefs={columnDefs}
            visibleColumnIds={visibleColumnIds}
            columnOrder={columnOrder}
            onToggle={onToggle}
            onReset={onReset}
            onReorder={onReorder}
            onMove={onMove}
            onSave={onSave}
            onMakeDefault={onMakeDefault}
            makingDefault={makingDefault}
          />
        </div>,
        document.body,
      )}
    </div>
  )
}
