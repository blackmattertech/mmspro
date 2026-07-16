import { useMemo, useState, useEffect } from 'react'
import { usePermissions } from '../../hooks/usePermissions'
import { isCompanyAdmin } from '../../lib/accountRoles'
import { useAuth } from '../../hooks/useAuth'
import { useEquipment } from '../../hooks/useEquipment'
import { useOrgEquipmentFields } from '../../hooks/useOrgEquipmentFields'
import { getEquipment } from '../../lib/api-equipment'
import EquipmentModal from '../../components/equipment/EquipmentModal'
import AssetsFieldsPanel from '../../components/assets/AssetsFieldsPanel'
import AreasTab from '../../components/company/AreasTab'
import GooToggle from '../../components/ui/GooToggle'
import TrashIcon from '../../components/ui/TrashIcon'
import EditIcon from '../../components/ui/EditIcon'
import './Company.css'
import '../../components/company/CompanyShared.css'

export default function Equipment() {
  const { role } = useAuth()
  const {
    loading: permLoading,
    canRead,
    canCreate,
    canUpdate,
    canDelete,
  } = usePermissions()
  const canManage = canCreate('equipment') || canUpdate('equipment') || canDelete('equipment')
  const canManageAreas = canCreate('areas') || canUpdate('areas') || canDelete('areas')
  const canManageChildren = isCompanyAdmin(role) || canUpdate('equipment')
  const [view, setView] = useState(() => (canRead('equipment') ? 'records' : 'areas'))
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    const id = window.setTimeout(() => {
      setDebouncedSearch(search.trim())
    }, 300)
    return () => window.clearTimeout(id)
  }, [search])

  const filters = useMemo(
    () => ({ search: debouncedSearch || undefined }),
    [debouncedSearch],
  )
  const { items, loading, saving, error, create, update, remove } = useEquipment(filters)
  const fieldsState = useOrgEquipmentFields()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  const showRecords = canRead('equipment')
  const showAreas = canRead('areas')
  const showFields = canRead('equipment')

  const openCreate = () => {
    setEditing(null)
    setModalOpen(true)
  }

  const openEdit = async (row) => {
    try {
      const detail = await getEquipment(row.id)
      setEditing(detail)
      setModalOpen(true)
    } catch (err) {
      window.alert(err.message)
    }
  }

  const handleSave = async (payload) => {
    if (editing?.id) await update(editing.id, payload)
    else await create(payload)
    setModalOpen(false)
  }

  const handleDelete = async (row) => {
    if (!window.confirm(`Delete equipment "${row.name}"?`)) return
    await remove(row.id)
  }

  const handleToggle = async (row, isActive) => {
    await update(row.id, { is_active: isActive })
  }

  if (permLoading) {
    return (
      <div className="company-page">
        <div className="company-loading">Loading...</div>
      </div>
    )
  }

  return (
    <div className="company-page">
      <header className="company-page__header">
        <h1 className="company-page__title">Equipment</h1>
        <p className="company-page__subtitle">
          Maintain areas and equipment records by location and department
        </p>
        <nav className="company-tabs" aria-label="Equipment sections">
          {showRecords && (
            <button
              type="button"
              className={`company-tabs__btn ${view === 'records' ? 'company-tabs__btn--active' : ''}`}
              onClick={() => setView('records')}
            >
              Records
            </button>
          )}
          {showAreas && (
            <button
              type="button"
              className={`company-tabs__btn ${view === 'areas' ? 'company-tabs__btn--active' : ''}`}
              onClick={() => setView('areas')}
            >
              Areas
            </button>
          )}
          {showFields && (
            <button
              type="button"
              className={`company-tabs__btn ${view === 'fields' ? 'company-tabs__btn--active' : ''}`}
              onClick={() => setView('fields')}
            >
              Field options
            </button>
          )}
        </nav>
      </header>

      <div className="company-page__content">
        {view === 'areas' ? (
          <AreasTab canManage={canManageAreas} />
        ) : view === 'fields' ? (
          <>
            <p className="company-readonly-note">
              Field structure is defined by Super Admin. You can manage dropdown values for equipment fields here.
            </p>
            <AssetsFieldsPanel
              fieldsState={fieldsState}
              canManageSchema={false}
              canManageChildren={canManageChildren}
            />
          </>
        ) : (
          <>
            {!canManage && (
              <p className="company-readonly-note">
                You have read-only access. Contact a company admin to make changes.
              </p>
            )}

            <div className="company-panel">
              <div className="company-panel__toolbar">
                <label className="company-filter">
                  <span>Search</span>
                  <input
                    className="company-form__input"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search equipment…"
                  />
                </label>
                {canManage && (
                  <button type="button" className="company-btn company-btn--primary" onClick={openCreate}>
                    + Add Equipment
                  </button>
                )}
              </div>

              {error && <div className="company-error">{error}</div>}

              {loading ? (
                <div className="company-loading">Loading equipment…</div>
              ) : items.length === 0 ? (
                <div className="company-empty">
                  No equipment yet. Create areas first, then add equipment records.
                </div>
              ) : (
                <div className="company-table-wrap">
                  <table className="company-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Code</th>
                        <th>Location</th>
                        <th>Department</th>
                        <th>Area</th>
                        <th>Active</th>
                        {canManage && <th>Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((row) => (
                        <tr key={row.id}>
                          <td>{row.name}</td>
                          <td>{row.code || '—'}</td>
                          <td>{row.locations?.name || '—'}</td>
                          <td>{row.departments?.name || '—'}</td>
                          <td>{row.areas?.name || '—'}</td>
                          <td>
                            <GooToggle
                              checked={row.is_active !== false}
                              disabled={!canManage || saving}
                              onChange={(checked) => handleToggle(row, checked)}
                              ariaLabel={`Toggle ${row.name}`}
                            />
                          </td>
                          {canManage && (
                            <td className="company-table__actions">
                              <button
                                type="button"
                                className="company-btn company-btn--secondary company-btn--compact company-btn--icon"
                                onClick={() => openEdit(row)}
                                aria-label={`Edit ${row.name}`}
                                title="Edit"
                              >
                                <EditIcon />
                              </button>
                              <button
                                type="button"
                                className="company-btn company-btn--danger company-btn--compact company-btn--icon"
                                onClick={() => handleDelete(row)}
                                aria-label={`Delete ${row.name}`}
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
            </div>

            {modalOpen && (
              <EquipmentModal
                equipment={editing}
                saving={saving}
                onClose={() => setModalOpen(false)}
                onSave={handleSave}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}
