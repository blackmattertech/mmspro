import { useEffect, useRef, useState } from 'react'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import EditIcon from '../ui/EditIcon'
import PageBack from './PageBack'
import '../company/CompanyShared.css'
import './RecordDetailLayout.css'
import './PageBack.css'

export default function RecordDetailModal({
  title,
  subtitle,
  leading = null,
  status = null,
  meta = null,
  onClose,
  onEdit,
  editLabel = 'Edit',
  menuItems,
  actions,
  variant = 'default',
  loading = false,
  error = null,
  children,
}) {
  const handleBackdropClick = useBackdropClose(onClose)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  const isProfile = variant === 'profile'

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') {
        if (menuOpen) {
          setMenuOpen(false)
          return
        }
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, menuOpen])

  useEffect(() => {
    if (!menuOpen) return undefined
    const onPointerDown = (event) => {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [menuOpen])

  return (
    <div className="company-modal-overlay" onMouseDown={handleBackdropClick}>
      <div
        className={`company-modal company-modal--wide${isProfile ? ' company-modal--profile' : ''}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={`company-modal__header${isProfile ? ' company-modal__header--profile' : ''}`}>
          <div className={`record-detail-layout__heading${leading ? ' record-detail-layout__heading--with-leading' : ''}`}>
            <PageBack onClick={onClose} className="page-back--header" />
            {leading && (
              <div className="record-detail-layout__leading">
                {leading}
              </div>
            )}
            <div className="record-detail-layout__titles">
              <div className="record-detail-layout__title-row">
                <h2>{title}</h2>
                {status}
              </div>
              {subtitle && <p className="company-page__subtitle">{subtitle}</p>}
              {meta && <div className="record-detail-layout__meta">{meta}</div>}
            </div>
          </div>
          <div className="record-detail-layout__actions">
            {onEdit && (
              <button type="button" className="company-btn company-btn--primary record-detail-layout__edit" onClick={onEdit}>
                <EditIcon size={16} />
                {editLabel}
              </button>
            )}
            {actions}
            {menuItems?.length > 0 && (
              <div className="record-detail-layout__menu" ref={menuRef}>
                <button
                  type="button"
                  className="record-detail-layout__icon-btn"
                  aria-label="More actions"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((open) => !open)}
                >
                  <span aria-hidden="true">⋯</span>
                </button>
                {menuOpen && (
                  <div className="record-detail-layout__menu-panel" role="menu">
                    {menuItems.map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        role="menuitem"
                        className={`record-detail-layout__menu-item${item.danger ? ' record-detail-layout__menu-item--danger' : ''}`}
                        onClick={() => {
                          setMenuOpen(false)
                          item.onClick?.()
                        }}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button type="button" className="record-detail-layout__icon-btn" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>
        </div>
        <div className="company-modal__body">
          {loading ? (
            <div className="company-loading">Loading…</div>
          ) : (
            <>
              {error && <div className="company-alert" role="alert">{error}</div>}
              {children}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
