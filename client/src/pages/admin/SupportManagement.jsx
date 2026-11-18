import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { TICKET_STATUSES, formatDuration } from '../../../../shared/supportTickets.js'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { useTablePagination } from '../../hooks/useTablePagination'
import { useTableColumnPrefs } from '../../hooks/useTableColumnPrefs'
import { TABLE_SORT_OPTIONS, selectFilterField, uniqueNameOptions } from '../../lib/tableFilters'
import { stopTableRowClick, tableRowClickProps } from '../../lib/clickableTableRow'
import { downloadBlobFile } from '../../lib/api'
import {
  adminTicketSummary,
  exportAdminTickets,
  formatTicketWhen,
  listAdminTickets,
} from '../../lib/supportApi'
import TablePagination from '../../components/shared/TablePagination'
import TableEmptyRow from '../../components/shared/TableEmptyRow'
import TableColumnPicker from '../../components/shared/TableColumnPicker'
import TableFilterToolbar from '../../components/shared/TableFilterToolbar'
import { ExportCsvButton } from '../../components/shared/ListTableChrome'
import NavIcon from '../../components/layout/NavIcon'
import { PriorityPill, SlaPill, StatusPill } from '../../components/support/TicketPills'
import TruncatedText from '../../components/shared/TruncatedText'
import { plainTextFromRich } from '../../lib/richText'
import '../../components/company/CompanyShared.css'
import '../../components/shared/TableFilterToolbar.css'
import '../../components/shared/TableColumnPicker.css'
import '../../components/shared/ListTableChrome.css'
import '../../components/workorders/WorkOrdersPage.css'
import '../../components/workrequests/WorkRequests.css'
import '../../components/support/Support.css'
import './AdminPage.css'

const TICKET_COLUMNS = [
  { id: 'ticket_number', label: 'Ticket ID' },
  { id: 'company', label: 'Company' },
  { id: 'subject', label: 'Subject' },
  { id: 'description', label: 'Description', defaultVisible: false },
  { id: 'category', label: 'Category' },
  { id: 'priority', label: 'Priority' },
  { id: 'status', label: 'Status' },
  { id: 'related_module', label: 'Related Module' },
  { id: 'asset_ref', label: 'Impacted Asset ID' },
  { id: 'created_by_name', label: 'Requested By' },
  { id: 'assignee_name', label: 'Assigned To' },
  { id: 'sla', label: 'SLA Due' },
  { id: 'created_at', label: 'Created' },
  { id: 'updated_at', label: 'Last Updated' },
  { id: 'actions', label: 'Actions', locked: true },
]

const STATUS_TABS = [{ id: '', label: 'All' }, ...TICKET_STATUSES]

