import { useState } from 'react'
import { useLocations } from '../../hooks/useLocations'
import GooToggle from '../ui/GooToggle'
import LocationModal from './LocationModal'
import './CompanyShared.css'

export default function LocationsTab({ canManage }) {
  const { locations, loading, saving, error, create, update, remove, toggleActive } = useLocations()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [togglingId, setTogglingId] = useState(null)

  const openCreate = () => {
    setEditing(null)
    setModalOpen(true)
  }

  const openEdit = (loc) => {
    setEditing(loc)
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

  const handleDelete = async (loc) => {
    if (!window.confirm(`Delete location "${loc.name}"?`)) return
    await remove(loc.id)
  }

  const handleToggle = async (loc, isActive) => {
    setTogglingId(loc.id)
    try {
      await toggleActive(loc.id, isActive)
    } catch {
      // error shown in tab
    } finally {
      setTogglingId(null)
    }
  }

  const activeCount = locations.filter((l) => l.is_active !== false).length

  return (
    <div className="company-panel">
      <div className="company-panel__toolbar">
        <p className="company-panel__count">
          {activeCount} active · {locations.length} total location(s)
        </p>
        {canManage && (
          <button type="button" className="company-btn company-btn--primary" onClick={openCreate}>
            + Add Location
          </button>
        )}
      </div>

      {error && <div className="company-alert">{error}</div>}

      {loading ? (
        <div className="company-loading">Loading locations...</div>
      ) : locations.length === 0 ? (
        <div className="company-empty">No locations yet. Add your first site or branch.</div>
      ) : (
        <div className="company-table-wrap">
          <table className="company-table master-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Code</th>
                <th>City</th>
                <th>Country</th>
                <th>Primary</th>
                {canManage && <th>Active</th>}
                {canManage && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {locations.map((loc) => {
                const isActive = loc.is_active !== false
                return (
                  <tr key={loc.id} className={!isActive ? 'company-table__row--inactive' : undefined}>
                    <td>
                      <span className="company-table__name">{loc.name}</span>
                      {loc.address_line1 && (
                        <span className="company-table__sub">{loc.address_line1}</span>
                      )}
                    </td>
                    <td><code className="company-code">{loc.code}</code></td>
                    <td>{loc.city || '—'}</td>
                    <td>{loc.country || '—'}</td>
                    <td>
                      {loc.is_primary ? (
                        <span className="company-badge company-badge--primary">Primary</span>
                      ) : '—'}
                    </td>
                    {canManage && (
                      <td>
                        <GooToggle
                          checked={isActive}
                          disabled={togglingId === loc.id || saving}
                          onChange={(checked) => handleToggle(loc, checked)}
                          ariaLabel={`${isActive ? 'Disable' : 'Enable'} ${loc.name}`}
                        />
                      </td>
                    )}
                    {canManage && (
                      <td>
                        <div className="company-table__actions">
                          <button type="button" className="company-link" onClick={() => openEdit(loc)}>
                            Edit
                          </button>
                          <button
                            type="button"
                            className="company-link company-link--danger"
                            onClick={() => handleDelete(loc)}
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
        <LocationModal
          key={editing?.id ?? 'new'}
          location={editing}
          saving={saving}
          onClose={() => setModalOpen(false)}
          onSave={handleSave}
        />
      )}
    </div>
  )
}
