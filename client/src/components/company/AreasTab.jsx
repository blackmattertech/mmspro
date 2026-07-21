import { useMemo, useState, useRef, useEffect } from 'react'
import { usePermissions } from '../../hooks/usePermissions'
import { useAreas } from '../../hooks/useAreas'
import { useLocations } from '../../hooks/useLocations'
import { useDepartments } from '../../hooks/useDepartments'
import { getAreasTemplate, bulkUploadAreas } from '../../lib/api'
import NavIcon from '../layout/NavIcon'
import GooToggle from '../ui/GooToggle'
import TrashIcon from '../ui/TrashIcon'
import EditIcon from '../ui/EditIcon'
import AreaModal from './AreaModal'
import FilterableSelect from '../ui/FilterableSelect'
import TablePagination from '../shared/TablePagination'
import { useTablePagination } from '../../hooks/useTablePagination'
import './CompanyShared.css'

function canPickAnyLocation({ isOrgAdmin, accessRole }) {
  if (isOrgAdmin) return true
  const roleName = accessRole?.name?.trim().toLowerCase() || ''
  return roleName === 'admin'
}

function areaSearchHaystack(area) {
  const parts = [
    area.name,
    area.code,
    area.org_locations?.name,
    area.org_locations?.code,
    area.departments?.name,
    area.departments?.code,
    area.is_active === false ? 'inactive' : 'active',
  ]
  return parts.filter(Boolean).join(' ').toLowerCase()
}

