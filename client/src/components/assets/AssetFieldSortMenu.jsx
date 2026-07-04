import { useEffect, useRef, useState } from 'react'
import { getSortOptionsForView } from '../../lib/assetFieldTypes'

function SortIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M5.5 4.5V13.5M5.5 4.5L3.75 6.25M5.5 4.5L7.25 6.25"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12.5 13.5V4.5M12.5 13.5L10.75 11.75M12.5 13.5L14.25 11.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function AssetFieldSortMenu({ view, sortBy, sortDir, onChange }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const options = getSortOptionsForView(view)
  const numeric = sortBy === 'parents' || sortBy === 'values' || sortBy === 'active'
  const orderLabels = sortBy === 'sort_order'
    ? { asc: 'First → Last', desc: 'Last → First' }
    : numeric
      ? { asc: 'Low → High', desc: 'High → Low' }
      : { asc: 'A → Z', desc: 'Z → A' }

  useEffect(() => {
    if (!open) return undefined
    const handleClick = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div className="asset-field-sort" ref={rootRef}>
      <button
        type="button"
        className={`asset-field-sort-btn ${open ? 'asset-field-sort-btn--active' : ''}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Sort options"
        aria-expanded={open}
      >
        <SortIcon />
      </button>
      {open && (
        <div className="asset-field-sort-menu" role="dialog" aria-label="Sort options">
          <label className="asset-field-sort-menu__field">
            <span className="asset-field-sort-menu__label">Sort by</span>
            <select
              className="company-form__input company-form__input--select"
              value={sortBy}
              onChange={(e) => onChange({ sortBy: e.target.value, sortDir })}
            >
              {options.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>
          <label className="asset-field-sort-menu__field">
            <span className="asset-field-sort-menu__label">Order</span>
            <select
              className="company-form__input company-form__input--select"
              value={sortDir}
              onChange={(e) => onChange({ sortBy, sortDir: e.target.value })}
            >
              <option value="asc">{orderLabels.asc}</option>
              <option value="desc">{orderLabels.desc}</option>
            </select>
          </label>
        </div>
      )}
    </div>
  )
}
