import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useQuickAccess } from '../../hooks/useQuickAccess'
import NavIcon from './NavIcon'

function shortcutTitle(item) {
  if (!item) return ''
  return item.group ? `${item.group} - ${item.label}` : item.label
}

function flattenShortcutOptions(options = []) {
  const leaves = []
  for (const option of options) {
    if (option.children?.length) {
      leaves.push(...flattenShortcutOptions(option.children))
    } else if (option.path) {
      leaves.push(option)
    }
  }
  return leaves
}

function hasAvailableLeaf(node, pinnedIds) {
  if (node.children?.length) {
    return node.children.some((child) => hasAvailableLeaf(child, pinnedIds))
  }
  return Boolean(node.path) && !pinnedIds.includes(node.id)
}

export default function SidebarQuickAccess({
  collapsed = false,
  scope = null,
  options = [],
  catalog,
}) {
  const { ids, add, remove, canAdd, max } = useQuickAccess(scope)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [menuStack, setMenuStack] = useState([])
  const [hoverTitle, setHoverTitle] = useState('')
  const rootRef = useRef(null)

  const resolveOptions = useMemo(() => {
    const source = catalog?.length ? catalog : options
    return flattenShortcutOptions(source)
  }, [catalog, options])

  const byId = useMemo(() => {
    const map = new Map()
    for (const option of resolveOptions) map.set(option.id, option)
    return map
  }, [resolveOptions])

  const pinned = useMemo(
    () => ids.map((id) => byId.get(id)).filter(Boolean),
    [ids, byId],
  )

  const rootItems = useMemo(
    () => options.filter((option) => hasAvailableLeaf(option, ids)),
    [options, ids],
  )

  const activeParent = menuStack[menuStack.length - 1] || null
  const visibleItems = useMemo(() => {
    const items = activeParent?.children || rootItems
    return items.filter((option) => hasAvailableLeaf(option, ids))
  }, [activeParent, rootItems, ids])

  const closePicker = () => {
    setPickerOpen(false)
    setMenuStack([])
  }

  useEffect(() => {
    if (!pickerOpen) return undefined
    const onPointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        closePicker()
      }
    }
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return
      if (menuStack.length) {
        setMenuStack((stack) => stack.slice(0, -1))
      } else {
        closePicker()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [pickerOpen, menuStack.length])

  if (!scope) return null

  return (
    <div
      ref={rootRef}
      className={`sidebar-quick ${collapsed ? 'sidebar-quick--collapsed' : ''}`}
    >
      <button
        type="button"
        className={`sidebar-quick__trigger ${pickerOpen ? 'sidebar-quick__trigger--open' : ''}`}
        aria-label="Quick access"
        aria-haspopup="dialog"
        aria-expanded={pickerOpen}
        aria-controls="sidebar-quick-panel"
        onClick={() => {
          if (pickerOpen) closePicker()
          else {
            setMenuStack([])
            setPickerOpen(true)
          }
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 3.25v9.5M3.25 8h9.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        {collapsed && (
          <span className="sidebar__tooltip" aria-hidden="true">Quick access</span>
        )}
      </button>

      {pickerOpen && (
        <div
          id="sidebar-quick-panel"
          className="sidebar-quick__panel"
          role="dialog"
          aria-label="Quick access"
        >
          <div className="sidebar-quick__header">
            <span className="sidebar-quick__title">Quick access</span>
            <span className="sidebar-quick__count">{pinned.length}/{max}</span>
          </div>

          {pinned.length > 0 && (
            <div className="sidebar-quick__row" role="toolbar" aria-label="Pinned shortcuts">
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
                      onClick={closePicker}
                    >
                      <NavIcon name={item.icon} />
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
            </div>
          )}

          {pinned.length > 0 && (
            <div
              className={`sidebar-quick__label ${hoverTitle ? 'sidebar-quick__label--visible' : ''}`}
              aria-live="polite"
            >
              {hoverTitle || '\u00A0'}
            </div>
          )}

          <div className="sidebar-quick__picker">
            <div className="sidebar-quick__picker-head">
              {activeParent ? (
                <button
                  type="button"
                  className="sidebar-quick__picker-back"
                  onClick={() => setMenuStack((stack) => stack.slice(0, -1))}
                  aria-label={`Back to ${menuStack.length > 1 ? menuStack[menuStack.length - 2].label : 'menu'}`}
                >
                  <NavIcon name="chevron" />
                  <span>{activeParent.label}</span>
                </button>
              ) : (
                <span>Add shortcut</span>
              )}
              {!canAdd && <span className="sidebar-quick__picker-hint">Limit reached</span>}
            </div>
            {visibleItems.length === 0 ? (
              <p className="sidebar-quick__picker-empty">
                {canAdd ? 'No more pages to pin.' : 'Remove a shortcut to add another.'}
              </p>
            ) : (
              <ul className="sidebar-quick__picker-list">
                {visibleItems.map((option) => {
                  const isFolder = Boolean(option.children?.length)
                  return (
                    <li key={option.id}>
                      <button
                        type="button"
                        className={`sidebar-quick__picker-item ${isFolder ? 'sidebar-quick__picker-item--folder' : ''}`}
                        onClick={() => {
                          if (isFolder) {
                            setMenuStack((stack) => [...stack, option])
                            return
                          }
                          add(option.id)
                          closePicker()
                        }}
                      >
                        <NavIcon name={option.icon} />
                        <span className="sidebar-quick__picker-label">
                          <span>{option.label}</span>
                        </span>
                        {isFolder && (
                          <span className="sidebar-quick__picker-chevron" aria-hidden="true">
                            <NavIcon name="chevron" />
                          </span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
