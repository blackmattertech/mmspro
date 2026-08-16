import { useEffect, useMemo, useState } from 'react'
import { useOrg } from '../../hooks/useOrg'
import { usePermissions } from '../../hooks/usePermissions'
import { useEmployees } from '../../hooks/useEmployees'
import { useLocations } from '../../hooks/useLocations'
import { useDepartments } from '../../hooks/useDepartments'
import { useRoles } from '../../hooks/useRoles'
import { useOrgLimits } from '../../hooks/useOrgLimits'
import { useLimitExceeded } from '../../hooks/useLimitExceeded'
import { isLimitError } from '../../lib/limitErrors'
import { deleteEmployeePhoto, uploadEmployeePhoto } from '../../lib/orgAssets'
import GooToggle from '../ui/GooToggle'
import TrashIcon from '../ui/TrashIcon'
import EditIcon from '../ui/EditIcon'
import EmployeeAvatar from './EmployeeAvatar'
import EmployeeModal from './EmployeeModal'
import LimitExceededCard from '../shared/LimitExceededCard'
import TablePagination from '../shared/TablePagination'
import TableColumnPicker from '../shared/TableColumnPicker'
import TableFilterToolbar from '../shared/TableFilterToolbar'
import { useTablePagination } from '../../hooks/useTablePagination'
import { useTableColumnPrefs } from '../../hooks/useTableColumnPrefs'
import { TABLE_SORT_OPTIONS, applyTableFilters } from '../../lib/tableFilters'
import { stopTableRowClick, tableRowClickProps } from '../../lib/clickableTableRow'
import RecordDetailModal from '../shared/RecordDetailModal'
import { EmployeeDetailContent } from './CompanyRecordDetails'
import {
  useMasterBulkUpload,
  MasterBulkActions,
  MasterBulkResult,
} from './MasterBulkUpload'
import { getEmployeesTemplate, bulkUploadEmployees } from '../../lib/api'
import '../shared/TableColumnPicker.css'
import '../shared/TableFilterToolbar.css'
import '../workorders/WorkOrdersPage.css'
import { formatPhoneDisplay } from '../shared/PhoneInput'
import { isLocationHeadEmployee } from '../../lib/employeeRoles'
import './CompanyShared.css'

const EMPLOYEE_FILTER_FIELDS = [
  { value: 'name', label: 'Name' },
  { value: 'emp_id', label: 'Emp ID' },
  { value: 'department', label: 'Department' },
  { value: 'location', label: 'Location' },
  { value: 'email', label: 'Email' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'manager', label: 'Manager' },
  { value: 'status', label: 'Status', placeholder: 'active or inactive' },
]

function employeeSearchHaystack(employee) {
  const emails = [
    employee.email,
    ...(employee.org_employee_emails || []).map((row) => row.email),
  ]
  const parts = [
    employee.emp_id,
    employee.name,
    employee.mobile,
    employee.mobile ? formatPhoneDisplay(employee.mobile) : '',
    ...emails,
    employee.departments?.name,
    employee.org_locations?.name,
    employee.manager?.name,
    employee.manager?.emp_id,
    employee.access_role?.name,
    isLocationHeadEmployee(employee) ? 'Location Head' : '',
    employee.is_active === false ? 'inactive' : 'active',
  ]
  return parts.filter(Boolean).join(' ').toLowerCase()
}

function canPickAnyLocation({ isOrgAdmin, accessRole }) {
  if (isOrgAdmin) return true
  const roleName = accessRole?.name?.trim().toLowerCase() || ''
  return roleName === 'admin'
}

