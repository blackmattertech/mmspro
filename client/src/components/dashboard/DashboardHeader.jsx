import { useState, useRef, useEffect } from 'react'
import NotificationPanel from './NotificationPanel'
import { useOrg } from '../../hooks/useOrg'
import { useNotifications } from '../../hooks/useNotifications'
import { getOrgAssetSignedUrl } from '../../lib/orgAssets'
import './DashboardHeader.css'

export default function DashboardHeader({
  locations,
  locationFilter,
  onLocationChange,
  canSeeAllLocations = true,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  onCreateWorkOrder,
}) {
  const [showNotifications, setShowNotifications] = useState(false)
  const notifBtnRef = useRef(null)
  const { org } = useOrg()
  const { unreadCount } = useNotifications()
  const [logoUrl, setLogoUrl] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function loadLogo() {
      if (!org?.logo_url) {
        setLogoUrl(null)
        return
      }
      try {
        const url = await getOrgAssetSignedUrl(org.logo_url)
        if (!cancelled) setLogoUrl(url)
      } catch {
        if (!cancelled) setLogoUrl(null)
      }
    }

    loadLogo()
    return () => { cancelled = true }
  }, [org?.logo_url])

  const companyName = org?.name
  const logoLetter = (companyName?.[0] || 'C').toUpperCase()

  return (
    <>
      <header className="dash-header">
        <div className="dash-header__left">
          <div className="dash-header__brand">
            <div className="dash-header__logo-wrap" aria-hidden={!logoUrl && !companyName}>
              {logoUrl ? (
                <img src={logoUrl} alt="" className="dash-header__logo" />
              ) : (
                <span className="dash-header__logo-fallback">{logoLetter}</span>
              )}
            </div>
            <div className="dash-header__text">
              <h1 className="dash-header__title">Dashboard</h1>
              {companyName && (
                <p className="dash-header__subtitle">{companyName}</p>
              )}
            </div>
          </div>
        </div>

        <div className="dash-header__right">
          <div className="dash-header__filter">
            <label className="dash-header__filter-label" htmlFor="dash-location-filter">Location</label>
            <select
              id="dash-location-filter"
              className="dash-header__select"
              value={locationFilter}
              onChange={(e) => onLocationChange(e.target.value)}
              disabled={!canSeeAllLocations}
            >
              {canSeeAllLocations && <option value="all">All Locations</option>}
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
          </div>

          <div className="dash-header__date-range">
            <input
              type="date"
              className="dash-header__date"
              value={dateFrom}
              onChange={(e) => onDateFromChange(e.target.value)}
            />
            <span className="dash-header__date-sep">–</span>
            <input
              type="date"
              className="dash-header__date"
              value={dateTo}
              onChange={(e) => onDateToChange(e.target.value)}
            />
          </div>

          <button
            type="button"
            className="dash-header__create-btn"
            onClick={async () => {
              if (typeof onCreateWorkOrder === 'function') {
                await onCreateWorkOrder()
              }
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            Create Work Order
          </button>

          <div className="dash-header__icon-wrap">
            <button
              ref={notifBtnRef}
              type="button"
              className="dash-header__icon-btn dash-header__icon-btn--primary"
              aria-label="Notifications"
              aria-expanded={showNotifications}
              onClick={() => setShowNotifications((prev) => !prev)}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M10 2.5C7.5 2.5 6 4.5 6 7V10.5L4 13V14H16V13L14 10.5V7C14 4.5 12.5 2.5 10 2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                <path d="M8.5 14V14.5C8.5 15.6 9.15 16.5 10 16.5C10.85 16.5 11.5 15.6 11.5 14.5V14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              {unreadCount > 0 && (
                <span className="dash-header__badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
              )}
            </button>
            <NotificationPanel
              open={showNotifications}
              onClose={() => setShowNotifications(false)}
              anchorRef={notifBtnRef}
            />
          </div>
        </div>
      </header>
    </>
  )
}
