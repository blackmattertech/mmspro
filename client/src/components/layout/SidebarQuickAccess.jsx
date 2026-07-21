import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useQuickAccess } from '../../hooks/useQuickAccess'
import NavIcon from './NavIcon'

function shortcutTitle(item) {
  if (!item) return ''
  return item.group ? `${item.group} - ${item.label}` : item.label
}

export default function SidebarQuickAccess({
  collapsed = false,
  scope = null,
  options = [],
}) {
  const { ids, add, remove, pruneTo, canAdd, max } = useQuickAccess(scope)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [hoverTitle, setHoverTitle] = useState('')
  const rootRef = useRef(null)

  const byId = useMemo(() => {
    const map = new Map()
    for (const option of options) map.set(option.id, option)
    return map
  }, [options])

  const pinned = useMemo(
    () => ids.map((id) => byId.get(id)).filter(Boolean),
    [ids, byId],
  )

  const available = useMemo(
    () => options.filter((option) => !ids.includes(option.id)),
    [options, ids],
  )

  useEffect(() => {
    if (!pickerOpen) return undefined
    const onPointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setPickerOpen(false)
      }
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setPickerOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [pickerOpen])

  useEffect(() => {
    if (!options.length) return
    pruneTo(options.map((option) => option.id))
  }, [options, pruneTo])

  if (!scope) return null

  return (
    <div
      ref={rootRef}
      className={`sidebar-quick ${collapsed ? 'sidebar-quick--collapsed' : ''}`}
    >
      {!collapsed && (
        <div className="sidebar-quick__header">
          <span className="sidebar-quick__title">Quick access</span>
          <span className="sidebar-quick__count">{pinned.length}/{max}</span>
        </div>
      )}

      <div className="sidebar-quick__row" role="toolbar" aria-label="Quick access">
        {pinned.map((item) => {
          const title = shortcutTitle(item)
          return (
            <div
              key={item.id}
              className="sidebar-quick__slot"
              onMouseEnter={() => setHoverTitle(title)}
              onMouseLeave={() => setHoverTitle('')}
              onFocus={() => setHoverTitle(title)}
              onBlur={() => setHoverTitle('')}
            >
              <NavLink
                to={item.path}
                end
                className={({ isActive }) =>
                  `sidebar-quick__btn ${isActive ? 'sidebar-quick__btn--active' : ''}`
                }
                aria-label={title}
              >
                <NavIcon name={item.icon} />
                {collapsed && (
                  <span className="sidebar-quick__tooltip" aria-hidden="true">{title}</span>
                )}
              </NavLink>
              <button
                type="button"
                className="sidebar-quick__remove"
                aria-label={`Remove ${title} shortcut`}
                onClick={() => remove(item.id)}
              >
                ×
              </button>
            </div>
          )
        })}

        {canAdd && (
          <div
            className="sidebar-quick__slot"
            onMouseEnter={() => setHoverTitle('Add shortcut')}
            onMouseLeave={() => setHoverTitle('')}
            onFocus={() => setHoverTitle('Add shortcut')}
            onBlur={() => setHoverTitle('')}
          >
            <button
              type="button"
              className={`sidebar-quick__btn sidebar-quick__btn--add ${pickerOpen ? 'sidebar-quick__btn--open' : ''}`}
              aria-label="Add shortcut"
              aria-expanded={pickerOpen}
              onClick={() => setPickerOpen((open) => !open)}
            >
              <NavIcon name="addSquare" />
              {collapsed && (
                <span className="sidebar-quick__tooltip" aria-hidden="true">Add shortcut</span>
              )}
            </button>
          </div>
        )}
      </div>

      {!collapsed && (
        <div
          className={`sidebar-quick__label ${hoverTitle ? 'sidebar-quick__label--visible' : ''}`}
          aria-live="polite"
        >
          {hoverTitle || '\u00A0'}
        </div>
      )}

      {pickerOpen && (
        <div className="sidebar-quick__picker" role="dialog" aria-label="Add shortcut">
          <div className="sidebar-quick__picker-head">
            <span>Add shortcut</span>
            {!canAdd && <span className="sidebar-quick__picker-hint">Limit reached</span>}
          </div>
          {available.length === 0 ? (
            <p className="sidebar-quick__picker-empty">
              {canAdd ? 'No more pages to pin.' : 'Remove a shortcut to add another.'}
            </p>
          ) : (
            <ul className="sidebar-quick__picker-list">
              {available.map((option) => (
                <li key={option.id}>
                  <button
                    type="button"
                    className="sidebar-quick__picker-item"
                    onClick={() => {
                      add(option.id)
                      setPickerOpen(false)
                    }}
                  >
                    <NavIcon name={option.icon} />
                    <span className="sidebar-quick__picker-label">
                      <span>{shortcutTitle(option)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
