import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import DateField from '../ui/DateField'
import FilterableSelect from '../ui/FilterableSelect'
import { isEventInFixedPopover, useFixedPopover } from '../../hooks/useFixedPopover'
import { EMPTY_REPORT_FILTERS } from '../../lib/reportColumns'
import '../company/CompanyShared.css'
import './ReportsFilters.css'

function uniqueTextOptions(values) {
  const seen = new Set()
  const out = []
  for (const value of values) {
    const text = String(value || '').trim()
    if (!text) continue
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ value: text, label: text })
  }
  return out.sort((a, b) => a.label.localeCompare(b.label))
}

function SelectField({
  label,
  value,
  onChange,
  options,
  disabled = false,
  emptyLabel = 'All',
}) {
  return (
    <label className="company-form__field reports-filters__field">
      <span className="company-form__label">{label}</span>
      <FilterableSelect
        value={value}
        onChange={onChange}
        options={options}
        getOptionValue={(opt) => opt.value}
        getOptionLabel={(opt) => opt.label}
        allowEmpty
        emptyLabel={emptyLabel}
        placeholder={emptyLabel}
        disabled={disabled}
        className="company-form__input--select"
        aria-label={label}
      />
    </label>
  )
}

const ASSET_KEYS = [
  'area_id',
  'facility_id',
  'equipment_id',
  'equipment_type',
  'equipment_capacity',
  'equipment_tag',
]

const OPTIONAL_FILTER_KEYS = [
  'order_type',
  'order_from',
  'order_to',
  ...ASSET_KEYS,
  'priority',
  'status',
  'job_nature',
  'created_by',
  'reported_by',
  'assigned_to',
]

export function countActiveReportFilters(filters, lockedFacilityId = '') {
  return OPTIONAL_FILTER_KEYS.filter((key) => {
    if (!filters?.[key]) return false
    if (key === 'facility_id' && lockedFacilityId && filters.facility_id === lockedFacilityId) {
      return false
    }
    return true
  }).length
}

