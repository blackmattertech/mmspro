import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { isEventInFixedPopover, useFixedPopover } from '../../hooks/useFixedPopover'
import { assetUrl } from '../../lib/assets'
import { AdvancedFilterMenu } from './ListTableChrome'
import './TableFilterToolbar.css'
import './ListTableChrome.css'

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

function useOutsideClose(open, onClose, extraRef) {
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event) => {
      if (
        ref.current?.contains(event.target)
        || extraRef?.current?.contains(event.target)
        || isEventInFixedPopover(event)
      ) {
        return
      }
      onClose()
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
  }, [open, onClose, extraRef])
  return ref
}

function FilterMenu({ filter }) {
  const fields = (filter.fields || []).map((item) => ({
    id: item.id || item.value,
    label: item.label,
    placeholder: item.placeholder,
    type: item.type,
    options: item.options,
    emptyLabel: item.emptyLabel,
    fromKey: item.fromKey,
    toKey: item.toKey,
  }))
  const values = filter.values
    || (filter.field && String(filter.value || '').trim() ? { [filter.field]: filter.value } : {})

  const onChange = (next) => {
    if (filter.onChange) {
      filter.onChange(next)
      return
    }
    const entries = Object.entries(next).filter(([, value]) => String(value ?? '').trim())
    if (!entries.length) {
      filter.onFieldChange?.('')
      filter.onValueChange?.('')
      return
    }
    filter.onFieldChange?.(entries[0][0])
    filter.onValueChange?.(entries[0][1])
  }

  return <AdvancedFilterMenu fields={fields} values={values} onChange={onChange} hideLabel />
}

function SortMenu({ sort }) {
  const [open, setOpen] = useState(false)
  const options = sort.options || []
  const value = sort.value || ''
  const selected = options.find((item) => item.value === value)
  const triggerRef = useRef(null)
  const { popoverRef, style, popoverProps } = useFixedPopover({
    open,
    anchorRef: triggerRef,
    matchWidth: false,
    minWidth: 260,
    maxHeight: 420,
    gap: 8,
    align: 'start',
  })
  const rootRef = useOutsideClose(open, () => setOpen(false), popoverRef)

  return (
    <div className="table-filter-menu" ref={rootRef}>
      <button
        ref={triggerRef}
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

      {open && style && createPortal(
        <div className="table-filter-menu__panel table-filter-menu__panel--sort" role="listbox" aria-label="Sort options" {...popoverProps}>
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
        </div>,
        document.body,
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
  filterSlot = null,
  sort,
  actions,
  columnPicker,
}) {
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

      {filterSlot}
      {filter?.fields?.length > 0 && <FilterMenu filter={filter} />}
      {sort?.options?.length > 0 && <SortMenu sort={sort} />}

      {(actions || columnPicker) && (
        <div className="table-filter-toolbar__actions">
          {actions}
          {columnPicker}
        </div>
      )}
    </div>
  )
}
