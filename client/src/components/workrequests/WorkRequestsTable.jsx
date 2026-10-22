import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useOrg } from '../../hooks/useOrg'
import { orgPath } from '../../config/navigation'
import { listWorkRequests, getWorkRequest } from '../../lib/api-work-requests'
import { useWorkOrderList } from '../../hooks/useWorkOrderList'
import { usePermissions } from '../../hooks/usePermissions'
import { useOpenQueryId } from '../../hooks/useOpenQueryId'
import { useOrgStatusOptions } from '../../hooks/useOrgStatusOptions'
import { TableColumnHead } from '../shared/ListTableChrome'
import RecordPdfButton from '../shared/RecordPdfButton'
import '../shared/ListTableChrome.css'
import WorkRequestDetailModal from './WorkRequestDetailModal'
import TablePagination from '../shared/TablePagination'
import StatusCountBar from '../shared/StatusCountBar'
import { colorByStatus } from '../../lib/statusCounts'
import { useTablePagination } from '../../hooks/useTablePagination'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { WORK_REQUEST_COLUMNS } from './workRequestColumns'
import { readCatalogText } from '../../lib/pickerFields'
import EmployeeAvatar from '../company/EmployeeAvatar'
import './WorkRequests.css'
import '../company/CompanyShared.css'
import '../shared/StatusCountBar.css'
import { VirtualTableBody } from '../shared/VirtualTableBody'

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function typeLabel(value) {
  const map = {
    inter_department: 'Inter',
    intra_department: 'Intra',
    user_self: 'Self',
    manual: 'Manual',
  }
  return map[value] || value || '—'
}

function wrNumberLabel(row) {
  if (row.request_number) return row.request_number
  if (row.status === 'draft') return 'Draft'
  return '—'
}

function statusLabel(status, labelByKey = null) {
  if (labelByKey?.[status]) return labelByKey[status]
  return (status || 'submitted').replace(/_/g, ' ')
}

function equipmentLabel(row) {
  if (row.equipment?.name) return row.equipment.name
  if (row.equipment?.code) return row.equipment.code
  const hierarchy = row.asset_hierarchy || []
  if (hierarchy.length) {
    const last = hierarchy[hierarchy.length - 1]
    return last?.value || '—'
  }
  return '—'
}

function requesterName(row) {
  return row.requester?.name || row.requester?.full_name || row.requester?.email || ''
}

function requesterMeta(row) {
  return [row.requester?.department_name || row.requester?.department?.name, row.requester?.role]
    .filter(Boolean)
    .join(' · ')
}

function RequesterCell({ row }) {
  const name = requesterName(row)
  if (!name) return '—'
  const meta = requesterMeta(row)
  return (
    <span className="wr-requester">
      <EmployeeAvatar employee={row.requester} size="sm" />
      <span className="wr-requester__copy">
        <span className="wr-requester__name">{name}</span>
        {meta && <span className="wr-requester__meta">{meta}</span>}
      </span>
    </span>
  )
}

function techniciansLabel(row) {
  const techs = row.assigned_technicians || []
  if (!techs.length) return '—'
  return techs.map((tech) => tech.name).join(', ')
}

