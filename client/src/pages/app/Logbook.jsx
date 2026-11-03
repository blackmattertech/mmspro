import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePermissions } from '../../hooks/usePermissions'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { useDepartments } from '../../hooks/useDepartments'
import { useLocations } from '../../hooks/useLocations'
import { bulkUploadLogbook, deleteMeterReading, getLogbook, getLogbookTemplate, getMeterReadings } from '../../lib/api-logbook'
import { getEquipmentColumnValues } from '../../lib/api-equipment'
import { unwrapList } from '../../lib/listResponse'
import {
  formatMeterDate,
  formatMeterLogger,
  formatMeterTime,
  formatMeterValue,
  meterAssetLabel,
  meterFieldText,
  meterListColumns,
} from '../../lib/meterReading'
import { TABLE_SORT_OPTIONS, selectFilterField, uniqueNameOptions } from '../../lib/tableFilters'
import { stopTableRowClick, tableRowClickProps } from '../../lib/clickableTableRow'
import TablePagination from '../../components/shared/TablePagination'
import TableEmptyRow from '../../components/shared/TableEmptyRow'
import TableFilterToolbar from '../../components/shared/TableFilterToolbar'
import TableColumnPicker from '../../components/shared/TableColumnPicker'
import { AdvancedFilterMenu, TableColumnHead } from '../../components/shared/ListTableChrome'
import { useTablePagination } from '../../hooks/useTablePagination'
import { useTableColumnPrefs } from '../../hooks/useTableColumnPrefs'
import {
  MasterBulkActions,
  MasterBulkResult,
  useMasterBulkUpload,
} from '../../components/company/MasterBulkUpload'
import MeterReadingModal from '../../components/logbook/MeterReadingModal'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import '../../components/shared/TableFilterToolbar.css'
import '../../components/shared/TableColumnPicker.css'
import '../../components/shared/ListTableChrome.css'
import '../../components/company/CompanyShared.css'

function meterCellText(row, column) {
  if (column.id === 'last_reading') return formatMeterValue(row.last_reading)
  if (column.id === 'date') return formatMeterDate(row.last_reading_at)
  if (column.id === 'time') return row.last_reading_at ? formatMeterTime(row.last_reading_at) : '—'
  if (column.id === 'logged_by') return formatMeterLogger(row) || '—'
  return meterFieldText(row, column) || '—'
}

