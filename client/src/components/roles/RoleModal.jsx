import { useState, useEffect } from 'react'
import RolePermissionsTable from './RolePermissionsTable'
import { emptyPermissions } from '../../lib/accessModules'
import PageBack from '../shared/PageBack'
import '../company/CompanyShared.css'
import './RoleModal.css'

const EMPTY = {
  name: '',
  description: '',
}

export default function RoleModal({
  role,
  saving,
  onClose,
  onSave,
}) {
  const [form, setForm] = useState(EMPTY)
  const [permissions, setPermissions] = useState(emptyPermissions())
  const [error, setError] = useState(null)

  useEffect(() => {
    if (role) {
      setForm({
        name: role.name || '',
        description: role.description || '',
      })
      setPermissions(role.permissions || emptyPermissions())
    } else {
      setForm(EMPTY)
      setPermissions(emptyPermissions())
    }
  }, [role])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    if (!form.name.trim()) {
      setError('Role name is required')
      return
    }

    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        permissions,
      }
      if (!role) {
        // Access roles are org-wide; employees are limited by their own location.
        payload.location_id = null
      }
      await onSave(payload)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="company-panel role-editor role-modal">
      <div className="company-modal__header">
        <div className="modal__header-main">
          {onClose && <PageBack onClick={onClose} className="page-back--header" label="Roles & Access" />}
          <h2>{role ? 'Update Role' : 'Create Role'}</h2>
        </div>
        {onClose && (
          <button type="button" className="company-modal__close" onClick={onClose} aria-label="Close">×</button>
        )}
      </div>
      <form className="company-modal__form role-modal__form" onSubmit={handleSubmit}>
        <div className="role-modal__top">
          <label className="company-form__field">
            <span className="company-form__label">Role name</span>
            <input
              className="company-form__input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Supervisor"
              required
            />
          </label>

          <label className="company-form__field">
            <span className="company-form__label">Description</span>
            <textarea
              className="company-form__input company-form__input--textarea"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Optional description"
              rows={2}
            />
          </label>

          <p className="company-modal__hint">
            Roles apply to all locations. Assigned employees still only access their own location.
          </p>
        </div>

        <div className="role-modal__permissions">
          <h3 className="role-modal__permissions-title">Module access</h3>
          <RolePermissionsTable
            permissions={permissions}
            canEdit
            onChange={setPermissions}
          />
        </div>

        {error && <div className="company-alert">{error}</div>}

        <div className="company-modal__footer">
          <button type="button" className="company-btn company-btn--secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="company-btn company-btn--primary" disabled={saving}>
            {saving ? 'Saving...' : role ? 'Update Role' : 'Create Role'}
          </button>
        </div>
      </form>
    </div>
  )
}
