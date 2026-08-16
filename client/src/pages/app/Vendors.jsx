import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOrg } from '../../hooks/useOrg'
import { useVendors } from '../../hooks/useVendors'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import VendorModal from '../../components/vendors/VendorModal'
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
import { orgPath } from '../../config/navigation'
import { formatCityDisplay } from '../../lib/indiaLocations'
import '../../components/shared/TableColumnPicker.css'
import '../../components/shared/TableFilterToolbar.css'
import '../../components/workorders/WorkOrdersPage.css'
import '../../components/company/CompanyShared.css'
import '../../components/vendors/Vendors.css'

const VENDOR_COLUMNS = [
  { id: 'vendor_code', label: 'Vendor ID' },
  { id: 'name', label: 'Name' },
  { id: 'contact_person', label: 'Contact Person' },
  { id: 'mobile', label: 'Mobile' },
  { id: 'email', label: 'Email', defaultVisible: false },
  { id: 'city', label: 'City' },
  { id: 'state', label: 'State', defaultVisible: false },
  { id: 'pincode', label: 'Pincode', defaultVisible: false },
  { id: 'address_line1', label: 'Address Line 1', defaultVisible: false },
  { id: 'address_line2', label: 'Address Line 2', defaultVisible: false },
  { id: 'gstin', label: 'GSTIN' },
  { id: 'pan', label: 'PAN', defaultVisible: false },
  { id: 'bank_account_number', label: 'Bank A/c Number', defaultVisible: false },
  { id: 'bank_name', label: 'Bank Name', defaultVisible: false },
  { id: 'account_name', label: 'Account Name', defaultVisible: false },
  { id: 'ifsc_code', label: 'IFSC Code', defaultVisible: false },
  { id: 'branch', label: 'Branch', defaultVisible: false },
  { id: 'actions', label: 'Actions', locked: true },
]

const VENDOR_FILTER_FIELDS = [
  { value: 'vendor_code', label: 'Vendor ID' },
  { value: 'name', label: 'Name' },
  { value: 'contact_person', label: 'Contact Person' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'email', label: 'Email' },
  { value: 'city', label: 'City' },
  { value: 'gstin', label: 'GSTIN' },
]

function renderVendorCell(row, columnId) {
  switch (columnId) {
    case 'vendor_code':
      return <code className="company-code">{row.vendor_code}</code>
    case 'name':
      return row.name
    case 'contact_person':
      return row.contact_person || '—'
    case 'mobile':
      return row.mobile || '—'
    case 'email':
      return row.email || '—'
    case 'city':
      return formatCityDisplay(row.city, row.state) || '—'
    case 'state':
      return row.state || '—'
    case 'pincode':
      return row.pincode || '—'
    case 'address_line1':
      return row.address_line1 || '—'
    case 'address_line2':
      return row.address_line2 || '—'
    case 'gstin':
      return row.gstin || '—'
    case 'pan':
      return row.pan || '—'
    case 'bank_account_number':
      return row.bank_account_number || '—'
    case 'bank_name':
      return row.bank_name || '—'
    case 'account_name':
      return row.account_name || '—'
    case 'ifsc_code':
      return row.ifsc_code || '—'
    case 'branch':
      return row.branch || '—'
    default:
      return '—'
  }
}

