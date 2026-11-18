import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { isEventInFixedPopover, useFixedPopover } from '../../hooks/useFixedPopover'
import EmployeeAvatar from './EmployeeAvatar'

function employeeSelectMeta(employee) {
  return [
    employee?.emp_id,
    employee?.departments?.name,
    employee?.access_role?.name,
    employee?.org_locations?.name,
  ].filter(Boolean).join(' · ')
}

function employeeSearchText(employee) {
  return [
    employee?.name,
    employee?.emp_id,
    employee?.departments?.name,
    employee?.access_role?.name,
    employee?.org_locations?.name,
    employee?.email,
  ].filter(Boolean).join(' ').toLowerCase()
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
  searchPlaceholder = 'Search employee…',
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const searchRef = useRef(null)
  const selected = options.find((emp) => emp.id === value)
  const { popoverRef, style, popoverProps } = useFixedPopover({
    open,
    anchorRef: triggerRef,
    matchWidth: true,
    minWidth: 520,
    maxHeight: 320,
    gap: 4,
  })

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return (options || []).filter((emp) => employeeSearchText(emp).includes(q))
  }, [options, query])

  useEffect(() => {
    if (!open) {
      setQuery('')
      return undefined
    }

    const focusTimer = window.setTimeout(() => {
      searchRef.current?.focus()
    }, 0)

    const handleClickOutside = (e) => {
      if (
        rootRef.current?.contains(e.target)
        || popoverRef.current?.contains(e.target)
        || isEventInFixedPopover(e)
      ) {
        return
      }
      setOpen(false)
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, popoverRef])

  const pick = (nextValue) => {
    onChange(nextValue)
    setOpen(false)
    setQuery('')
  }

  return (
    <label className="company-form__field">
      {label && <span className="company-form__label">{label}</span>}
      <div className="company-employee-select" ref={rootRef}>
        <button
          ref={triggerRef}
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

        {open && style && createPortal(
          <div
            className="company-employee-select__menu"
            {...popoverProps}
            style={style}
          >
            <div className="company-employee-select__search">
              <input
                ref={searchRef}
                type="search"
                className="company-employee-select__search-input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                autoComplete="off"
              />
            </div>
            <ul className="company-employee-select__list" role="listbox">
              <li role="option" aria-selected={!value}>
                <button
                  type="button"
                  className={`company-employee-select__option${!value ? ' company-employee-select__option--selected' : ''}`}
                  onClick={() => pick('')}
                >
                  <span className="company-employee-select__placeholder">{placeholder}</span>
                </button>
              </li>
              {filtered.length === 0 ? (
                <li className="company-employee-select__empty" role="presentation">
                  No employees match “{query.trim()}”
                </li>
              ) : filtered.map((emp) => (
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
          </div>,
          document.body,
        )}
      </div>
    </label>
  )
}
