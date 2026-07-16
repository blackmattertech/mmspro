import { useState } from 'react'
import { useAreas } from '../../hooks/useAreas'
import GooToggle from '../ui/GooToggle'
import TrashIcon from '../ui/TrashIcon'
import EditIcon from '../ui/EditIcon'
import AreaModal from './AreaModal'
import './CompanyShared.css'

export default function AreasTab({ canManage }) {
  const { areas, loading, saving, error, create, update, remove, toggleActive } = useAreas()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [togglingId, setTogglingId] = useState(null)

  const openCreate = () => {
    setEditing(null)
    setModalOpen(true)
  }

  const openEdit = (area) => {
    setEditing(area)
    setModalOpen(true)
  }

  const handleSave = async (payload) => {
    if (editing) await update(editing.id, payload)
    else await create(payload)
    setModalOpen(false)
  }

  const handleDelete = async (area) => {
    if (!window.confirm(`Delete area "${area.name}"?`)) return
    await remove(area.id)
  }

  const handleToggle = async (area, isActive) => {
    setTogglingId(area.id)
    try {
      await toggleActive(area.id, isActive)
    } finally {
      setTogglingId(null)
    }
  }

  return (
    <div className="company-panel">
      <div className="company-panel__toolbar">
        <p className="company-panel__count">{areas.length} area(s)</p>
        {canManage && (
          <button type="button" className="company-btn company-btn--primary" onClick={openCreate}>
            + Add Area
          </button>
        )}
      </div>

      {error && <div className="company-alert">{error}</div>}

      {loading ? (
        <div className="company-loading">Loading areas…</div>
      ) : areas.length === 0 ? (
        <div className="company-empty">No areas yet. Add an area under a location and department.</div>
      ) : (
        <div className="company-table-wrap">
          <table className="company-table master-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Code</th>
                <th>Location</th>
                <th>Department</th>
                {canManage && <th>Active</th>}
                {canManage && <th aria-label="Actions" />}
              </tr>
            </thead>
            <tbody>
              {areas.map((area) => (
                <tr key={area.id} className={area.is_active === false ? 'company-table__row--inactive' : ''}>
                  <td>{area.name}</td>
                  <td>{area.code || '—'}</td>
                  <td>{area.org_locations?.name || '—'}</td>
                  <td>{area.departments?.name || '—'}</td>
                  {canManage && (
                    <td>
                      <GooToggle
                        checked={area.is_active !== false}
                        disabled={togglingId === area.id}
                        onChange={(checked) => handleToggle(area, checked)}
                        ariaLabel={`Toggle ${area.name}`}
                      />
                    </td>
                  )}
                  {canManage && (
                    <td className="company-table__actions">
                      <button
                        type="button"
                        className="company-btn company-btn--secondary company-btn--compact company-btn--icon"
                        onClick={() => openEdit(area)}
                        aria-label={`Edit ${area.name}`}
                        title="Edit"
                      >
                        <EditIcon />
                      </button>
                      <button
                        type="button"
                        className="company-btn company-btn--danger company-btn--compact company-btn--icon"
                        onClick={() => handleDelete(area)}
                        aria-label={`Delete ${area.name}`}
                        title="Delete"
                      >
                        <TrashIcon />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <AreaModal
          area={editing}
          saving={saving}
          onClose={() => setModalOpen(false)}
          onSave={handleSave}
        />
      )}
    </div>
  )
}
