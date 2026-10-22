import { memo, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useOrg } from '../../hooks/useOrg'
import { orgPath } from '../../config/navigation'
import { useCatalogFields } from '../../hooks/useCatalogFields'
import { canonicalLabel, readCatalogText } from '../../lib/pickerFields'
import { formatWorkOrderDate } from '../../lib/workOrderTableUtils'
import { stopTableRowClick, tableRowClickProps } from '../../lib/clickableTableRow'
import { useTablePagination } from '../../hooks/useTablePagination'
import { useTableColumnPrefs } from '../../hooks/useTableColumnPrefs'
import { useOrgStatusOptions } from '../../hooks/useOrgStatusOptions'
import TablePagination from '../shared/TablePagination'
import TableColumnPicker from '../shared/TableColumnPicker'
import AssignedToCell from './AssignedToCell'
import EditIcon from '../ui/EditIcon'
import TrashIcon from '../ui/TrashIcon'
import StatusCountBar from '../shared/StatusCountBar'
import { TableColumnHead } from '../shared/ListTableChrome'
import RecordPdfButton from '../shared/RecordPdfButton'
import { ColumnPickerPortal } from '../shared/ColumnPickerSlot'
import { VirtualTableBody } from '../shared/VirtualTableBody'
import '../shared/ListTableChrome.css'
import { progressPercentForStatus } from '../../lib/statusProgress'
import { colorByStatus, tallyStatusCounts } from '../../lib/statusCounts'
import '../shared/TableColumnPicker.css'
import '../shared/StatusCountBar.css'

export const WORK_ORDER_COLUMN_CONFIG = {
  wo_number: { label: 'WO #', className: '' },
  summary: { label: 'Short description', className: 'wo-table__summary' },
  assignees: { label: 'Assigned to', className: 'wo-table__assignees' },
  assigned_with: { label: 'Assigned to', className: 'wo-table__assignees' },
  creator: { label: 'Created by', className: 'wo-table__creator' },
  created_at: { label: 'Created', className: '' },
  received_at: { label: 'Received', className: '' },
  scheduled_at: { label: 'Scheduled', className: '' },
  status: { label: 'Status', className: '' },
  progress: { label: 'Progress %', className: 'wo-table__progress' },
  work_request: { label: 'Work request', className: '' },
  priority: { label: 'Priority', className: '' },
  work_center: { label: 'Work center', className: '' },
}

const COLUMN_CONFIG = WORK_ORDER_COLUMN_CONFIG

const EXTRA_COLUMNS = [
  { id: 'creator', label: 'Created by' },
  { id: 'received_at', label: 'Received' },
  { id: 'scheduled_at', label: 'Scheduled' },
  { id: 'updated_at', label: 'Updated' },
  { id: 'work_center', label: 'Work center' },
  { id: 'problem_description', label: 'Problem description' },
  { id: 'location', label: 'Location' },
  { id: 'department', label: 'Department' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'source_type', label: 'Source' },
  { id: 'job_nature', label: 'Job nature' },
  { id: 'special_instructions', label: 'Special instructions' },
  { id: 'job_description', label: 'Job description' },
  { id: 'permit', label: 'Work permits' },
  { id: 'planned_start_at', label: 'Planned start' },
  { id: 'planned_end_at', label: 'Planned end' },
]

const SOURCE_LABELS = {
  approved_work_request: 'Work request',
  preventive_maintenance: 'Preventive maintenance',
  manual: 'Manual',
  breakdown: 'Work request',
  user_self_request: 'User self request',
}

function hierarchyValue(order, name, fieldId) {
  const items = Array.isArray(order?.asset_hierarchy) ? order.asset_hierarchy : []
  if (fieldId) {
    const byId = items.find((item) => item.field_id === fieldId && String(item.value || '').trim())
    if (byId) return String(byId.value).trim()
  }
  const key = canonicalLabel(name)
  if (!key) return ''
  const byName = items.find((item) => canonicalLabel(item.field_name) === key && String(item.value || '').trim())
  return byName ? String(byName.value).trim() : ''
}

