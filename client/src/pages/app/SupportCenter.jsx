import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TICKET_STATUSES } from '../../../../shared/supportTickets.js'
import { orgPath } from '../../config/navigation'
import { useOrg } from '../../hooks/useOrg'
import { usePermissions } from '../../hooks/usePermissions'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { useTablePagination } from '../../hooks/useTablePagination'
import { useTableColumnPrefs } from '../../hooks/useTableColumnPrefs'
import { TABLE_SORT_OPTIONS, selectFilterField, uniqueNameOptions } from '../../lib/tableFilters'
import { stopTableRowClick, tableRowClickProps } from '../../lib/clickableTableRow'
import { downloadBlobFile } from '../../lib/api'
import {
  companyTicketSummary,
  createCompanyTicket,
  exportCompanyTickets,
  formatTicketWhen,
  listCompanyTickets,
  replyCompanyTicket,
} from '../../lib/supportApi'
import { uploadSupportFiles } from '../../lib/supportTicketAssets'
import PageBreadcrumbs from '../../components/shared/PageBreadcrumbs'
import TablePagination from '../../components/shared/TablePagination'
import TableEmptyRow from '../../components/shared/TableEmptyRow'
import TableColumnPicker from '../../components/shared/TableColumnPicker'
import TableFilterToolbar from '../../components/shared/TableFilterToolbar'
import { DataColumnHead, ExportCsvButton, updateColumnFilter } from '../../components/shared/ListTableChrome'
import NavIcon from '../../components/layout/NavIcon'
import DuplicateRowButton from '../../components/ui/DuplicateRowButton'
import { createNestedClone, prepareNestedCloneCreate } from '../../lib/nestedClone'
import CreateTicketModal from '../../components/support/CreateTicketModal'
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

const TICKET_COLUMNS = [
  { id: 'ticket_number', label: 'Ticket ID' },
  { id: 'subject', label: 'Subject' },
  { id: 'description', label: 'Description', defaultVisible: false },
  { id: 'category', label: 'Category' },
  { id: 'priority', label: 'Priority' },
  { id: 'status', label: 'Status' },
  { id: 'related_module', label: 'Related Module' },
  { id: 'asset_ref', label: 'Impacted Asset ID' },
  { id: 'created_by_name', label: 'Requested By' },
  { id: 'created_at', label: 'Created' },
  { id: 'updated_at', label: 'Last Updated' },
  { id: 'assignee_name', label: 'Assigned To' },
  { id: 'sla', label: 'SLA' },
  { id: 'actions', label: 'Actions', locked: true },
]

const STATUS_TABS = [{ id: '', label: 'All' }, ...TICKET_STATUSES]

