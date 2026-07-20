import { useMemo, useRef, useState, useEffect } from 'react'
import { usePermissions } from '../../hooks/usePermissions'
import { isCompanyAdmin } from '../../lib/accountRoles'
import { useAuth } from '../../hooks/useAuth'
import { useEquipment } from '../../hooks/useEquipment'
import { useOrgEquipmentFields } from '../../hooks/useOrgEquipmentFields'
import { getEquipment, getEquipmentTemplate, bulkUploadEquipment } from '../../lib/api-equipment'
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
  const { items, loading, saving, error, create, update, remove, reload } = useEquipment(filters)
  const fieldsState = useOrgEquipmentFields()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkResult, setBulkResult] = useState(null)
  const [bulkError, setBulkError] = useState(null)
  const bulkInputRef = useRef(null)

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

  const handleDownloadTemplate = async () => {
    setBulkError(null)
    try {
      const { filename, contentType, data } = await getEquipmentTemplate()
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
      const blob = new Blob([bytes], { type: contentType })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename || 'equipment-template.xlsx'
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setBulkError(err.message)
    }
  }

  const handleBulkFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBulkBusy(true)
    setBulkError(null)
    setBulkResult(null)
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(new Error('Could not read the file'))
        reader.readAsDataURL(file)
      })
      const base64 = String(dataUrl).split(',').pop()
      const result = await bulkUploadEquipment(base64)
      setBulkResult(result)
      await reload({ silent: true })
    } catch (err) {
      setBulkError(err.message)
    } finally {
      setBulkBusy(false)
      if (bulkInputRef.current) bulkInputRef.current.value = ''
    }
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
              Equipments
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
              Field structure is defined by Super Admin. You can manage option values for equipment fields here.
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
                  <div className="company-panel__toolbar-actions">
                    <button
                      type="button"
                      className="company-btn company-btn--secondary"
                      onClick={handleDownloadTemplate}
                    >
                      Download template
                    </button>
                    <button
                      type="button"
                      className="company-btn company-btn--secondary"
                      onClick={() => bulkInputRef.current?.click()}
                      disabled={bulkBusy}
                    >
                      {bulkBusy ? 'Uploading…' : 'Bulk upload'}
                    </button>
                    <input
                      ref={bulkInputRef}
                      type="file"
                      accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      style={{ display: 'none' }}
                      onChange={handleBulkFile}
                    />
                    <button type="button" className="company-btn company-btn--primary" onClick={openCreate}>
                      + Add Equipment
                    </button>
                  </div>
                )}
              </div>

              {error && <div className="company-error">{error}</div>}
              {bulkError && <div className="company-error">{bulkError}</div>}
              {bulkResult && (
                <div className={`company-alert ${bulkResult.failed ? 'company-alert--warning' : ''}`}>
                  <strong>{bulkResult.created}</strong> equipment created
                  {bulkResult.failed ? `, ${bulkResult.failed} row(s) failed.` : '.'}
                  {bulkResult.errors?.length > 0 && (
                    <ul className="equipment-bulk-errors">
                      {bulkResult.errors.slice(0, 10).map((err) => (
                        <li key={err.row}>Row {err.row}: {err.message}</li>
                      ))}
                      {bulkResult.errors.length > 10 && (
                        <li>…and {bulkResult.errors.length - 10} more</li>
                      )}
                    </ul>
                  )}
                </div>
              )}

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
