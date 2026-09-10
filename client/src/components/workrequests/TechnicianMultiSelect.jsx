import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useFixedPopover } from '../../hooks/useFixedPopover'
import EmployeeAvatar from '../company/EmployeeAvatar'
import { formatPhoneDisplay } from '../shared/PhoneInput'
import '../company/CompanyShared.css'

function technicianSearchText(employee) {
  return [
    employee?.name,
    employee?.emp_id,
    employee?.email,
    employee?.mobile,
    employee?.departments?.name,
    employee?.org_locations?.name,
  ].filter(Boolean).join(' ').toLowerCase()
}

function TechnicianDetails({ employee }) {
  const department = employee?.departments?.name || '—'
  const location = employee?.org_locations?.name || '—'
  const phone = employee?.mobile ? formatPhoneDisplay(employee.mobile) : '—'
  const email = employee?.email || '—'

  return (
    <span className="wr-tech-select__copy">
      <span className="wr-tech-select__name">
        {employee?.name}
        {employee?.emp_id ? ` (${employee.emp_id})` : ''}
      </span>
      <span className="wr-tech-select__meta">Department: {department}</span>
      <span className="wr-tech-select__meta">Location: {location}</span>
      <span className="wr-tech-select__meta">Mobile: {phone}</span>
      <span className="wr-tech-select__meta">Email: {email}</span>
    </span>
  )
}

export default function TechnicianMultiSelect({
  employees = [],
  value = [],
  onChange,
  disabled = false,
  placeholder = 'Select technicians…',
}) {
  const listId = useId()
  const rootRef = useRef(null)
  const inputRef = useRef(null)
  const controlRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const selectedIds = Array.isArray(value) ? value : []
  const { popoverRef, style, popoverProps } = useFixedPopover({
    open,
    anchorRef: controlRef,
    matchWidth: true,
    maxHeight: 420,
    gap: 4,
  })

  const selectedEmployees = useMemo(
    () => selectedIds
      .map((id) => employees.find((employee) => employee.id === id))
      .filter(Boolean),
    [employees, selectedIds],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return employees
    return employees.filter((employee) => technicianSearchText(employee).includes(q))
  }, [employees, query])

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setHighlightedIndex(0)
  }, [])

  const toggle = (employeeId) => {
    if (disabled || !employeeId) return
    if (selectedIds.includes(employeeId)) {
      onChange(selectedIds.filter((id) => id !== employeeId))
      return
    }
    onChange([...selectedIds, employeeId])
  }

  useEffect(() => {
    if (!open) return undefined
    const handlePointer = (event) => {
      if (rootRef.current?.contains(event.target) || popoverRef.current?.contains(event.target)) return
      close()
    }
    document.addEventListener('mousedown', handlePointer)
    return () => document.removeEventListener('mousedown', handlePointer)
  }, [close, open, popoverRef])

  useEffect(() => {
    if (!open) return
    setHighlightedIndex(0)
  }, [open, query])

  useEffect(() => {
    if (!open) return
    const highlighted = popoverRef.current?.querySelector('.wr-tech-select__option--highlighted')
    highlighted?.scrollIntoView({ block: 'nearest' })
  }, [highlightedIndex, open, popoverRef])

  const openMenu = () => {
    if (disabled) return
    setOpen(true)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const onKeyDown = (event) => {
    if (disabled) return

    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      inputRef.current?.blur()
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!open) setOpen(true)
      setHighlightedIndex((index) => Math.min(index + 1, Math.max(filtered.length - 1, 0)))
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) setOpen(true)
      setHighlightedIndex((index) => Math.max(index - 1, 0))
      return
    }

    if (event.key === 'Backspace' && !query && selectedIds.length) {
      onChange(selectedIds.slice(0, -1))
      return
    }

    if (event.key === 'Enter' && open) {
      event.preventDefault()
      const employee = filtered[highlightedIndex]
      if (employee) toggle(employee.id)
    }
  }

  const menu = open && style
    ? createPortal(
      <ul
        id={listId}
        className="filterable-select__menu wr-tech-select__menu"
        role="listbox"
        aria-multiselectable="true"
        {...popoverProps}
      >
        {filtered.length === 0 ? (
          <li className="filterable-select__empty" role="presentation">
            {employees.length === 0
              ? 'No Maintenance employees at this location.'
              : 'No matches'}
          </li>
        ) : (
          filtered.map((employee, index) => {
            const selected = selectedIds.includes(employee.id)
            return (
              <li key={employee.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={[
                    'wr-tech-select__option',
                    selected ? 'wr-tech-select__option--selected' : '',
                    index === highlightedIndex ? 'wr-tech-select__option--highlighted' : '',
                  ].filter(Boolean).join(' ')}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => toggle(employee.id)}
                >
                  <span className={`wr-tech-select__check${selected ? ' wr-tech-select__check--on' : ''}`} aria-hidden="true">
                    {selected ? '✓' : ''}
                  </span>
                  <EmployeeAvatar employee={employee} />
                  <TechnicianDetails employee={employee} />
                </button>
              </li>
            )
          })
        )}
      </ul>,
      document.body,
    )
    : null

  return (
    <div className="filterable-select wr-tech-select" ref={rootRef}>
      <div
        className="wr-tech-select__control"
        ref={controlRef}
        onClick={openMenu}
      >
        {selectedEmployees.map((employee) => (
          <span key={employee.id} className="wr-tech-select__chip">
            <EmployeeAvatar employee={employee} size="sm" />
            <span className="wr-tech-select__chip-copy">
              <span className="wr-tech-select__chip-name">{employee.name}</span>
              <span className="wr-tech-select__chip-meta">
                {[
                  employee.emp_id,
                  employee.departments?.name,
                  employee.mobile ? formatPhoneDisplay(employee.mobile) : null,
                ].filter(Boolean).join(' · ')}
              </span>
            </span>
            <button
              type="button"
              className="wr-tech-select__chip-remove"
              aria-label={`Remove ${employee.name}`}
              disabled={disabled}
              onClick={(event) => {
                event.stopPropagation()
                toggle(employee.id)
              }}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          className="wr-tech-select__input"
          value={open ? query : ''}
          placeholder={selectedEmployees.length ? 'Add another…' : placeholder}
          onChange={(event) => {
            setQuery(event.target.value)
            if (!open) setOpen(true)
          }}
          onFocus={openMenu}
          onKeyDown={onKeyDown}
          disabled={disabled}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          role="combobox"
          autoComplete="off"
        />
        <button
          type="button"
          className="filterable-select__toggle"
          tabIndex={-1}
          aria-label="Toggle technicians"
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation()
            if (open) close()
            else openMenu()
          }}
        >
          <span aria-hidden>▾</span>
        </button>
      </div>
      {menu}
    </div>
  )
}
