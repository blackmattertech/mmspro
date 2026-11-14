import { useEffect, useMemo, useState } from 'react'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { useUoms } from '../../hooks/useUoms'
import { useConfirmDelete } from '../../hooks/useConfirmDelete'
import { useTablePagination } from '../../hooks/useTablePagination'
import {
  bulkUploadUoms,
  downloadBlobFile,
  exportUoms,
  getUomsTemplate,
} from '../../lib/api'
import {
  ACTIVE_STATUS_FILTER,
  TABLE_SORT_OPTIONS,
  compactFilters,
  selectFilterField,
  uniqueNameOptions,
} from '../../lib/tableFilters'
import TablePagination from '../shared/TablePagination'
import TableFilterToolbar from '../shared/TableFilterToolbar'
import TableEmptyRow from '../shared/TableEmptyRow'
import { ExportCsvButton } from '../shared/ListTableChrome'
import GooToggle from '../ui/GooToggle'
import TrashIcon from '../ui/TrashIcon'
import EditIcon from '../ui/EditIcon'
import UomModal from './UomModal'
import { MasterBulkActions, MasterBulkResult, useMasterBulkUpload } from './MasterBulkUpload'
import '../shared/ListTableChrome.css'
import '../shared/TableFilterToolbar.css'
import '../workorders/WorkOrdersPage.css'
import './CompanyShared.css'

const UOM_SORT_OPTIONS = [
  { value: 'code_asc', label: 'Code A–Z' },
  { value: 'code_desc', label: 'Code Z–A' },
  ...TABLE_SORT_OPTIONS,
]

function uomListSort(sortBy) {
  switch (sortBy) {
    case 'code_desc':
      return { sort: 'code', sortDir: 'desc' }
    case 'name_asc':
      return { sort: 'name', sortDir: 'asc' }
    case 'name_desc':
      return { sort: 'name', sortDir: 'desc' }
    case 'newest':
      return { sort: 'created_at', sortDir: 'desc' }
    case 'oldest':
      return { sort: 'created_at', sortDir: 'asc' }
    default:
      return { sort: 'code', sortDir: 'asc' }
  }
}