function equipmentLabel(order) {
  return hierarchyValue(order, 'Equipment') || hierarchyValue(order, 'Equipment Name')
}

function permitLabel(order) {
  const types = Array.isArray(order?.permit_types)
    ? order.permit_types.map((item) => String(item || '').trim()).filter(Boolean)
    : []
  const number = String(order?.permit_number || '').trim()
  if (types.length && number) return `${types.join(', ')} · ${number}`
  if (types.length) return types.join(', ')
  if (number) return number
  if (order?.permit_required) return 'Required'
  return ''
}

function sourceLabel(value) {
  if (!value) return ''
  return SOURCE_LABELS[value] || String(value).replace(/_/g, ' ')
}

function textCell(value) {
  const text = String(value || '').trim()
  if (!text) return '—'
  return (
    <span className="company-table__name" title={text}>
      {text}
    </span>
  )
}

function storedFieldText(order, fieldId) {
  const saved = String(order?.field_values?.[fieldId] || '').trim()
  if (saved) return saved
  const raw = order?.form_field_values?.[fieldId]
  if (typeof raw === 'string') return raw.trim()
  if (raw && typeof raw === 'object') return String(raw.value_text || raw.value || '').trim()
  return ''
}

const APPROVABLE_STATUSES = new Set(['assigned', 'returned_rework'])

const WorkOrderTableRow = memo(function WorkOrderTableRow({
  order,
  visibleColumnIds,
  renderCell,
  onView,
  onApprove,
  canApproveOrder,
  approvingId,
  canEdit,
  onEdit,
  canDelete,
  onDelete,
}) {
  return (
    <tr
      {...(onView ? tableRowClickProps({
        onOpen: () => onView(order.id),
        label: `View work order ${order.wo_number}`,
      }) : {})}
    >
      {visibleColumnIds.map((column) => (
        <td key={column} className={COLUMN_CONFIG[column]?.className}>
          {renderCell(order, column)}
        </td>
      ))}
      <td onClick={stopTableRowClick}>
        <div className="company-table__actions">
          {['completed', 'verified', 'closed'].includes(order.status) && (
            <RecordPdfButton
              moduleKey="work_order"
              recordId={order.id}
              filename={`${order.wo_number || 'work-order'}.pdf`}
            />
          )}
          {onApprove && (canApproveOrder
            ? canApproveOrder(order)
            : APPROVABLE_STATUSES.has(order.status)
          ) && (
            <button
              type="button"
              className="wo-table__approve"
              onClick={() => onApprove(order)}
              disabled={approvingId === order.id}
            >
              {approvingId === order.id ? 'Approving…' : 'Approve'}
            </button>
          )}
          {onView && (
            <button
              type="button"
              className="company-link"
              onClick={() => onView(order.id)}
            >
              View
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              className="company-btn company-btn--secondary company-btn--compact company-btn--icon"
              onClick={() => onEdit?.(order)}
              aria-label={`Edit ${order.wo_number}`}
              title="Edit"
            >
              <EditIcon />
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              className="company-btn company-btn--danger company-btn--compact company-btn--icon"
              onClick={() => onDelete?.(order)}
              aria-label={`Delete ${order.wo_number}`}
              title="Delete"
            >
              <TrashIcon />
            </button>
          )}
        </div>
      </td>
    </tr>
  )
})

