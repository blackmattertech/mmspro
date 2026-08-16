import { useEffect, useMemo, useRef, useState } from 'react'
import { usePermissions } from '../../hooks/usePermissions'
import { isCompanyAdmin } from '../../lib/accountRoles'
import { useAuth } from '../../hooks/useAuth'
import { useEquipment } from '../../hooks/useEquipment'
import { useOrgEquipmentFields } from '../../hooks/useOrgEquipmentFields'
import { getEquipment, getEquipmentTemplate, bulkUploadEquipment } from '../../lib/api-equipment'
import EquipmentModal from '../../components/equipment/EquipmentModal'
import AssetsFieldsPanel from '../../components/assets/AssetsFieldsPanel'
import AreasTab from '../../components/company/AreasTab'
import NavIcon from '../../components/layout/NavIcon'
import GooToggle from '../../components/ui/GooToggle'
import TrashIcon from '../../components/ui/TrashIcon'
import EditIcon from '../../components/ui/EditIcon'
import TablePagination from '../../components/shared/TablePagination'
import TableColumnPicker from '../../components/shared/TableColumnPicker'
import TableFilterToolbar from '../../components/shared/TableFilterToolbar'
import { useTablePagination } from '../../hooks/useTablePagination'
import { useTableColumnPrefs } from '../../hooks/useTableColumnPrefs'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { TABLE_SORT_OPTIONS, applyTableFilters } from '../../lib/tableFilters'
import { stopTableRowClick, tableRowClickProps } from '../../lib/clickableTableRow'
import RecordDetailModal from '../../components/shared/RecordDetailModal'
import { EquipmentDetailContent } from '../../components/company/CompanyRecordDetails'
import '../../components/shared/TableColumnPicker.css'
import '../../components/shared/TableFilterToolbar.css'
import '../../components/workorders/WorkOrdersPage.css'
import './Company.css'
import '../../components/company/CompanyShared.css'

