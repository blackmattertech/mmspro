import { useState, useEffect, useMemo } from 'react'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import EmployeeAvatar from '../company/EmployeeAvatar'
import '../company/CompanyShared.css'
import './AssignEmployeesModal.css'

export default function AssignEmployeesModal({
  role,
  employees,
  saving,
  onClose,
  onSave,
}) {
  const [selected, setSelected] = useState(new Set())
  const [search, setSearch] = useState('')
  const handleBackdropClick = useBackdropClose(onClose)

  const assignedIds = useMemo(
    () => employees.filter((e) => e.access_role_id === role?.id).map((e) => e.id),
    [employees, role?.id],
  )

  useEffect(() => {
    setSelected(new Set(assignedIds))
  }, [assignedIds])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const active = employees.filter((e) => e.is_active !== false)
    if (!q) return active
    return active.filter((e) =>
      e.name?.toLowerCase().includes(q)
      || e.emp_id?.toLowerCase().includes(q)
      || e.email?.toLowerCase().includes(q),
    )
  }, [employees, search])

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
          <h2>Assign to Employees — {role?.name}</h2>
          <button type="button" className="company-modal__close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form className="company-modal__form" onSubmit={handleSubmit}>
          <p className="assign-employees-modal__hint">
            Select employees who should have the <strong>{role?.name}</strong> role. Employees not selected will be unassigned from this role.
          </p>

          <input
            type="search"
            className="company-form__input"
            placeholder="Search by name, ID, or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <div className="assign-employees-modal__list">
            {filtered.length === 0 ? (
              <p className="company-empty">No employees found.</p>
            ) : (
              filtered.map((employee) => {
                const checked = selected.has(employee.id)
                const hasOtherRole = employee.access_role_id && employee.access_role_id !== role?.id

                return (
                  <label
                    key={employee.id}
                    className={`assign-employees-modal__row ${checked ? 'assign-employees-modal__row--selected' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(employee.id)}
                    />
                    <EmployeeAvatar employee={employee} size={36} />
                    <span className="assign-employees-modal__name">{employee.name}</span>
                    <span className="assign-employees-modal__meta">{employee.emp_id}</span>
                    {hasOtherRole && employee.access_role?.name && (
                      <span className="assign-employees-modal__other-role">
                        Currently: {employee.access_role.name}
                      </span>
                    )}
                  </label>
                )
              })
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
