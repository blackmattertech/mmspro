import { useMemo } from 'react'
import FilterableSelect from '../ui/FilterableSelect'
import TechnicianMultiSelect from '../workrequests/TechnicianMultiSelect'
import { useMasterOptions } from '../../hooks/useMasterOptions'
import { getMasterSource } from '../../lib/formFieldSources'

function optionLabel(row) {
  if (!row) return ''
  if (row.emp_id && row.name) return `${row.name} (${row.emp_id})`
  if (row.vendor_code && row.name) return `${row.name} (${row.vendor_code})`
  if (row.code && row.name) return `${row.name} (${row.code})`
  if (row.version && row.name) return `${row.name} (v${row.version})`
  return row.name || row.label || row.key || row.id || ''
}

function RemoteSelect({
  options,
  loading,
  value,
  onChange,
  required,
  disabled,
  placeholder,
  multi = false,
  excludeIds = [],
}) {
  const filtered = useMemo(() => {
    if (!excludeIds?.length) return options || []
    const blocked = new Set(excludeIds.map(String))
    return (options || []).filter((row) => !blocked.has(String(row.id)))
  }, [options, excludeIds])

  if (multi) {
    return (
      <TechnicianMultiSelect
        employees={filtered}
        value={Array.isArray(value) ? value : []}
        onChange={onChange}
        disabled={disabled || loading}
        placeholder={loading ? 'Loading…' : placeholder}
      />
    )
  }
  return (
    <FilterableSelect
      value={value || ''}
      onChange={onChange}
      options={filtered}
      getOptionValue={(row) => row.id}
      getOptionLabel={optionLabel}
      placeholder={loading ? 'Loading…' : placeholder}
      disabled={disabled || loading}
      required={required}
      className="company-form__input--select"
    />
  )
}

function normalizeFilterId(value) {
  if (value == null || value === '' || value === '__none__') return undefined
  return value
}

export default function MasterPicker({
  sourceId,
  formId,
  value,
  onChange,
  required = false,
  disabled = false,
  excludeIds = [],
  filters = {},
}) {
  const source = getMasterSource(sourceId)
  const placeholder = source ? `Select ${source.label}` : 'Select…'
  const locationId = normalizeFilterId(filters.locationId)
  const departmentId = normalizeFilterId(filters.departmentId)
  const areaId = normalizeFilterId(filters.areaId)
  const blocked = Object.values(filters).some((item) => item === '__none__')
  const { options, loading } = useMasterOptions(sourceId, {
    locationId,
    departmentId,
    areaId,
    formId,
    enabled: Boolean(source) && !blocked,
  })

  const common = {
    value: blocked ? '' : value,
    onChange,
    required,
    disabled: disabled || blocked,
    placeholder: blocked ? 'Select parent first' : placeholder,
    multi: Boolean(source?.multi),
    excludeIds,
  }

  if (!source) return null

  let rows = options || []
  if (sourceId === 'departments' && locationId) {
    rows = rows.filter((row) => row.all_locations || row.location_id === locationId)
  }
  if (value && !rows.some((row) => String(row.id) === String(value))) {
    rows = [{ id: value, name: String(value) }, ...rows]
  }

  return <RemoteSelect options={blocked ? [] : rows} loading={!blocked && loading} {...common} />
}
