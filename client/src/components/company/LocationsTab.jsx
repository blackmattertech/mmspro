import { useEffect, useMemo, useState } from 'react'
import { useLocations } from '../../hooks/useLocations'
import { useEmployees } from '../../hooks/useEmployees'
import { useOrgLimits } from '../../hooks/useOrgLimits'
import { useLimitExceeded } from '../../hooks/useLimitExceeded'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { isLimitError } from '../../lib/limitErrors'
import { getLocationsTemplate, bulkUploadLocations } from '../../lib/api'
import GooToggle from '../ui/GooToggle'
import TrashIcon from '../ui/TrashIcon'
import EditIcon from '../ui/EditIcon'
import LocationModal from './LocationModal'
import LocationHeadCell from './LocationHeadCell'
import LimitExceededCard from '../shared/LimitExceededCard'
import TablePagination from '../shared/TablePagination'
import TableColumnPicker from '../shared/TableColumnPicker'
import TableFilterToolbar from '../shared/TableFilterToolbar'
import { useTablePagination } from '../../hooks/useTablePagination'
import { useTableColumnPrefs } from '../../hooks/useTableColumnPrefs'
import { TABLE_SORT_OPTIONS, applyTableFilters } from '../../lib/tableFilters'
import { stopTableRowClick, tableRowClickProps } from '../../lib/clickableTableRow'
import RecordDetailModal from '../shared/RecordDetailModal'
import { LocationDetailContent } from './CompanyRecordDetails'
import {
  useMasterBulkUpload,
  MasterBulkActions,
  MasterBulkResult,
} from './MasterBulkUpload'
import '../shared/TableColumnPicker.css'
import '../shared/TableFilterToolbar.css'
import '../workorders/WorkOrdersPage.css'
import './CompanyShared.css'

const LOCATION_FILTER_FIELDS = [
  { value: 'name', label: 'Name' },
  { value: 'code', label: 'Code' },
  { value: 'city', label: 'City' },
  { value: 'country', label: 'Country' },
  { value: 'status', label: 'Status', placeholder: 'active or inactive' },
]