export default function Vendors() {
  const navigate = useNavigate()
  const { org } = useOrg()
  const [search, setSearch] = useState('')
  const [filterField, setFilterField] = useState('')
  const [filterValue, setFilterValue] = useState('')
  const [sortBy, setSortBy] = useState('name_asc')
  const debouncedSearch = useDebouncedValue(search.trim())
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  const filters = useMemo(() => ({ search: debouncedSearch || undefined }), [debouncedSearch])
  const { items, loading, saving, error, create, update, remove } = useVendors(filters)

  const filteredItems = useMemo(() => applyTableFilters(items, {
    fieldFilter: { field: filterField, value: filterValue },
    fieldFilterGetters: {
      vendor_code: (row) => row.vendor_code,
      name: (row) => row.name,
      contact_person: (row) => row.contact_person,
      mobile: (row) => row.mobile,
      email: (row) => row.email,
      city: (row) => formatCityDisplay(row.city, row.state) || row.city,
      gstin: (row) => row.gstin,
    },
    sortBy,
    getName: (row) => row.name || row.vendor_code,
    getCreatedAt: (row) => row.created_at,
  }), [items, filterField, filterValue, sortBy])

  const filterResetKey = `${debouncedSearch}|${filterField}|${filterValue}|${sortBy}`
  const pagination = useTablePagination(filteredItems.length, { resetKey: filterResetKey })
  const pagedItems = pagination.paginate(filteredItems)
  const {
    isVisible: isVendorColumnVisible,
    toggleColumn: toggleVendorColumn,
    resetColumns: resetVendorColumns,
    columnDefs: vendorPickerColumns,
    visibleColumnIds: vendorVisibleColumnIds,
  } = useTableColumnPrefs('masters-vendors', VENDOR_COLUMNS)

  const openCreate = () => {
    setEditing(null)
    setModalOpen(true)
  }

  const openView = (row) => {
    if (!org?.slug || !row?.id) return
    navigate(orgPath(org.slug, `masters/vendors/${row.id}`))
  }

  const openEdit = (row) => {
    setEditing(row)
    setModalOpen(true)
  }

  const handleSave = async (payload) => {
    if (editing?.id) await update(editing.id, payload)
    else await create(payload)
    setModalOpen(false)
  }

  const handleDelete = async (row) => {
    const label = row.vendor_code || row.name
    if (!window.confirm(`Delete vendor "${label}"?`)) return
    await remove(row.id)
  }

  const goBulkUpload = () => {
    if (!org?.slug) return
    navigate(orgPath(org.slug, 'configuration/import?template=vendors'))
  }

  return (
    <div className="company-page">
      <header className="company-page__header">
        <h1 className="company-page__title">Vendors</h1>
        <p className="company-page__subtitle">
          Maintain vendor contact, address, taxation, and bank details.
        </p>
      </header>

      <div className="company-page__content">
        <div className="company-panel">
          <div className="company-panel__toolbar company-panel__toolbar--filters">
            <TableFilterToolbar
              search={{
                value: search,
                onChange: setSearch,
                placeholder: 'Search vendor ID, name, contact, GSTIN…',
                ariaLabel: 'Search vendors',
              }}
              filter={{
                fields: VENDOR_FILTER_FIELDS,
                field: filterField,
                onFieldChange: setFilterField,
                value: filterValue,
                onValueChange: setFilterValue,
              }}
              sort={{ value: sortBy, onChange: setSortBy, options: TABLE_SORT_OPTIONS }}
              actions={(
                <>
                  <button
                    type="button"
                    className="company-btn company-btn--secondary equipment-bulk-btn"
                    onClick={goBulkUpload}
                  >
                    <span className="equipment-bulk-btn__icon" aria-hidden="true">
                      <NavIcon name="upload" />
                    </span>
                    Bulk upload
                  </button>
                  <button type="button" className="company-btn company-btn--primary" onClick={openCreate}>
                    + Add Vendor
                  </button>
                </>
              )}
              columnPicker={(
                <TableColumnPicker
                  columnDefs={vendorPickerColumns}
                  visibleColumnIds={vendorVisibleColumnIds}
                  onToggle={toggleVendorColumn}
                  onReset={resetVendorColumns}
                />
              )}
            />
          </div>

          {error && <div className="company-alert" role="alert">{error}</div>}

          {loading ? (
            <div className="company-loading">Loading vendors…</div>
          ) : items.length === 0 ? (
            <div className="company-empty">No vendors yet. Click &quot;Add Vendor&quot; to create one.</div>
          ) : filteredItems.length === 0 ? (
            <div className="company-empty">No vendors match your filters.</div>
          ) : (
            <div className="company-table-wrap">
              <div className="company-table-scroll">
                <table className="company-table master-table">
                  <thead>
                    <tr>
                      {isVendorColumnVisible('vendor_code') && <th>Vendor ID</th>}
                      {isVendorColumnVisible('name') && <th>Name</th>}
                      {isVendorColumnVisible('contact_person') && <th>Contact Person</th>}
                      {isVendorColumnVisible('mobile') && <th>Mobile</th>}
                      {isVendorColumnVisible('email') && <th>Email</th>}
                      {isVendorColumnVisible('city') && <th>City</th>}
                      {isVendorColumnVisible('state') && <th>State</th>}
                      {isVendorColumnVisible('pincode') && <th>Pincode</th>}
                      {isVendorColumnVisible('address_line1') && <th>Address Line 1</th>}
                      {isVendorColumnVisible('address_line2') && <th>Address Line 2</th>}
                      {isVendorColumnVisible('gstin') && <th>GSTIN</th>}
                      {isVendorColumnVisible('pan') && <th>PAN</th>}
                      {isVendorColumnVisible('bank_account_number') && <th>Bank A/c Number</th>}
                      {isVendorColumnVisible('bank_name') && <th>Bank Name</th>}
                      {isVendorColumnVisible('account_name') && <th>Account Name</th>}
                      {isVendorColumnVisible('ifsc_code') && <th>IFSC Code</th>}
                      {isVendorColumnVisible('branch') && <th>Branch</th>}
                      {isVendorColumnVisible('actions') && <th>Actions</th>}
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
                        {isVendorColumnVisible('vendor_code') && (
                          <td>{renderVendorCell(row, 'vendor_code')}</td>
                        )}
                        {isVendorColumnVisible('name') && (
                          <td>{renderVendorCell(row, 'name')}</td>
                        )}
                        {isVendorColumnVisible('contact_person') && (
                          <td>{renderVendorCell(row, 'contact_person')}</td>
                        )}
                        {isVendorColumnVisible('mobile') && (
                          <td>{renderVendorCell(row, 'mobile')}</td>
                        )}
                        {isVendorColumnVisible('email') && (
                          <td>{renderVendorCell(row, 'email')}</td>
                        )}
                        {isVendorColumnVisible('city') && (
                          <td>{renderVendorCell(row, 'city')}</td>
                        )}
                        {isVendorColumnVisible('state') && (
                          <td>{renderVendorCell(row, 'state')}</td>
                        )}
                        {isVendorColumnVisible('pincode') && (
                          <td>{renderVendorCell(row, 'pincode')}</td>
                        )}
                        {isVendorColumnVisible('address_line1') && (
                          <td>{renderVendorCell(row, 'address_line1')}</td>
                        )}
                        {isVendorColumnVisible('address_line2') && (
                          <td>{renderVendorCell(row, 'address_line2')}</td>
                        )}
                        {isVendorColumnVisible('gstin') && (
                          <td>{renderVendorCell(row, 'gstin')}</td>
                        )}
                        {isVendorColumnVisible('pan') && (
                          <td>{renderVendorCell(row, 'pan')}</td>
                        )}
                        {isVendorColumnVisible('bank_account_number') && (
                          <td>{renderVendorCell(row, 'bank_account_number')}</td>
                        )}
                        {isVendorColumnVisible('bank_name') && (
                          <td>{renderVendorCell(row, 'bank_name')}</td>
                        )}
                        {isVendorColumnVisible('account_name') && (
                          <td>{renderVendorCell(row, 'account_name')}</td>
                        )}
                        {isVendorColumnVisible('ifsc_code') && (
                          <td>{renderVendorCell(row, 'ifsc_code')}</td>
                        )}
                        {isVendorColumnVisible('branch') && (
                          <td>{renderVendorCell(row, 'branch')}</td>
                        )}
                        {isVendorColumnVisible('actions') && (
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
                                disabled={saving}
                                aria-label={`Delete ${row.name}`}
                                title="Delete"
                              >
                                <TrashIcon />
                              </button>
                            </div>
                          </td>
                        )}
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

      {modalOpen && (
        <VendorModal
          vendor={editing}
          saving={saving}
          onClose={() => setModalOpen(false)}
          onSave={handleSave}
        />
      )}
    </div>
  )
}