export default function AreasTab({ canManage }) {
  const { isOrgAdmin, locationId: myLocationId, accessRole } = usePermissions()
  const canSelectAnyLocation = canPickAnyLocation({ isOrgAdmin, accessRole })

  const [search, setSearch] = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => {
    if (canSelectAnyLocation || !myLocationId) return
    setLocationFilter((prev) => prev || myLocationId)
  }, [canSelectAnyLocation, myLocationId])

  const { locations } = useLocations()
  const { departments } = useDepartments(locationFilter || undefined)
  const { areas, loading, saving, error, create, update, remove, toggleActive, reload } = useAreas({
    locationId: locationFilter || undefined,
    departmentId: departmentFilter || undefined,
  })
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [togglingId, setTogglingId] = useState(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkError, setBulkError] = useState(null)
  const [bulkResult, setBulkResult] = useState(null)
  const bulkInputRef = useRef(null)

  const activeLocations = locations.filter((l) => l.is_active !== false)
  const activeDepartments = departments.filter((d) => d.is_active !== false)

  useEffect(() => {
    if (!departmentFilter) return
    const stillValid = activeDepartments.some((d) => d.id === departmentFilter)
    if (!stillValid) setDepartmentFilter('')
  }, [locationFilter, departmentFilter, activeDepartments])

  const filteredAreas = useMemo(() => {
    const query = search.trim().toLowerCase()
    const terms = query ? query.split(/\s+/).filter(Boolean) : []
    return areas.filter((area) => {
      if (statusFilter === 'active' && area.is_active === false) return false
      if (statusFilter === 'inactive' && area.is_active !== false) return false
      if (!terms.length) return true
      const haystack = areaSearchHaystack(area)
      return terms.every((term) => haystack.includes(term))
    })
  }, [areas, search, statusFilter])

  const activeCount = areas.filter((a) => a.is_active !== false).length
  const filteredActiveCount = filteredAreas.filter((a) => a.is_active !== false).length
  const searchActive = Boolean(search.trim()) || Boolean(statusFilter)
  const filtersActive = Boolean(locationFilter || departmentFilter || searchActive)

  const paginationResetKey = `${search}|${locationFilter}|${departmentFilter}|${statusFilter}`
  const pagination = useTablePagination(filteredAreas.length, { resetKey: paginationResetKey })
  const pagedAreas = pagination.paginate(filteredAreas)

  const countLabel = (() => {
    if (!filtersActive) return `${areas.length} area(s)`
    return `${filteredActiveCount} active · ${filteredAreas.length} of ${areas.length} area(s)`
  })()

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

  const handleDownloadTemplate = async () => {
    setBulkError(null)
    try {
      const { filename, contentType, data } = await getAreasTemplate()
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
      const blob = new Blob([bytes], { type: contentType })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename || 'areas-template.xlsx'
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
      const result = await bulkUploadAreas(base64)
      setBulkResult(result)
      await reload({ silent: true })
    } catch (err) {
      setBulkError(err.message)
    } finally {
      setBulkBusy(false)
      if (bulkInputRef.current) bulkInputRef.current.value = ''
    }
  }

  return (
    <div className="company-panel">
      <div className="company-panel__toolbar">
        <div className="company-panel__filters">
          <label className="company-filter">
            <span>Search</span>
            <input
              type="search"
              className="company-form__input company-form__input--search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, code, location…"
              aria-label="Search areas"
            />
          </label>
          <label className="company-filter">
            <span>Location</span>
            <FilterableSelect
              className="company-form__input--select"
              value={locationFilter}
              onChange={setLocationFilter}
              options={activeLocations}
              getOptionValue={(loc) => loc.id}
              getOptionLabel={(loc) => loc.name}
              disabled={!canSelectAnyLocation && Boolean(myLocationId)}
              allowEmpty={canSelectAnyLocation}
              emptyLabel="All locations"
              placeholder="All locations"
            />
          </label>
          <label className="company-filter">
            <span>Department</span>
            <FilterableSelect
              className="company-form__input--select"
              value={departmentFilter}
              onChange={setDepartmentFilter}
              options={activeDepartments}
              getOptionValue={(dept) => dept.id}
              getOptionLabel={(dept) => dept.name}
              emptyLabel="All departments"
              placeholder="All departments"
            />
          </label>
          <label className="company-filter">
            <span>Status</span>
            <FilterableSelect
              className="company-form__input--select"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
              ]}
              getOptionValue={(opt) => opt.value}
              getOptionLabel={(opt) => opt.label}
              emptyLabel="All"
              placeholder="All"
            />
          </label>
          <p className="company-panel__count">{countLabel}</p>
        </div>
        {canManage && (
          <div className="company-panel__toolbar-actions">
            <button
              type="button"
              className="company-btn company-btn--secondary equipment-bulk-btn"
              onClick={handleDownloadTemplate}
            >
              <span className="equipment-bulk-btn__icon" aria-hidden="true">
                <NavIcon name="download" />
              </span>
              Download template
            </button>
            <button
              type="button"
              className="company-btn company-btn--secondary equipment-bulk-btn"
              onClick={() => bulkInputRef.current?.click()}
              disabled={bulkBusy}
            >
              <span className="equipment-bulk-btn__icon" aria-hidden="true">
                <NavIcon name="upload" />
              </span>
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
              + Add Area
            </button>
          </div>
        )}
      </div>

      {error && <div className="company-alert">{error}</div>}
      {bulkError && <div className="company-error">{bulkError}</div>}
      {bulkResult && (
        <div className={`company-alert ${bulkResult.failed ? 'company-alert--warning' : ''}`}>
          <strong>{bulkResult.created}</strong> area(s) created
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
        <div className="company-loading">Loading areas…</div>
      ) : areas.length === 0 ? (
        <div className="company-empty">No areas yet. Add an area under a location and department.</div>
      ) : filteredAreas.length === 0 ? (
        <div className="company-empty">No areas match your filters.</div>
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
              {pagedAreas.map((area) => (
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
          <TablePagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            pageSize={pagination.pageSize}
            pageSizeOptions={pagination.pageSizeOptions}
            totalCount={filteredAreas.length}
            rangeStart={pagination.rangeStart}
            rangeEnd={pagination.rangeEnd}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
          />
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
