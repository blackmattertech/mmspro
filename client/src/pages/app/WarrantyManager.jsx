import { useEffect, useMemo, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useOrg } from '../../hooks/useOrg'
import { usePermissions } from '../../hooks/usePermissions'
import { useWarranties } from '../../hooks/useWarranties'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { orgPath } from '../../config/navigation'
import {
  WARRANTY_TABS,
  getWarrantyActiveTab,
  warrantyTabEmptyHint,
} from '../../config/warranty'
import NavIcon from '../../components/layout/NavIcon'
import PageBreadcrumbs from '../../components/shared/PageBreadcrumbs'
import EditIcon from '../../components/ui/EditIcon'
import TrashIcon from '../../components/ui/TrashIcon'
import SettingsIcon from '../../components/ui/SettingsIcon'
import TablePagination from '../../components/shared/TablePagination'
import TableEmptyRow from '../../components/shared/TableEmptyRow'
import TableColumnPicker from '../../components/shared/TableColumnPicker'
import RecordPdfButton from '../../components/shared/RecordPdfButton'
import TableFilterToolbar from '../../components/shared/TableFilterToolbar'
import { useTablePagination } from '../../hooks/useTablePagination'
import { useTableColumnPrefs } from '../../hooks/useTableColumnPrefs'
import { useCatalogFields } from '../../hooks/useCatalogFields'
import { mergePickerColumns, readCatalogText } from '../../lib/pickerFields'
import { TABLE_SORT_OPTIONS, applyTableFilters, compactFilters, uniqueNameOptions, selectFilterField } from '../../lib/tableFilters'
import { stopTableRowClick, tableRowClickProps } from '../../lib/clickableTableRow'
import { getWarrantiesTemplate, bulkUploadWarranties, previewWarrantyImport } from '../../lib/api-warranties'
import {
  useMasterBulkUpload,
  MasterBulkActions,
} from '../../components/company/MasterBulkUpload'
import WarrantyBulkNote from '../../components/warranty/WarrantyBulkNote'
import '../../components/shared/TableColumnPicker.css'
import '../../components/shared/TableFilterToolbar.css'
import WarrantyExpiringFilter from '../../components/warranty/WarrantyExpiringFilter'
import { DEFAULT_WARRANTY_EXPIRING_FILTER, isWarrantyExpiringFilterValid, warrantyExpiringFilterSummary } from '../../lib/warrantyExpiringFilter'
import '../../components/warranty/WarrantyExpiringFilter.css'
import '../../components/workorders/WorkOrdersPage.css'
import '../../components/workrequests/WorkRequests.css'
import '../../components/company/CompanyShared.css'
import '../../components/warranty/WarrantyManager.css'

const WARRANTY_COLUMNS = [
  { id: 'serial_number', label: 'S.No' },
  { id: 'make', label: 'Make' },
  { id: 'vendor', label: 'Vendor' },
  { id: 'vendor_code', label: 'Vendor ID', defaultVisible: false },
  { id: 'purchase_date', label: 'Purchase Date' },
  { id: 'po_number', label: 'PO Number' },
  { id: 'po_date', label: 'PO Date', defaultVisible: false },
  { id: 'invoice_number', label: 'Invoice Number', defaultVisible: false },
  { id: 'invoice_date', label: 'Invoice Date', defaultVisible: false },
  { id: 'warranty_start', label: 'Warranty Start', defaultVisible: false },
  { id: 'warranty_end', label: 'Warranty End' },
  { id: 'warranty_period_months', label: 'Warranty Period', defaultVisible: false },
  { id: 'expiry_notification_days', label: 'Expiry Notification', defaultVisible: false },
  { id: 'contact_name', label: 'Contact' },
  { id: 'contact_phone', label: 'Contact Phone', defaultVisible: false },
  { id: 'contact_email', label: 'Contact Email', defaultVisible: false },
  { id: 'products', label: 'Products / Materials', defaultVisible: false },
  { id: 'model_part_no', label: 'Model / P.No', defaultVisible: false },
  { id: 'product_value', label: 'Product Value', defaultVisible: false },
  { id: 'total_value', label: 'Total Value', defaultVisible: false },
  { id: 'product_remarks', label: 'Product Remarks', defaultVisible: false },
  { id: 'product_count', label: 'Product Lines', defaultVisible: false },
  { id: 'created_at', label: 'Created', defaultVisible: false },
  { id: 'updated_at', label: 'Updated', defaultVisible: false },
  { id: 'actions', label: 'Actions', locked: true },
]

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString()
}

function formatDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function warrantyLineItems(row) {
  return row.items || []
}

function joinItemField(row, field) {
  const values = warrantyLineItems(row)
    .map((item) => item[field])
    .filter((value) => value != null && String(value).trim() !== '')
  return values.length ? values.join(', ') : '—'
}

function formatMoney(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return null
  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function renderJoinedText(text) {
  if (!text || text === '—') return '—'
  return (
    <span className="company-table__name" title={text}>
      {text}
    </span>
  )
}

function renderWarrantyCell(row, columnId) {
  switch (columnId) {
    case 'serial_number':
      return row.serial_number
    case 'make':
      return row.make || '—'
    case 'vendor':
      return row.vendor || '—'
    case 'vendor_code':
      return row.vendor_record?.vendor_code
        ? <code className="company-code">{row.vendor_record.vendor_code}</code>
        : '—'
    case 'purchase_date':
    case 'po_date':
    case 'invoice_date':
    case 'warranty_start':
    case 'warranty_end':
      return formatDate(row[columnId])
    case 'po_number':
      return row.po_number || '—'
    case 'invoice_number':
      return row.invoice_number || '—'
    case 'warranty_period_months':
      return row.warranty_period_months != null && row.warranty_period_months !== ''
        ? `${row.warranty_period_months} Months`
        : '—'
    case 'expiry_notification_days':
      return row.expiry_notification_days != null && row.expiry_notification_days !== ''
        ? `${row.expiry_notification_days} Days`
        : '—'
    case 'contact_name':
      return row.contact_name || '—'
    case 'contact_phone':
      return row.contact_phone || '—'
    case 'contact_email':
      return row.contact_email || '—'
    case 'products':
      return renderJoinedText(joinItemField(row, 'product_name'))
    case 'model_part_no':
      return renderJoinedText(joinItemField(row, 'model_part_no'))
    case 'product_value': {
      const values = warrantyLineItems(row)
        .map((item) => formatMoney(item.value))
        .filter(Boolean)
      return renderJoinedText(values.length ? values.join(', ') : '—')
    }
    case 'total_value': {
      const total = warrantyLineItems(row).reduce((sum, item) => {
        const num = Number(item.value)
        return sum + (Number.isFinite(num) ? num : 0)
      }, 0)
      return total > 0 ? formatMoney(total) : '—'
    }
    case 'product_remarks':
      return renderJoinedText(joinItemField(row, 'remarks'))
    case 'product_count': {
      const count = warrantyLineItems(row).length
      return count || '—'
    }
    case 'created_at':
      return formatDateTime(row.created_at)
    case 'updated_at':
      return formatDateTime(row.updated_at)
    default:
      return readCatalogText(row, { id: columnId }) || '—'
  }
}

export default function WarrantyManager() {
  const navigate = useNavigate()
  const location = useLocation()
  const { org } = useOrg()
  const { canCreate, canUpdate, canDelete } = usePermissions()
  const canManage = canCreate('warranty_manager') || canUpdate('warranty_manager') || canDelete('warranty_manager')
  const activeTab = getWarrantyActiveTab(location.pathname) || WARRANTY_TABS[0]
  const warrantyStatusFilter = activeTab.status
  const isSoonTab = warrantyStatusFilter === 'expiring_soon'
  const [search, setSearch] = useState('')
  const [columnFilters, setColumnFilters] = useState({})
  const [expiringFilterDraft, setExpiringFilterDraft] = useState(DEFAULT_WARRANTY_EXPIRING_FILTER)
  const [expiringFilterApplied, setExpiringFilterApplied] = useState(null)
  const [expiringPanelOpen, setExpiringPanelOpen] = useState(false)
  const [sortBy, setSortBy] = useState('newest')
  const debouncedSearch = useDebouncedValue(search.trim())
  const applyExpiringRange = isSoonTab && Boolean(expiringFilterApplied) && !expiringPanelOpen
  const [listTotal, setListTotal] = useState(0)
  const filterResetKey = [
    activeTab.id,
    debouncedSearch,
    JSON.stringify(columnFilters),
    sortBy,
    applyExpiringRange ? JSON.stringify(expiringFilterApplied) : '',
  ].join('|')
  const pagination = useTablePagination(listTotal, { resetKey: filterResetKey })

  useEffect(() => {
    setExpiringPanelOpen(false)
  }, [activeTab.id])

  const filters = useMemo(() => ({
    search: debouncedSearch || undefined,
    limit: pagination.pageSize,
    offset: pagination.offset,
    filters: compactFilters(columnFilters),
    warranty_status: warrantyStatusFilter,
    expiring_mode: applyExpiringRange ? expiringFilterApplied.mode : undefined,
    expiring_min_days: applyExpiringRange ? expiringFilterApplied.minDays : undefined,
    expiring_max_days: applyExpiringRange ? expiringFilterApplied.maxDays : undefined,
    expiring_date_from: applyExpiringRange ? expiringFilterApplied.dateFrom : undefined,
    expiring_date_to: applyExpiringRange ? expiringFilterApplied.dateTo : undefined,
  }), [
    debouncedSearch,
    pagination.pageSize,
    pagination.offset,
    columnFilters,
    warrantyStatusFilter,
    applyExpiringRange,
    expiringFilterApplied,
  ])
  const { items, total, statusCounts, loading, saving, error, remove, reload } = useWarranties(filters)
  const warrantyFilterFields = useMemo(() => ([
    selectFilterField('serial_number', 'S.No', uniqueNameOptions(items, (row) => row.serial_number), 'All serial numbers'),
    selectFilterField('make', 'Make', uniqueNameOptions(items, (row) => row.make), 'All makes'),
    selectFilterField('vendor', 'Vendor', uniqueNameOptions(items, (row) => row.vendor), 'All vendors'),
    selectFilterField('po_number', 'PO Number', uniqueNameOptions(items, (row) => row.po_number), 'All PO numbers'),
    selectFilterField('invoice_number', 'Invoice Number', uniqueNameOptions(items, (row) => row.invoice_number), 'All invoice numbers'),
    selectFilterField('contact_name', 'Contact', uniqueNameOptions(items, (row) => row.contact_name), 'All contacts'),
    selectFilterField('products', 'Products', uniqueNameOptions(items, (row) => joinItemField(row, 'product_name') === '—' ? '' : joinItemField(row, 'product_name')), 'All products'),
  ]), [items])
  useEffect(() => { setListTotal(total) }, [total])
  const {
    bulkInputRef,
    bulkBusy,
    bulkError,
    bulkResult,
    bulkPreview,
    handleDownloadTemplate,
    handleBulkFile,
    confirmBulkImport,
    cancelBulkPreview,
  } = useMasterBulkUpload({
    downloadTemplate: getWarrantiesTemplate,
    upload: bulkUploadWarranties,
    previewUpload: previewWarrantyImport,
    onSuccess: () => reload({ silent: true }),
    defaultFilename: 'warranties-template.xlsx',
  })

  const handleWarrantyFilters = (next) => {
    setColumnFilters(next)
  }

  const tabCounts = useMemo(() => {
    const map = Object.fromEntries((statusCounts || []).map((row) => [row.status, Number(row.count) || 0]))
    if (map.active != null && map.in_warranty == null) map.in_warranty = map.active
    return map
  }, [statusCounts])

  const filteredItems = useMemo(() => applyTableFilters(items, {
    sortBy,
    getName: (row) => row.make || row.vendor || row.po_number || joinItemField(row, 'product_name'),
    getCreatedAt: (row) => row.purchase_date || row.created_at,
  }), [items, sortBy])

  const pagedItems = filteredItems

  const catalogFields = useCatalogFields()
  const columnDefs = useMemo(() => mergePickerColumns(
    canManage ? WARRANTY_COLUMNS : WARRANTY_COLUMNS.filter((col) => col.id !== 'actions'),
    catalogFields,
  ), [canManage, catalogFields])

  const {
    toggleColumn,
    resetColumns,
    columnDefs: pickerColumns,
    visibleColumnIds,
    columnOrder,
    reorderColumns,
    moveColumn,
    saveColumns,
  } = useTableColumnPrefs('warranty-manager', columnDefs)

  const openCreate = () => {
    if (!org?.slug) return
    navigate(orgPath(org.slug, 'warranty-manager/create'))
  }

  const openView = (row) => {
    if (!org?.slug || !row?.id) return
    navigate(orgPath(org.slug, `warranty-manager/${row.id}`))
  }

  const openEdit = (row) => {
    if (!org?.slug || !row?.id) return
    navigate(orgPath(org.slug, `warranty-manager/${row.id}/edit`))
  }

  const handleDelete = async (row) => {
    const label = row.serial_number != null ? row.serial_number : 'this warranty'
    if (!window.confirm(`Delete warranty ${label}?`)) return
    await remove(row.id)
  }

  const emptyMessage = loading
    ? 'Loading warranties…'
    : (search.trim() || compactFilters(columnFilters)
      ? 'No warranties match your filters.'
      : (isSoonTab && expiringFilterApplied
        ? `No warranties match the Soon to Expired range (${warrantyExpiringFilterSummary(expiringFilterApplied)}).`
        : warrantyTabEmptyHint(activeTab.id, canCreate('warranty_manager'))))

  const toggleSoonSettings = () => {
    setExpiringFilterDraft(expiringFilterApplied || DEFAULT_WARRANTY_EXPIRING_FILTER)
    setExpiringPanelOpen((open) => !open)
  }

  return (
    <div className="company-page wo-page">
      <header className="wo-page__top">
        <div className="wo-page__intro">
          <PageBreadcrumbs />
          <h1 className="wo-page__title">Warranty Manager</h1>
          <p className="wo-page__subtitle">
            Track purchase details, warranty periods, and product line items.
          </p>
        </div>
      </header>

      <div className="wr-page__toolbar">
        <div className="wr-page__toolbar-row wr-page__toolbar-row--tabs">
          <div className="warranty-tabs-cluster">
            <nav className="wo-page__tabs" aria-label="Warranty views">
              {WARRANTY_TABS.map((tab) => (
                <NavLink
                  key={tab.id}
                  to={org?.slug ? orgPath(org.slug, tab.segment) : '#'}
                  end
                  className={({ isActive }) =>
                    `wo-page__tab${isActive ? ' wo-page__tab--active' : ''}`
                  }
                >
                  {tab.icon ? <NavIcon name={tab.icon} /> : null}
                  {tab.label}
                  <span className="wo-page__tab-count">{tabCounts[tab.status] ?? 0}</span>
                </NavLink>
              ))}
            </nav>
            <div className="warranty-soon-settings">
              <button
                type="button"
                className={`warranty-soon-settings__btn${expiringPanelOpen ? ' is-open' : ''}${expiringFilterApplied ? ' is-applied' : ''}`}
                aria-label="Soon to Expired range settings"
                aria-expanded={expiringPanelOpen}
                onClick={toggleSoonSettings}
              >
                <SettingsIcon size={18} />
                <span className="warranty-soon-settings__tooltip" role="tooltip">
                  Set the Soon to Expired range (days or dates)
                </span>
              </button>
            </div>
          </div>
          {canCreate('warranty_manager') && (
            <button
              type="button"
              className="wo-page__tab wr-page__create-tab"
              onClick={openCreate}
            >
              <NavIcon name="addSquare" />
              New Warranty
            </button>
          )}
        </div>
      </div>

      <div className="company-page__content">
        <div className="company-panel">
          <div className="company-panel__toolbar company-panel__toolbar--filters">
            <TableFilterToolbar
              className="warranty-manager-toolbar"
              search={{
                value: search,
                onChange: setSearch,
                placeholder: 'Search S.No., make, vendor, PO, invoice, product, contact…',
                ariaLabel: 'Search warranties',
              }}
              filter={{
                fields: warrantyFilterFields,
                values: columnFilters,
                onChange: handleWarrantyFilters,
              }}
              sort={{ value: sortBy, onChange: setSortBy, options: TABLE_SORT_OPTIONS }}
              actions={canCreate('warranty_manager') && (
                <div className="warranty-manager__actions">
                  <MasterBulkActions
                    onDownload={handleDownloadTemplate}
                    bulkBusy={bulkBusy}
                    bulkInputRef={bulkInputRef}
                    onFileChange={handleBulkFile}
                    title="Import warranties"
                    description={<WarrantyBulkNote />}
                    noun="warranty"
                    bulkError={bulkError}
                    bulkResult={bulkResult}
                    bulkPreview={bulkPreview}
                    onConfirmImport={confirmBulkImport}
                    onCancelPreview={cancelBulkPreview}
                  />
                </div>
              )}
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

          {expiringPanelOpen && (
            <WarrantyExpiringFilter
              value={expiringFilterDraft}
              onChange={setExpiringFilterDraft}
              onApply={() => {
                if (!isWarrantyExpiringFilterValid(expiringFilterDraft)) return
                setExpiringFilterApplied({ ...expiringFilterDraft })
                setExpiringPanelOpen(false)
              }}
              onCancel={() => {
                setExpiringFilterDraft(expiringFilterApplied || DEFAULT_WARRANTY_EXPIRING_FILTER)
                setExpiringPanelOpen(false)
              }}
              onClear={() => {
                setExpiringFilterDraft(DEFAULT_WARRANTY_EXPIRING_FILTER)
                setExpiringFilterApplied(null)
                setExpiringPanelOpen(false)
              }}
              applyDisabled={!isWarrantyExpiringFilterValid(expiringFilterDraft)}
              clearDisabled={!expiringFilterApplied}
            />
          )}

          {error && <div className="company-alert" role="alert">{error}</div>}

          <div className="company-table-wrap">
            <div className="company-table-scroll">
              <table className="company-table master-table">
                <thead>
                  <tr>
                    {visibleColumnIds.map((columnId) => {
                      const col = columnDefs.find((item) => item.id === columnId)
                      return <th key={columnId}>{col?.label || columnId}</th>
                    })}
                  </tr>
                </thead>
                <tbody>
                  {pagedItems.length === 0 ? (
                    <TableEmptyRow colSpan={visibleColumnIds.length}>
                      {emptyMessage}
                    </TableEmptyRow>
                  ) : pagedItems.map((row) => (
                    <tr
                      key={row.id}
                      {...tableRowClickProps({
                        onOpen: () => openView(row),
                        label: `View warranty ${row.serial_number}`,
                      })}
                    >
                      {visibleColumnIds.map((columnId) => {
                        if (columnId === 'actions') {
                          return (
                            <td key={columnId} onClick={stopTableRowClick}>
                              <div className="company-table__actions">
                                <RecordPdfButton moduleKey="warranty" recordId={row.id} filename={`${row.serial_number || 'warranty'}.pdf`} />
                                {canUpdate('warranty_manager') && (
                                  <button
                                    type="button"
                                    className="company-btn company-btn--secondary company-btn--compact company-btn--icon"
                                    onClick={() => openEdit(row)}
                                    aria-label={`Edit warranty ${row.serial_number}`}
                                    title="Edit"
                                  >
                                    <EditIcon />
                                  </button>
                                )}
                                {canDelete('warranty_manager') && (
                                  <button
                                    type="button"
                                    className="company-btn company-btn--secondary company-btn--compact company-btn--icon company-btn--danger"
                                    onClick={() => handleDelete(row)}
                                    disabled={saving}
                                    aria-label={`Delete warranty ${row.serial_number}`}
                                    title="Delete"
                                  >
                                    <TrashIcon />
                                  </button>
                                )}
                              </div>
                            </td>
                          )
                        }

                        return (
                          <td key={columnId}>{renderWarrantyCell(row, columnId)}</td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination {...pagination} />
          </div>
        </div>
      </div>
    </div>
  )
}
