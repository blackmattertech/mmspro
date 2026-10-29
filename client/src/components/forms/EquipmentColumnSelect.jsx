import { useEffect, useState } from 'react'
import FilterableSelect from '../ui/FilterableSelect'
import { getEquipmentColumnValues } from '../../lib/api-equipment'

export default function EquipmentColumnSelect({
  fieldId,
  value,
  onChange,
  required = false,
  disabled = false,
}) {
  const [options, setOptions] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!fieldId) {
      setOptions([])
      return undefined
    }
    let cancelled = false
    setLoading(true)
    getEquipmentColumnValues(fieldId)
      .then((rows) => {
        if (!cancelled) setOptions(rows)
      })
      .catch(() => {
        if (!cancelled) setOptions([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [fieldId])

  const current = value == null ? '' : String(value)
  const choices = current && !options.some((item) => item === current)
    ? [current, ...options]
    : options

  return (
    <FilterableSelect
      value={current}
      onChange={onChange}
      options={choices}
      getOptionValue={(item) => item}
      getOptionLabel={(item) => item}
      placeholder={loading ? 'Loading…' : 'Select…'}
      disabled={disabled || loading}
      required={required}
      className="company-form__input--select"
    />
  )
}
