import NavIcon from './NavIcon'
import './MobileTopBar.css'

export default function MobileTopBar({ title = 'MMS PRO', onMenuClick, menuOpen = false }) {
  return (
    <header className="mobile-topbar">
      <button
        type="button"
        className="mobile-topbar__menu"
        onClick={onMenuClick}
        aria-label="Open navigation"
        aria-expanded={menuOpen}
        aria-controls="app-sidebar"
      >
        <NavIcon name="menu" />
      </button>
      <span className="mobile-topbar__title">{title}</span>
    </header>
  )
}
