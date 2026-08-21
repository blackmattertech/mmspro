import { useEffect, useMemo, useRef, useState } from 'react'
import { usePermissions } from '../../hooks/usePermissions'
import { isCompanyAdmin } from '../../lib/accountRoles'
import { useAuth } from '../../hooks/useAuth'
import { useEquipment } from '../../hooks/useEquipment'
import { useOrgEquipmentFields } from '../../hooks/useOrgEquipmentFields'
import { getEquipment, getEquipmentTemplate, bulkUploadEquipment, deleteEquipment } from '../../lib/api-equipment'
import EquipmentModal from '../../components/equipment/EquipmentModal'
import AssetsFieldsPanel from '../../components/assets/AssetsFieldsPanel'
import AreasTab from '../../components/company/AreasTab'
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
import {
  useMasterBulkUpload,
  MasterBulkActions,
  MasterBulkResult,
} from '../../components/company/MasterBulkUpload'
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

function canPickAnyLocation({ isOrgAdmin, accessRole }) {
  if (isOrgAdmin) return true
  const roleName = accessRole?.name?.trim().toLowerCase() || ''
  return roleName === 'admin'
}

function equipmentLocationName(row) {
  return row?.org_locations?.name || row?.locations?.name || ''
}

export default function Equipment() {
  const { role } = useAuth()
  const {
    loading: permLoading,
    canRead,
    canCreate,
    canUpdate,
    canDelete,
    isOrgAdmin,
    locationId: myLocationId,
    accessRole,
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
  const canSelectAnyLocation = canPickAnyLocation({ isOrgAdmin, accessRole })
  const scopedLocationId = canSelectAnyLocation ? undefined : (myLocationId || undefined)
  const [view, setView] = useState(() => (canRead('equipment') ? 'records' : 'areas'))
  const [search, setSearch] = useState('')
  const [filterField, setFilterField] = useState('')
  const [filterValue, setFilterValue] = useState('')
  const [sortBy, setSortBy] = useState('name_asc')
  const debouncedSearch = useDebouncedValue(search.trim())
  const [listTotal, setListTotal] = useState(0)
  const filterResetKey = `${debouncedSearch}|${filterField}|${filterValue}|${sortBy}|${scopedLocationId || ''}`
  const equipmentPagination = useTablePagination(listTotal, { resetKey: filterResetKey })

  const filters = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      locationId: scopedLocationId,
      limit: equipmentPagination.pageSize,
      offset: equipmentPagination.offset,
    }),
    [debouncedSearch, scopedLocationId, equipmentPagination.pageSize, equipmentPagination.offset],
  )
  const { items, total, loading, saving, error, create, update, remove, reload } = useEquipment(filters)
  useEffect(() => { setListTotal(total) }, [total])
  const fieldsState = useOrgEquipmentFields({ enabled: view === 'fields' })

  const filteredItems = useMemo(() => applyTableFilters(items, {
    fieldFilter: { field: filterField, value: filterValue },
    fieldFilterGetters: {
      name: (row) => row.name,
      code: (row) => row.code,
      location: (row) => equipmentLocationName(row),
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
  const [selected, setSelected] = useState(() => new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)
  const selectAllRef = useRef(null)
  const visibleIds = useMemo(() => pagedItems.map((row) => row.id), [pagedItems])
  const selectedVisibleCount = visibleIds.filter((id) => selected.has(id)).length
  const allVisibleSelected = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someVisibleSelected
    }
  }, [someVisibleSelected])

  const {
    bulkInputRef,
    bulkBusy,
    bulkError,
    bulkResult,
    handleDownloadTemplate,
    handleBulkFile,
  } = useMasterBulkUpload({
    downloadTemplate: getEquipmentTemplate,
    upload: bulkUploadEquipment,
    onSuccess: async () => {
      await reload({ silent: true })
    },
    defaultFilename: 'equipment-template.xlsx',
  })

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
    if (!window.confirm(`Delete equipment "${row.name}"? This cannot be undone.`)) return
    setDeleteError(null)
    try {
      await remove(row.id)
      setSelected((prev) => {
        const next = new Set(prev)
        next.delete(row.id)
        return next
      })
    } catch (err) {
      setDeleteError(err.message || 'Could not delete this equipment')
    }
  }

  const toggleSelected = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected) {
        visibleIds.forEach((id) => next.delete(id))
      } else {
        visibleIds.forEach((id) => next.add(id))
      }
      return next
    })
  }

  const handleBulkDelete = async () => {
    const ids = [...selected]
    if (!ids.length) return
    const label = ids.length === 1 ? 'this equipment' : `${ids.length} equipment records`
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return
    setBulkDeleting(true)
    setDeleteError(null)
    try {
      for (const id of ids) {
        await deleteEquipment(id)
      }
      await reload({ silent: true })
      setSelected(new Set())
      if (viewing && ids.includes(viewing.id)) setViewing(null)
    } catch (err) {
      setDeleteError(err.message || 'Could not delete the selected equipment')
      await reload({ silent: true })
    } finally {
      setBulkDeleting(false)
    }
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
                      {selected.size > 0 && (
                      <button
                        type="button"
                        className="company-btn company-btn--danger"
                        disabled={bulkDeleting || saving}
                        onClick={handleBulkDelete}
                      >
                        <TrashIcon />
                        {bulkDeleting ? 'Deleting...' : `Delete (${selected.size})`}
                      </button>
                      )}
                      <MasterBulkActions
                        onDownload={handleDownloadTemplate}
                        bulkBusy={bulkBusy}
                        bulkInputRef={bulkInputRef}
                        onFileChange={handleBulkFile}
                        addLabel="+ Add Equipment"
                        onAdd={openCreate}
                        title="Bulk upload equipment"
                        bulkError={bulkError}
                        bulkResult={bulkResult}
                        noun="equipment"
                      />
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
              {deleteError && <div className="company-alert">{deleteError}</div>}
              {bulkError && <div className="company-error">{bulkError}</div>}
              <MasterBulkResult result={bulkResult} noun="equipment" />

              {loading ? (
                <div className="company-loading">Loading equipment…</div>
              ) : items.length === 0 ? (
                <div className="company-empty">
                  No equipment yet. Create areas first, then add equipment records.
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="company-empty">No equipment matches your filters.</div>
              ) : (
                <>
                <div className="company-table-wrap">
                  <div className="company-table-scroll">
                  <table className="company-table master-table">
                    <thead>
                      <tr>
                        {canManage && (
                          <th className="company-table__cell--check">
                            <input
                              ref={selectAllRef}
                              type="checkbox"
                              checked={allVisibleSelected}
                              onChange={toggleSelectAllVisible}
                              aria-label="Select all equipment"
                            />
                          </th>
                        )}
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
                      {pagedItems.map((row) => {
                        const isActive = row.is_active !== false
                        return (
                        <tr
                          key={row.id}
                          {...tableRowClickProps({
                            onOpen: () => openView(row),
                            label: `View ${row.name}`,
                            className: !isActive ? 'company-table__row--inactive' : undefined,
                          })}
                        >
                          {canManage && (
                            <td
                              className="company-table__cell--check"
                              onClick={stopTableRowClick}
                              onKeyDown={stopTableRowClick}
                            >
                              <input
                                type="checkbox"
                                checked={selected.has(row.id)}
                                onChange={() => toggleSelected(row.id)}
                                aria-label={`Select ${row.name}`}
                              />
                            </td>
                          )}
                          {isEquipmentColumnVisible('name') && (
                            <td><span className="company-table__name">{row.name}</span></td>
                          )}
                          {isEquipmentColumnVisible('code') && (
                            <td><code className="company-code">{row.code || '—'}</code></td>
                          )}
                          {isEquipmentColumnVisible('location') && <td>{equipmentLocationName(row) || '—'}</td>}
                          {isEquipmentColumnVisible('department') && <td>{row.departments?.name || '—'}</td>}
                          {isEquipmentColumnVisible('area') && <td>{row.areas?.name || '—'}</td>}
                          {isEquipmentColumnVisible('active') && (
                            <td onClick={stopTableRowClick}>
                              <GooToggle
                                checked={isActive}
                                disabled={!canManage || saving}
                                onChange={(checked) => handleToggle(row, checked)}
                                ariaLabel={`${isActive ? 'Disable' : 'Enable'} ${row.name}`}
                              />
                            </td>
                          )}
                          {canManage && isEquipmentColumnVisible('actions') && (
                            <td onClick={stopTableRowClick}>
                              <div className="company-table__actions">
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
                              </div>
                            </td>
                          )}
                        </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  </div>
                </div>
                <TablePagination {...equipmentPagination} />
                </>
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
                defaultLocationId={scopedLocationId || ''}
                lockLocation={Boolean(scopedLocationId)}
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