export default function WorkOrdersTable({
  orders,
  totalCount,
  pagination: paginationProp,
  serverPaged = false,
  columns,
  tableId,
  emptyTitle,
  emptyHint,
  onView,
  statusCounts,
  onApprove,
  onEdit,
  onDelete,
  canApproveOrder,
  canEdit = false,
  canDelete = false,
  approvingId = null,
  paginationResetKey = '',
  headerSort = null,
  onHeaderSort,
  columnFilters = {},
  onColumnFilter,
  statusFilters = [],
  onToggleStatus,
}) {
  const { org } = useOrg()
  const formFields = useCatalogFields()

  const columnDefs = useMemo(() => {
    const included = new Set(columns)
    const defs = columns.map((id) => ({
      id,
      label: COLUMN_CONFIG[id]?.label || id,
    }))
    const usedLabels = new Set(defs.map((col) => canonicalLabel(col.label)))
    for (const extra of EXTRA_COLUMNS) {
      if (included.has(extra.id) || usedLabels.has(canonicalLabel(extra.label))) continue
      defs.push({ ...extra, defaultVisible: false })
      usedLabels.add(canonicalLabel(extra.label))
    }
    for (const field of formFields) {
      if (usedLabels.has(canonicalLabel(field.name))) continue
      defs.push({
        id: `field:${field.id}`,
        label: field.name,
        defaultVisible: false,
        fieldId: field.id,
        fieldName: field.name,
      })
      usedLabels.add(canonicalLabel(field.name))
    }
    return defs
  }, [columns, formFields])
  const labelById = useMemo(
    () => new Map(columnDefs.map((col) => [col.id, col.label])),
    [columnDefs],
  )
  const {
    visibleColumnIds,
    columnOrder,
    toggleColumn,
    resetColumns,
    reorderColumns,
    moveColumn,
  } = useTableColumnPrefs(tableId, columnDefs)
  const { statuses, labelByKey: statusLabels } = useOrgStatusOptions('work_order', { includeInactive: true })
  const statusColors = useMemo(() => colorByStatus(statuses), [statuses])
  const displayCounts = statusCounts?.length ? statusCounts : tallyStatusCounts(orders)

  const localPagination = useTablePagination(totalCount ?? orders.length, { resetKey: paginationResetKey })
  const pagination = paginationProp || localPagination
  const pagedOrders = serverPaged || paginationProp ? orders : pagination.paginate(orders)

  const renderCell = useCallback((order, column) => {
    switch (column) {
      case 'wo_number':
        return order.wo_number || '—'
      case 'summary': {
        const text = String(order.short_description || order.summary || '').trim()
        return (
          <span className="company-table__name" title={text || undefined}>
            {text || '—'}
          </span>
        )
      }
      case 'assignees':
      case 'assigned_with':
        return (
          <AssignedToCell
            assignees={order.assignees}
            assignedDepartment={order.assigned_department}
            assignedLocation={order.assigned_location}
          />
        )
      case 'creator':
        return order.creator?.display_name || order.creator?.email || '—'
      case 'created_at':
      case 'received_at':
        return formatWorkOrderDate(order.created_at)
      case 'scheduled_at':
        return formatWorkOrderDate(order.scheduled_at)
      case 'status':
        return (
          <span className={`wo-status wo-status--${order.status}`}>
            {statusLabels[order.status] || String(order.status || '').replace(/_/g, ' ')}
          </span>
        )
      case 'priority':
        return order.priority || hierarchyValue(order, 'Job Priority') || '—'
      case 'work_center':
        return textCell(order.work_center || hierarchyValue(order, 'Work Centers') || hierarchyValue(order, 'Work Center'))
      case 'problem_description':
        return textCell(order.problem_description)
      case 'location':
        return textCell(order.assigned_location?.name || hierarchyValue(order, 'Plant / Facility') || hierarchyValue(order, 'Plant/Facility'))
      case 'department':
        return textCell(order.assigned_department?.name)
      case 'equipment':
        return textCell(equipmentLabel(order))
      case 'source_type':
        return textCell(sourceLabel(order.source_type))
      case 'job_nature':
        return textCell(order.job_nature || hierarchyValue(order, 'Job Nature'))
      case 'special_instructions':
        return textCell(order.special_instructions)
      case 'job_description':
        return textCell(order.job_description)
      case 'permit':
        return textCell(permitLabel(order) || hierarchyValue(order, 'Work Permits'))
      case 'updated_at':
        return formatWorkOrderDate(order.updated_at)
      case 'planned_start_at':
        return formatWorkOrderDate(order.planned_start_at)
      case 'planned_end_at':
        return formatWorkOrderDate(order.planned_end_at)
      case 'work_request': {
        if (!order.work_request_id || !order.work_request_number) {
          return order.work_request_number || '—'
        }
        const href = org?.slug
          ? orgPath(org.slug, `work-request/all?open=${order.work_request_id}`)
          : '#'
        return (
          <Link to={href} className="company-link" onClick={stopTableRowClick}>
            {order.work_request_number}
          </Link>
        )
      }
      case 'progress': {
        const pct = Number.isFinite(Number(order.progress_percent))
          ? Number(order.progress_percent)
          : progressPercentForStatus(order.status, statuses)
        return (
          <div className="wo-progress" title={`${pct}%`}>
            <div className="wo-progress__track">
              <span className="wo-progress__fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="wo-progress__value">{pct}%</span>
          </div>
        )
      }
      default: {
        if (String(column).startsWith('field:')) {
          const meta = columnDefs.find((col) => col.id === column)
          const fieldId = meta?.fieldId || column.slice('field:'.length)
          return textCell(
            readCatalogText(order, meta || { id: column, fieldId })
            || storedFieldText(order, fieldId)
            || hierarchyValue(order, meta?.fieldName, fieldId),
          )
        }
        return '—'
      }
    }
  }, [statusLabels, statuses, org?.slug, columnDefs])

  const countBar = (
    <StatusCountBar
      counts={displayCounts}
      statuses={statuses}
      labelByKey={statusLabels}
      colorByKey={statusColors}
      ariaLabel="Work order status counts"
      selectedKeys={statusFilters}
      onToggle={onToggleStatus}
    />
  )

  const columnPicker = (
    <ColumnPickerPortal>
      <TableColumnPicker
        columnDefs={columnDefs}
        visibleColumnIds={visibleColumnIds}
        columnOrder={columnOrder}
        onToggle={toggleColumn}
        onReset={resetColumns}
        onReorder={reorderColumns}
        onMove={moveColumn}
      />
    </ColumnPickerPortal>
  )

  if (!orders.length) {
    return (
      <div>
        {columnPicker}
        {countBar}
        <div className="company-empty">
          <p>{emptyTitle}</p>
          {emptyHint && <p className="wo-page__empty-hint">{emptyHint}</p>}
        </div>
      </div>
    )
  }

  return (
    <div>
      {columnPicker}
      {countBar}
      <div className="company-table-wrap">
      <div className="company-table-scroll">
      <table className="company-table master-table">
        <thead>
          <tr>
            {visibleColumnIds.map((column) => (
              <TableColumnHead
                key={column}
                columnId={column}
                label={labelById.get(column) || COLUMN_CONFIG[column]?.label || column}
                sort={headerSort}
                onSort={onHeaderSort}
                filterValue={columnFilters[column] || ''}
                onFilter={onColumnFilter}
              />
            ))}
            <th>
              <div className="wo-table__actions-head">
                <span>Actions</span>
              </div>
            </th>
          </tr>
        </thead>
        <VirtualTableBody
          items={pagedOrders}
          renderRow={(order) => (
            <WorkOrderTableRow
              key={order.id}
              order={order}
              visibleColumnIds={visibleColumnIds}
              renderCell={renderCell}
              onView={onView}
              onApprove={onApprove}
              canApproveOrder={canApproveOrder}
              approvingId={approvingId}
              canEdit={canEdit}
              onEdit={onEdit}
              canDelete={canDelete}
              onDelete={onDelete}
            />
          )}
        />
      </table>
      <TablePagination {...pagination} />
      </div>
      </div>
    </div>
  )
}
