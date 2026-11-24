import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useOrg } from '../../hooks/useOrg'
import { usePermissions } from '../../hooks/usePermissions'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { isCompanyAdmin, canManageOrg } from '../../lib/accountRoles'
import { orgPath } from '../../config/navigation'
import { CHECKLIST_FORMS, checklistFormLabels, formIdsFromChecklist } from '../../lib/checklistForms'
import {
  getChecklistTemplates,
  deleteChecklistTemplate,
} from '../../lib/api-pm'
import PageBack from '../../components/shared/PageBack'
import TableFilterToolbar from '../../components/shared/TableFilterToolbar'
import TableEmptyRow from '../../components/shared/TableEmptyRow'
import { DataColumnHead, ExportCsvButton, updateColumnFilter } from '../../components/shared/ListTableChrome'
import { downloadClientCsv } from '../../lib/clientCsv'
import {
  ACTIVE_STATUS_FILTER,
  TABLE_SORT_OPTIONS,
  applyTableFilters,
  compactFilters,
  selectFilterField,
  uniqueNameOptions,
} from '../../lib/tableFilters'
import EditIcon from '../../components/ui/EditIcon'
import SettingsIcon from '../../components/ui/SettingsIcon'
import RecordPdfButton from '../../components/shared/RecordPdfButton'
import TrashIcon from '../../components/ui/TrashIcon'
import DuplicateRowButton from '../../components/ui/DuplicateRowButton'
import { cloneNavState } from '../../lib/workRecordClone'
import ChecklistModuleSettingsModal from '../../components/checklists/ChecklistModuleSettingsModal'
import { useConfirmDelete } from '../../hooks/useConfirmDelete'
import '../../components/shared/ListTableChrome.css'
import '../../components/shared/TableFilterToolbar.css'
import '../../components/workorders/WorkOrdersPage.css'
import '../../components/company/CompanyShared.css'
import './Others.css'

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
  const [search, setSearch] = useState('')
  const [columnFilters, setColumnFilters] = useState({})
  const [sortBy, setSortBy] = useState('name_asc')
  const debouncedSearch = useDebouncedValue(search.trim())
  const listFilters = useMemo(() => compactFilters(columnFilters) || {}, [columnFilters])

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

  const filterFields = useMemo(() => ([
    selectFilterField(
      'forms',
      'Forms',
      CHECKLIST_FORMS.map((form) => ({ value: form.formId, label: form.label })),
      'All forms',
    ),
    ACTIVE_STATUS_FILTER,
  ]), [])

  const filteredRows = useMemo(() => {
    const query = debouncedSearch.toLowerCase()
    let list = rows
    if (query) {
      list = list.filter((row) => {
        const haystack = [
          row.name,
          row.description,
          checklistFormLabels(row),
        ].join(' ').toLowerCase()
        return haystack.includes(query)
      })
    }
    if (listFilters.forms) {
      const raw = String(listFilters.forms)
      const known = CHECKLIST_FORMS.some((form) => form.formId === raw)
      if (known) {
        list = list.filter((row) => formIdsFromChecklist(row).includes(raw))
      } else {
        const needle = raw.toLowerCase()
        list = list.filter((row) => checklistFormLabels(row).toLowerCase().includes(needle))
      }
    }
    if (listFilters.status === 'active') {
      list = list.filter((row) => row.is_active !== false)
    } else if (listFilters.status === 'inactive') {
      list = list.filter((row) => row.is_active === false)
    } else if (listFilters.status) {
      const needle = String(listFilters.status).toLowerCase()
      list = list.filter((row) => (row.is_active === false ? 'inactive' : 'active').includes(needle))
    }
    if (listFilters.name) {
      const needle = String(listFilters.name).toLowerCase()
      list = list.filter((row) => String(row.name || '').toLowerCase().includes(needle))
    }
    if (listFilters.description) {
      const needle = String(listFilters.description).toLowerCase()
      list = list.filter((row) => String(row.description || '').toLowerCase().includes(needle))
    }
    if (listFilters.sections) {
      const needle = String(listFilters.sections).toLowerCase()
      list = list.filter((row) => String(row.section_count ?? 0).includes(needle))
    }
    if (listFilters.fields) {
      const needle = String(listFilters.fields).toLowerCase()
      list = list.filter((row) => String(row.field_count ?? 0).includes(needle))
    }
    if (listFilters.version) {
      const needle = String(listFilters.version).toLowerCase()
      list = list.filter((row) => String(row.version || 1).includes(needle))
    }
    return applyTableFilters(list, {
      sortBy,
      getName: (row) => row.name,
      getCreatedAt: (row) => row.created_at || row.updated_at,
    })
  }, [rows, debouncedSearch, listFilters, sortBy])

  const openBuilder = (id) => {
    if (!org?.slug) return
    navigate(orgPath(org.slug, id
      ? `masters/checklists/${id}`
      : 'masters/checklists/new'))
  }

  const handleDuplicate = (row) => {
    if (!org?.slug || !row?.id) return
    navigate(orgPath(org.slug, 'masters/checklists/new'), { state: cloneNavState(row.id) })
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
        <h1 className="company-page__title">Checklists</h1>
        <p className="company-page__subtitle">
          Build reusable checklists, choose which modules they apply to, and use them on enabled forms.
        </p>
      </header>

      <div className="company-page__content">
        <div className="company-panel">
          <div className="company-panel__toolbar company-panel__toolbar--filters">
            <TableFilterToolbar
              search={{
                value: search,
                onChange: setSearch,
                placeholder: 'Search checklist name, forms, description…',
                ariaLabel: 'Search checklists',
              }}
              filter={{
                fields: filterFields,
                values: columnFilters,
                onChange: setColumnFilters,
              }}
              sort={{ value: sortBy, onChange: setSortBy, options: TABLE_SORT_OPTIONS }}
              actions={(
                <>
                  <ExportCsvButton
                    onClick={() => downloadClientCsv('checklists.csv', filteredRows, [
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
                </>
              )}
            />
          </div>

          {error && <div className="company-alert">{error}</div>}

          {loading ? (
            <div className="company-loading">Loading checklists…</div>
          ) : (
            <div className="company-table-wrap checklists-page__table">
              <div className="company-table-scroll">
                <table className="company-table master-table">
                  <thead>
                    <tr>
                      <DataColumnHead columnId="name" label="Name" filters={columnFilters} onFilter={(id, value) => updateColumnFilter(setColumnFilters, id, value)} />
                      <DataColumnHead columnId="forms" label="Forms" filters={columnFilters} onFilter={(id, value) => updateColumnFilter(setColumnFilters, id, value)} />
                      <DataColumnHead columnId="description" label="Description" filters={columnFilters} onFilter={(id, value) => updateColumnFilter(setColumnFilters, id, value)} />
                      <DataColumnHead columnId="sections" label="Sections" filters={columnFilters} onFilter={(id, value) => updateColumnFilter(setColumnFilters, id, value)} />
                      <DataColumnHead columnId="fields" label="Fields" filters={columnFilters} onFilter={(id, value) => updateColumnFilter(setColumnFilters, id, value)} />
                      <DataColumnHead columnId="version" label="Version" filters={columnFilters} onFilter={(id, value) => updateColumnFilter(setColumnFilters, id, value)} />
                      <DataColumnHead columnId="status" label="Status" filters={columnFilters} onFilter={(id, value) => updateColumnFilter(setColumnFilters, id, value)} />
                      {(canManage || canRemove) && <th>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.length === 0 ? (
                      <TableEmptyRow colSpan={(canManage || canRemove) ? 8 : 7}>
                        {rows.length === 0
                          ? 'No checklists yet. Create one to start building sections and fields.'
                          : 'No checklists match your search.'}
                      </TableEmptyRow>
                    ) : filteredRows.map((row) => (
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
                              {canManage && (
                                <DuplicateRowButton
                                  onClick={() => handleDuplicate(row)}
                                  label={`Duplicate ${row.name}`}
                                />
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
      </div>

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
