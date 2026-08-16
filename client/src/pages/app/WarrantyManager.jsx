import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOrg } from '../../hooks/useOrg'
import { usePermissions } from '../../hooks/usePermissions'
import { useWarranties } from '../../hooks/useWarranties'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { orgPath } from '../../config/navigation'
import EditIcon from '../../components/ui/EditIcon'
import TrashIcon from '../../components/ui/TrashIcon'
import NavIcon from '../../components/layout/NavIcon'
import TablePagination from '../../components/shared/TablePagination'
import TableColumnPicker from '../../components/shared/TableColumnPicker'
import TableFilterToolbar from '../../components/shared/TableFilterToolbar'
import { useTablePagination } from '../../hooks/useTablePagination'
import { useTableColumnPrefs } from '../../hooks/useTableColumnPrefs'
import { TABLE_SORT_OPTIONS, applyTableFilters } from '../../lib/tableFilters'
import { stopTableRowClick, tableRowClickProps } from '../../lib/clickableTableRow'
import '../../components/shared/TableColumnPicker.css'
import '../../components/shared/TableFilterToolbar.css'
import WarrantyExpiringFilter from '../../components/warranty/WarrantyExpiringFilter'
import { DEFAULT_WARRANTY_EXPIRING_FILTER, isWarrantyExpiringFilterValid, warrantyExpiringFilterSummary } from '../../lib/warrantyExpiringFilter'
import '../../components/warranty/WarrantyExpiringFilter.css'
import '../../components/workorders/WorkOrdersPage.css'
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

const WARRANTY_FILTER_FIELDS = [
  { value: 'serial_number', label: 'S.No' },
  { value: 'make', label: 'Make' },
  { value: 'vendor', label: 'Vendor' },
  { value: 'po_number', label: 'PO Number' },
  { value: 'invoice_number', label: 'Invoice Number' },
  { value: 'contact_name', label: 'Contact' },
  { value: 'products', label: 'Products' },
  { value: 'status', label: 'Status', placeholder: 'active, expired, or expiring' },
]

function resolveWarrantyStatusFilter(field, value) {
  if (field !== 'status') return 'all'
  const query = String(value || '').trim().toLowerCase()
  if (!query) return 'all'
  if (query.includes('expiring') || query.includes('soon')) return 'expiring_soon'
  if (query.includes('expired')) return 'expired'
  if (query.includes('active')) return 'active'
  return 'all'
}

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
      return '—'
  }
}

