import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { getSortOptionsForView } from '../../lib/assetFieldTypes'
import { isEventInFixedPopover, useFixedPopover } from '../../hooks/useFixedPopover'
import FilterableSelect from '../ui/FilterableSelect'
import '../company/CompanyShared.css'

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
  const triggerRef = useRef(null)
  const { popoverRef, style, popoverProps } = useFixedPopover({
    open,
    anchorRef: triggerRef,
    matchWidth: false,
    minWidth: 220,
    maxHeight: 360,
    gap: 6,
    align: 'start',
  })
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
      if (
        rootRef.current?.contains(event.target)
        || popoverRef.current?.contains(event.target)
        || isEventInFixedPopover(event)
      ) {
        return
      }
      setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open, popoverRef])

  return (
    <div className="asset-field-sort" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`asset-field-sort-btn ${open ? 'asset-field-sort-btn--active' : ''}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Sort options"
        aria-expanded={open}
      >
        <SortIcon />
      </button>
      {open && style && createPortal(
        <div className="asset-field-sort-menu" role="dialog" aria-label="Sort options" {...popoverProps}>
          <label className="asset-field-sort-menu__field">
            <span className="asset-field-sort-menu__label">Sort by</span>
            <FilterableSelect
              className="company-form__input--select"
              value={sortBy}
              onChange={(next) => onChange({ sortBy: next, sortDir })}
              options={options}
              getOptionValue={(opt) => opt.value}
              getOptionLabel={(opt) => opt.label}
              allowEmpty={false}
            />
          </label>
          <label className="asset-field-sort-menu__field">
            <span className="asset-field-sort-menu__label">Order</span>
            <FilterableSelect
              className="company-form__input--select"
              value={sortDir}
              onChange={(next) => onChange({ sortBy, sortDir: next })}
              options={[
                { value: 'asc', label: orderLabels.asc },
                { value: 'desc', label: orderLabels.desc },
              ]}
              getOptionValue={(opt) => opt.value}
              getOptionLabel={(opt) => opt.label}
              allowEmpty={false}
            />
          </label>
        </div>,
        document.body,
      )}
    </div>
  )
}
