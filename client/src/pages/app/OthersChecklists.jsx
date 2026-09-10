import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useOrg } from '../../hooks/useOrg'
import { usePermissions } from '../../hooks/usePermissions'
import { isCompanyAdmin, canManageOrg } from '../../lib/accountRoles'
import { orgPath } from '../../config/navigation'
import {
  getChecklistTemplates,
  deleteChecklistTemplate,
} from '../../lib/api-pm'
import PageBack from '../../components/shared/PageBack'
import EditIcon from '../../components/ui/EditIcon'
import TrashIcon from '../../components/ui/TrashIcon'
import '../../components/company/CompanyShared.css'
import './Others.css'

export default function OthersChecklists() {
  const navigate = useNavigate()
  const { org } = useOrg()
  const { role } = useAuth()
  const { canCreate, canUpdate, canDelete } = usePermissions()
  const canManage = (
    isCompanyAdmin(role)
    || canManageOrg(role)
    || canCreate('work_orders_scheduled')
    || canUpdate('work_orders_scheduled')
    || canCreate('work_orders')
    || canUpdate('work_orders')
  )
  const canRemove = (
    isCompanyAdmin(role)
    || canManageOrg(role)
    || canDelete('work_orders_scheduled')
    || canDelete('work_orders')
  )

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const backTo = org?.slug ? orgPath(org.slug, 'masters/others') : '#'

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getChecklistTemplates({ includeInactive: true })
      setRows(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message || 'Could not load checklists')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const openBuilder = (id) => {
    if (!org?.slug) return
    navigate(orgPath(org.slug, id
      ? `masters/others/checklists/${id}`
      : 'masters/others/checklists/new'))
  }

  const handleDelete = async (row) => {
    if (!window.confirm(`Delete checklist "${row.name}"?`)) return
    try {
      await deleteChecklistTemplate(row.id)
      await reload()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="company-page others-page">
      <header className="company-page__header">
        <PageBack to={backTo} label="Others" />
        <div className="others-manage__header-row">
          <div>
            <h1 className="company-page__title">Checklists</h1>
            <p className="company-page__subtitle">
              Create checklist templates with sections and field types for inspections and PM work.
            </p>
          </div>
          {canManage && (
            <button
              type="button"
              className="company-btn company-btn--primary"
              onClick={() => openBuilder(null)}
            >
              + New checklist
            </button>
          )}
        </div>
      </header>

      {!canManage && (
        <p className="company-readonly-note">
          You can view checklists. Contact a company admin to create or edit them.
        </p>
      )}

      {error && <div className="company-alert">{error}</div>}

      {loading ? (
        <div className="company-loading">Loading checklists…</div>
      ) : (
        <div className="company-table-wrap">
          <div className="company-table-scroll">
            <table className="company-table master-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Description</th>
                  <th>Sections</th>
                  <th>Fields</th>
                  <th>Version</th>
                  <th>Status</th>
                  {(canManage || canRemove) && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="task-meta-table__empty">
                      No checklists yet. Create one to start building sections and fields.
                    </td>
                  </tr>
                ) : rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <button
                        type="button"
                        className="company-link"
                        onClick={() => openBuilder(row.id)}
                      >
                        <span className="company-table__name">{row.name}</span>
                      </button>
                    </td>
                    <td>{row.description || '—'}</td>
                    <td>{row.section_count ?? 0}</td>
                    <td>{row.field_count ?? 0}</td>
                    <td>v{row.version || 1}</td>
                    <td>{row.is_active === false ? 'Inactive' : 'Active'}</td>
                    {(canManage || canRemove) && (
                      <td>
                        <div className="company-table__actions">
                          {canManage && (
                            <button
                              type="button"
                              className="company-btn company-btn--secondary company-btn--compact company-btn--icon"
                              onClick={() => openBuilder(row.id)}
                              aria-label={`Edit ${row.name}`}
                            >
                              <EditIcon />
                            </button>
                          )}
                          {canRemove && (
                            <button
                              type="button"
                              className="company-btn company-btn--danger company-btn--compact company-btn--icon"
                              onClick={() => handleDelete(row)}
                              aria-label={`Delete ${row.name}`}
                            >
                              <TrashIcon />
                            </button>
                          )}
                        </div>
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
  )
}
