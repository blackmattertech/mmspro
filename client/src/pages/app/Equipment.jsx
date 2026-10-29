import { useEffect, useMemo, useRef, useState } from 'react'
import { VirtualTableBody } from '../../components/shared/VirtualTableBody'
import { usePermissions } from '../../hooks/usePermissions'
import { useOrg } from '../../hooks/useOrg'
import { useEquipment } from '../../hooks/useEquipment'
import { useLocations } from '../../hooks/useLocations'
import { useDepartments } from '../../hooks/useDepartments'
import { useOrgEquipmentFields } from '../../hooks/useOrgEquipmentFields'
import { getEquipment, getEquipmentColumnValues, getEquipmentTemplate, bulkUploadEquipment, deleteEquipment } from '../../lib/api-equipment'
import { invalidateReferenceCache } from '../../lib/referenceDataCache'
import EquipmentModal from '../../components/equipment/EquipmentModal'
import GooToggle from '../../components/ui/GooToggle'
import TrashIcon from '../../components/ui/TrashIcon'
import EditIcon from '../../components/ui/EditIcon'
import TablePagination from '../../components/shared/TablePagination'
import TableEmptyRow from '../../components/shared/TableEmptyRow'
import TableColumnPicker from '../../components/shared/TableColumnPicker'
import TableFilterToolbar from '../../components/shared/TableFilterToolbar'
import { useTablePagination } from '../../hooks/useTablePagination'
import { useTableColumnPrefs } from '../../hooks/useTableColumnPrefs'
import { equipmentImageSrc, formatPickerValue } from '../../lib/pickerFields'
import { orderedHierarchyFields } from '../../lib/assetHierarchy'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { TABLE_SORT_OPTIONS, compactFilters, uniqueNameOptions, ACTIVE_STATUS_FILTER } from '../../lib/tableFilters'
import { stopTableRowClick, tableRowClickProps } from '../../lib/clickableTableRow'
import EquipmentDetail from '../../components/equipment/EquipmentDetail'
import EquipmentQrLabelsDialog from '../../components/equipment/EquipmentQrLabelsDialog'
import { orgPath } from '../../config/navigation'
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

function canPickAnyLocation({ isOrgAdmin, accessRole }) {
  if (isOrgAdmin) return true
  const roleName = accessRole?.name?.trim().toLowerCase() || ''
  return roleName === 'admin'
}

function equipmentLocationName(row) {
  return row?.org_locations?.name || row?.locations?.name || ''
}

