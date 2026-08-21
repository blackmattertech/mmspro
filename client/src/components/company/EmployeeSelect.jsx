import { useEffect, useRef, useState } from 'react'
import EmployeeAvatar from './EmployeeAvatar'

function employeeSelectMeta(employee) {
  return [
    employee?.emp_id,
    employee?.departments?.name,
    employee?.access_role?.name,
    employee?.org_locations?.name,
  ].filter(Boolean).join(' · ')
}

function EmployeeSelectPerson({ employee }) {
  const meta = employeeSelectMeta(employee)
  return (
    <span className="company-employee-select__value">
      <EmployeeAvatar employee={employee} size="sm" />
      <span className="company-employee-select__copy">
        <span className="company-employee-select__name">{employee.name}</span>
        {meta && <span className="company-employee-select__meta">{meta}</span>}
      </span>
    </span>
  )
}

export default function EmployeeSelect({
  label,
  value,
  onChange,
  options,
  placeholder = 'None',
  disabled = false,
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const selected = options.find((emp) => emp.id === value)

  useEffect(() => {
    if (!open) return undefined

    const handleClickOutside = (e) => {
      if (!rootRef.current?.contains(e.target)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const pick = (nextValue) => {
    onChange(nextValue)
    setOpen(false)
  }

  return (
    <label className="company-form__field">
      {label && <span className="company-form__label">{label}</span>}
      <div className="company-employee-select" ref={rootRef}>
        <button
          type="button"
          className="company-employee-select__trigger"
          onClick={() => !disabled && setOpen((prev) => !prev)}
          aria-expanded={open}
          aria-haspopup="listbox"
          disabled={disabled}
        >
          {selected ? (
            <EmployeeSelectPerson employee={selected} />
          ) : (
            <span className="company-employee-select__placeholder">{placeholder}</span>
          )}
          <span className="company-employee-select__chevron" aria-hidden>▾</span>
        </button>

        {open && (
          <ul className="company-employee-select__menu" role="listbox">
            <li role="option" aria-selected={!value}>
              <button
                type="button"
                className={`company-employee-select__option${!value ? ' company-employee-select__option--selected' : ''}`}
                onClick={() => pick('')}
              >
                <span className="company-employee-select__placeholder">{placeholder}</span>
              </button>
            </li>
            {options.map((emp) => (
              <li key={emp.id} role="option" aria-selected={emp.id === value}>
                <button
                  type="button"
                  className={`company-employee-select__option${emp.id === value ? ' company-employee-select__option--selected' : ''}`}
                  onClick={() => pick(emp.id)}
                >
                  <EmployeeSelectPerson employee={emp} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </label>
  )
}
