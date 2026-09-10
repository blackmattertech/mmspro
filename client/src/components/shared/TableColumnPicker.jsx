import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import SettingsIcon from '../ui/SettingsIcon'
import './TableColumnPicker.css'

export default function TableColumnPicker({
  columnDefs = [],
  visibleColumnIds = [],
  onToggle,
  onReset,
  className = '',
}) {
  const [open, setOpen] = useState(false)
  const [menuStyle, setMenuStyle] = useState(null)
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  const listId = useId()

  const toggleable = columnDefs.filter((col) => !col.locked)
  const hiddenCount = toggleable.filter((col) => !visibleColumnIds.includes(col.id)).length

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

  if (!toggleable.length) return null

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
          className="table-column-picker__menu"
          role="listbox"
          id={listId}
          aria-label="Table columns"
          data-fixed-popover=""
          style={menuStyle}
        >
          <div className="table-column-picker__menu-head">
            <span>Show columns</span>
            <button
              type="button"
              className="table-column-picker__reset"
              onClick={() => onReset?.()}
            >
              Reset
            </button>
          </div>
          <ul className="table-column-picker__list">
            {toggleable.map((col) => {
              const checked = visibleColumnIds.includes(col.id)
              return (
                <li key={col.id}>
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