export default function EmployeesTab({ canManage }) {
  const { org } = useOrg()
  const { isOrgAdmin, locationId: myLocationId, accessRole } = usePermissions()
  const canSelectAnyLocation = canPickAnyLocation({ isOrgAdmin, accessRole })
  const [search, setSearch] = useState('')
  const [filterField, setFilterField] = useState('')
  const [filterValue, setFilterValue] = useState('')
  const [sortBy, setSortBy] = useState('name_asc')

  const scopedLocationId = canSelectAnyLocation ? '' : (myLocationId || '')

  const { locations, create: createLocation, reload: reloadLocations, saving: savingLocation } = useLocations()
  const { departments, create: createDepartment, reload: reloadDepartments, saving: savingDepartment } = useDepartments()
  const { roles: accessRoles } = useRoles()
  const {
    employees,
    loading,
    saving,
    error,
    create,
    update,
    remove,
    toggleActive,
    reload,
  } = useEmployees({
    locationId: scopedLocationId,
  })

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
    downloadTemplate: getEmployeesTemplate,
    upload: bulkUploadEmployees,
    onSuccess: async () => {
      await reload?.({ silent: true })
      await reloadLimits()
    },
    defaultFilename: 'employees-template.xlsx',
  })

  const activeLocations = locations.filter((l) => l.is_active !== false)
  const activeDepartments = departments.filter((d) => d.is_active !== false)
  const nestedSaving = savingLocation || savingDepartment
  const defaultCreateLocationId = canSelectAnyLocation ? '' : (myLocationId || '')
  const lockCreateLocation = Boolean(defaultCreateLocationId)

  const filteredEmployees = useMemo(() => applyTableFilters(employees, {
    search,
    searchHaystack: employeeSearchHaystack,
    fieldFilter: { field: filterField, value: filterValue },
    fieldFilterGetters: {
      name: (employee) => employee.name,
      emp_id: (employee) => employee.emp_id,
      department: (employee) => employee.departments?.name,
      location: (employee) => employee.org_locations?.name,
      email: (employee) => [
        employee.email,
        ...(employee.org_employee_emails || []).map((row) => row.email),
      ].filter(Boolean).join(' '),
      mobile: (employee) => employee.mobile ? formatPhoneDisplay(employee.mobile) : employee.mobile,
      manager: (employee) => employee.manager?.name,
      status: (employee) => (employee.is_active === false ? 'inactive' : 'active'),
    },
    sortBy,
    getName: (employee) => employee.name,
    getCreatedAt: (employee) => employee.created_at,
  }), [employees, search, filterField, filterValue, sortBy])

  const activeCount = employees.filter((e) => e.is_active !== false).length
  const atEmployeeLimit = isResourceAtLimit('employees', 'employee_limit', activeCount)

  const paginationResetKey = `${search}|${filterField}|${filterValue}|${sortBy}`
  const pagination = useTablePagination(filteredEmployees.length, { resetKey: paginationResetKey })
  const pagedEmployees = pagination.paginate(filteredEmployees)
  const employeeColumnDefs = useMemo(() => {
    const cols = [
      { id: 'photo', label: 'Photo' },
      { id: 'emp_id', label: 'Emp ID' },
      { id: 'name', label: 'Employee Name' },
      { id: 'mobile', label: 'Mobile' },
      { id: 'email', label: 'Email(s)' },
      { id: 'department', label: 'Department' },
      { id: 'location', label: 'Location' },
      { id: 'manager', label: 'Manager' },
    ]
    if (canManage) {
      cols.push({ id: 'active', label: 'Active' })
      cols.push({ id: 'actions', label: 'Actions', locked: true })
    }
    return cols
  }, [canManage])
  const {
    isVisible: isEmployeeColumnVisible,
    toggleColumn: toggleEmployeeColumn,
    resetColumns: resetEmployeeColumns,
    columnDefs: employeePickerColumns,
    visibleColumnIds: employeeVisibleColumnIds,
  } = useTableColumnPrefs('company-employees', employeeColumnDefs)

  const refreshMasters = async () => {
    await Promise.all([reloadLocations(), reloadDepartments(), reloadLimits()])
  }

  const openCreate = () => {
    if (atEmployeeLimit) {
      triggerLimit('Employee')
      return
    }
    setEditing(null)
    setModalOpen(true)
  }

  const openView = (employee) => setViewing(employee)

  const openEdit = (employee) => {
    setEditing(employee)
    setModalOpen(true)
  }

  useEffect(() => {
    if (!viewing?.id) return
    const fresh = employees.find((row) => row.id === viewing.id)
    if (!fresh) return
    if (
      fresh.photo_url !== viewing.photo_url
      || fresh.photo_signed_url !== viewing.photo_signed_url
      || fresh.updated_at !== viewing.updated_at
      || fresh.name !== viewing.name
      || fresh.is_active !== viewing.is_active
    ) {
      setViewing(fresh)
    }
  }, [employees, viewing])

  const handleSave = async (payload, photoFile, { removePhoto = false } = {}) => {
    try {
      let saved
      if (editing) saved = await update(editing.id, payload)
      else saved = await create(payload)

      if (photoFile && org?.id) {
        const path = await uploadEmployeePhoto(org.id, saved.id, photoFile)
        saved = await update(saved.id, { photo_url: path })
      } else if (removePhoto && saved.photo_url) {
        try {
          await deleteEmployeePhoto(saved.photo_url)
        } catch {
          // Clear DB path even if storage delete fails (missing file, etc.)
        }
        saved = await update(saved.id, { photo_url: null })
      }

      await Promise.all([reloadLimits(), reloadDepartments()])
      setModalOpen(false)
      setEditing(null)
      if (viewing?.id && saved?.id === viewing.id) {
        setViewing(saved)
      }
    } catch (err) {
      if (tryHandleLimitError(err, 'Employee')) {
        setModalOpen(false)
        return
      }
      throw err
    }
  }

  const handleCreateLocation = async (payload) => {
    try {
      const created = await createLocation(payload)
      await refreshMasters()
      return created
    } catch (err) {
      tryHandleLimitError(err, 'Location')
      throw err
    }
  }

  const handleCreateDepartment = async (payload) => {
    try {
      const created = await createDepartment(payload)
      await refreshMasters()
      return created
    } catch (err) {
      tryHandleLimitError(err, 'Department')
      throw err
    }
  }

  const handleDelete = async (employee) => {
    if (!window.confirm(`Delete employee "${employee.name}"?`)) return false
    await remove(employee.id)
    await reloadLimits()
    return true
  }

  const handleToggle = async (employee, isActive) => {
    setTogglingId(employee.id)
    try {
      await toggleActive(employee.id, isActive)
      await reloadLimits()
    } catch (err) {
      tryHandleLimitError(err, 'Employee')
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
            placeholder: 'Search employees...',
            ariaLabel: 'Search employees',
          }}
          filter={{
            fields: EMPLOYEE_FILTER_FIELDS,
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
              addLabel="+ Add Employee"
              onAdd={openCreate}
              title="Bulk upload employees"
              bulkError={bulkError}
              bulkResult={bulkResult}
              noun="employee"
            />
          )}
          columnPicker={(
            <TableColumnPicker
              columnDefs={employeePickerColumns}
              visibleColumnIds={employeeVisibleColumnIds}
              onToggle={toggleEmployeeColumn}
              onReset={resetEmployeeColumns}
            />
          )}
        />
      </div>

      {showPlainError && <div className="company-alert">{error}</div>}
      {bulkError && <div className="company-error">{bulkError}</div>}
      <MasterBulkResult result={bulkResult} noun="employee" />

      {loading ? (
        <div className="company-loading">Loading employees...</div>
      ) : employees.length === 0 ? (
        <div className="company-empty">No employees yet. Add your first team member.</div>
      ) : filteredEmployees.length === 0 ? (
        <div className="company-empty">No employees match your search.</div>
      ) : (
        <>
        <div className="company-table-wrap">
          <div className="company-table-scroll">
            <table className="company-table master-table">
              <thead>
                <tr>
                  {isEmployeeColumnVisible('photo') && <th className="company-table__cell--photo">Photo</th>}
                  {isEmployeeColumnVisible('emp_id') && <th>Emp ID</th>}
                  {isEmployeeColumnVisible('name') && <th>Employee Name</th>}
                  {isEmployeeColumnVisible('mobile') && <th>Mobile</th>}
                  {isEmployeeColumnVisible('email') && <th>Email(s)</th>}
                  {isEmployeeColumnVisible('department') && <th>Department</th>}
                  {isEmployeeColumnVisible('location') && <th>Location</th>}
                  {isEmployeeColumnVisible('manager') && <th className="company-table__cell--manager">Manager</th>}
                  {canManage && isEmployeeColumnVisible('active') && <th>Active</th>}
                  {canManage && isEmployeeColumnVisible('actions') && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {pagedEmployees.map((employee) => {
                  const isActive = employee.is_active !== false
                  const showLocationHead = isLocationHeadEmployee(employee)
                  return (
                    <tr
                      key={employee.id}
                      {...tableRowClickProps({
                        onOpen: () => openView(employee),
                        label: `View ${employee.name}`,
                        className: !isActive ? 'company-table__row--inactive' : undefined,
                      })}
                    >
                      {isEmployeeColumnVisible('photo') && (
                        <td className="company-table__cell--photo">
                          <div className="company-employee-photo-cell">
                            <EmployeeAvatar employee={employee} />
                            {showLocationHead && (
                              <div className="company-employee-photo__pills" aria-label="Employee roles">
                                <span className="company-badge company-badge--location-head">
                                  Location Head
                                </span>
                              </div>
                            )}
                          </div>
                        </td>
                      )}
                      {isEmployeeColumnVisible('emp_id') && (
                        <td><code className="company-code">{employee.emp_id}</code></td>
                      )}
                      {isEmployeeColumnVisible('name') && (
                        <td><span className="company-table__name">{employee.name}</span></td>
                      )}
                      {isEmployeeColumnVisible('mobile') && (
                        <td className="company-table__cell--nowrap">
                          {employee.mobile ? formatPhoneDisplay(employee.mobile) : '—'}
                        </td>
                      )}
                      {isEmployeeColumnVisible('email') && (
                        <td>
                          <div className="company-employee-emails-cell">
                            {employee.email ? (
                              <span className="company-employee-emails-cell__primary">{employee.email}</span>
                            ) : (
                              '—'
                            )}
                            {(employee.org_employee_emails || []).map((row) => (
                              <span key={row.id} className="company-employee-emails-cell__extra">
                                {row.email}
                              </span>
                            ))}
                          </div>
                        </td>
                      )}
                      {isEmployeeColumnVisible('department') && (
                        <td>{employee.departments?.name || '—'}</td>
                      )}
                      {isEmployeeColumnVisible('location') && (
                        <td className="company-table__cell--truncate">
                          {employee.org_locations?.name || '—'}
                        </td>
                      )}
                      {isEmployeeColumnVisible('manager') && (
                        <td className="company-table__cell--manager">
                          {employee.manager ? (
                            <span className="company-employee-ref">
                              <EmployeeAvatar
                                size="sm"
                                employee={
                                  employees.find((e) => e.id === employee.manager.id) || employee.manager
                                }
                              />
                              <span className="company-employee-ref__name">{employee.manager.name}</span>
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                      )}
                      {canManage && isEmployeeColumnVisible('active') && (
                        <td onClick={stopTableRowClick}>
                          <GooToggle
                            checked={isActive}
                            disabled={togglingId === employee.id || saving}
                            onChange={(checked) => handleToggle(employee, checked)}
                            ariaLabel={`${isActive ? 'Disable' : 'Enable'} ${employee.name}`}
                          />
                        </td>
                      )}
                      {canManage && isEmployeeColumnVisible('actions') && (
                        <td onClick={stopTableRowClick}>
                          <div className="company-table__actions">
                            <button
                              type="button"
                              className="company-btn company-btn--secondary company-btn--compact company-btn--icon"
                              onClick={() => openEdit(employee)}
                              aria-label={`Edit ${employee.name}`}
                              title="Edit"
                            >
                              <EditIcon />
                            </button>
                            <button
                              type="button"
                              className="company-btn company-btn--danger company-btn--compact company-btn--icon"
                              onClick={() => handleDelete(employee)}
                              aria-label={`Delete ${employee.name}`}
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
        <TablePagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          pageSize={pagination.pageSize}
          pageSizeOptions={pagination.pageSizeOptions}
          totalCount={filteredEmployees.length}
          rangeStart={pagination.rangeStart}
          rangeEnd={pagination.rangeEnd}
          onPageChange={pagination.setPage}
          onPageSizeChange={pagination.setPageSize}
        />
        </>
      )}

      {viewing && (
        <RecordDetailModal
          variant="profile"
          title={viewing.name}
          subtitle={viewing.emp_id ? `ID ${viewing.emp_id}` : undefined}
          leading={<EmployeeAvatar employee={viewing} size="xl" className="company-employee-avatar--tile" />}
          status={(
            <span className={`company-badge${viewing.is_active !== false ? ' company-badge--success' : ''}`}>
              {viewing.is_active !== false ? 'Active' : 'Inactive'}
            </span>
          )}
          meta={(
            <div className="employee-detail__roles">
              {viewing.access_role?.name && (
                <>
                  <span>{viewing.access_role.name}</span>
                  <span className="employee-detail__roles-dot" aria-hidden="true">•</span>
                </>
              )}
              <span>Employee</span>
              {isLocationHeadEmployee(viewing) && (
                <>
                  <span className="employee-detail__roles-dot" aria-hidden="true">•</span>
                  <span>Location Head</span>
                </>
              )}
            </div>
          )}
          onClose={() => setViewing(null)}
          onEdit={canManage ? () => {
            openEdit(viewing)
          } : undefined}
          menuItems={canManage ? [{
            label: 'Delete employee',
            danger: true,
            onClick: async () => {
              const deleted = await handleDelete(viewing)
              if (deleted) setViewing(null)
            },
          }] : undefined}
        >
          <EmployeeDetailContent employee={viewing} employees={employees} />
        </RecordDetailModal>
      )}

      {modalOpen && (
        <EmployeeModal
          key={editing?.id ?? 'new'}
          employee={editing}
          employees={employees}
          locations={locations}
          departments={departments}
          accessRoles={accessRoles}
          saving={saving}
          nestedSaving={nestedSaving}
          defaultLocationId={defaultCreateLocationId}
          lockLocation={lockCreateLocation}
          onClose={() => setModalOpen(false)}
          onSave={handleSave}
          onCreateLocation={canSelectAnyLocation ? handleCreateLocation : undefined}
          onCreateDepartment={handleCreateDepartment}
          onLimitExceeded={tryHandleLimitError}
        />
      )}

      {limitVisible && (
        <LimitExceededCard resource={limitResource} onClose={dismissLimit} />
      )}
    </div>
  )
}