export default function LocationsTab({ canManage }) {
  const [search, setSearch] = useState('')
  const [filterField, setFilterField] = useState('')
  const [filterValue, setFilterValue] = useState('')
  const [sortBy, setSortBy] = useState('name_asc')
  const debouncedSearch = useDebouncedValue(search.trim())
  const [listTotal, setListTotal] = useState(0)
  const filterResetKey = `${debouncedSearch}|${filterField}|${filterValue}|${sortBy}`
  const pagination = useTablePagination(listTotal, { resetKey: filterResetKey })
  const { locations, total, loading, saving, error, create, update, remove, toggleActive, reload } = useLocations({
    search: debouncedSearch,
    limit: pagination.pageSize,
    offset: pagination.offset,
  })
  useEffect(() => { setListTotal(total) }, [total])
  const { employees } = useEmployees()
  const { isResourceAtLimit, reload: reloadLimits } = useOrgLimits()
  const { visible: limitVisible, resource: limitResource, trigger: triggerLimit, tryHandleLimitError, dismiss: dismissLimit } = useLimitExceeded()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [togglingId, setTogglingId] = useState(null)

  const {
    bulkInputRef,
    bulkBusy,
    bulkError,
    bulkResult,
    handleDownloadTemplate,
    handleBulkFile,
  } = useMasterBulkUpload({
    downloadTemplate: getLocationsTemplate,
    upload: bulkUploadLocations,
    onSuccess: async () => {
      await reload?.({ silent: true })
      await reloadLimits()
    },
    defaultFilename: 'locations-template.xlsx',
  })

  const filteredLocations = useMemo(() => applyTableFilters(locations, {
    fieldFilter: { field: filterField, value: filterValue },
    fieldFilterGetters: {
      name: (loc) => loc.name,
      code: (loc) => loc.code,
      city: (loc) => loc.city,
      country: (loc) => loc.country,
      status: (loc) => (loc.is_active === false ? 'inactive' : 'active'),
    },
    sortBy,
    getName: (loc) => loc.name,
    getCreatedAt: (loc) => loc.created_at,
  }), [locations, filterField, filterValue, sortBy])

  const atLocationLimit = isResourceAtLimit('locations', 'location_limit')
  const pagedLocations = filteredLocations
  const locationColumnDefs = useMemo(() => {
    const cols = [
      { id: 'name', label: 'Name' },
      { id: 'code', label: 'Code' },
      { id: 'city', label: 'City' },
      { id: 'country', label: 'Country' },
      { id: 'location_head', label: 'Location head' },
      { id: 'primary', label: 'Primary' },
    ]
    if (canManage) {
      cols.push({ id: 'active', label: 'Active' })
      cols.push({ id: 'actions', label: 'Actions', locked: true })
    }
    return cols
  }, [canManage])
  const {
    isVisible: isLocationColumnVisible,
    toggleColumn: toggleLocationColumn,
    resetColumns: resetLocationColumns,
    columnDefs: locationPickerColumns,
    visibleColumnIds: locationVisibleColumnIds,
  } = useTableColumnPrefs('company-locations', locationColumnDefs)

  const openCreate = () => {
    if (atLocationLimit) {
      triggerLimit('Location')
      return
    }
    setEditing(null)
    setModalOpen(true)
  }

  const openView = (loc) => setViewing(loc)

  const openEdit = (loc) => {
    setEditing(loc)
    setModalOpen(true)
  }

  const handleSave = async (payload) => {
    try {
      if (editing) await update(editing.id, payload)
      else await create(payload)
      await reloadLimits()
      setModalOpen(false)
    } catch (err) {
      if (tryHandleLimitError(err, 'Location')) {
        setModalOpen(false)
      }
    }
  }

  const handleDelete = async (loc) => {
    if (!window.confirm(`Delete location "${loc.name}"?`)) return
    await remove(loc.id)
    await reloadLimits()
  }

  const handleToggle = async (loc, isActive) => {
    setTogglingId(loc.id)
    try {
      await toggleActive(loc.id, isActive)
      await reloadLimits()
    } catch (err) {
      tryHandleLimitError(err, 'Location')
    } finally {
      setTogglingId(null)
    }
  }

  const showPlainError = error && !limitVisible && !isLimitError({ message: error })

  return (
    <div className="company-panel">
      <div className="company-panel__toolbar company-panel__toolbar--filters">
        <TableFilterToolbar
          search={{
            value: search,
            onChange: setSearch,
            placeholder: 'Search locations...',
            ariaLabel: 'Search locations',
          }}
          filter={{
            fields: LOCATION_FILTER_FIELDS,
            field: filterField,
            onFieldChange: setFilterField,
            value: filterValue,
            onValueChange: setFilterValue,
          }}
          sort={{ value: sortBy, onChange: setSortBy, options: TABLE_SORT_OPTIONS }}
          actions={canManage && (
            <MasterBulkActions
              onDownload={handleDownloadTemplate}
              bulkBusy={bulkBusy}
              bulkInputRef={bulkInputRef}
              onFileChange={handleBulkFile}
              addLabel="+ Add Location"
              onAdd={openCreate}
              title="Bulk upload locations"
              bulkError={bulkError}
              bulkResult={bulkResult}
              noun="location"
            />
          )}
          columnPicker={(
            <TableColumnPicker
              columnDefs={locationPickerColumns}
              visibleColumnIds={locationVisibleColumnIds}
              onToggle={toggleLocationColumn}
              onReset={resetLocationColumns}
            />
          )}
        />
      </div>

      {showPlainError && <div className="company-alert">{error}</div>}
      {bulkError && <div className="company-error">{bulkError}</div>}
      <MasterBulkResult result={bulkResult} noun="location" />

      {loading ? (
        <div className="company-loading">Loading locations...</div>
      ) : locations.length === 0 ? (
        <div className="company-empty">No locations yet. Add your first site or branch.</div>
      ) : filteredLocations.length === 0 ? (
        <div className="company-empty">No locations match your filters.</div>
      ) : (
        <div className="company-table-wrap">
          <div className="company-table-scroll">
          <table className="company-table master-table">
            <thead>
              <tr>
                {isLocationColumnVisible('name') && <th>Name</th>}
                {isLocationColumnVisible('code') && <th>Code</th>}
                {isLocationColumnVisible('city') && <th>City</th>}
                {isLocationColumnVisible('country') && <th>Country</th>}
                {isLocationColumnVisible('location_head') && <th>Location head</th>}
                {isLocationColumnVisible('primary') && <th>Primary</th>}
                {canManage && isLocationColumnVisible('active') && <th>Active</th>}
                {canManage && isLocationColumnVisible('actions') && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {pagedLocations.map((loc) => {
                const isActive = loc.is_active !== false
                return (
                  <tr
                    key={loc.id}
                    {...tableRowClickProps({
                      onOpen: () => openView(loc),
                      label: `View ${loc.name}`,
                      className: !isActive ? 'company-table__row--inactive' : undefined,
                    })}
                  >
                    {isLocationColumnVisible('name') && (
                      <td>
                        <span className="company-table__name">{loc.name}</span>
                      </td>
                    )}
                    {isLocationColumnVisible('code') && (
                      <td><code className="company-code">{loc.code}</code></td>
                    )}
                    {isLocationColumnVisible('city') && <td>{loc.city || '—'}</td>}
                    {isLocationColumnVisible('country') && <td>{loc.country || '—'}</td>}
                    {isLocationColumnVisible('location_head') && (
                      <td><LocationHeadCell location={loc} /></td>
                    )}
                    {isLocationColumnVisible('primary') && (
                      <td>
                        {loc.is_primary ? (
                          <span className="company-badge company-badge--primary">Primary</span>
                        ) : '—'}
                      </td>
                    )}
                    {canManage && isLocationColumnVisible('active') && (
                      <td onClick={stopTableRowClick}>
                        <GooToggle
                          checked={isActive}
                          disabled={togglingId === loc.id || saving}
                          onChange={(checked) => handleToggle(loc, checked)}
                          ariaLabel={`${isActive ? 'Disable' : 'Enable'} ${loc.name}`}
                        />
                      </td>
                    )}
                    {canManage && isLocationColumnVisible('actions') && (
                      <td onClick={stopTableRowClick}>
                        <div className="company-table__actions">
                          <button
                            type="button"
                            className="company-btn company-btn--secondary company-btn--compact company-btn--icon"
                            onClick={() => openEdit(loc)}
                            aria-label={`Edit ${loc.name}`}
                            title="Edit"
                          >
                            <EditIcon />
                          </button>
                          <button
                            type="button"
                            className="company-btn company-btn--danger company-btn--compact company-btn--icon"
                            onClick={() => handleDelete(loc)}
                            aria-label={`Delete ${loc.name}`}
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
          <TablePagination {...pagination} />
          />
          </div>
        </div>
      )}

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
          <LocationDetailContent location={viewing} employees={employees} />
        </RecordDetailModal>
      )}

      {modalOpen && (
        <LocationModal
          key={editing?.id ?? 'new'}
          location={editing}
          employees={employees}
          saving={saving}
          onClose={() => setModalOpen(false)}
          onSave={handleSave}
        />
      )}

      {limitVisible && (
        <LimitExceededCard resource={limitResource} onClose={dismissLimit} />
      )}
    </div>
  )
}