function HistoryModal({ equipmentId, assetFields, canCreate, canDelete, onClose, onChanged }) {
  const handleBackdropClick = useBackdropClose(onClose)
  const [payload, setPayload] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [adding, setAdding] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    return getMeterReadings(equipmentId)
      .then((data) => setPayload(data))
      .catch((err) => setError(err.message || 'Could not load readings'))
      .finally(() => setLoading(false))
  }, [equipmentId])

  useEffect(() => {
    load()
  }, [load])

  const equipment = payload?.equipment
  const readings = payload?.readings || []

  const handleDelete = async (row) => {
    if (!window.confirm('Delete this meter reading?')) return
    try {
      await deleteMeterReading(row.id)
      await load()
      onChanged?.()
    } catch (err) {
      setError(err.message || 'Could not delete this reading')
    }
  }

  return (
    <div className="company-modal-overlay" onMouseDown={handleBackdropClick} role="presentation">
      <div
        className="company-modal company-modal--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="logbook-history-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="company-modal__header">
          <div>
            <h2 id="logbook-history-title">{meterAssetLabel(equipment, assetFields) || 'Meter readings'}</h2>
            <p className="company-modal__hint">Reading history</p>
          </div>
          <button type="button" className="company-modal__close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="company-modal__form">
          {canCreate && equipment && (
            <div className="company-modal__actions">
              <button type="button" className="company-btn company-btn--primary" onClick={() => setAdding(true)}>
                Add reading
              </button>
            </div>
          )}
          {error && <div className="company-alert" role="alert">{error}</div>}
          {loading ? (
            <p className="company-empty">Loading readings…</p>
          ) : (
            <div className="company-table-wrap">
              <div className="company-table-scroll">
                <table className="company-table">
                  <thead>
                    <tr>
                      <th>Reading</th>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Logged by</th>
                      {canDelete && <th>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {readings.length === 0 ? (
                      <TableEmptyRow colSpan={canDelete ? 5 : 4}>
                        No meter readings yet.
                      </TableEmptyRow>
                    ) : readings.map((row) => (
                      <tr key={row.id}>
                        <td>{formatMeterValue(row.reading)}</td>
                        <td>{formatMeterDate(row.reading_at)}</td>
                        <td>{formatMeterTime(row.reading_at)}</td>
                        <td>{formatMeterLogger(row) || '—'}</td>
                        {canDelete && (
                          <td>
                            <button
                              type="button"
                              className="company-btn company-btn--ghost company-btn--compact"
                              onClick={() => handleDelete(row)}
                            >
                              Delete
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        {adding && equipment && (
          <MeterReadingModal
            nested
            equipment={equipment}
            lastReading={equipment.last_reading}
            onClose={() => setAdding(false)}
            onSaved={async () => {
              setAdding(false)
              await load()
              onChanged?.()
            }}
          />
        )}
      </div>
    </div>
  )
}

export default function Logbook() {
  const { loading: permLoading, canCreate, canDelete } = usePermissions()
  const { locations } = useLocations()
  const { departments } = useDepartments()
  const [search, setSearch] = useState('')
  const [columnFilters, setColumnFilters] = useState({})
  const [sortBy, setSortBy] = useState('name_asc')
  const [headerSort, setHeaderSort] = useState(null)
  const debouncedSearch = useDebouncedValue(search.trim())
  const debouncedFilterKey = useDebouncedValue(JSON.stringify(columnFilters))
  const debouncedFilters = useMemo(() => {
    try {
      return JSON.parse(debouncedFilterKey)
    } catch {
      return {}
    }
  }, [debouncedFilterKey])
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [historyId, setHistoryId] = useState(null)
  const [adding, setAdding] = useState(null)
  const [assetFields, setAssetFields] = useState(null)
  const [hierarchyValueOptions, setHierarchyValueOptions] = useState({})
  const seenLoad = useRef(false)
  const filterResetKey = `${debouncedSearch}|${debouncedFilterKey}|${sortBy}|${headerSort?.id || ''}|${headerSort?.dir || ''}`
  const pagination = useTablePagination(total, { resetKey: filterResetKey })
  const columnDefs = useMemo(() => (
    meterListColumns(assetFields || []).map((column) => ({
      ...column,
      locked: column.id === 'actions',
    }))
  ), [assetFields])
  const {
    columnDefs: pickerColumns,
    visibleColumnIds,
    columnOrder,
    toggleColumn,
    resetColumns,
    reorderColumns,
    moveColumn,
    saveColumns,
  } = useTableColumnPrefs('meter-reading', columnDefs)
  const dataColumns = useMemo(
    () => columnDefs.filter((column) => column.id !== 'actions'),
    [columnDefs],
  )
  const visibleDataColumns = useMemo(() => (
    visibleColumnIds
      .filter((id) => id !== 'actions')
      .map((id) => columnDefs.find((column) => column.id === id))
      .filter(Boolean)
  ), [visibleColumnIds, columnDefs])
  const showActions = visibleColumnIds.includes('actions')
  const filterFields = useMemo(() => dataColumns.map((column) => {
    if (column.id === 'location') {
      return selectFilterField(
        'location',
        'Location',
        uniqueNameOptions(locations.filter((row) => row.is_active !== false)),
        'All locations',
      )
    }
    if (column.id === 'department') {
      return selectFilterField(
        'department',
        'Department',
        uniqueNameOptions(departments.filter((row) => row.is_active !== false)),
        'All departments',
      )
    }
    if (String(column.id).startsWith('field:')) {
      const fieldId = column.fieldId || column.id.slice('field:'.length)
      return selectFilterField(
        column.id,
        column.label,
        uniqueNameOptions((hierarchyValueOptions[fieldId] || []).map((value) => ({ name: value }))),
        `All ${column.label}`,
      )
    }
    return selectFilterField(column.id, column.label, [], `All ${column.label}`)
  }), [dataColumns, locations, departments, hierarchyValueOptions])

  const setColumnFilter = (columnId, value) => {
    setColumnFilters((prev) => {
      const next = { ...prev }
      if (!String(value || '').trim()) delete next[columnId]
      else next[columnId] = value
      return next
    })
  }

  useEffect(() => {
    let cancelled = false
    if (!seenLoad.current) setLoading(true)
    setError(null)
    getLogbook({
      search: debouncedSearch,
      filters: debouncedFilters,
      sortBy: headerSort ? undefined : sortBy,
      sort: headerSort?.id || '',
      sortDir: headerSort?.dir || '',
      limit: pagination.pageSize,
      offset: pagination.offset,
    })
      .then((data) => {
        if (cancelled) return
        const page = unwrapList(data)
        setItems(page.items)
        setTotal(page.total)
        setAssetFields(Array.isArray(data?.asset_fields) ? data.asset_fields : [])
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not load meter readings')
      })
      .finally(() => {
        if (cancelled) return
        seenLoad.current = true
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [
    debouncedSearch,
    debouncedFilters,
    sortBy,
    headerSort,
    pagination.pageSize,
    pagination.offset,
    reloadKey,
  ])

  const assetFieldKey = useMemo(
    () => (assetFields || []).map((field) => field?.id).filter(Boolean).join('|'),
    [assetFields],
  )

  useEffect(() => {
    const ids = assetFieldKey.split('|').filter(Boolean)
    if (!ids.length) return undefined
    let cancelled = false
    Promise.all(ids.map((fieldId) => (
      getEquipmentColumnValues(fieldId)
        .then((values) => [fieldId, values])
        .catch(() => [fieldId, []])
    ))).then((entries) => {
      if (!cancelled) setHierarchyValueOptions(Object.fromEntries(entries))
    })
    return () => { cancelled = true }
  }, [assetFieldKey])

  const refresh = () => setReloadKey((value) => value + 1)
  const {
    bulkInputRef,
    bulkBusy,
    bulkError,
    bulkResult,
    handleDownloadTemplate,
    handleBulkFile,
  } = useMasterBulkUpload({
    downloadTemplate: getLogbookTemplate,
    upload: bulkUploadLogbook,
    onSuccess: refresh,
    defaultFilename: 'meter-readings-template.xlsx',
  })
  const hasQuery = Boolean(debouncedSearch || Object.keys(debouncedFilters).length)

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
        <h1 className="company-page__title">Meter reading</h1>
        <p className="company-page__subtitle">
          Log meter readings for assets that require them. Scan an asset QR code, then choose Add reading.
        </p>
      </header>
      <div className="company-page__content">
        <div className="company-panel">
          <div className="company-panel__toolbar company-panel__toolbar--filters">
            <TableFilterToolbar
              search={{
                value: search,
                onChange: setSearch,
                placeholder: 'Search assets...',
                ariaLabel: 'Search meter readings',
              }}
              sort={{
                value: headerSort ? '' : sortBy,
                onChange: (value) => {
                  setSortBy(value)
                  setHeaderSort(null)
                },
                options: TABLE_SORT_OPTIONS,
              }}
              filterSlot={(
                <AdvancedFilterMenu
                  fields={filterFields}
                  values={columnFilters}
                  onChange={setColumnFilters}
                />
              )}
              actions={canCreate('logbook') ? (
                <MasterBulkActions
                  onDownload={handleDownloadTemplate}
                  bulkBusy={bulkBusy}
                  bulkInputRef={bulkInputRef}
                  onFileChange={handleBulkFile}
                  title="Import meter readings"
                  description="Download the sample file. It lists assets that require a reading. Enter a number in Meter reading, then upload the .xlsx file. Date, time, and your name are saved automatically."
                  actionLabel="Import"
                  bulkError={bulkError}
                  bulkResult={bulkResult}
                  noun="reading"
                />
              ) : null}
              columnPicker={(
                <TableColumnPicker
                  columnDefs={pickerColumns}
                  visibleColumnIds={visibleColumnIds}
                  columnOrder={columnOrder}
                  onToggle={toggleColumn}
                  onReset={resetColumns}
                  onReorder={reorderColumns}
                  onMove={moveColumn}
                  onSave={saveColumns}
                />
              )}
            />
          </div>
          {error && <div className="company-alert" role="alert">{error}</div>}
          {bulkError && <div className="company-error">{bulkError}</div>}
          <MasterBulkResult result={bulkResult} noun="reading" />
          {loading ? (
            <div className="company-loading">Loading meter readings…</div>
          ) : (
            <>
              <div className="company-table-wrap">
                <div className="company-table-scroll">
                  <table className="company-table master-table">
                    <thead>
                      <tr>
                        {visibleDataColumns.map((column) => (
                          <TableColumnHead
                            key={column.id}
                            columnId={column.id}
                            label={column.label}
                            sort={headerSort}
                            onSort={setHeaderSort}
                            filterValue={columnFilters[column.id] || ''}
                            onFilter={setColumnFilter}
                          />
                        ))}
                        {showActions && <th>Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {items.length === 0 ? (
                        <TableEmptyRow colSpan={visibleDataColumns.length + (showActions ? 1 : 0)}>
                          {hasQuery
                            ? 'No assets match your filters.'
                            : 'No assets require a meter reading yet. Turn on Reading required on an asset record to log it here.'}
                        </TableEmptyRow>
                      ) : items.map((row) => {
                        const assetLabel = meterAssetLabel(row, assetFields) || row.name || 'asset'
                        return (
                        <tr
                          key={row.id}
                          {...tableRowClickProps({
                            onOpen: () => setHistoryId(row.id),
                            label: `View readings for ${assetLabel}`,
                          })}
                        >
                          {visibleDataColumns.map((column, index) => (
                            <td key={column.id}>
                              {index === 0 ? (
                                <span className="company-table__name">{meterCellText(row, column)}</span>
                              ) : meterCellText(row, column)}
                            </td>
                          ))}
                          {showActions && (
                            <td onClick={stopTableRowClick}>
                              <div className="company-table__actions">
                                {canCreate('logbook') && (
                                  <button
                                    type="button"
                                    className="company-btn company-btn--primary company-btn--compact"
                                    onClick={() => setAdding(row)}
                                  >
                                    Add reading
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="company-btn company-btn--ghost company-btn--compact"
                                  onClick={() => setHistoryId(row.id)}
                                >
                                  History
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
              <TablePagination
                page={pagination.page}
                totalPages={pagination.totalPages}
                pageSize={pagination.pageSize}
                pageSizeOptions={pagination.pageSizeOptions}
                totalCount={total}
                rangeStart={pagination.rangeStart}
                rangeEnd={pagination.rangeEnd}
                onPageChange={pagination.setPage}
                onPageSizeChange={pagination.setPageSize}
              />
            </>
          )}
        </div>
      </div>
      {historyId && (
        <HistoryModal
          equipmentId={historyId}
          assetFields={assetFields}
          canCreate={canCreate('logbook')}
          canDelete={canDelete('logbook')}
          onClose={() => setHistoryId(null)}
          onChanged={refresh}
        />
      )}
      {adding && (
        <MeterReadingModal
          equipment={adding}
          assetLabel={meterAssetLabel(adding, assetFields)}
          lastReading={adding.last_reading}
          onClose={() => setAdding(null)}
          onSaved={() => {
            setAdding(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}