export default function SupportManagement() {
  const navigate = useNavigate()
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('newest')
  const [columnFilters, setColumnFilters] = useState({})
  const debouncedSearch = useDebouncedValue(search.trim(), 300)
  const [tickets, setTickets] = useState([])
  const [total, setTotal] = useState(0)
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  const resetKey = `${status}|${debouncedSearch}|${sortBy}|${JSON.stringify(columnFilters)}`
  const pagination = useTablePagination(total, { resetKey })

  const {
    visibleColumnIds,
    columnOrder,
    columnDefs,
    toggleColumn,
    resetColumns,
    reorderColumns,
    moveColumn,
    saveColumns,
    makeDefaultColumns,
    makingDefault,
  } = useTableColumnPrefs('admin-support-tickets', TICKET_COLUMNS)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [list, counts] = await Promise.all([
        listAdminTickets({
          status,
          search: debouncedSearch,
          limit: pagination.pageSize,
          offset: pagination.offset,
        }),
        adminTicketSummary(),
      ])
      setTickets(list.tickets || [])
      setTotal(list.total || 0)
      setSummary(counts)
    } catch (err) {
      setError(err.message || 'Could not load support tickets')
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, pagination.offset, pagination.pageSize, status])

  useEffect(() => { load() }, [load])

  const filterFields = useMemo(() => ([
    selectFilterField('category', 'Category', uniqueNameOptions(tickets, (row) => row.category), 'All categories'),
    selectFilterField('priority', 'Priority', uniqueNameOptions(tickets, (row) => row.priority), 'All priorities'),
    selectFilterField(
      'company',
      'Company',
      uniqueNameOptions(tickets, (row) => row.organizations?.name),
      'All companies',
    ),
    selectFilterField('related_module', 'Module', uniqueNameOptions(tickets, (row) => row.related_module), 'All modules'),
    selectFilterField('assignee_name', 'Assigned To', uniqueNameOptions(tickets, (row) => row.assignee_name), 'All assignees'),
  ]), [tickets])

  const filteredTickets = useMemo(() => {
    let rows = [...tickets]
    Object.entries(columnFilters).forEach(([key, value]) => {
      const needle = String(value || '').trim().toLowerCase()
      if (!needle) return
      rows = rows.filter((row) => {
        const haystack = key === 'company'
          ? row.organizations?.name
          : row[key]
        return String(haystack || '').toLowerCase() === needle
      })
    })
    rows.sort((a, b) => {
      if (sortBy === 'oldest') return new Date(a.created_at) - new Date(b.created_at)
      if (sortBy === 'name') return String(a.subject || '').localeCompare(String(b.subject || ''))
      return new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at)
    })
    return rows
  }, [columnFilters, sortBy, tickets])

  const average = summary?.avg_resolution_minutes
  const averageLabel = average == null ? '—' : formatDuration(average * 60 * 1000)
  const openTicket = (id) => navigate(`/admin/support/${id}`)

  const renderCell = (ticket, columnId) => {
    switch (columnId) {
      case 'ticket_number':
        return <code className="company-code">{ticket.ticket_number}</code>
      case 'company':
        return (
          <div>
            <div className="admin-table__name">{ticket.organizations?.name || '—'}</div>
            {ticket.organizations?.slug ? <div className="admin-table__slug">/{ticket.organizations.slug}</div> : null}
          </div>
        )
      case 'subject':
        return ticket.subject
      case 'description': {
        const text = plainTextFromRich(ticket.description) || '—'
        return <TruncatedText text={text}>{text}</TruncatedText>
      }
      case 'category':
        return ticket.category
      case 'priority':
        return <PriorityPill priority={ticket.priority} />
      case 'status':
        return <StatusPill status={ticket.status} />
      case 'related_module':
        return ticket.related_module || '—'
      case 'asset_ref':
        return ticket.asset_ref || '—'
      case 'created_by_name':
        return ticket.created_by_name || '—'
      case 'assignee_name':
        return ticket.assignee_name || 'Unassigned'
      case 'sla':
        return <SlaPill ticket={ticket} />
      case 'created_at':
        return formatTicketWhen(ticket.created_at)
      case 'updated_at':
        return formatTicketWhen(ticket.updated_at)
      case 'actions':
        return (
          <div className="company-table__actions" onClick={stopTableRowClick}>
            <button
              type="button"
              className="company-btn company-btn--secondary company-btn--compact company-btn--icon"
              onClick={() => openTicket(ticket.id)}
              aria-label={`View ${ticket.ticket_number}`}
              title="View"
            >
              <NavIcon name="view" />
            </button>
          </div>
        )
      default:
        return '—'
    }
  }

  return (
    <div className="admin-page">
      <header className="admin-page__header">
        <div>
          <h1 className="admin-page__title">Support Management</h1>
          <p className="admin-page__subtitle">Monitor and resolve support requests across organizations</p>
        </div>
        <Link to="/admin/support/sla" className="admin-page__create-btn">
          SLA policy
        </Link>
      </header>

      <div className="admin-page__content">
        {error && <div className="admin-alert">{error}</div>}

        <div className="admin-kpi-grid admin-kpi-grid--support">
          <div className="admin-kpi-card admin-kpi-card--primary">
            <span className="admin-kpi-card__label">Total tickets</span>
            <span className="admin-kpi-card__value">{summary?.total ?? '—'}</span>
          </div>
          <div className="admin-kpi-card admin-kpi-card--outlined">
            <span className="admin-kpi-card__label">Open</span>
            <span className="admin-kpi-card__value">{summary?.open ?? '—'}</span>
          </div>
          <div className="admin-kpi-card admin-kpi-card--outlined">
            <span className="admin-kpi-card__label">SLA at risk</span>
            <span className="admin-kpi-card__value">{summary?.sla_at_risk ?? '—'}</span>
          </div>
          <div className="admin-kpi-card admin-kpi-card--outlined">
            <span className="admin-kpi-card__label">Avg resolution</span>
            <span className="admin-kpi-card__value">{averageLabel}</span>
          </div>
        </div>

        <div className="admin-card">
          <div className="wr-page__toolbar" style={{ borderBottom: '1px solid var(--color-light-gray-1)' }}>
            <div className="wr-page__toolbar-row wr-page__toolbar-row--tabs">
              <nav className="wo-page__tabs" aria-label="Ticket status">
                {STATUS_TABS.map((tab) => (
                  <button
                    key={tab.id || 'all'}
                    type="button"
                    className={`wo-page__tab${status === tab.id ? ' wo-page__tab--active' : ''}`}
                    onClick={() => setStatus(tab.id)}
                  >
                    <span className="wo-page__tab-label">{tab.label}</span>
                    <span className="wo-page__tab-count">
                      {tab.id ? (summary?.[tab.id] ?? 0) : (summary?.total ?? 0)}
                    </span>
                  </button>
                ))}
              </nav>
            </div>
          </div>

          <div className="company-panel__toolbar company-panel__toolbar--filters" style={{ padding: '12px 16px' }}>
            <TableFilterToolbar
              search={{
                value: search,
                onChange: setSearch,
                placeholder: 'Search ticket, subject, category, or requester…',
                ariaLabel: 'Search tickets',
              }}
              filter={{
                fields: filterFields,
                values: columnFilters,
                onChange: setColumnFilters,
              }}
              sort={{ value: sortBy, onChange: setSortBy, options: TABLE_SORT_OPTIONS }}
              actions={(
                <ExportCsvButton
                  busy={exporting}
                  onClick={async () => {
                    setExporting(true)
                    try {
                      downloadBlobFile(await exportAdminTickets({ status, search: debouncedSearch }))
                    } finally {
                      setExporting(false)
                    }
                  }}
                />
              )}
              columnPicker={(
                <TableColumnPicker
                  columnDefs={columnDefs}
                  visibleColumnIds={visibleColumnIds}
                  columnOrder={columnOrder}
                  onToggle={toggleColumn}
                  onReset={resetColumns}
                  onReorder={reorderColumns}
                  onMove={moveColumn}
                  onSave={saveColumns}
                  onMakeDefault={makeDefaultColumns}
                  makingDefault={makingDefault}
                />
              )}
            />
          </div>

          <div className="company-table-wrap support-admin-table-wrap">
            <div className="company-table-scroll">
              <table className="company-table master-table">
                <thead>
                  <tr>
                    {visibleColumnIds.map((columnId) => {
                      const col = columnDefs.find((item) => item.id === columnId)
                      return <th key={columnId}>{col?.label || columnId}</th>
                    })}
                  </tr>
                </thead>
                <tbody>
                  {filteredTickets.length === 0 ? (
                    <TableEmptyRow colSpan={visibleColumnIds.length}>
                      {loading ? 'Loading tickets…' : 'No tickets in this view.'}
                    </TableEmptyRow>
                  ) : filteredTickets.map((ticket) => (
                    <tr
                      key={ticket.id}
                      className="company-table__row--clickable"
                      {...tableRowClickProps({
                        onOpen: () => openTicket(ticket.id),
                        label: `View ticket ${ticket.ticket_number}`,
                      })}
                    >
                      {visibleColumnIds.map((columnId) => (
                        <td key={columnId}>{renderCell(ticket, columnId)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <TablePagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            pageSize={pagination.pageSize}
            pageSizeOptions={pagination.pageSizeOptions}
            totalCount={total}
            rangeStart={pagination.rangeStart}
            rangeEnd={pagination.rangeEnd}
            onPageChange={pagination.onPageChange}
            onPageSizeChange={pagination.onPageSizeChange}
          />
        </div>
      </div>
    </div>
  )
}