export default function UomsTab({ canManage }) {
  const { requestDelete, deleteModal } = useConfirmDelete()
  const [search, setSearch] = useState('')
  const [columnFilters, setColumnFilters] = useState({})
  const [sortBy, setSortBy] = useState('code_asc')
  const [exporting, setExporting] = useState(false)
  const debouncedSearch = useDebouncedValue(search.trim())
  const listFilters = useMemo(() => compactFilters(columnFilters), [columnFilters])
  const listSort = useMemo(() => uomListSort(sortBy), [sortBy])
  const [listTotal, setListTotal] = useState(0)
  const pagination = useTablePagination(listTotal, {
    resetKey: `${debouncedSearch}|${JSON.stringify(listFilters)}|${sortBy}`,
  })
  const {
    uoms,
    total,
    loading,
    saving,
    error,
    create,
    update,
    remove,
    toggleActive,
    reload,
  } = useUoms({
    search: debouncedSearch,
    limit: pagination.pageSize,
    offset: pagination.offset,
    filters: listFilters,
    sort: listSort.sort,
    sortDir: listSort.sortDir,
  })
  const {
    bulkInputRef,
    bulkBusy,
    bulkError,
    bulkResult,
    handleDownloadTemplate,
    handleBulkFile,
  } = useMasterBulkUpload({
    downloadTemplate: getUomsTemplate,
    upload: bulkUploadUoms,
    onSuccess: async () => {
      await reload({ silent: true, force: true })
    },
    defaultFilename: 'uoms-template.xlsx',
  })
  const filterFields = useMemo(() => ([
    selectFilterField('code', 'Code', uniqueNameOptions(uoms, (row) => row.code), 'All codes'),
    selectFilterField('name', 'Name', uniqueNameOptions(uoms), 'All names'),
    ACTIVE_STATUS_FILTER,
  ]), [uoms])
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [togglingId, setTogglingId] = useState(null)

  useEffect(() => { setListTotal(total) }, [total])

  const openCreate = () => {
    setEditing(null)
    setModalOpen(true)
  }

  const openEdit = (row) => {
    setEditing(row)
    setModalOpen(true)
  }

  const handleSave = async (payload) => {
    if (editing) await update(editing.id, payload)
    else await create(payload)
    setModalOpen(false)
  }

  const handleDelete = async (row) => {
    const ok = await requestDelete({
      title: 'Delete UOM',
      message: `Delete ${row.code}? Existing records keep the unit already saved on them.`,
    })
    if (!ok) return
    await remove(row.id)
  }

  const handleToggle = async (row, checked) => {
    setTogglingId(row.id)
    try {
      await toggleActive(row.id, checked)
    } finally {
      setTogglingId(null)
    }
  }

  return (
    <div className="company-panel">
      <div className="company-panel__toolbar company-panel__toolbar--filters">
        <TableFilterToolbar
          search={{
            value: search,
            onChange: setSearch,
            placeholder: 'Search units…',
            ariaLabel: 'Search units of measure',
          }}
          filter={{
            fields: filterFields,
            values: columnFilters,
            onChange: setColumnFilters,
          }}
          sort={{ value: sortBy, onChange: setSortBy, options: UOM_SORT_OPTIONS }}
          actions={(
            <>
              <ExportCsvButton
                busy={exporting}
                onClick={async () => {
                  setExporting(true)
                  try {
                    const file = await exportUoms({
                      search: debouncedSearch,
                      filters: listFilters,
                      sort: listSort.sort,
                      sortDir: listSort.sortDir,
                    })
                    downloadBlobFile(file)
                  } finally {
                    setExporting(false)
                  }
                }}
              />
              {canManage && (
                <MasterBulkActions
                  onDownload={handleDownloadTemplate}
                  bulkBusy={bulkBusy}
                  bulkInputRef={bulkInputRef}
                  onFileChange={handleBulkFile}
                  addLabel="+ Add UOM"
                  onAdd={openCreate}
                  title="Import units"
                  bulkError={bulkError}
                  bulkResult={bulkResult}
                  noun="unit"
                />
              )}
            </>
          )}
        />
      </div>

      {error && <div className="company-alert" role="alert">{error}</div>}
      {bulkError && <div className="company-error">{bulkError}</div>}
      <MasterBulkResult result={bulkResult} noun="unit" />

      {loading ? (
        <div className="company-loading">Loading units…</div>
      ) : (
        <>
          <div className="company-table-wrap">
            <div className="company-table-scroll">
              <table className="company-table master-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    {canManage && <th>Active</th>}
                    {canManage && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {uoms.length === 0 ? (
                    <TableEmptyRow colSpan={canManage ? 4 : 2}>
                      {debouncedSearch
                        ? 'No units match your search.'
                        : 'No units yet. Add the units this company uses, such as NOS, KG, or MTR.'}
                    </TableEmptyRow>
                  ) : uoms.map((row) => {
                    const isActive = row.is_active !== false
                    return (
                      <tr key={row.id} className={!isActive ? 'company-table__row--inactive' : undefined}>
                        <td><code className="company-code">{row.code}</code></td>
                        <td><span className="company-table__name">{row.name}</span></td>
                        {canManage && (
                          <td>
                            <GooToggle
                              checked={isActive}
                              disabled={togglingId === row.id || saving}
                              onChange={(checked) => handleToggle(row, checked)}
                              ariaLabel={`${isActive ? 'Deactivate' : 'Activate'} ${row.code}`}
                            />
                          </td>
                        )}
                        {canManage && (
                          <td>
                            <button
                              type="button"
                              className="company-btn company-btn--secondary company-btn--compact company-btn--icon"
                              onClick={() => openEdit(row)}
                              aria-label={`Edit ${row.code}`}
                              title="Edit"
                            >
                              <EditIcon size={14} />
                            </button>
                            <button
                              type="button"
                              className="company-btn company-btn--danger company-btn--compact company-btn--icon"
                              onClick={() => handleDelete(row)}
                              disabled={saving}
                              aria-label={`Delete ${row.code}`}
                              title="Delete"
                            >
                              <TrashIcon size={14} />
                            </button>
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
            totalCount={total}
            rangeStart={pagination.rangeStart}
            rangeEnd={pagination.rangeEnd}
            onPageChange={pagination.onPageChange}
            onPageSizeChange={pagination.onPageSizeChange}
          />
        </>
      )}

      {modalOpen && (
        <UomModal
          uom={editing}
          saving={saving}
          onClose={() => setModalOpen(false)}
          onSave={handleSave}
        />
      )}
      {deleteModal}
    </div>
  )
}
