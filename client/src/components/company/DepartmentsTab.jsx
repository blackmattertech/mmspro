import { useState } from 'react'
import { useDepartments } from '../../hooks/useDepartments'
import { useLocations } from '../../hooks/useLocations'
import { useEmployees } from '../../hooks/useEmployees'
import GooToggle from '../ui/GooToggle'
import DepartmentModal, { formatDepartmentLocation } from './DepartmentModal'
import DepartmentHeadCell from './DepartmentHeadCell'
import './CompanyShared.css'

export default function DepartmentsTab({ canManage }) {
  const [locationFilter, setLocationFilter] = useState('')
  const { locations, create: createLocation, saving: savingLocation } = useLocations()
  const { employees } = useEmployees()
  const { departments, loading, saving, error, create, update, remove, toggleActive } = useDepartments(locationFilter)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [togglingId, setTogglingId] = useState(null)

  const activeLocations = locations.filter((l) => l.is_active !== false)
  const activeDepartments = departments.filter((d) => d.is_active !== false)

  const openCreate = () => {
    setEditing(null)
    setModalOpen(true)
  }

  const openEdit = (dept) => {
    setEditing(dept)
    setModalOpen(true)
  }

  const handleSave = async (payload) => {
    try {
      if (editing) await update(editing.id, payload)
      else await create(payload)
      setModalOpen(false)
    } catch {
      // keep modal open; error shown in tab and modal
    }
  }

  const handleDelete = async (dept) => {
    if (!window.confirm(`Delete department "${dept.name}"?`)) return
    await remove(dept.id)
  }

  const handleToggle = async (dept, isActive) => {
    setTogglingId(dept.id)
    try {
      await toggleActive(dept.id, isActive)
    } catch {
      // error shown in tab
    } finally {
      setTogglingId(null)
    }
  }

  const activeCount = activeDepartments.length

  return (
    <div className="company-panel">
      <div className="company-panel__toolbar">
        <div className="company-panel__filters">
          <label className="company-filter">
            <span>Location</span>
            <select
              className="company-form__input company-form__input--select"
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
            >
              <option value="">All locations</option>
              {activeLocations.map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
          </label>
          <p className="company-panel__count">
            {activeCount} active · {departments.length} total department(s)
          </p>
        </div>
        {canManage && (
          <button type="button" className="company-btn company-btn--primary" onClick={openCreate}>
            + Add Department
          </button>
        )}
      </div>

      {error && <div className="company-alert">{error}</div>}

      {loading ? (
        <div className="company-loading">Loading departments...</div>
      ) : departments.length === 0 ? (
        <div className="company-empty">No departments yet. Create teams like Maintenance, Operations, etc.</div>
      ) : (
        <div className="company-table-wrap">
          <table className="company-table master-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Location</th>
                <th>Department Head</th>
                <th>Description</th>
                {canManage && <th>Active</th>}
                {canManage && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {departments.map((dept) => {
                const isActive = dept.is_active !== false
                return (
                  <tr key={dept.id} className={!isActive ? 'company-table__row--inactive' : undefined}>
                    <td><code className="company-code">{dept.code || '—'}</code></td>
                    <td><span className="company-table__name">{dept.name}</span></td>
                    <td>{formatDepartmentLocation(dept)}</td>
                    <td><DepartmentHeadCell department={dept} locationFilter={locationFilter} /></td>
                    <td>{dept.description || '—'}</td>
                    {canManage && (
                      <td>
                        <GooToggle
                          checked={isActive}
                          disabled={togglingId === dept.id || saving}
                          onChange={(checked) => handleToggle(dept, checked)}
                          ariaLabel={`${isActive ? 'Disable' : 'Enable'} ${dept.name}`}
                        />
                      </td>
                    )}
                    {canManage && (
                      <td>
                        <div className="company-table__actions">
                          <button type="button" className="company-link" onClick={() => openEdit(dept)}>
                            Edit
                          </button>
                          <button
                            type="button"
                            className="company-link company-link--danger"
                            onClick={() => handleDelete(dept)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <DepartmentModal
          key={editing?.id ?? 'new'}
          department={editing}
          locations={activeLocations}
          departments={activeDepartments}
          employees={employees}
          saving={saving}
          nestedSaving={savingLocation}
          onClose={() => setModalOpen(false)}
          onSave={handleSave}
          onCreateLocation={createLocation}
        />
      )}
    </div>
  )
}
