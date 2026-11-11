import { useMemo } from 'react'
import DateField from '../ui/DateField'
import FilterableSelect from '../ui/FilterableSelect'
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
  onApplied,
  onClose,
  reportKind = 'unified',
  columnDefs = [],
  selectedColumnIds = [],
  onToggleColumn,
  onSelectAllColumns,
  onResetColumns,
}) {
  const selectedSet = useMemo(() => new Set(selectedColumnIds), [selectedColumnIds])
  const allSelected = columnDefs.length > 0 && columnDefs.every((col) => selectedSet.has(col.id))

  const showOrderType = reportKind === 'unified'
  const showOrderDepts = reportKind === 'unified' || reportKind === 'work_request'
  const showJobNature = reportKind === 'unified' || reportKind === 'work_request'
  const showAssets = reportKind !== 'warranty' && reportKind !== 'plant' && reportKind !== 'task'
  const showJob = !['meter_reading', 'equipment', 'plant'].includes(reportKind)
  const showCreatedBy = ['unified', 'pm_plan', 'meter_reading', 'task'].includes(reportKind)
  const showReportedBy = reportKind === 'unified' || reportKind === 'work_request'
  const showAssignedTo = ['unified', 'pm_plan', 'task'].includes(reportKind)
  const dateLabel = reportKind === 'pm_plan'
    ? 'Due date'
    : reportKind === 'work_request'
      ? 'Request date'
      : reportKind === 'meter_reading'
        ? 'Reading date'
        : 'Date'

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
  }

  const handleSearch = () => {
    onSearch?.()
    onApplied?.()
  }

  return (
    <div className="reports-filters reports-filters--rail">
      <div className="reports-filters__panel reports-filters__panel--rail">
        <div className="reports-filters__header">
          <div>
            <strong className="reports-filters__title">
              Filters
              {activeCount > 0 ? <span className="reports-filters__badge">{activeCount}</span> : null}
            </strong>
            <p className="reports-filters__subtitle">Adjust filters, then Search to apply.</p>
          </div>
          <div className="reports-filters__header-actions">
            <button type="button" className="reports-filters__clear-link" onClick={handleClear}>
              Clear all
            </button>
            {onClose ? (
              <button
                type="button"
                className="reports-filters__close"
                onClick={onClose}
                aria-label="Close filters"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <path d="M4.5 4.5L13.5 13.5M13.5 4.5L4.5 13.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            ) : null}
          </div>
        </div>

        <div className="reports-filters__scroll">
          <section className="reports-filters__group">
            <h3 className="reports-filters__group-title">{dateLabel}</h3>
            <div className="reports-filters__grid reports-filters__grid--rail">
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

          {(showOrderType || showOrderDepts) && (
            <section className="reports-filters__group">
              <h3 className="reports-filters__group-title">Order</h3>
              <div className="reports-filters__grid reports-filters__grid--rail">
                {showOrderType && (
                  <SelectField
                    label="Order Type"
                    value={filters.order_type}
                    onChange={(value) => setFilter('order_type', value)}
                    options={options?.order_types || []}
                  />
                )}
                {showOrderDepts && (
                  <>
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
                  </>
                )}
              </div>
            </section>
          )}

          {showAssets && (
            <section className="reports-filters__group">
              <h3 className="reports-filters__group-title">Assets</h3>
              <div className="reports-filters__grid reports-filters__grid--rail">
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
                {reportKind !== 'plant' && (
                  <>
                    <SelectField
                      label="Asset"
                      value={filters.equipment_id}
                      onChange={(value) => setFilter('equipment_id', value)}
                      options={equipmentOptions}
                    />
                    <SelectField
                      label="Asset Type"
                      value={filters.equipment_type}
                      onChange={(value) => setFilter('equipment_type', value)}
                      options={typeOptions}
                    />
                    <SelectField
                      label="Asset Capacity"
                      value={filters.equipment_capacity}
                      onChange={(value) => setFilter('equipment_capacity', value)}
                      options={capacityOptions}
                    />
                    <SelectField
                      label="Asset Tag"
                      value={filters.equipment_tag}
                      onChange={(value) => setFilter('equipment_tag', value)}
                      options={tagOptions}
                    />
                  </>
                )}
              </div>
            </section>
          )}

          {showJob && (
            <section className="reports-filters__group">
              <h3 className="reports-filters__group-title">Job</h3>
              <div className="reports-filters__grid reports-filters__grid--rail">
                <SelectField
                  label="Priority"
                  value={filters.priority}
                  onChange={(value) => setFilter('priority', value)}
                  options={options?.priorities || []}
                />
                <SelectField
                  label="Status"
                  value={filters.status}
                  onChange={(value) => setFilter('status', value)}
                  options={
                    reportKind === 'warranty'
                      ? [
                        { value: 'Active', label: 'Active' },
                        { value: 'Expired', label: 'Expired' },
                      ]
                      : (options?.statuses || [])
                  }
                />
                {showJobNature && (
                  <SelectField
                    label="Job Nature"
                    value={filters.job_nature}
                    onChange={(value) => setFilter('job_nature', value)}
                    options={options?.job_natures || []}
                  />
                )}
              </div>
            </section>
          )}

          {(reportKind === 'task' || reportKind === 'warranty') && (
            <section className="reports-filters__group">
              <h3 className="reports-filters__group-title">Location</h3>
              <div className="reports-filters__grid reports-filters__grid--rail">
                <SelectField
                  label="Plant / Facility"
                  value={filters.facility_id}
                  onChange={(value) => setFilter('facility_id', value)}
                  options={facilityOptions}
                  disabled={!canSelectLocation}
                />
              </div>
            </section>
          )}

          {(showCreatedBy || showReportedBy || showAssignedTo) && (
            <section className="reports-filters__group">
              <h3 className="reports-filters__group-title">User</h3>
              <div className="reports-filters__grid reports-filters__grid--rail">
                {showCreatedBy && (
                  <SelectField
                    label="Created By"
                    value={filters.created_by}
                    onChange={(value) => setFilter('created_by', value)}
                    options={options?.created_by || []}
                  />
                )}
                {showReportedBy && (
                  <SelectField
                    label="Reported By"
                    value={filters.reported_by}
                    onChange={(value) => setFilter('reported_by', value)}
                    options={options?.reported_by || []}
                  />
                )}
                {showAssignedTo && (
                  <SelectField
                    label="Assigned To"
                    value={filters.assigned_to}
                    onChange={(value) => setFilter('assigned_to', value)}
                    options={options?.assigned_to || []}
                  />
                )}
              </div>
            </section>
          )}

          {columnDefs.length > 0 && (
            <section className="reports-filters__group">
              <div className="reports-filters__group-heading">
                <h3 className="reports-filters__group-title">Columns</h3>
                <div className="reports-filters__group-actions">
                  <button
                    type="button"
                    className="reports-filters__clear-link"
                    onClick={() => (allSelected ? onResetColumns?.() : onSelectAllColumns?.())}
                  >
                    {allSelected ? 'Reset' : 'Select all'}
                  </button>
                </div>
              </div>
              <p className="reports-filters__hint">
                {selectedColumnIds.length} of {columnDefs.length} selected
              </p>
              <div className="reports-columns-grid" role="group" aria-label="Report columns">
                {columnDefs.map((col) => {
                  const checked = selectedSet.has(col.id)
                  return (
                    <label key={col.id} className="reports-columns-grid__item">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={checked && selectedColumnIds.length <= 1}
                        onChange={() => onToggleColumn?.(col.id)}
                      />
                      <span>{col.label}</span>
                    </label>
                  )
                })}
              </div>
            </section>
          )}
        </div>

        <div className="reports-filters__actions">
          <button type="button" className="company-btn company-btn--secondary" onClick={handleClear}>
            Clear
          </button>
          <button type="button" className="company-btn company-btn--primary" onClick={handleSearch}>
            Search
          </button>
        </div>
      </div>
    </div>
  )
}
