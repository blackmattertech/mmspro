import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { listWorkRequests, getWorkRequest } from '../../lib/api-work-requests'
import { useWorkOrderList } from '../../hooks/useWorkOrderList'
import { usePermissions } from '../../hooks/usePermissions'
import { useOpenQueryId } from '../../hooks/useOpenQueryId'
import { useOrgStatusOptions } from '../../hooks/useOrgStatusOptions'
import { applyWorkRequestFilters, sortWorkRequests } from '../../lib/workRequestFilters'
import WorkRequestDetailModal from './WorkRequestDetailModal'
import TablePagination from '../shared/TablePagination'
import { useTablePagination } from '../../hooks/useTablePagination'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { WORK_REQUEST_COLUMNS } from './workRequestColumns'
import EmployeeAvatar from '../company/EmployeeAvatar'
import './WorkRequests.css'
import '../company/CompanyShared.css'

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

function renderCell(row, columnId, statusLabels = null) {
  switch (columnId) {
    case 'wr_number':
      return (
        <span className="company-link wr-list-row__link wr-table__ellipsis" title={wrNumberLabel(row)}>
          {wrNumberLabel(row)}
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
    case 'work_order':
      return row.manual_work_order_id ? 'Linked' : '—'
    case 'request_date':
      return clampText(formatDate(row.request_date), 'wr-table__ellipsis')
    default:
      return '—'
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
  visibleColumnIds = DEFAULT_VISIBLE,
}) {
  const location = useLocation()
  const [selectedId, setSelectedId, closeSelected] = useOpenQueryId()
  const { canUpdate } = usePermissions()
  const { labelByKey: statusLabels } = useOrgStatusOptions('work_request', { includeInactive: true })
  const canApprove = filter === 'incoming' && (
    canUpdate('work_request_approve') || canUpdate('work_request_incoming')
  )

  const debouncedSearch = useDebouncedValue(search)
  const [listTotal, setListTotal] = useState(0)
  const paginationResetKey = `${debouncedSearch}|${fieldFilter?.field}|${fieldFilter?.value}|${sortBy}|${filter}`
  const pagination = useTablePagination(listTotal, { resetKey: paginationResetKey })
  const fetchList = useCallback(
    () => listWorkRequests(filter, {
      search: debouncedSearch,
      limit: pagination.pageSize,
      offset: pagination.offset,
    }),
    [filter, debouncedSearch, pagination.pageSize, pagination.offset],
  )
  const { orders: requests, total, loading, error, reload } = useWorkOrderList(fetchList)
  useEffect(() => { setListTotal(total) }, [total])

  const success = location.state?.success

  const sorted = useMemo(
    () => sortWorkRequests(requests, sortBy),
    [requests, sortBy],
  )

  const filtered = useMemo(
    () => applyWorkRequestFilters(sorted, {
      search: '',
      fieldFilter,
    }),
    [sorted, fieldFilter],
  )

  const pagedRows = filtered

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

      {!filtered.length ? (
        <div className="company-empty">
          <p>
            {sorted.length
              ? 'No work requests match your search or filters.'
              : (emptyHint || 'No work requests yet.')}
          </p>
        </div>
      ) : (
        <>
        <div className="company-table-wrap wr-table-wrap">
          <table className="company-table master-table wr-table">
            <thead>
              <tr>
                {columns.map((columnId) => {
                  const col = WORK_REQUEST_COLUMNS.find((item) => item.id === columnId)
                  return (
                    <th key={columnId} className={COLUMN_CELL_CLASS[columnId] || 'wr-table__cell'}>
                      {col?.label || columnId}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((row) => (
                <tr
                  key={row.id}
                  className={`wr-list-row${selectedId === row.id ? ' wr-list-row--active' : ''}`}
                  onClick={() => setSelectedId(row.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setSelectedId(row.id)
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`View work request ${wrNumberLabel(row)}`}
                >
                  {columns.map((columnId) => (
                    <td key={columnId} className={COLUMN_CELL_CLASS[columnId] || 'wr-table__cell'}>
                      {renderCell(row, columnId, statusLabels)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
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
