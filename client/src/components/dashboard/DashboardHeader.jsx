import { useState, useEffect } from 'react'
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
}) {
  const { org } = useOrg()
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
                <img src={logoUrl} alt="" className="dash-header__logo" loading="lazy" decoding="async" />
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
        </div>
      </header>
    </>
  )
}
