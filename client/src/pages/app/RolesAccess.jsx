import { useState, useMemo, useEffect } from 'react'
import { useOrg } from '../../hooks/useOrg'
import { orgPath } from '../../config/navigation'
import PageBack from '../../components/shared/PageBack'
import { useRoles } from '../../hooks/useRoles'
import { useEmployees } from '../../hooks/useEmployees'
import { getRolesCapabilities } from '../../lib/api-roles'
import RoleModal from '../../components/roles/RoleModal'
import RolePermissionsTable from '../../components/roles/RolePermissionsTable'
import AssignEmployeesModal from '../../components/roles/AssignEmployeesModal'
import EmployeeAvatar from '../../components/company/EmployeeAvatar'
import TrashIcon from '../../components/ui/TrashIcon'
import EditIcon from '../../components/ui/EditIcon'
import TablePagination from '../../components/shared/TablePagination'
import TableColumnPicker from '../../components/shared/TableColumnPicker'
import TableFilterToolbar from '../../components/shared/TableFilterToolbar'
import { useTablePagination } from '../../hooks/useTablePagination'
import { useTableColumnPrefs } from '../../hooks/useTableColumnPrefs'
import { TABLE_SORT_OPTIONS, applyTableFilters } from '../../lib/tableFilters'
import '../../components/shared/TableColumnPicker.css'
import '../../components/shared/TableFilterToolbar.css'
import '../../components/workorders/WorkOrdersPage.css'
import '../../components/company/CompanyShared.css'
import './RolesAccess.css'

const EMPTY_CAPS = {
  is_org_admin: false,
  location_id: null,
  can_create: false,
  can_read: false,
  can_update: false,
  can_delete: false,
  can_assign: false,
}

const ROLE_FILTER_FIELDS = [
  { value: 'name', label: 'Name' },
  { value: 'description', label: 'Description' },
]

