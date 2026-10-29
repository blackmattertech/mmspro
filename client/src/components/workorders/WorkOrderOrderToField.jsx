import { useMemo } from 'react'
import { useDepartments } from '../../hooks/useDepartments'
import FilterableSelect from '../ui/FilterableSelect'
import '../workrequests/WorkRequests.css'
import './ManualWorkOrder.css'

function departmentLocationName(department) {
  if (!department) return ''
  if (department.all_locations) return 'All locations'
  return department.org_locations?.name || department.location_name || ''
}

function departmentLabel(department) {
  const location = departmentLocationName(department)
  return location ? `${department.name} · ${location}` : (department?.name || '')
}

function departmentSearchLabel(department) {
  return [
    department?.name,
    department?.code,
    departmentLocationName(department),
  ].filter(Boolean).join(' ')
}

export default function WorkOrderOrderToField({
  value = '',
  selected = null,
  onChange,
  disabled = false,
  embedded = false,
  className = '',
}) {
  const { departments, loading } = useDepartments('', { limit: 200 })

  const options = useMemo(() => {
    const active = (departments || []).filter((department) => department.is_active !== false)
    if (!value || !selected?.id || active.some((department) => department.id === value)) {
      return active
    }
    return [selected, ...active]
  }, [departments, selected, value])

  const handleChange = (departmentId) => {
    const department = options.find((row) => row.id === departmentId)
    onChange?.({
      departmentId: departmentId || null,
      locationId: department?.location_id || department?.org_locations?.id || null,
      department: department || null,
    })
  }

  const field = (
    <>
      <label className={`company-form__field ${className}`.trim()}>
        <span className="company-form__label">Order to department *</span>
        <FilterableSelect
          className="company-form__input--select"
          value={value || ''}
          onChange={handleChange}
          options={options}
          getOptionValue={(department) => department.id}
          getOptionLabel={departmentLabel}
          getOptionSearchLabel={departmentSearchLabel}
          placeholder={loading ? 'Loading departments…' : 'Select department'}
          disabled={disabled || loading}
          allowEmpty={false}
          required
        />
      </label>
      <p className="wo-manual__intro">
        The department head, or people in that department who can approve, will assign a technician in their department.
      </p>
    </>
  )

  if (embedded) return field

  return (
    <section className="wr-form-section" aria-labelledby="wo-order-to-title">
      <header className="wr-form-section__head" id="wo-order-to-title">
        <h3 className="wr-form-section__title">Order to</h3>
      </header>
      <div className="wr-form-section__body">
        {field}
      </div>
    </section>
  )
}
