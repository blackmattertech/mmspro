import { useState, useEffect, useMemo, useRef } from 'react'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import EmployeeAvatar from '../company/EmployeeAvatar'
import PageBack from '../shared/PageBack'
import TableFilterToolbar from '../shared/TableFilterToolbar'
import { TABLE_SORT_OPTIONS, applyTableFilters, compactFilters } from '../../lib/tableFilters'
import { formatPhoneDisplay } from '../shared/PhoneInput'
import '../company/CompanyShared.css'
import '../shared/PageBack.css'
import '../shared/TableFilterToolbar.css'
import '../workorders/WorkOrdersPage.css'
import './AssignEmployeesModal.css'

const EMPLOYEE_FILTER_FIELDS = [
  { value: 'name', label: 'Name' },
  { value: 'emp_id', label: 'Emp ID' },
  { value: 'department', label: 'Department' },
  { value: 'location', label: 'Location' },
  { value: 'email', label: 'Email' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'manager', label: 'Manager' },
  { value: 'role', label: 'Current role' },
  { value: 'status', label: 'Status', placeholder: 'active or inactive' },
]

export default function AssignEmployeesModal({
  role,
  employees,
  selectionEmployees,
  saving,
  scopeHint,
  onClose,
  onSave,
  onQueryChange,
}) {
  const [selected, setSelected] = useState(new Set())
  const [search, setSearch] = useState('')
  const [columnFilters, setColumnFilters] = useState({})
  const [sortBy, setSortBy] = useState('name_asc')
  const handleBackdropClick = useBackdropClose(onClose)
  const debouncedSearch = useDebouncedValue(search.trim())
  const seededRoleId = useRef(null)

  const assignedIds = useMemo(
    () => (selectionEmployees || employees)
      .filter((employee) => employee.access_role_id === role?.id)
      .map((employee) => employee.id),
    [selectionEmployees, employees, role?.id],
  )

  useEffect(() => {
    if (!role?.id || seededRoleId.current === role.id) return
    if (!(selectionEmployees || employees).length && assignedIds.length === 0) return
    seededRoleId.current = role.id
    setSelected(new Set(assignedIds))
  }, [assignedIds, employees, role?.id, selectionEmployees])

  useEffect(() => {
    onQueryChange?.({
      search: debouncedSearch,
      listFilters: compactFilters(columnFilters),
    })
  }, [debouncedSearch, columnFilters, onQueryChange])

  const filtered = useMemo(() => applyTableFilters(employees, {
    sortBy,
    getName: (employee) => employee.name,
    getCreatedAt: (employee) => employee.created_at,
  }), [employees, sortBy])

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      await onSave([...selected])
    } catch {
      // error shown by parent
    }
  }

  return (
    <div className="company-modal-overlay" onMouseDown={handleBackdropClick}>
      <div className="company-modal company-modal--wide assign-employees-modal" onClick={(e) => e.stopPropagation()}>
        <div className="company-modal__header">
          <div className="assign-employees-modal__heading">
            <PageBack onClick={onClose} className="page-back--header" label="Roles & Access" />
            <h2>Assign to Employees — {role?.name}</h2>
          </div>
          <button type="button" className="company-modal__close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form className="company-modal__form" onSubmit={handleSubmit}>
          <p className="assign-employees-modal__hint">
            Select employees who should have the <strong>{role?.name}</strong> role.
            {scopeHint
              ? ` ${scopeHint}`
              : ' Employees not selected will be unassigned from this role.'}
          </p>

          <TableFilterToolbar
            className="assign-employees-modal__toolbar"
            search={{
              value: search,
              onChange: setSearch,
              placeholder: 'Search employees...',
              ariaLabel: 'Search employees',
            }}
            filter={{
              fields: EMPLOYEE_FILTER_FIELDS,
              values: columnFilters,
              onChange: setColumnFilters,
            }}
            sort={{ value: sortBy, onChange: setSortBy, options: TABLE_SORT_OPTIONS }}
          />

          <div className="assign-employees-modal__table-wrap">
            {filtered.length === 0 ? (
              <p className="company-empty">No employees found.</p>
            ) : (
              <table className="company-table assign-employees-modal__table">
                <thead>
                  <tr>
                    <th className="assign-employees-modal__check-col" aria-label="Select" />
                    <th>Name</th>
                    <th>ID</th>
                    <th>Mobile</th>
                    <th>Email</th>
                    <th>Location</th>
                    <th>Department</th>
                    <th>Current role</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((employee) => {
                    const checked = selected.has(employee.id)

                    return (
                      <tr
                        key={employee.id}
                        className={`assign-employees-modal__row ${checked ? 'assign-employees-modal__row--selected' : ''}${employee.is_active === false ? ' company-table__row--inactive' : ''}`}
                        onClick={() => toggle(employee.id)}
                      >
                        <td className="assign-employees-modal__check-col" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggle(employee.id)}
                            aria-label={`Select ${employee.name}`}
                          />
                        </td>
                        <td>
                          <span className="assign-employees-modal__person">
                            <EmployeeAvatar employee={employee} />
                            <span className="assign-employees-modal__name">{employee.name}</span>
                          </span>
                        </td>
                        <td className="company-table__cell--nowrap">{employee.emp_id || '—'}</td>
                        <td className="company-table__cell--nowrap">
                          {employee.mobile ? formatPhoneDisplay(employee.mobile) : '—'}
                        </td>
                        <td className="company-table__cell--truncate">{employee.email || '—'}</td>
                        <td className="company-table__cell--truncate">{employee.org_locations?.name || '—'}</td>
                        <td className="company-table__cell--truncate">{employee.departments?.name || '—'}</td>
                        <td>
                          {employee.access_role?.name ? (
                            <span className="assign-employees-modal__role-pill">
                              {employee.access_role.name}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="company-modal__footer">
            <button type="button" className="company-btn company-btn--secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="company-btn company-btn--primary" disabled={saving}>
              {saving ? 'Saving...' : `Assign (${selected.size})`}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