export default function Equipment() {
  const {
    loading: permLoading,
    canCreate,
    canUpdate,
    canDelete,
    isOrgAdmin,
    locationId: myLocationId,
    accessRole,
  } = usePermissions()
  const { org } = useOrg()
  const canManage = canCreate('equipment') || canUpdate('equipment') || canDelete('equipment')
  const fieldsState = useOrgEquipmentFields()
  const hierarchyFields = useMemo(
    () => orderedHierarchyFields(fieldsState.fields),
    [fieldsState.fields],
  )
  const { locations } = useLocations()
  const { departments } = useDepartments()
  const [hierarchyValueOptions, setHierarchyValueOptions] = useState({})

  useEffect(() => {
    let cancelled = false
    const fields = hierarchyFields
    if (!fields.length) {
      setHierarchyValueOptions({})
      return undefined
    }
    Promise.all(fields.map((field) => (
      getEquipmentColumnValues(field.id)
        .then((values) => [field.id, values])
        .catch(() => [field.id, []])
    ))).then((entries) => {
      if (!cancelled) setHierarchyValueOptions(Object.fromEntries(entries))
    })
    return () => { cancelled = true }
  }, [hierarchyFields])

  const equipmentFilterFields = useMemo(() => ([
    ...hierarchyFields.map((field) => ({
      value: `field:${field.id}`,
      label: field.name,
      type: 'select',
      emptyLabel: `All ${field.name}`,
      options: uniqueNameOptions([
        ...(field.dropdown_options || []).map((value) => ({ name: value })),
        ...(hierarchyValueOptions[field.id] || []).map((value) => ({ name: value })),
      ]),
    })),
    {
      value: 'location',
      label: 'Location',
      type: 'select',
      emptyLabel: 'All locations',
      options: uniqueNameOptions(locations.filter((row) => row.is_active !== false)),
    },
    {
      value: 'department',
      label: 'Department',
      type: 'select',
      emptyLabel: 'All departments',
      options: uniqueNameOptions(departments.filter((row) => row.is_active !== false)),
    },
    ACTIVE_STATUS_FILTER,
  ]), [hierarchyFields, hierarchyValueOptions, locations, departments])
  const equipmentColumnDefs = useMemo(() => {
    const cols = [
      ...hierarchyFields.map((field) => ({
        id: `field:${field.id}`,
        label: field.name,
        fieldId: field.id,
        fieldName: field.name,
        fieldType: field.field_type,
      })),
      { id: 'location', label: 'Location' },
      { id: 'department', label: 'Department' },
      { id: 'reading_required', label: 'Reading required' },
      { id: 'active', label: 'Active' },
      { id: 'created_at', label: 'Created', defaultVisible: false },
      { id: 'updated_at', label: 'Updated', defaultVisible: false },
    ]
    if (canManage) cols.push({ id: 'actions', label: 'Actions', locked: true })
    return cols
  }, [canManage, hierarchyFields])
  const {
    toggleColumn: toggleEquipmentColumn,
    resetColumns: resetEquipmentColumns,
    columnDefs: equipmentPickerColumns,
    visibleColumnIds: equipmentVisibleColumnIds,
    columnOrder: equipmentColumnOrder,
    reorderColumns: reorderEquipmentColumns,
    moveColumn: moveEquipmentColumn,
    saveColumns: saveEquipmentColumns,
  } = useTableColumnPrefs('masters-equipment', equipmentColumnDefs)
  const canSelectAnyLocation = canPickAnyLocation({ isOrgAdmin, accessRole })
  const scopedLocationId = canSelectAnyLocation ? undefined : (myLocationId || undefined)
  const [search, setSearch] = useState('')
  const [columnFilters, setColumnFilters] = useState({})
  const [sortBy, setSortBy] = useState('name_asc')
  const debouncedSearch = useDebouncedValue(search.trim())
  const [listTotal, setListTotal] = useState(0)
  const filterResetKey = `${debouncedSearch}|${JSON.stringify(columnFilters)}|${sortBy}|${scopedLocationId || ''}`
  const equipmentPagination = useTablePagination(listTotal, { resetKey: filterResetKey })

  const filters = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      locationId: scopedLocationId,
      limit: equipmentPagination.pageSize,
      offset: equipmentPagination.offset,
      listFilters: compactFilters(columnFilters),
      sortBy,
    }),
    [
      debouncedSearch,
      scopedLocationId,
      equipmentPagination.pageSize,
      equipmentPagination.offset,
      columnFilters,
      sortBy,
    ],
  )
  const { items, total, loading, saving, error, create, update, remove, reload } = useEquipment(filters)
  useEffect(() => { setListTotal(total) }, [total])

  const hasListQuery = Boolean(debouncedSearch || compactFilters(columnFilters))
  const pagedItems = items
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [selected, setSelected] = useState(() => new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)
  const [labelsOpen, setLabelsOpen] = useState(false)
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
      invalidateReferenceCache('areas')
      await reload({ silent: true })
    },
    defaultFilename: 'assets-template.xlsx',
  })

  const openCreate = () => {
    setEditing(null)
    setModalOpen(true)
  }

  const openView = async (row) => {
    setViewing(row)
    try {
      const detail = await getEquipment(row.id)
      setViewing((current) => (current?.id === row.id ? detail : current))
    } catch {
      // Keep the list row if the detail request fails.
    }
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
    const saved = editing?.id ? await update(editing.id, payload) : await create(payload)
    setModalOpen(false)
    if (viewing?.id && editing?.id === viewing.id && saved) setViewing(saved)
    return saved
  }

  const handleReplaceImage = async (image) => {
    if (!viewing?.id) return
    const saved = await update(viewing.id, { image })
    if (saved) setViewing(saved)
  }

  const handleDelete = async (row) => {
    if (!window.confirm(`Delete asset "${row.name}"? This cannot be undone.`)) return
    setDeleteError(null)
    try {
      await remove(row.id)
      setSelected((prev) => {
        const next = new Set(prev)
        next.delete(row.id)
        return next
      })
    } catch (err) {
      setDeleteError(err.message || 'Could not delete this asset')
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
    const label = ids.length === 1 ? 'this asset' : `${ids.length} asset records`
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
      setDeleteError(err.message || 'Could not delete the selected assets')
      await reload({ silent: true })
    } finally {
      setBulkDeleting(false)
    }
  }

  const handleToggle = async (row, isActive) => {
    await update(row.id, { is_active: isActive })
  }

  const handleReadingRequired = async (row, required) => {
    await update(row.id, { reading_required: required })
  }

  if (permLoading) {
    return (
      <div className="company-page">
        <div className="company-loading">Loading...</div>
      </div>
    )
  }

  const showingDetail = Boolean(viewing)

  return (
    <div className="company-page">
      {!showingDetail && (
      <header className="company-page__header">
        <h1 className="company-page__title">Assets</h1>
        <p className="company-page__subtitle">
          Maintain asset records by location and department
        </p>
      </header>
      )}

      <div className="company-page__content">
        {showingDetail && (
          <EquipmentDetail
            equipment={viewing}
            canEdit={canUpdate('equipment')}
            onClose={() => setViewing(null)}
            onEdit={() => openEdit(viewing)}
            onReplaceImage={handleReplaceImage}
            links={{
              workOrders: org?.slug ? orgPath(org.slug, 'work-orders/manual') : undefined,
              pm: org?.slug ? orgPath(org.slug, 'work-orders/scheduled') : undefined,
              warranty: org?.slug ? orgPath(org.slug, 'warranty-manager') : undefined,
            }}
          />
        )}
        <>
            {!showingDetail && (
            <div className="company-panel">
              <div className="company-panel__toolbar company-panel__toolbar--filters">
                <TableFilterToolbar
                  search={{
                    value: search,
                    onChange: setSearch,
                    placeholder: 'Search assets...',
                    ariaLabel: 'Search assets',
                  }}
                  filter={{
                    fields: equipmentFilterFields,
                    values: columnFilters,
                    onChange: setColumnFilters,
                  }}
                  sort={{ value: sortBy, onChange: setSortBy, options: TABLE_SORT_OPTIONS }}
                  actions={(
                    <>
                      <button
                        type="button"
                        className="company-btn company-btn--secondary"
                        onClick={() => setLabelsOpen(true)}
                      >
                        Export QR
                      </button>
                      {canManage && (
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
                        addLabel="+ Add Asset"
                        onAdd={openCreate}
                        title="Import assets"
                        bulkError={bulkError}
                        bulkResult={bulkResult}
                        noun="asset"
                      />
                      </>
                      )}
                    </>
                  )}
                  columnPicker={(
                    <TableColumnPicker
                      columnDefs={equipmentPickerColumns}
                      visibleColumnIds={equipmentVisibleColumnIds}
                      columnOrder={equipmentColumnOrder}
                      onToggle={toggleEquipmentColumn}
                      onReset={resetEquipmentColumns}
                      onReorder={reorderEquipmentColumns}
                      onMove={moveEquipmentColumn}
                      onSave={saveEquipmentColumns}
                    />
                  )}
                />
              </div>

              {error && <div className="company-error">{error}</div>}
              {deleteError && <div className="company-alert">{deleteError}</div>}
              {bulkError && <div className="company-error">{bulkError}</div>}
              <MasterBulkResult result={bulkResult} noun="asset" />

              {loading ? (
                <div className="company-loading">Loading assets…</div>
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
                              aria-label="Select all assets"
                            />
                          </th>
                        )}
                        {equipmentVisibleColumnIds.map((columnId) => {
                          if (columnId === 'actions') return canManage ? <th key={columnId}>Actions</th> : null
                          const col = equipmentPickerColumns.find((item) => item.id === columnId)
                          return <th key={columnId}>{col?.label || columnId}</th>
                        })}
                      </tr>
                    </thead>
                    {items.length === 0 ? (
                      <tbody>
                        <TableEmptyRow colSpan={(canManage ? 1 : 0) + equipmentVisibleColumnIds.filter((columnId) => columnId !== 'actions' || canManage).length}>
                          {hasListQuery ? 'No assets match your filters.' : 'No assets yet.'}
                        </TableEmptyRow>
                      </tbody>
                    ) : (
                    <VirtualTableBody
                      items={pagedItems}
                      renderRow={(row) => {
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
                          {equipmentVisibleColumnIds.map((columnId) => {
                            if (columnId === 'actions') {
                              if (!canManage) return null
                              return (
                                <td key={columnId} onClick={stopTableRowClick}>
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
                              )
                            }
                            if (columnId === 'location') return <td key={columnId}>{equipmentLocationName(row) || '—'}</td>
                            if (columnId === 'department') return <td key={columnId}>{row.departments?.name || '—'}</td>
                            if (columnId === 'reading_required') {
                              const required = row.reading_required === true
                              return (
                                <td key={columnId} onClick={stopTableRowClick}>
                                  {canUpdate('equipment') ? (
                                    <GooToggle
                                      checked={required}
                                      disabled={saving}
                                      onChange={(checked) => handleReadingRequired(row, checked)}
                                      ariaLabel={`${required ? 'Stop requiring' : 'Require'} meter readings for ${row.name}`}
                                    />
                                  ) : (required ? 'Yes' : 'No')}
                                </td>
                              )
                            }
                            if (columnId === 'active') {
                              return (
                                <td key={columnId} onClick={stopTableRowClick}>
                                  <GooToggle
                                    checked={isActive}
                                    disabled={!canManage || saving}
                                    onChange={(checked) => handleToggle(row, checked)}
                                    ariaLabel={`${isActive ? 'Disable' : 'Enable'} ${row.name}`}
                                  />
                                </td>
                              )
                            }
                            const col = equipmentPickerColumns.find((item) => item.id === columnId)
                            const imageSrc = equipmentImageSrc(row, col)
                            if (imageSrc || col?.fieldType === 'image' || col?.fieldType === 'file') {
                              return (
                                <td key={columnId}>
                                  {imageSrc ? (
                                    <img className="equipment-table__thumb" src={imageSrc} alt="" />
                                  ) : '—'}
                                </td>
                              )
                            }
                            return <td key={columnId}>{formatPickerValue(row, col || { id: columnId })}</td>
                          })}
                        </tr>
                        )
                      }}
                    />
                    )}
                  </table>
                  </div>
                </div>
                {items.length > 0 && <TablePagination {...equipmentPagination} />}
                </>
              )}
            </div>
            )}

            {labelsOpen && (
              <EquipmentQrLabelsDialog
                canSaveSizes={canUpdate('equipment')}
                scopedLocationId={scopedLocationId || ''}
                onClose={() => setLabelsOpen(false)}
              />
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
      </div>
    </div>
  )
}
