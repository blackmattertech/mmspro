import { useEffect, useMemo, useRef, useState } from 'react'
import { assetUrl } from '../../lib/assets'
import './TableFilterToolbar.css'

const FILTER_ICON_URL = assetUrl('Assets/icons/filter3-outline.svg')
const SORT_ICON_URL = assetUrl('Assets/icons/sort-alpha-outline.svg')

function IconMask({ url, className }) {
  return (
    <span
      className={className}
      style={{ WebkitMaskImage: `url("${url}")`, maskImage: `url("${url}")` }}
      aria-hidden="true"
    />
  )
}

function useOutsideClose(open, onClose) {
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event) => {
      if (!ref.current?.contains(event.target)) onClose()
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])
  return ref
}

function FilterMenu({ filter }) {
  const [open, setOpen] = useState(false)
  const fields = filter.fields || []
  const field = filter.field || ''
  const value = filter.value || ''
  const selectedField = fields.find((item) => item.value === field) || null
  const active = Boolean(field && String(value).trim())
  const rootRef = useOutsideClose(open, () => setOpen(false))

  const clear = () => {
    filter.onFieldChange?.('')
    filter.onValueChange?.('')
  }

  return (
    <div className="table-filter-menu" ref={rootRef}>
      <button
        type="button"
        className={`table-filter-menu__trigger${open ? ' table-filter-menu__trigger--open' : ''}${active ? ' table-filter-menu__trigger--active' : ''}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Filter"
        title="Filter"
      >
        <IconMask url={FILTER_ICON_URL} className="table-filter-menu__icon" />
        {active && <span className="table-filter-menu__badge">1</span>}
      </button>

      {open && (
        <div className="table-filter-menu__panel" role="dialog" aria-label="Table filter">
          <div className="table-filter-menu__header">
            <div>
              <strong className="table-filter-menu__title">Filter</strong>
              <p className="table-filter-menu__subtitle">Choose a field, then type a value</p>
            </div>
            {active && (
              <button type="button" className="table-filter-menu__clear" onClick={clear}>
                Clear
              </button>
            )}
          </div>

          <div className="table-filter-menu__step">
            <span className="table-filter-menu__label">Filter by</span>
            <div className="table-filter-menu__choices table-filter-menu__choices--wrap" role="group" aria-label="Filter by">
              {fields.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={`table-filter-menu__choice${field === item.value ? ' table-filter-menu__choice--active' : ''}`}
                  onClick={() => {
                    filter.onFieldChange?.(item.value)
                    if (field !== item.value) filter.onValueChange?.('')
                  }}
                  aria-pressed={field === item.value}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {selectedField && (
            <label className="table-filter-menu__field">
              <span className="table-filter-menu__label">{selectedField.label}</span>
              <input
                type="text"
                className="company-form__input"
                value={value}
                onChange={(e) => filter.onValueChange?.(e.target.value)}
                placeholder={selectedField.placeholder || `Filter by ${selectedField.label.toLowerCase()}…`}
                autoFocus
              />
            </label>
          )}
        </div>
      )}
    </div>
  )
}

function SortMenu({ sort }) {
  const [open, setOpen] = useState(false)
  const options = sort.options || []
  const value = sort.value || ''
  const selected = options.find((item) => item.value === value)
  const rootRef = useOutsideClose(open, () => setOpen(false))

  return (
    <div className="table-filter-menu" ref={rootRef}>
      <button
        type="button"
        className={`table-filter-menu__trigger${open ? ' table-filter-menu__trigger--open' : ''}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Sort"
        title={selected ? `Sort: ${selected.label}` : 'Sort'}
      >
        <IconMask url={SORT_ICON_URL} className="table-filter-menu__icon" />
      </button>

      {open && (
        <div className="table-filter-menu__panel table-filter-menu__panel--sort" role="listbox" aria-label="Sort options">
          <div className="table-filter-menu__header">
            <div>
              <strong className="table-filter-menu__title">Sort</strong>
              <p className="table-filter-menu__subtitle">Choose how rows are ordered</p>
            </div>
          </div>
          <div className="table-filter-menu__choices">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === value}
                className={`table-filter-menu__choice${option.value === value ? ' table-filter-menu__choice--active' : ''}`}
                onClick={() => {
                  sort.onChange?.(option.value)
                  setOpen(false)
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Shared table toolbar: search + filter icon menu + sort icon menu + actions.
 *
 * filter: { fields: [{ value, label, placeholder? }], field, onFieldChange, value, onValueChange }
 * sort: { value, onChange, options: [{ value, label }] }
 */
export default function TableFilterToolbar({
  className = '',
  search,
  filter,
  sort,
  actions,
  columnPicker,
}) {
  const activeFilterLabel = useMemo(() => {
    if (!filter?.field || !String(filter.value || '').trim()) return null
    const fieldLabel = filter.fields?.find((item) => item.value === filter.field)?.label || filter.field
    return `${fieldLabel}: ${String(filter.value).trim()}`
  }, [filter])

  return (
    <div className={`table-filter-toolbar wo-page__bar-controls ${className}`.trim()}>
      {search && (
        <input
          type="search"
          id={search.id}
          className="company-form__input wo-page__search"
          placeholder={search.placeholder || 'Search…'}
          value={search.value}
          onChange={(e) => search.onChange(e.target.value)}
          aria-label={search.ariaLabel || search.placeholder || 'Search'}
        />
      )}

      {filter?.fields?.length > 0 && <FilterMenu filter={filter} />}
      {sort?.options?.length > 0 && <SortMenu sort={sort} />}

      {activeFilterLabel && (
        <button
          type="button"
          className="table-filter-toolbar__chip"
          onClick={() => {
            filter?.onFieldChange?.('')
            filter?.onValueChange?.('')
          }}
          title="Clear filter"
        >
          <span>{activeFilterLabel}</span>
          <span aria-hidden="true">×</span>
        </button>
      )}

      {(actions || columnPicker) && (
        <div className="table-filter-toolbar__actions">
          {actions}
          {columnPicker}
        </div>
      )}
    </div>
  )
}
