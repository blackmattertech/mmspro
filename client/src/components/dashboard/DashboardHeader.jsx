import { useState, useEffect, useRef } from 'react'
import DateField from '../ui/DateField'
import FilterableSelect from '../ui/FilterableSelect'
import { useOrg } from '../../hooks/useOrg'
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
  onCreateWorkRequest,
  canCreateWorkOrder = false,
  canCreateWorkRequest = false,
}) {
  const { org } = useOrg()
  const [createOpen, setCreateOpen] = useState(false)
  const createRef = useRef(null)
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

  useEffect(() => {
    if (!createOpen) return undefined
    function onPointer(event) {
      if (!createRef.current?.contains(event.target)) setCreateOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [createOpen])

  const companyName = org?.name
  const logoLetter = (companyName?.[0] || 'C').toUpperCase()
  const createActions = [
    canCreateWorkRequest ? { id: 'request', label: 'Create Work Request', run: onCreateWorkRequest } : null,
    canCreateWorkOrder ? { id: 'order', label: 'Create Work Order', run: onCreateWorkOrder } : null,
  ].filter(Boolean)

  return (
    <>
      <header className="dash-header">
        <div className="dash-header__left">
          <div className="dash-header__brand">
            <div className="dash-header__logo-wrap" aria-hidden={!logoUrl && !companyName}>
              {logoUrl ? (
                <img src={logoUrl} alt="" className="dash-header__logo" loading="lazy" decoding="async" />
              ) : (
                <span className="dash-header__logo-fallback">{logoLetter}</span>
              )}
            </div>
            <div className="dash-header__text">
              <h1 className="dash-header__title">Dashboard</h1>
            </div>
          </div>
        </div>

        <div className="dash-header__right">
          <div className="dash-header__filter">
            <label className="dash-header__filter-label" htmlFor="dash-location-filter">Location</label>
            <FilterableSelect
              id="dash-location-filter"
              value={locationFilter}
              onChange={onLocationChange}
              options={[
                ...(canSeeAllLocations ? [{ value: 'all', label: 'All Locations' }] : []),
                ...locations.map((loc) => ({ value: loc.id, label: loc.name })),
              ]}
              getOptionValue={(opt) => opt.value}
              getOptionLabel={(opt) => opt.label}
              disabled={!canSeeAllLocations}
              allowEmpty={false}
              inputClassName="dash-header__select"
            />
          </div>

          <div className="dash-header__date-range">
            <DateField
              className="dash-header__date"
              value={dateFrom}
              onChange={onDateFromChange}
            />
            <span className="dash-header__date-sep">–</span>
            <DateField
              className="dash-header__date"
              value={dateTo}
              onChange={onDateToChange}
            />
          </div>

          {createActions.length ? (
            <div className="dash-create" ref={createRef}>
              <button
                type="button"
                className="dash-header__create-btn"
                onClick={() => createActions[0].run?.()}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                {createActions[0].label}
              </button>
              {createActions.length > 1 ? (
                <button
                  type="button"
                  className="dash-create__caret"
                  aria-expanded={createOpen}
                  aria-label="More create actions"
                  onClick={() => setCreateOpen((open) => !open)}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </button>
              ) : null}
              {createOpen && createActions.length > 1 ? (
                <div className="dash-create__menu" role="menu">
                  {createActions.slice(1).map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      role="menuitem"
                      className="dash-create__item"
                      onClick={() => {
                        setCreateOpen(false)
                        action.run?.()
                      }}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>
    </>
  )
}