export default function RolesAccess() {
  const { org, loading: orgLoading } = useOrg()
  const [capability, setCapability] = useState(EMPTY_CAPS)
  const [capsLoading, setCapsLoading] = useState(true)

  const userLocationId = capability.location_id || ''
  const isOrgAdmin = capability.is_org_admin
  const {
    roles,
    loading,
    saving,
    error,
    create,
    update,
    remove,
    assignEmployees,
  } = useRoles()
  const { employees } = useEmployees({
    locationId: isOrgAdmin ? undefined : (userLocationId || undefined),
  })

  const [selectedId, setSelectedId] = useState(null)
  const [search, setSearch] = useState('')
  const [filterField, setFilterField] = useState('')
  const [filterValue, setFilterValue] = useState('')
  const [sortBy, setSortBy] = useState('name_asc')
  const [editorMode, setEditorMode] = useState(null)
  const [assignOpen, setAssignOpen] = useState(false)
  const [permDraft, setPermDraft] = useState(null)
  const [permSaving, setPermSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    setCapsLoading(true)
    getRolesCapabilities()
      .then((data) => {
        if (!cancelled) setCapability(data || EMPTY_CAPS)
      })
      .catch(() => {
        if (!cancelled) setCapability(EMPTY_CAPS)
      })
      .finally(() => {
        if (!cancelled) setCapsLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const activeRoles = useMemo(
    () => roles.filter((r) => r.is_active !== false),
    [roles],
  )

  const filteredRoles = useMemo(() => applyTableFilters(activeRoles, {
    search,
    searchHaystack: (role) => [role.name, role.description].filter(Boolean).join(' '),
    fieldFilter: { field: filterField, value: filterValue },
    fieldFilterGetters: {
      name: (role) => role.name,
      description: (role) => role.description,
    },
    sortBy,
    getName: (role) => role.name,
    getCreatedAt: (role) => role.created_at,
  }), [activeRoles, search, filterField, filterValue, sortBy])

  const rolesPagination = useTablePagination(filteredRoles.length, { resetKey: `${search}|${filterField}|${filterValue}|${sortBy}` })
  const pagedRoles = rolesPagination.paginate(filteredRoles)
  const roleColumnDefs = useMemo(() => ([
    { id: 'name', label: 'Role' },
    { id: 'description', label: 'Description' },
    { id: 'employees', label: 'Employees' },
    { id: 'actions', label: 'Actions', locked: true },
  ]), [])
  const {
    isVisible: isRoleColumnVisible,
    toggleColumn: toggleRoleColumn,
    resetColumns: resetRoleColumns,
    columnDefs: rolePickerColumns,
    visibleColumnIds: roleVisibleColumnIds,
  } = useTableColumnPrefs('roles-access', roleColumnDefs)

  const selectedRole = useMemo(
    () => roles.find((r) => r.id === selectedId) || null,
    [roles, selectedId],
  )

  useEffect(() => {
    if (selectedId && !roles.some((role) => role.id === selectedId)) {
      setSelectedId(null)
      setPermDraft(null)
      if (editorMode === 'edit') setEditorMode(null)
    }
  }, [roles, selectedId, editorMode])

  const displayPermissions = permDraft ?? selectedRole?.permissions ?? []
  const canCreate = capability.can_create
  const canUpdate = capability.can_update
  const canDelete = capability.can_delete
  const canAssign = capability.can_assign
  const canManageAny = canCreate || canUpdate || canDelete || canAssign
  const canOpenCreate = canCreate
  const canShowEditor = (editorMode === 'create' && canCreate)
    || (editorMode === 'edit' && canUpdate)

  const openCreate = () => {
    if (!canOpenCreate) return
    setSelectedId(null)
    setPermDraft(null)
    setEditorMode('create')
  }

  const openEdit = (role) => {
    if (!canUpdate) return
    setSelectedId(role.id)
    setEditorMode('edit')
  }

  const editing = editorMode === 'edit' ? selectedRole : null
  const showEditor = editorMode === 'create' || editorMode === 'edit'
  const showRoleDetail = Boolean(selectedRole) && !showEditor

  const handleSaveRole = async (payload) => {
    if (editorMode === 'edit' && editing) {
      await update(editing.id, payload)
    } else {
      await create(payload)
    }
    setEditorMode(null)
    setSelectedId(null)
    setPermDraft(null)
  }

  const handleDelete = async (role) => {
    if (!window.confirm(`Delete role "${role.name}"? Assigned employees will lose this role.`)) return
    await remove(role.id)
    if (selectedId === role.id) {
      setSelectedId(null)
      setPermDraft(null)
    }
  }

  const handleSelectRole = (role) => {
    if (selectedId === role.id) {
      setSelectedId(null)
      setPermDraft(null)
      return
    }
    setSelectedId(role.id)
    setPermDraft(null)
  }

  const handleSavePermissions = async () => {
    if (!selectedRole || !permDraft) return
    setPermSaving(true)
    try {
      await update(selectedRole.id, { permissions: permDraft })
      setPermDraft(null)
    } finally {
      setPermSaving(false)
    }
  }

  const handleAssign = async (employeeIds) => {
    await assignEmployees(selectedRole.id, employeeIds)
    setAssignOpen(false)
  }

  if (orgLoading || capsLoading) {
    return (
      <div className="roles-page">
        <div className="company-loading">Loading...</div>
      </div>
    )
  }

  return (
    <div className="roles-page">
      <header className="roles-page__header">
        <div>
          <PageBack
            to={org?.slug ? orgPath(org.slug, 'dashboard') : '#'}
            label="Dashboard"
          />
          <h1 className="roles-page__title">Roles & Access</h1>
          <p className="roles-page__subtitle">
            Create roles, define module permissions, and assign them to employees
          </p>
        </div>
      </header>

      <div className="roles-page__content">
        {!capability.can_read && !canManageAny && (
          <p className="company-readonly-note">
            Only org admins, or employees assigned Roles & Access permission by an admin, can manage roles.
          </p>
        )}

        {error && <div className="company-alert">{error}</div>}

        {showEditor && canShowEditor && (
          <RoleModal
            key={editing?.id ?? 'new'}
            role={editing}
            saving={saving}
            onClose={() => setEditorMode(null)}
            onSave={handleSaveRole}
          />
        )}

        {!showEditor && (
          <div className="company-panel">
            <div className="company-panel__toolbar company-panel__toolbar--filters">
              <TableFilterToolbar
                search={{
                  value: search,
                  onChange: setSearch,
                  placeholder: 'Search roles...',
                  ariaLabel: 'Search roles',
                }}
                filter={{
                  fields: ROLE_FILTER_FIELDS,
                  field: filterField,
                  onFieldChange: setFilterField,
                  value: filterValue,
                  onValueChange: setFilterValue,
                }}
                sort={{ value: sortBy, onChange: setSortBy, options: TABLE_SORT_OPTIONS }}
                actions={canCreate && (
                  <button
                    type="button"
                    className="company-btn company-btn--primary"
                    onClick={openCreate}
                    disabled={!canOpenCreate}
                  >
                    + Create Role
                  </button>
                )}
                columnPicker={(
                  <TableColumnPicker
                    columnDefs={rolePickerColumns}
                    visibleColumnIds={roleVisibleColumnIds}
                    onToggle={toggleRoleColumn}
                    onReset={resetRoleColumns}
                  />
                )}
              />
            </div>

            {loading ? (
              <div className="company-loading">Loading roles...</div>
            ) : !capability.can_read && !canManageAny ? (
              <div className="company-empty">
                You do not have permission to view roles.
              </div>
            ) : activeRoles.length === 0 ? (
              <div className="company-empty">
                No roles yet. Create a role to define what each team member can access.
              </div>
            ) : filteredRoles.length === 0 ? (
              <div className="company-empty">No roles match your filters.</div>
            ) : (
              <div className="company-table-wrap">
                <div className="company-table-scroll">
                <table className="company-table master-table">
                  <thead>
                    <tr>
                      {isRoleColumnVisible('name') && <th>Role</th>}
                      {isRoleColumnVisible('description') && <th>Description</th>}
                      {isRoleColumnVisible('employees') && <th>Employees</th>}
                      {isRoleColumnVisible('actions') && <th>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRoles.map((role) => {
                      const isSelected = selectedId === role.id
                      const samples = role.sample_employees || []
                      const total = role.employee_count || 0
                      const extra = Math.max(0, total - samples.length)

                      return (
                        <tr
                          key={role.id}
                          className={isSelected ? 'company-table__row--selected' : undefined}
                        >
                          {isRoleColumnVisible('name') && (
                            <td>
                              <button
                                type="button"
                                className="company-link roles-table__name-btn"
                                onClick={() => handleSelectRole(role)}
                              >
                                <span className="company-table__name">{role.name}</span>
                              </button>
                            </td>
                          )}
                          {isRoleColumnVisible('description') && (
                            <td>{role.description || '—'}</td>
                          )}
                          {isRoleColumnVisible('employees') && (
                            <td>
                              {total === 0 ? (
                                <span className="roles-table__empty">—</span>
                              ) : (
                                <div className="roles-table__people">
                                  {samples.slice(0, 4).map((emp) => {
                                    const headedNames = (emp.headed_locations || [])
                                      .map((loc) => loc.name)
                                      .filter(Boolean)
                                    const locationLabel = headedNames.length
                                      ? headedNames.join(', ')
                                      : (emp.org_locations?.name || null)
                                    const tip = [emp.name || emp.emp_id, locationLabel].filter(Boolean).join(' · ')

                                    return (
                                      <div
                                        key={emp.id}
                                        className="roles-table__person"
                                        data-tooltip={tip}
                                      >
                                        <span className="roles-table__avatar">
                                          <EmployeeAvatar employee={emp} />
                                        </span>
                                      </div>
                                    )
                                  })}
                                  {extra > 0 && (
                                    <span
                                      className="roles-table__more"
                                      data-tooltip={`${extra} more employee${extra === 1 ? '' : 's'}`}
                                    >
                                      +{extra}
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>
                          )}
                          {isRoleColumnVisible('actions') && (
                            <td>
                              <div className="company-table__actions">
                                <button
                                  type="button"
                                  className="company-link"
                                  onClick={() => handleSelectRole(role)}
                                >
                                  {isSelected ? 'Hide access' : 'View access'}
                                </button>
                                {canAssign && (
                                  <button
                                    type="button"
                                    className="company-link"
                                    onClick={() => {
                                      setSelectedId(role.id)
                                      setAssignOpen(true)
                                    }}
                                  >
                                    Assign
                                  </button>
                                )}
                                {canUpdate && (
                                  <button
                                    type="button"
                                    className="company-btn company-btn--secondary company-btn--compact company-btn--icon"
                                    onClick={() => openEdit(role)}
                                    aria-label={`Edit ${role.name}`}
                                    title="Edit"
                                  >
                                    <EditIcon />
                                  </button>
                                )}
                                {canDelete && (
                                  <button
                                    type="button"
                                    className="company-btn company-btn--danger company-btn--compact company-btn--icon"
                                    onClick={() => handleDelete(role)}
                                    aria-label={`Delete ${role.name}`}
                                    title="Delete"
                                  >
                                    <TrashIcon />
                                  </button>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <TablePagination
                  page={rolesPagination.page}
                  totalPages={rolesPagination.totalPages}
                  pageSize={rolesPagination.pageSize}
                  pageSizeOptions={rolesPagination.pageSizeOptions}
                  totalCount={filteredRoles.length}
                  rangeStart={rolesPagination.rangeStart}
                  rangeEnd={rolesPagination.rangeEnd}
                  onPageChange={rolesPagination.setPage}
                  onPageSizeChange={rolesPagination.setPageSize}
                />
                </div>
              </div>
            )}
          </div>
        )}

        {showRoleDetail && (
          <div className="roles-detail company-panel">
            <div className="roles-detail__header">
              <div>
                <h2 className="roles-detail__title">{selectedRole.name}</h2>
                <p className="roles-detail__desc">
                  {selectedRole.name?.trim().toLowerCase() === 'location head'
                    ? (
                      (selectedRole.sample_employees || [])
                        .flatMap((emp) => (emp.headed_locations || []).map((loc) => loc.name))
                        .filter(Boolean)
                        .filter((name, index, arr) => arr.indexOf(name) === index)
                        .join(', ')
                      || 'Location heads are set per location'
                    )
                    : 'All locations'}
                </p>
                {selectedRole.description && (
                  <p className="roles-detail__desc">{selectedRole.description}</p>
                )}
              </div>
              {(canAssign || canUpdate || canDelete) && (
                <div className="roles-detail__actions">
                  {canAssign && (
                    <button
                      type="button"
                      className="company-btn company-btn--secondary"
                      onClick={() => setAssignOpen(true)}
                    >
                      Assign to Employees
                    </button>
                  )}
                  {canUpdate && (
                    <button
                      type="button"
                      className="company-btn company-btn--secondary company-btn--compact company-btn--icon"
                      onClick={() => openEdit(selectedRole)}
                      aria-label={`Edit ${selectedRole.name}`}
                      title="Edit"
                    >
                      <EditIcon />
                    </button>
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      className="company-btn company-btn--danger company-btn--compact company-btn--icon"
                      onClick={() => handleDelete(selectedRole)}
                      aria-label={`Delete ${selectedRole.name}`}
                      title="Delete"
                    >
                      <TrashIcon />
                    </button>
                  )}
                </div>
              )}
            </div>

            <RolePermissionsTable
              permissions={displayPermissions}
              canEdit={canUpdate}
              onChange={canUpdate ? setPermDraft : undefined}
            />

            {canUpdate && permDraft && (
              <div className="roles-detail__perm-footer">
                <button
                  type="button"
                  className="company-btn company-btn--secondary"
                  onClick={() => setPermDraft(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="company-btn company-btn--primary"
                  disabled={permSaving || saving}
                  onClick={handleSavePermissions}
                >
                  {permSaving ? 'Saving...' : 'Save Permissions'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {assignOpen && selectedRole && canAssign && (
        <AssignEmployeesModal
          role={selectedRole}
          employees={employees}
          saving={saving}
          onClose={() => setAssignOpen(false)}
          onSave={handleAssign}
        />
      )}
    </div>
  )
}