export default function WarrantyManager() {
  const navigate = useNavigate()
  const { org } = useOrg()
  const { canCreate, canUpdate, canDelete } = usePermissions()
  const canManage = canCreate('warranty_manager') || canUpdate('warranty_manager') || canDelete('warranty_manager')
  const [search, setSearch] = useState('')
  const [filterField, setFilterField] = useState('')
  const [filterValue, setFilterValue] = useState('')
  const [expiringFilterDraft, setExpiringFilterDraft] = useState(DEFAULT_WARRANTY_EXPIRING_FILTER)
  const [expiringFilterApplied, setExpiringFilterApplied] = useState(DEFAULT_WARRANTY_EXPIRING_FILTER)
  const [expiringPanelOpen, setExpiringPanelOpen] = useState(false)
  const [sortBy, setSortBy] = useState('newest')
  const debouncedSearch = useDebouncedValue(search.trim())
  const [listTotal, setListTotal] = useState(0)
  const filterResetKey = `${debouncedSearch}|${filterField}|${filterValue}|${sortBy}`
  const pagination = useTablePagination(listTotal, { resetKey: filterResetKey })

  const filters = useMemo(() => ({
    search: debouncedSearch || undefined,
    limit: pagination.pageSize,
    offset: pagination.offset,
  }), [debouncedSearch, pagination.pageSize, pagination.offset])
  const { items, total, loading, saving, error, remove } = useWarranties(filters)
  useEffect(() => { setListTotal(total) }, [total])

  const warrantyStatusFilter = useMemo(
    () => resolveWarrantyStatusFilter(filterField, filterValue),
    [filterField, filterValue],
  )
  const isStatusFieldFilter = filterField === 'status'

  const handleFilterFieldChange = (value) => {
    setFilterField(value)
    if (value !== 'status') {
      setExpiringPanelOpen(false)
      setExpiringFilterDraft(DEFAULT_WARRANTY_EXPIRING_FILTER)
      setExpiringFilterApplied(DEFAULT_WARRANTY_EXPIRING_FILTER)
    }
  }

  const handleFilterValueChange = (value) => {
    setFilterValue(value)
    if (filterField !== 'status') return
    const nextStatus = resolveWarrantyStatusFilter('status', value)
    if (nextStatus === 'expiring_soon') {
      setExpiringFilterDraft({ ...expiringFilterApplied })
      setExpiringPanelOpen(true)
      return
    }
    setExpiringPanelOpen(false)
    setExpiringFilterDraft(DEFAULT_WARRANTY_EXPIRING_FILTER)
    setExpiringFilterApplied(DEFAULT_WARRANTY_EXPIRING_FILTER)
  }

  const filteredItems = useMemo(() => applyTableFilters(items, {
    fieldFilter: isStatusFieldFilter ? undefined : { field: filterField, value: filterValue },
    fieldFilterGetters: {
      serial_number: (row) => row.serial_number,
      make: (row) => row.make,
      vendor: (row) => row.vendor,
      po_number: (row) => row.po_number,
      invoice_number: (row) => row.invoice_number,
      contact_name: (row) => row.contact_name,
      products: (row) => joinItemField(row, 'product_name'),
    },
    warrantyStatusFilter: warrantyStatusFilter === 'expiring_soon' && expiringPanelOpen
      ? 'all'
      : warrantyStatusFilter,
    warrantyExpiringFilter: expiringFilterApplied,
    sortBy,
    getName: (row) => row.make || row.vendor || row.po_number || joinItemField(row, 'product_name'),
    getCreatedAt: (row) => row.purchase_date || row.created_at,
  }), [items, isStatusFieldFilter, filterField, filterValue, warrantyStatusFilter, expiringPanelOpen, expiringFilterApplied, sortBy])

  const pagedItems = filteredItems

  const columnDefs = useMemo(() => (
    canManage ? WARRANTY_COLUMNS : WARRANTY_COLUMNS.filter((col) => col.id !== 'actions')
  ), [canManage])

  const {
    toggleColumn,
    resetColumns,
    columnDefs: pickerColumns,
    visibleColumnIds,
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

  const showTable = !loading && items.length > 0 && filteredItems.length > 0

  return (
    <div className="company-page">
      <header className="company-page__header">
        <h1 className="company-page__title">Warranty Manager</h1>
        <p className="company-page__subtitle">
          Track purchase details, warranty periods, and product line items.
        </p>
      </header>

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
                fields: WARRANTY_FILTER_FIELDS,
                field: filterField,
                onFieldChange: handleFilterFieldChange,
                value: filterValue,
                onValueChange: handleFilterValueChange,
              }}
              sort={{ value: sortBy, onChange: setSortBy, options: TABLE_SORT_OPTIONS }}
              actions={canCreate('warranty_manager') && (
                <div className="warranty-manager__actions">
                  <button
                    type="button"
                    className="company-btn company-btn--primary warranty-manager__create-btn"
                    onClick={openCreate}
                  >
                    <NavIcon name="addSquare" />
                    New Warranty
                  </button>
                </div>
              )}
              columnPicker={showTable && (
                <TableColumnPicker
                  columnDefs={pickerColumns}
                  visibleColumnIds={visibleColumnIds}
                  onToggle={toggleColumn}
                  onReset={resetColumns}
                />
              )}
            />
          </div>

          {warrantyStatusFilter === 'expiring_soon' && expiringPanelOpen && (
            <WarrantyExpiringFilter
              value={expiringFilterDraft}
              onChange={setExpiringFilterDraft}
              onApply={() => {
                if (!isWarrantyExpiringFilterValid(expiringFilterDraft)) return
                setExpiringFilterApplied({ ...expiringFilterDraft })
                setExpiringPanelOpen(false)
              }}
              onCancel={() => {
                setExpiringFilterDraft({ ...expiringFilterApplied })
                setExpiringPanelOpen(false)
              }}
              applyDisabled={!isWarrantyExpiringFilterValid(expiringFilterDraft)}
            />
          )}

          {warrantyStatusFilter === 'expiring_soon' && !expiringPanelOpen && (
            <div className="warranty-expiring-filter__applied">
              <span className="warranty-expiring-filter__applied-label">
                Showing warranties expiring: <strong>{warrantyExpiringFilterSummary(expiringFilterApplied)}</strong>
              </span>
              <button
                type="button"
                className="company-btn company-btn--secondary company-btn--compact"
                onClick={() => {
                  setExpiringFilterDraft({ ...expiringFilterApplied })
                  setExpiringPanelOpen(true)
                }}
              >
                Edit range
              </button>
            </div>
          )}

          {error && <div className="company-alert" role="alert">{error}</div>}

          {loading ? (
            <div className="company-loading">Loading warranties…</div>
          ) : items.length === 0 ? (
            <div className="company-empty">
              No warranty records yet.
              {canCreate('warranty_manager') && ' Click "New Warranty" to add one.'}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="company-empty">No warranties match your filters.</div>
          ) : (
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
                    {pagedItems.map((row) => (
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
          )}
        </div>
      </div>
    </div>
  )
}