export default function ReportsFilters({
  filters,
  onChange,
  options,
  canSelectLocation = true,
  activeCount = 0,
  onSearch,
  onClear,
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef(null)
  const { popoverRef, style, popoverProps } = useFixedPopover({
    open,
    anchorRef: triggerRef,
    matchWidth: false,
    minWidth: 720,
    maxHeight: 640,
    gap: 8,
    align: 'start',
  })

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event) => {
      if (
        triggerRef.current?.contains(event.target)
        || popoverRef.current?.contains(event.target)
        || isEventInFixedPopover(event)
      ) {
        return
      }
      setOpen(false)
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, popoverRef])

  const equipment = options?.equipment || []
  const areaOptions = options?.areas || []
  const locationOptions = options?.locations || []

  const facilityOptions = useMemo(() => {
    const seen = new Set()
    const list = []
    const add = (value, label) => {
      if (!value || seen.has(value)) return
      seen.add(value)
      list.push({ value, label: label || 'Plant' })
    }
    const selectedArea = areaOptions.find((row) => row.value === filters.area_id)
    if (selectedArea?.location_id) {
      const loc = locationOptions.find((row) => row.value === selectedArea.location_id)
      add(selectedArea.location_id, loc?.label)
    }
    for (const row of equipment) {
      if (filters.area_id && row.area_id && row.area_id !== filters.area_id) continue
      add(row.location_id, row.location_name)
    }
    if (!filters.area_id) {
      for (const loc of locationOptions) add(loc.value, loc.label)
    }
    if (!list.length) return locationOptions
    return list.sort((a, b) => a.label.localeCompare(b.label))
  }, [areaOptions, equipment, filters.area_id, locationOptions])

  const scopedEquipment = useMemo(() => (
    equipment.filter((row) => {
      if (filters.area_id && row.area_id && row.area_id !== filters.area_id) return false
      if (filters.facility_id && row.location_id && row.location_id !== filters.facility_id) return false
      return true
    })
  ), [equipment, filters.area_id, filters.facility_id])

  const equipmentOptions = useMemo(() => (
    scopedEquipment
      .filter((row) => {
        if (filters.equipment_type && row.equipment_type !== filters.equipment_type) return false
        if (filters.equipment_capacity && row.equipment_capacity !== filters.equipment_capacity) return false
        if (filters.equipment_tag && row.equipment_tag !== filters.equipment_tag) return false
        return true
      })
      .map((row) => ({
        value: row.id,
        label: row.code ? `${row.code} — ${row.name}` : row.name,
      }))
  ), [scopedEquipment, filters.equipment_type, filters.equipment_capacity, filters.equipment_tag])

  const typeOptions = useMemo(
    () => uniqueTextOptions(scopedEquipment.map((row) => row.equipment_type)),
    [scopedEquipment],
  )
  const capacityOptions = useMemo(
    () => uniqueTextOptions(
      scopedEquipment
        .filter((row) => !filters.equipment_type || row.equipment_type === filters.equipment_type)
        .map((row) => row.equipment_capacity),
    ),
    [scopedEquipment, filters.equipment_type],
  )
  const tagOptions = useMemo(
    () => uniqueTextOptions(
      scopedEquipment
        .filter((row) => {
          if (filters.equipment_type && row.equipment_type !== filters.equipment_type) return false
          if (filters.equipment_capacity && row.equipment_capacity !== filters.equipment_capacity) return false
          return true
        })
        .map((row) => row.equipment_tag),
    ),
    [scopedEquipment, filters.equipment_type, filters.equipment_capacity],
  )

  const setFilter = (key, value) => {
    const next = { ...filters, [key]: value }
    const assetIndex = ASSET_KEYS.indexOf(key)
    if (assetIndex >= 0) {
      for (const child of ASSET_KEYS.slice(assetIndex + 1)) {
        next[child] = ''
      }
    }
    if (key === 'area_id' && value) {
      const selectedArea = areaOptions.find((row) => row.value === value)
      if (selectedArea?.location_id) next.facility_id = selectedArea.location_id
    }
    if (key === 'equipment_id' && value) {
      const selected = equipment.find((row) => row.id === value)
      if (selected) {
        next.equipment_type = selected.equipment_type || ''
        next.equipment_capacity = selected.equipment_capacity || ''
        next.equipment_tag = selected.equipment_tag || ''
      }
    }
    if (['equipment_type', 'equipment_capacity', 'equipment_tag'].includes(key) && next.equipment_id) {
      const selected = equipment.find((row) => row.id === next.equipment_id)
      if (selected) {
        const mismatch = (
          (next.equipment_type && selected.equipment_type !== next.equipment_type)
          || (next.equipment_capacity && selected.equipment_capacity !== next.equipment_capacity)
          || (next.equipment_tag && selected.equipment_tag !== next.equipment_tag)
        )
        if (mismatch) next.equipment_id = ''
      }
    }
    if (key === 'facility_id' && !canSelectLocation) {
      next.facility_id = filters.facility_id
    }
    onChange(next)
  }

  const handleClear = () => {
    if (onClear) onClear()
    else {
      onChange({
        ...EMPTY_REPORT_FILTERS,
        from_date: filters.from_date,
        to_date: filters.to_date,
        facility_id: canSelectLocation ? '' : filters.facility_id,
      })
    }
    setOpen(false)
  }

  const handleSearch = () => {
    onSearch?.()
    setOpen(false)
  }

  return (
    <div className="reports-filters">
      <button
        ref={triggerRef}
        type="button"
        className={`reports-filters__trigger${activeCount > 0 ? ' reports-filters__trigger--active' : ''}${open ? ' reports-filters__trigger--open' : ''}`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M2 4H14M4 8H12M6 12H10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        Filters
        {activeCount > 0 ? <span className="reports-filters__badge">{activeCount}</span> : null}
      </button>

      {open && style && createPortal(
        <div
          className="reports-filters__panel"
          role="dialog"
          aria-label="Report filters"
          {...popoverProps}
        >
          <div className="reports-filters__header">
            <div>
              <strong className="reports-filters__title">Filters</strong>
              <p className="reports-filters__subtitle">Choose dates and fields, then search</p>
            </div>
            <button type="button" className="reports-filters__clear-link" onClick={handleClear}>
              Clear all
            </button>
          </div>

          <div className="reports-filters__scroll">
            <section className="reports-filters__group">
              <h3 className="reports-filters__group-title">Log date</h3>
              <div className="reports-filters__grid">
                <label className="company-form__field reports-filters__field">
                  <span className="company-form__label">From Date</span>
                  <DateField
                    value={filters.from_date}
                    onChange={(value) => setFilter('from_date', value)}
                    placeholder="From date"
                  />
                </label>
                <label className="company-form__field reports-filters__field">
                  <span className="company-form__label">To Date</span>
                  <DateField
                    value={filters.to_date}
                    onChange={(value) => setFilter('to_date', value)}
                    placeholder="To date"
                  />
                </label>
              </div>
            </section>

            <section className="reports-filters__group">
              <h3 className="reports-filters__group-title">Order</h3>
              <div className="reports-filters__grid reports-filters__grid--3">
                <SelectField
                  label="Order Type"
                  value={filters.order_type}
                  onChange={(value) => setFilter('order_type', value)}
                  options={options?.order_types || []}
                />
                <SelectField
                  label="Order From"
                  value={filters.order_from}
                  onChange={(value) => setFilter('order_from', value)}
                  options={options?.departments || []}
                />
                <SelectField
                  label="Order To"
                  value={filters.order_to}
                  onChange={(value) => setFilter('order_to', value)}
                  options={options?.departments || []}
                />
              </div>
            </section>

            <section className="reports-filters__group">
              <h3 className="reports-filters__group-title">Assets</h3>
              <div className="reports-filters__grid">
                <SelectField
                  label="Area"
                  value={filters.area_id}
                  onChange={(value) => setFilter('area_id', value)}
                  options={areaOptions}
                />
                <SelectField
                  label="Plant / Facility"
                  value={filters.facility_id}
                  onChange={(value) => setFilter('facility_id', value)}
                  options={facilityOptions}
                  disabled={!canSelectLocation}
                />
                <SelectField
                  label="Equipment"
                  value={filters.equipment_id}
                  onChange={(value) => setFilter('equipment_id', value)}
                  options={equipmentOptions}
                />
                <SelectField
                  label="Equipment Type"
                  value={filters.equipment_type}
                  onChange={(value) => setFilter('equipment_type', value)}
                  options={typeOptions}
                />
                <SelectField
                  label="Equipment Capacity"
                  value={filters.equipment_capacity}
                  onChange={(value) => setFilter('equipment_capacity', value)}
                  options={capacityOptions}
                />
                <SelectField
                  label="Equipment Tag"
                  value={filters.equipment_tag}
                  onChange={(value) => setFilter('equipment_tag', value)}
                  options={tagOptions}
                />
              </div>
            </section>

            <section className="reports-filters__group">
              <h3 className="reports-filters__group-title">Job</h3>
              <div className="reports-filters__grid reports-filters__grid--3">
                <SelectField
                  label="Job Priority"
                  value={filters.priority}
                  onChange={(value) => setFilter('priority', value)}
                  options={options?.priorities || []}
                />
                <SelectField
                  label="Job Status"
                  value={filters.status}
                  onChange={(value) => setFilter('status', value)}
                  options={options?.statuses || []}
                />
                <SelectField
                  label="Job Nature"
                  value={filters.job_nature}
                  onChange={(value) => setFilter('job_nature', value)}
                  options={options?.job_natures || []}
                />
              </div>
            </section>

            <section className="reports-filters__group">
              <h3 className="reports-filters__group-title">User</h3>
              <div className="reports-filters__grid reports-filters__grid--3">
                <SelectField
                  label="Created By"
                  value={filters.created_by}
                  onChange={(value) => setFilter('created_by', value)}
                  options={options?.created_by || []}
                />
                <SelectField
                  label="Reported By"
                  value={filters.reported_by}
                  onChange={(value) => setFilter('reported_by', value)}
                  options={options?.reported_by || []}
                />
                <SelectField
                  label="Assigned To"
                  value={filters.assigned_to}
                  onChange={(value) => setFilter('assigned_to', value)}
                  options={options?.assigned_to || []}
                />
              </div>
            </section>
          </div>

          <div className="reports-filters__actions">
            <button type="button" className="company-btn company-btn--secondary" onClick={handleClear}>
              Clear
            </button>
            <button type="button" className="company-btn company-btn--primary" onClick={handleSearch}>
              Search
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