const WorkRequestTableRow = memo(function WorkRequestTableRow({
  row,
  columns,
  statusLabels,
  orgSlug,
  selected,
  onSelect,
}) {
  return (
    <tr
      className={`wr-list-row${selected ? ' wr-list-row--active' : ''}`}
      onClick={() => onSelect(row.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(row.id)
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`View work request ${wrNumberLabel(row)}`}
    >
      {columns.map((columnId) => (
        <td key={columnId} className={COLUMN_CELL_CLASS[columnId] || 'wr-table__cell'}>
          {renderCell(row, columnId, statusLabels, orgSlug)}
        </td>
      ))}
    </tr>
  )
})

const COLUMN_CELL_CLASS = {
  wr_number: 'wr-table__cell wr-table__cell--id',
  type: 'wr-table__cell wr-table__cell--type',
  order_from: 'wr-table__cell wr-table__cell--dept',
  order_to: 'wr-table__cell wr-table__cell--dept',
  problem: 'wr-table__cell wr-table__cell--text',
  priority: 'wr-table__cell wr-table__cell--priority',
  status: 'wr-table__cell wr-table__cell--status',
  breakdown: 'wr-table__cell wr-table__cell--short',
  job_nature: 'wr-table__cell wr-table__cell--short',
  requester: 'wr-table__cell wr-table__cell--person',
  equipment: 'wr-table__cell wr-table__cell--dept',
  remarks: 'wr-table__cell wr-table__cell--text',
  assigned: 'wr-table__cell wr-table__cell--text',
  work_order: 'wr-table__cell wr-table__cell--short',
  request_date: 'wr-table__cell wr-table__cell--date',
}

function clampText(value, className = 'wr-table__clamp') {
  const text = value && value !== '—' ? value : '—'
  return (
    <span className={className} title={text !== '—' ? text : undefined}>
      {text}
    </span>
  )
}

function renderCell(row, columnId, statusLabels = null, orgSlug = '') {
  switch (columnId) {
    case 'wr_number':
      return (
        <span className="wr-table__id-cell">
          <span className="company-link wr-list-row__link wr-table__ellipsis" title={wrNumberLabel(row)}>
            {wrNumberLabel(row)}
          </span>
          {['completed', 'verified', 'closed'].includes(row.execution_status) && (
            <RecordPdfButton moduleKey="work_request" recordId={row.id} filename={`${wrNumberLabel(row)}.pdf`} />
          )}
        </span>
      )
    case 'type':
      return typeLabel(row.request_type)
    case 'order_from':
      return clampText(row.order_from?.name, 'wr-table__ellipsis')
    case 'order_to':
      return clampText(row.order_to?.name, 'wr-table__ellipsis')
    case 'problem':
      return clampText(row.short_description)
    case 'priority':
      return (
        <span style={{ textTransform: 'capitalize' }}>{row.priority}</span>
      )
    case 'status':
      return (
        <span className={`wo-status wo-status--${row.status}`}>
          {statusLabel(row.status, statusLabels)}
        </span>
      )
    case 'breakdown':
      return row.is_breakdown_label || (row.is_breakdown ? 'Yes' : 'No')
    case 'job_nature':
      return row.job_nature || row.job_nature_label || '—'
    case 'requester':
      return <RequesterCell row={row} />
    case 'equipment':
      return clampText(equipmentLabel(row), 'wr-table__ellipsis')
    case 'remarks':
      return clampText(row.remarks)
    case 'assigned':
      return clampText(techniciansLabel(row))
    case 'work_order': {
      const number = row.linked_work_order?.wo_number
      if (!row.manual_work_order_id || !number) return row.manual_work_order_id ? 'Linked' : '—'
      const href = orgSlug
        ? orgPath(orgSlug, `work-orders/received?open=${row.manual_work_order_id}`)
        : '#'
      return (
        <Link
          to={href}
          className="company-link"
          onClick={(event) => event.stopPropagation()}
        >
          {number}
        </Link>
      )
    }
    case 'request_date':
      return clampText(formatDate(row.request_date), 'wr-table__ellipsis')
    case 'problem_description':
      return clampText(row.problem_description)
    case 'execution_status':
      return clampText(row.execution_status)
    case 'created_at':
    case 'updated_at':
      return clampText(formatDate(row[columnId]), 'wr-table__ellipsis')
    default:
      return clampText(readCatalogText(row, { id: columnId }) || '—')
  }
}

const DEFAULT_VISIBLE = WORK_REQUEST_COLUMNS
  .filter((col) => col.defaultVisible !== false)
  .map((col) => col.id)

export default function WorkRequestsTable({
  filter,
  emptyHint,
  search = '',
  fieldFilter = { field: '', value: '' },
  sortBy = 'newest',
  columnFilters = {},
  setColumnFilter,
  headerSort = null,
  setHeaderSort,
  statusFilters = [],
  toggleStatus,
  visibleColumnIds = DEFAULT_VISIBLE,
  bulkReloadToken = 0,
}) {
  const location = useLocation()
  const { org } = useOrg()
  const [selectedId, setSelectedId, closeSelected] = useOpenQueryId()
  const { canUpdate, isProductEnabled } = usePermissions()
  const { statuses, labelByKey: statusLabels } = useOrgStatusOptions('work_request', { includeInactive: true })
  const statusColors = colorByStatus(statuses)
  const canApprove = filter === 'incoming' && isProductEnabled('work_orders') && (
    canUpdate('work_request_approve') || canUpdate('work_request_incoming')
  )

  const debouncedSearch = useDebouncedValue(search)
  const debouncedField = useDebouncedValue(`${fieldFilter?.field || ''}|${fieldFilter?.value || ''}`)
  const [listTotal, setListTotal] = useState(0)
  const mergedFilters = useMemo(() => {
    const next = { ...columnFilters }
    const [field, value] = debouncedField.split('|')
    if (field && value) next[field] = value
    return next
  }, [columnFilters, debouncedField])
  const paginationResetKey = `${debouncedSearch}|${JSON.stringify(mergedFilters)}|${sortBy}|${headerSort?.id || ''}|${headerSort?.dir || ''}|${statusFilters.join(',')}|${filter}`
  const pagination = useTablePagination(listTotal, { resetKey: paginationResetKey })
  const fetchList = useCallback(
    () => listWorkRequests(filter, {
      search: debouncedSearch,
      limit: pagination.pageSize,
      offset: pagination.offset,
      filters: mergedFilters,
      statuses: statusFilters,
      excludeStatuses: statusFilters.length ? [] : ['draft'],
      sort: headerSort?.id || '',
      sortDir: headerSort?.dir || '',
      sortBy: headerSort ? '' : sortBy,
    }),
    [
      filter,
      debouncedSearch,
      pagination.pageSize,
      pagination.offset,
      bulkReloadToken,
      mergedFilters,
      statusFilters,
      headerSort,
      sortBy,
    ],
  )
  const { orders: requests, total, statusCounts, loading, error, reload } = useWorkOrderList(fetchList)
  useEffect(() => { setListTotal(total) }, [total])

  const success = location.state?.success
  const pagedRows = requests
  const filtered = requests

  const columns = visibleColumnIds?.length ? visibleColumnIds : DEFAULT_VISIBLE

  if (loading) {
    return <div className="company-loading">Loading...</div>
  }

  return (
    <>
      {success && (
        <div className="wo-alert wo-alert--success" role="status">{success}</div>
      )}
      {error && <div className="wo-alert wo-alert--error" role="alert">{error}</div>}

      <StatusCountBar
        counts={statusCounts}
        statuses={statuses}
        labelByKey={statusLabels}
        colorByKey={statusColors}
        ariaLabel="Work request status counts"
        selectedKeys={statusFilters}
        onToggle={toggleStatus}
      />

      {!filtered.length ? (
        <div className="company-empty">
          <p>
            {(debouncedSearch || Object.keys(mergedFilters).length || statusFilters.length)
              ? 'No work requests match your search or filters.'
              : (emptyHint || 'No work requests yet.')}
          </p>
        </div>
      ) : (
        <>
        <div className="company-table-wrap wr-table-wrap">
          <div className="company-table-scroll">
            <table className="company-table master-table wr-table">
              <thead>
                <tr>
                  {columns.map((columnId) => {
                    const col = WORK_REQUEST_COLUMNS.find((item) => item.id === columnId)
                    return (
                      <TableColumnHead
                        key={columnId}
                        columnId={columnId}
                        label={col?.label || columnId}
                        className={COLUMN_CELL_CLASS[columnId] || 'wr-table__cell'}
                        sort={headerSort}
                        onSort={setHeaderSort}
                        filterValue={columnFilters[columnId] || ''}
                        onFilter={setColumnFilter}
                      />
                    )
                  })}
                </tr>
              </thead>
              <VirtualTableBody
                items={pagedRows}
                renderRow={(row) => (
                  <WorkRequestTableRow
                    key={row.id}
                    row={row}
                    columns={columns}
                    statusLabels={statusLabels}
                    orgSlug={org?.slug}
                    selected={selectedId === row.id}
                    onSelect={setSelectedId}
                  />
                )}
              />
            </table>
          </div>
        </div>
        <TablePagination {...pagination} />
        </>
      )}

      {selectedId && (
        <WorkRequestDetailModal
          requestId={selectedId}
          fetchWorkRequest={getWorkRequest}
          canApprove={canApprove}
          onClose={closeSelected}
          onUpdated={() => reload({ silent: true })}
        />
      )}
    </>
  )
}
