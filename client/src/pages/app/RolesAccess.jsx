import { useState, useMemo, useEffect } from 'react'
import { useOrg } from '../../hooks/useOrg'
import { useRoles } from '../../hooks/useRoles'
import { useEmployees } from '../../hooks/useEmployees'
import { getRolesCapabilities } from '../../lib/api-roles'
import RoleModal from '../../components/roles/RoleModal'
import RolePermissionsTable from '../../components/roles/RolePermissionsTable'
import AssignEmployeesModal from '../../components/roles/AssignEmployeesModal'
import EmployeeAvatar from '../../components/company/EmployeeAvatar'
import '../../components/company/CompanyShared.css'
import './RolesAccess.css'

function LocationPinIcon() {
  return (
    <svg className="role-card__pin" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z"
      />
    </svg>
  )
}

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

    // Return to cards-only view after create/update
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
    // Toggle: click same card again to collapse the access table
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

        {!showEditor && (loading ? (
          <div className="company-loading">Loading roles...</div>
        ) : !capability.can_read && !canManageAny ? (
          <div className="company-panel">
            <div className="company-empty">
              You do not have permission to view roles.
            </div>
          </div>
        ) : activeRoles.length === 0 ? (
          <div className="company-panel">
            <div className="company-empty">
              No roles yet. Create a role to define what each team member can access.
            </div>
          </div>
        ) : (
          <div className="roles-grid">
            {activeRoles.map((role) => {
              const isSelected = selectedId === role.id
              const samples = role.sample_employees || []
              const total = role.employee_count || 0
              const extra = Math.max(0, total - samples.length)
              const locationLabel = 'All Locations'

              return (
                <button
                  key={role.id}
                  type="button"
                  className={`role-card ${isSelected ? 'role-card--selected' : ''}`}
                  onClick={() => handleSelectRole(role)}
                  aria-expanded={isSelected}
                  aria-label={`${role.name}, ${locationLabel}, ${total} employee${total === 1 ? '' : 's'}`}
                >
                  <div className="role-card__top">
                    <span className="role-card__name">{role.name}</span>
                  </div>
                  <div className="role-card__bottom">
                    <div className="role-card__location">
                      <LocationPinIcon />
                      <span>{locationLabel}</span>
                    </div>
                    <div className="role-card__avatars">
                      {samples.map((emp) => {
                        const tip = emp.name || emp.emp_id || 'Employee'
                        return (
                          <span
                            key={emp.id}
                            className="role-card__avatar"
                            data-tooltip={tip}
                            title={tip}
                          >
                            <EmployeeAvatar employee={emp} />
                          </span>
                        )
                      })}
                      {extra > 0 && (
                        <span className="role-card__more">+{extra}</span>
                      )}
                      {total === 0 && (
                        <span className="role-card__empty">No employees</span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        ))}

        {showRoleDetail && (
          <div className="roles-detail company-panel">
            <div className="roles-detail__header">
              <div>
                <h2 className="roles-detail__title">{selectedRole.name}</h2>
                <p className="roles-detail__desc">All locations</p>
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
                      className="company-btn company-btn--secondary"
                      onClick={() => openEdit(selectedRole)}
                    >
                      Update Role
                    </button>
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      className="company-link company-link--danger"
                      onClick={() => handleDelete(selectedRole)}
                    >
                      Delete
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
