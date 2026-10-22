import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useFixedPopover } from '../../hooks/useFixedPopover'
import { assetUrl } from '../../lib/assets'
import './ListTableChrome.css'

const FILTER_ICON_URL = assetUrl('Assets/icons/filter3-outline.svg')

function CalendarIcon() {
  return (
    <svg className="advanced-filter__calendar" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 3.5V7M16 3.5V7M3.5 10H20.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function IconMask({ url, className }) {
  return (
    <span
      className={className}
      style={{ WebkitMaskImage: `url("${url}")`, maskImage: `url("${url}")` }}
      aria-hidden="true"
    />
  )
}

function fieldId(field) {
  return field.id || field.value
}

function optionValue(option) {
  return option.value ?? option.id
}

function optionLabel(option) {
  return option.label ?? option.name ?? String(optionValue(option) ?? '')
}

function rangeKeys(field) {
  const id = fieldId(field)
  return {
    fromKey: field.fromKey || `${id}_from`,
    toKey: field.toKey || `${id}_to`,
  }
}

function cleanFilterValues(values) {
  const next = {}
  for (const [key, value] of Object.entries(values || {})) {
    const text = String(value ?? '').trim()
    if (text) next[key] = text
  }
  return next
}

function activeFilterItems(fields, values) {
  const used = new Set()
  const items = []
  for (const field of fields) {
    const id = fieldId(field)
    if (field.type === 'date-range') {
      const { fromKey, toKey } = rangeKeys(field)
      used.add(fromKey)
      used.add(toKey)
      const from = String(values?.[fromKey] || '').trim()
      const to = String(values?.[toKey] || '').trim()
      if (!from && !to) continue
      items.push({
        key: id,
        label: field.label,
        display: [from, to].filter(Boolean).join(' → '),
        keys: [fromKey, toKey],
      })
      continue
    }
    used.add(id)
    const raw = String(values?.[id] || '').trim()
    if (!raw) continue
    const match = (field.options || []).find((option) => String(optionValue(option)) === raw)
    items.push({
      key: id,
      label: field.label,
      display: match ? optionLabel(match) : raw,
      keys: [id],
    })
  }
  return items
}

export function countActiveFilters(filters) {
  return Object.values(filters || {}).filter((value) => String(value || '').trim()).length
}

export function AdvancedFilterMenu({
  fields = [],
  values = {},
  onChange,
  className = '',
  hideLabel = true,
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(() => cleanFilterValues(values))
  const rootRef = useRef(null)
  const applied = cleanFilterValues(values)
  const activeItems = activeFilterItems(fields, applied)
  const draftItems = activeFilterItems(fields, draft)

  const openDialog = () => {
    setDraft(cleanFilterValues(values))
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  const setDraftValue = (id, value) => {
    setDraft((prev) => {
      const next = { ...prev }
      if (!String(value ?? '').trim()) delete next[id]
      else next[id] = value
      return next
    })
  }

  const removeDraftKeys = (keys) => {
    setDraft((prev) => {
      const next = { ...prev }
      keys.forEach((key) => { delete next[key] })
      return next
    })
  }

  const apply = () => {
    onChange?.(cleanFilterValues(draft))
    setOpen(false)
  }

  const host = typeof document !== 'undefined'
    ? (document.querySelector('.app-shell, .admin-shell') || document.body)
    : null

  return (
    <div className={`advanced-filter${hideLabel ? ' advanced-filter--icon' : ''} ${className}`.trim()} ref={rootRef}>
      <button
        type="button"
        className={`table-filter-menu__trigger${open ? ' table-filter-menu__trigger--open' : ''}${activeItems.length ? ' table-filter-menu__trigger--active' : ''}`}
        onClick={() => (open ? setOpen(false) : openDialog())}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Advanced filters"
        title="Advanced filters"
      >
        <IconMask url={FILTER_ICON_URL} className="table-filter-menu__icon" />
        {!hideLabel && <span className="advanced-filter__label">Advanced</span>}
        {activeItems.length > 0 && <span className="table-filter-menu__badge">{activeItems.length}</span>}
      </button>
      {open && host && createPortal(
        <div className="company-modal-overlay advanced-filter-overlay" onMouseDown={() => setOpen(false)}>
          <div
            className="advanced-filter__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="advanced-filter-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="advanced-filter__head">
              <span className="advanced-filter__badge" aria-hidden="true">
                <IconMask url={FILTER_ICON_URL} className="advanced-filter__badge-icon" />
              </span>
              <div className="advanced-filter__titles">
                <strong id="advanced-filter-title">Advanced filters</strong>
                <p>Refine the list by selecting one or more criteria.</p>
              </div>
              <button type="button" className="advanced-filter__close" onClick={() => setOpen(false)} aria-label="Close">
                ×
              </button>
            </header>

            <div className="advanced-filter__grid">
              {fields.map((field) => {
                const id = fieldId(field)
                if (field.type === 'date-range') {
                  const { fromKey, toKey } = rangeKeys(field)
                  return (
                    <label key={id} className="advanced-filter__field">
                      <span>{field.label}</span>
                      <span className="advanced-filter__dates">
                        <span
                          className="advanced-filter__date"
                          onClick={(event) => event.currentTarget.querySelector('input')?.showPicker?.()}
                        >
                          <CalendarIcon />
                          <input
                            type="date"
                            value={draft[fromKey] || ''}
                            aria-label="Start date"
                            onChange={(event) => setDraftValue(fromKey, event.target.value)}
                          />
                        </span>
                        <span aria-hidden="true">→</span>
                        <span
                          className="advanced-filter__date"
                          onClick={(event) => event.currentTarget.querySelector('input')?.showPicker?.()}
                        >
                          <CalendarIcon />
                          <input
                            type="date"
                            value={draft[toKey] || ''}
                            aria-label="End date"
                            onChange={(event) => setDraftValue(toKey, event.target.value)}
                          />
                        </span>
                      </span>
                    </label>
                  )
                }
                if (field.type === 'select') {
                  return (
                    <label key={id} className="advanced-filter__field">
                      <span>{field.label}</span>
                      <select
                        className="company-form__input company-form__input--select"
                        value={draft[id] || ''}
                        onChange={(event) => setDraftValue(id, event.target.value)}
                      >
                        <option value="">{field.emptyLabel || `All ${field.label}`}</option>
                        {(field.options || []).map((option) => (
                          <option key={optionValue(option)} value={optionValue(option)}>
                            {optionLabel(option)}
                          </option>
                        ))}
                      </select>
                    </label>
                  )
                }
                return (
                  <label key={id} className="advanced-filter__field">
                    <span>{field.label}</span>
                    <input
                      className="company-form__input"
                      value={draft[id] || ''}
                      placeholder={field.placeholder || 'Contains…'}
                      onChange={(event) => setDraftValue(id, event.target.value)}
                    />
                  </label>
                )
              })}
            </div>

            {draftItems.length > 0 && (
              <section className="advanced-filter__active">
                <div className="advanced-filter__active-head">
                  <strong>Active filters ({draftItems.length})</strong>
                  <button type="button" onClick={() => setDraft({})}>Clear all</button>
                </div>
                <div className="advanced-filter__chips">
                  {draftItems.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className="advanced-filter__chip"
                      onClick={() => removeDraftKeys(item.keys)}
                    >
                      {item.label}: {item.display}
                      <span aria-hidden="true">×</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            <footer className="advanced-filter__foot">
              <span>{draftItems.length} filter{draftItems.length === 1 ? '' : 's'} applied</span>
              <div className="advanced-filter__foot-actions">
                <button type="button" className="company-btn advanced-filter__clear" onClick={() => setDraft({})}>
                  Clear all
                </button>
                <button type="button" className="company-btn company-btn--primary advanced-filter__apply" onClick={apply}>
                  <IconMask url={FILTER_ICON_URL} className="advanced-filter__apply-icon" />
                  Apply filters
                </button>
              </div>
            </footer>
          </div>
        </div>,
        host,
      )}
    </div>
  )
}

export function TableColumnHead({
  columnId,
  label,
  sort,
  onSort,
  filterValue = '',
  onFilter,
  className = '',
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef(null)
  const popId = useId()
  const { popoverRef, style, popoverProps } = useFixedPopover({
    open,
    anchorRef: triggerRef,
    matchWidth: false,
    minWidth: 220,
    maxHeight: 180,
    gap: 6,
    align: 'start',
  })
  const activeSort = sort?.id === columnId
  const filtered = String(filterValue || '').trim().length > 0

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event) => {
      if (triggerRef.current?.contains(event.target) || popoverRef.current?.contains(event.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open, popoverRef])

  const cycleSort = () => {
    if (!onSort) return
    if (!activeSort) onSort({ id: columnId, dir: 'asc' })
    else if (sort.dir === 'asc') onSort({ id: columnId, dir: 'desc' })
    else onSort(null)
  }

  return (
    <th className={className}>
      <div className="list-th">
        <button
          type="button"
          className={`list-th__sort${activeSort ? ' list-th__sort--active' : ''}`}
          onClick={cycleSort}
          aria-label={`Sort by ${label}`}
        >
          <span>{label}</span>
          <span className="list-th__arrow" aria-hidden="true">
            {activeSort ? (sort.dir === 'asc' ? '↑' : '↓') : '↕'}
          </span>
        </button>
        {onFilter && (
          <>
            <button
              ref={triggerRef}
              type="button"
              className={`list-th__filter${filtered ? ' list-th__filter--active' : ''}${open ? ' list-th__filter--open' : ''}`}
              aria-expanded={open}
              aria-controls={popId}
              aria-label={`Filter ${label}`}
              title={`Filter ${label}`}
              onClick={() => setOpen((prev) => !prev)}
            >
              <IconMask url={FILTER_ICON_URL} className="list-th__filter-icon" />
            </button>
            {open && style && createPortal(
              <div id={popId} className="list-th__popover" role="dialog" aria-label={`Filter ${label}`} {...popoverProps}>
                <label className="list-th__popover-label">
                  <span>{label}</span>
                  <input
                    className="company-form__input"
                    value={filterValue}
                    autoFocus
                    placeholder="Contains…"
                    onChange={(event) => onFilter(columnId, event.target.value)}
                  />
                </label>
              </div>,
              document.body,
            )}
          </>
        )}
      </div>
    </th>
  )
}

export function ExportCsvButton({ onClick, busy = false, label = 'Export' }) {
  return (
    <button
      type="button"
      className="company-btn company-btn--secondary equipment-bulk-btn"
      onClick={onClick}
      disabled={busy}
    >
      <span className="equipment-bulk-btn__icon" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 4V15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M7.5 10.5L12 15L16.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 15V18.5C4 19.3284 4.67157 20 5.5 20H18.5C19.3284 20 20 19.3284 20 18.5V15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      {busy ? 'Exporting…' : label}
    </button>
  )
}

export function useSortedFilterFields(columnDefs = []) {
  return useMemo(
    () => columnDefs
      .filter((col) => !col.locked && col.filterable !== false)
      .map((col) => ({ id: col.id, label: col.label })),
    [columnDefs],
  )
}
