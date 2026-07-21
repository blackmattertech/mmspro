import { useState, useMemo, useEffect } from 'react'
import { useOrg } from '../../hooks/useOrg'
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
import { useTablePagination } from '../../hooks/useTablePagination'
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

export default function RolesAccess() {
  const { loading: orgLoading } = useOrg()
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
  const rolesPagination = useTablePagination(activeRoles.length)
  const pagedRoles = rolesPagination.paginate(activeRoles)

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
            <div className="company-panel__toolbar">
              <p className="company-panel__count">
                {activeRoles.length} role{activeRoles.length === 1 ? '' : 's'}
              </p>
              {canCreate && (
                <button
                  type="button"
                  className="company-btn company-btn--primary"
                  onClick={openCreate}
                  disabled={!canOpenCreate}
                >
                  + Create Role
                </button>
              )}
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
            ) : (
              <div className="company-table-wrap">
                <table className="company-table master-table">
                  <thead>
                    <tr>
                      <th>Role</th>
                      <th>Description</th>
                      <th>Employees</th>
                      <th>Actions</th>
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
                          <td>
                            <button
                              type="button"
                              className="company-link roles-table__name-btn"
                              onClick={() => handleSelectRole(role)}
                            >
                              <span className="company-table__name">{role.name}</span>
                            </button>
                          </td>
                          <td>{role.description || '—'}</td>
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
                  totalCount={activeRoles.length}
                  rangeStart={rolesPagination.rangeStart}
                  rangeEnd={rolesPagination.rangeEnd}
                  onPageChange={rolesPagination.setPage}
                  onPageSizeChange={rolesPagination.setPageSize}
                />
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