const EQUIPMENT_FILTER_FIELDS = [
  { value: 'name', label: 'Name' },
  { value: 'code', label: 'Code' },
  { value: 'location', label: 'Location' },
  { value: 'department', label: 'Department' },
  { value: 'area', label: 'Area' },
  { value: 'status', label: 'Status', placeholder: 'active or inactive' },
]

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
  const equipmentColumnDefs = useMemo(() => {
    const cols = [
      { id: 'name', label: 'Name' },
      { id: 'code', label: 'Code' },
      { id: 'location', label: 'Location' },
      { id: 'department', label: 'Department' },
      { id: 'area', label: 'Area' },
      { id: 'active', label: 'Active' },
    ]
    if (canManage) cols.push({ id: 'actions', label: 'Actions', locked: true })
    return cols
  }, [canManage])
  const {
    isVisible: isEquipmentColumnVisible,
    toggleColumn: toggleEquipmentColumn,
    resetColumns: resetEquipmentColumns,
    columnDefs: equipmentPickerColumns,
    visibleColumnIds: equipmentVisibleColumnIds,
  } = useTableColumnPrefs('masters-equipment', equipmentColumnDefs)
  const canManageAreas = canCreate('areas') || canUpdate('areas') || canDelete('areas')
  const canManageFieldOptions = isCompanyAdmin(role) || canUpdate('equipment')
  const [view, setView] = useState(() => (canRead('equipment') ? 'records' : 'areas'))
  const [search, setSearch] = useState('')
  const [filterField, setFilterField] = useState('')
  const [filterValue, setFilterValue] = useState('')
  const [sortBy, setSortBy] = useState('name_asc')
  const debouncedSearch = useDebouncedValue(search.trim())
  const [listTotal, setListTotal] = useState(0)
  const filterResetKey = `${debouncedSearch}|${filterField}|${filterValue}|${sortBy}`
  const equipmentPagination = useTablePagination(listTotal, { resetKey: filterResetKey })

  const filters = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      limit: equipmentPagination.pageSize,
      offset: equipmentPagination.offset,
    }),
    [debouncedSearch, equipmentPagination.pageSize, equipmentPagination.offset],
  )
  const { items, total, loading, saving, error, create, update, remove, reload } = useEquipment(filters)
  useEffect(() => { setListTotal(total) }, [total])
  const fieldsState = useOrgEquipmentFields({ enabled: view === 'fields' })

  const filteredItems = useMemo(() => applyTableFilters(items, {
    fieldFilter: { field: filterField, value: filterValue },
    fieldFilterGetters: {
      name: (row) => row.name,
      code: (row) => row.code,
      location: (row) => row.locations?.name,
      department: (row) => row.departments?.name,
      area: (row) => row.areas?.name,
      status: (row) => (row.is_active === false ? 'inactive' : 'active'),
    },
    sortBy,
    getName: (row) => row.name || row.code,
    getCreatedAt: (row) => row.created_at,
  }), [items, filterField, filterValue, sortBy])

  const pagedItems = filteredItems
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkResult, setBulkResult] = useState(null)
  const [bulkError, setBulkError] = useState(null)
  const bulkInputRef = useRef(null)

  const showRecords = canRead('equipment')
  const showAreas = canRead('areas')
  const showFieldOptions = canRead('equipment')

  const openCreate = () => {
    setEditing(null)
    setModalOpen(true)
  }

  const openView = (row) => setViewing(row)

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
          {showFieldOptions && (
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
              Equipment field structure is defined by Super Admin. Add dropdown option values for equipment fields (e.g. Equipment Details) here.
            </p>
            {!canManageFieldOptions && (
              <p className="company-readonly-note">
                You have read-only access. Contact a company admin to change option values.
              </p>
            )}
            <AssetsFieldsPanel
              fieldsState={fieldsState}
              canManageSchema={false}
              canManageChildren={canManageFieldOptions}
              fieldScope="equipment"
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
              <div className="company-panel__toolbar company-panel__toolbar--filters">
                <TableFilterToolbar
                  search={{
                    value: search,
                    onChange: setSearch,
                    placeholder: 'Search equipment...',
                    ariaLabel: 'Search equipment',
                  }}
                  filter={{
                    fields: EQUIPMENT_FILTER_FIELDS,
                    field: filterField,
                    onFieldChange: setFilterField,
                    value: filterValue,
                    onValueChange: setFilterValue,
                  }}
                  sort={{ value: sortBy, onChange: setSortBy, options: TABLE_SORT_OPTIONS }}
                  actions={canManage && (
                    <>
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
                        + Add Equipment
                      </button>
                    </>
                  )}
                  columnPicker={(
                    <TableColumnPicker
                      columnDefs={equipmentPickerColumns}
                      visibleColumnIds={equipmentVisibleColumnIds}
                      onToggle={toggleEquipmentColumn}
                      onReset={resetEquipmentColumns}
                    />
                  )}
                />
              </div>

              {error && <div className="company-error">{error}</div>}
              {bulkError && <div className="company-error">{bulkError}</div>}
              {bulkResult && (
                <div className={`company-alert ${bulkResult.failed ? 'company-alert--warning' : 'company-alert--success'}`}>
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
              ) : filteredItems.length === 0 ? (
                <div className="company-empty">No equipment matches your filters.</div>
              ) : (
                <div className="company-table-wrap">
                  <div className="company-table-scroll">
                  <table className="company-table">
                    <thead>
                      <tr>
                        {isEquipmentColumnVisible('name') && <th>Name</th>}
                        {isEquipmentColumnVisible('code') && <th>Code</th>}
                        {isEquipmentColumnVisible('location') && <th>Location</th>}
                        {isEquipmentColumnVisible('department') && <th>Department</th>}
                        {isEquipmentColumnVisible('area') && <th>Area</th>}
                        {isEquipmentColumnVisible('active') && <th>Active</th>}
                        {canManage && isEquipmentColumnVisible('actions') && <th>Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {pagedItems.map((row) => (
                        <tr
                          key={row.id}
                          {...tableRowClickProps({
                            onOpen: () => openView(row),
                            label: `View ${row.name}`,
                          })}
                        >
                          {isEquipmentColumnVisible('name') && <td>{row.name}</td>}
                          {isEquipmentColumnVisible('code') && <td>{row.code || '—'}</td>}
                          {isEquipmentColumnVisible('location') && <td>{row.locations?.name || '—'}</td>}
                          {isEquipmentColumnVisible('department') && <td>{row.departments?.name || '—'}</td>}
                          {isEquipmentColumnVisible('area') && <td>{row.areas?.name || '—'}</td>}
                          {isEquipmentColumnVisible('active') && (
                            <td onClick={stopTableRowClick}>
                              <GooToggle
                                checked={row.is_active !== false}
                                disabled={!canManage || saving}
                                onChange={(checked) => handleToggle(row, checked)}
                                ariaLabel={`Toggle ${row.name}`}
                              />
                            </td>
                          )}
                          {canManage && isEquipmentColumnVisible('actions') && (
                            <td className="company-table__actions" onClick={stopTableRowClick}>
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
                  <TablePagination {...equipmentPagination} />
                  />
                  </div>
                </div>
              )}
            </div>

            {viewing && (
              <RecordDetailModal
                title={viewing.name}
                subtitle={viewing.code ? `Code ${viewing.code}` : undefined}
                onClose={() => setViewing(null)}
                onEdit={canManage ? () => {
                  const record = viewing
                  setViewing(null)
                  openEdit(record)
                } : undefined}
              >
                <EquipmentDetailContent equipment={viewing} />
              </RecordDetailModal>
            )}

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
