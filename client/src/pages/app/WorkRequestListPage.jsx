import { useCallback, useMemo, useState } from 'react'
import { useLocation, useOutletContext } from 'react-router-dom'
import { listWorkRequests, getWorkRequest } from '../../lib/api-work-requests'
import { useWorkOrderList } from '../../hooks/useWorkOrderList'
import { usePermissions } from '../../hooks/usePermissions'
import { applyWorkRequestFilters, sortWorkRequests } from '../../lib/workRequestFilters'
import WorkRequestDetailModal from '../../components/workrequests/WorkRequestDetailModal'
import TablePagination from '../../components/shared/TablePagination'
import { useTablePagination } from '../../hooks/useTablePagination'
import '../../components/workrequests/WorkRequests.css'
import '../../components/company/CompanyShared.css'

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

function statusLabel(status) {
  return (status || 'submitted').replace(/_/g, ' ')
}

export default function WorkRequestListPage({ filter, emptyHint }) {
  const location = useLocation()
  const [selectedId, setSelectedId] = useState(null)
  const { canUpdate } = usePermissions()
  const canApprove = filter === 'incoming' && canUpdate('work_request_incoming')

  const {
    search = '',
    statusFilter = 'all',
    priorityFilter = 'all',
    advancedRules = [],
    departments = [],
    sortBy = 'newest',
  } = useOutletContext() || {}

  const fetchList = useCallback(() => listWorkRequests(filter), [filter])
  const { orders: requests, loading, error, reload } = useWorkOrderList(fetchList)

  const success = location.state?.success

  const sorted = useMemo(
    () => sortWorkRequests(requests, sortBy),
    [requests, sortBy],
  )

  const filtered = useMemo(
    () => applyWorkRequestFilters(sorted, {
      search,
      statusFilter,
      priorityFilter,
      advancedRules,
      departments,
    }),
    [sorted, search, statusFilter, priorityFilter, advancedRules, departments],
  )

  const paginationResetKey = `${search}|${statusFilter}|${priorityFilter}|${sortBy}`
  const pagination = useTablePagination(filtered.length, { resetKey: paginationResetKey })
  const pagedRows = pagination.paginate(filtered)

  if (loading) {
    return <div className="company-loading">Loading...</div>
  }

  return (
    <>
      {success && (
        <div className="wo-alert wo-alert--success" role="status">{success}</div>
      )}
      {error && <div className="wo-alert wo-alert--error" role="alert">{error}</div>}

      <p className="wo-page__result-count">
        {filtered.length} request{filtered.length === 1 ? '' : 's'}
        {filtered.length !== sorted.length && (
          <span> (filtered from {sorted.length})</span>
        )}
      </p>

      {!filtered.length ? (
        <div className="company-empty">
          <p>
            {sorted.length
              ? 'No work requests match your search or filters.'
              : (emptyHint || 'No work requests yet.')}
          </p>
        </div>
      ) : (
        <div className="company-table-wrap">
          <table className="company-table">
            <thead>
              <tr>
                <th>WR #</th>
                <th>Type</th>
                <th>From</th>
                <th>To</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Requested</th>
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
                  <td>
                    <span className="company-link wr-list-row__link">
                      {wrNumberLabel(row)}
                    </span>
                  </td>
                  <td>{typeLabel(row.request_type)}</td>
                  <td>{row.order_from?.name || '—'}</td>
                  <td>{row.order_to?.name || '—'}</td>
                  <td style={{ textTransform: 'capitalize' }}>{row.priority}</td>
                  <td>
                    <span className={`wo-status wo-status--${row.status}`}>
                      {statusLabel(row.status)}
                    </span>
                  </td>
                  <td>{formatDate(row.request_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <TablePagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            pageSize={pagination.pageSize}
            pageSizeOptions={pagination.pageSizeOptions}
            totalCount={filtered.length}
            rangeStart={pagination.rangeStart}
            rangeEnd={pagination.rangeEnd}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
          />
        </div>
      )}

      {selectedId && (
        <WorkRequestDetailModal
          requestId={selectedId}
          fetchWorkRequest={getWorkRequest}
          canApprove={canApprove}
          onClose={() => setSelectedId(null)}
          onUpdated={() => reload({ silent: true })}
        />
      )}
    </>
  )
}
