import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useOrg } from '../../hooks/useOrg'
import { usePermissions } from '../../hooks/usePermissions'
import { isCompanyAdmin, canManageOrg } from '../../lib/accountRoles'
import { orgPath } from '../../config/navigation'
import { checklistFormLabels } from '../../lib/checklistForms'
import {
  getChecklistTemplates,
  deleteChecklistTemplate,
} from '../../lib/api-pm'
import PageBack from '../../components/shared/PageBack'
import { ExportCsvButton } from '../../components/shared/ListTableChrome'
import { downloadClientCsv } from '../../lib/clientCsv'
import '../../components/shared/ListTableChrome.css'
import EditIcon from '../../components/ui/EditIcon'
import SettingsIcon from '../../components/ui/SettingsIcon'
import RecordPdfButton from '../../components/shared/RecordPdfButton'
import TrashIcon from '../../components/ui/TrashIcon'
import ChecklistModuleSettingsModal from '../../components/checklists/ChecklistModuleSettingsModal'
import '../../components/company/CompanyShared.css'
import './Others.css'
import { useConfirmDelete } from '../../hooks/useConfirmDelete'

export default function OthersChecklists() {
  const { requestDelete, deleteModal } = useConfirmDelete()
  const navigate = useNavigate()
  const { org } = useOrg()
  const { role } = useAuth()
  const { canCreate, canUpdate, canDelete } = usePermissions()
  const canManage = (
    isCompanyAdmin(role)
    || canManageOrg(role)
    || canCreate('others')
    || canUpdate('others')
    || canCreate('work_orders_scheduled')
    || canUpdate('work_orders_scheduled')
    || canCreate('work_orders')
    || canUpdate('work_orders')
  )
  const canRemove = (
    isCompanyAdmin(role)
    || canManageOrg(role)
    || canDelete('others')
    || canDelete('work_orders_scheduled')
    || canDelete('work_orders')
  )

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const backTo = org?.slug ? orgPath(org.slug, 'masters') : '#'

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
      ? `masters/checklists/${id}`
      : 'masters/checklists/new'))
  }

  const handleDelete = async (row) => {
    if (!(await requestDelete({ title: 'Delete checklist', message: `Delete checklist "${row.name}"?` }))) return
    try {
      await deleteChecklistTemplate(row.id)
      await reload()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="company-page others-page checklists-page">
      <header className="company-page__header">
        <PageBack to={backTo} label="Masters" />
        <div className="others-manage__header-row">
          <div>
            <h1 className="company-page__title">Checklists</h1>
            <p className="company-page__subtitle">
              Build reusable checklists, choose which modules they apply to, and use them on enabled forms.
            </p>
          </div>
          <div className="others-manage__actions">
            <ExportCsvButton
              onClick={() => downloadClientCsv('checklists.csv', rows, [
                { label: 'Name', value: (row) => row.name },
                { label: 'Forms', value: (row) => checklistFormLabels(row) },
                { label: 'Description', value: (row) => row.description },
                { label: 'Sections', value: (row) => row.section_count ?? 0 },
                { label: 'Fields', value: (row) => row.field_count ?? 0 },
                { label: 'Version', value: (row) => row.version },
                { label: 'Status', value: (row) => (row.is_active === false ? 'Inactive' : 'Active') },
              ])}
            />
            {canManage ? (
              <button
                type="button"
                className="company-btn company-btn--primary"
                onClick={() => openBuilder(null)}
              >
                + New checklist
              </button>
            ) : null}
            {canManage ? (
              <button
                type="button"
                className={`checklists-settings-btn${settingsOpen ? ' is-active' : ''}`}
                onClick={() => setSettingsOpen(true)}
                aria-label="Checklist module settings"
                aria-expanded={settingsOpen}
                title="Modules that can use checklist"
              >
                <SettingsIcon size={18} />
              </button>
            ) : null}
          </div>
        </div>
      </header>

      {error && <div className="company-alert">{error}</div>}

      {loading ? (
        <div className="company-loading">Loading checklists…</div>
      ) : (
        <div className="company-table-wrap checklists-page__table">
          <div className="company-table-scroll">
            <table className="company-table master-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Forms</th>
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
                    <td colSpan={8} className="task-meta-table__empty">
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
                    <td>{checklistFormLabels(row)}</td>
                    <td>{row.description || '—'}</td>
                    <td>{row.section_count ?? 0}</td>
                    <td>{row.field_count ?? 0}</td>
                    <td>v{row.version || 1}</td>
                    <td>{row.is_active === false ? 'Inactive' : 'Active'}</td>
                    {(canManage || canRemove) && (
                      <td>
                        <div className="company-table__actions">
                          <RecordPdfButton moduleKey="checklist" recordId={row.id} filename={`${row.name || 'checklist'}.pdf`} />
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
      {settingsOpen ? (
        <ChecklistModuleSettingsModal
          onClose={() => setSettingsOpen(false)}
          onSaved={() => setError(null)}
        />
      ) : null}
      {deleteModal}
    </div>
  )
}