export default function SupportCenter() {
  const navigate = useNavigate()
  const { org } = useOrg()
  const { canCreate } = usePermissions()
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
  const [creating, setCreating] = useState(false)
  const [ticketClone, setTicketClone] = useState(null)
  const [creatingBusy, setCreatingBusy] = useState(false)

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
  } = useTableColumnPrefs('support-tickets', TICKET_COLUMNS)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [list, counts] = await Promise.all([
        listCompanyTickets({
          status,
          search: debouncedSearch,
          limit: pagination.pageSize,
          offset: pagination.offset,
        }),
        companyTicketSummary(),
      ])
      setTickets(list.tickets || [])
      setTotal(list.total || 0)
      setSummary(counts)
    } catch (err) {
      setError(err.message || 'Could not load tickets')
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, pagination.offset, pagination.pageSize, status])

  useEffect(() => { load() }, [load])

  const filterFields = useMemo(() => ([
    selectFilterField('category', 'Category', uniqueNameOptions(tickets, (row) => row.category), 'All categories'),
    selectFilterField('priority', 'Priority', uniqueNameOptions(tickets, (row) => row.priority), 'All priorities'),
    selectFilterField('related_module', 'Module', uniqueNameOptions(tickets, (row) => row.related_module), 'All modules'),
    selectFilterField('created_by_name', 'Requested By', uniqueNameOptions(tickets, (row) => row.created_by_name), 'All requesters'),
    selectFilterField('assignee_name', 'Assigned To', uniqueNameOptions(tickets, (row) => row.assignee_name), 'All assignees'),
  ]), [tickets])

  const filteredTickets = useMemo(() => {
    let rows = [...tickets]
    Object.entries(columnFilters).forEach(([key, value]) => {
      const needle = String(value || '').trim().toLowerCase()
      if (!needle) return
      rows = rows.filter((row) => String(row[key] || '').toLowerCase().includes(needle))
    })
    rows.sort((a, b) => {
      if (sortBy === 'oldest') return new Date(a.created_at) - new Date(b.created_at)
      if (sortBy === 'name') return String(a.subject || '').localeCompare(String(b.subject || ''))
      return new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at)
    })
    return rows
  }, [columnFilters, sortBy, tickets])

  // Duplicate → prefilled create: ticket_number, status, SLA and attachments never carry over.
  const openDuplicate = (ticket) => {
    const next = createNestedClone('support_ticket', ticket)
    if (!next) return
    setTicketClone(next)
    setCreating(true)
  }

  const closeCreate = () => {
    setCreating(false)
    setTicketClone(null)
  }

  const openTicket = (id) => {
    if (!org?.slug || !id) return
    navigate(orgPath(org.slug, `support/${id}`))
  }

  const renderCell = (ticket, columnId) => {
    switch (columnId) {
      case 'ticket_number':
        return <code className="company-code">{ticket.ticket_number}</code>
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
      case 'created_at':
        return formatTicketWhen(ticket.created_at)
      case 'updated_at':
        return formatTicketWhen(ticket.updated_at)
      case 'assignee_name':
        return ticket.assignee_name || 'Unassigned'
      case 'sla':
        return <SlaPill ticket={ticket} />
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
            {canCreate('support_tickets') && (
              <DuplicateRowButton
                onClick={() => openDuplicate(ticket)}
                label={`Duplicate ${ticket.ticket_number}`}
              />
            )}
          </div>
        )
      default:
        return '—'
    }
  }

  return (
    <div className="company-page wo-page">
      <header className="wo-page__top">
        <div className="wo-page__intro">
          <PageBreadcrumbs />
          <h1 className="wo-page__title">Support Center</h1>
          <p className="wo-page__subtitle">
            Raise support requests, track progress, and reply to MMS PRO support.
          </p>
        </div>
      </header>

      <div className="wr-page__toolbar">
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
          {canCreate('support_tickets') && (
            <button
              type="button"
              className="wo-page__tab wr-page__create-tab"
              onClick={() => { setTicketClone(null); setCreating(true) }}
              aria-label="Create ticket"
              title="Create ticket"
            >
              <NavIcon name="addSquare" />
              <span className="wo-page__tab-label">Create Ticket</span>
            </button>
          )}
        </div>
      </div>

      <div className="company-page__content">
        <div className="company-panel">
          <div className="company-panel__toolbar company-panel__toolbar--filters">
            <TableFilterToolbar
              search={{
                value: search,
                onChange: setSearch,
                placeholder: 'Search ticket ID, subject, or category…',
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
                      downloadBlobFile(await exportCompanyTickets({ status, search: debouncedSearch }))
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

          {error && <div className="company-alert" role="alert">{error}</div>}

          <div className="company-table-wrap">
            <div className="company-table-scroll">
              <table className="company-table master-table">
                <thead>
                  <tr>
                    {visibleColumnIds.map((columnId) => {
                      if (columnId === 'actions') return <th key={columnId}>Actions</th>
                      const col = columnDefs.find((item) => item.id === columnId)
                      return (
                        <DataColumnHead
                          key={columnId}
                          columnId={columnId}
                          label={col?.label || columnId}
                          filters={columnFilters}
                          onFilter={(id, value) => updateColumnFilter(setColumnFilters, id, value)}
                        />
                      )
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

      {creating && (
        <CreateTicketModal
          saving={creatingBusy}
          cloneDraft={ticketClone?.draft || null}
          cloneSourceNumber={ticketClone?.source?.ticket_number || null}
          onClose={() => !creatingBusy && closeCreate()}
          onCreate={async ({ files = [], ...form }) => {
            const body = prepareNestedCloneCreate('support_ticket', ticketClone, form)
            setCreatingBusy(true)
            try {
              const created = await createCompanyTicket(body)
              if (files.length) {
                const attachments = await uploadSupportFiles(created.ticket.id, files)
                await replyCompanyTicket(created.ticket.id, '', attachments)
              }
              closeCreate()
              navigate(orgPath(org.slug, `support/${created.ticket.id}`))
            } finally {
              setCreatingBusy(false)
            }
          }}
        />
      )}
    </div>
  )
}
