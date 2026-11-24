import { useCallback, useMemo } from 'react'
import {
  formatScheduleSummary,
  pmPlanStatusLabel,
  pmPriorityLabel,
  scheduleTypeLabel,
  calendarUnitLabel,
  normalizeCalendarUnit,
} from '../../config/pm'
import AssignedToCell from '../workorders/AssignedToCell'
import DuplicateIcon from '../ui/DuplicateIcon'
import EditIcon from '../ui/EditIcon'
import TrashIcon from '../ui/TrashIcon'
import SaveAsTemplateButton from '../templates/SaveAsTemplateButton'
import { VirtualTableBody } from '../shared/VirtualTableBody'
import { TableColumnHead } from '../shared/ListTableChrome'
import { PM_PLAN_COLUMNS, PM_PLAN_DEFAULT_COLUMN_IDS } from './pmPlanColumns'
import { readCatalogText } from '../../lib/pickerFields'
import { formatCalendarDate } from '../../lib/displayDate'
import '../shared/ListTableChrome.css'

function formatDate(value) {
  if (!value) return '—'
  return formatCalendarDate(value) || '—'
}

function formatNumber(value) {
  if (value === '' || value == null) return '—'
  const num = Number(value)
  return Number.isFinite(num) ? String(num) : '—'
}

function equipmentLabel(plan) {
  const name = plan.equipment?.name
  const code = plan.equipment?.code
  if (code && name) return `${code} — ${name}`
  return name || code || '—'
}

function checklistLabel(plan) {
  const name = plan.checklist_template?.name
  if (!name) return '—'
  return plan.checklist_template?.version ? `${name} (v${plan.checklist_template.version})` : name
}

export default function PmPlansTable({
  plans,
  totalCount,
  visibleColumnIds: visibleColumnIdsProp,
  canAdd = false,
  canEdit = false,
  canRemove = false,
  canSaveTemplate = false,
  duplicatingId = null,
  onGenerate,
  onDuplicate,
  onEdit,
  onDelete,
  onOpen,
  headerSort = null,
  onHeaderSort,
  columnFilters = {},
  onColumnFilter,
}) {
  const visibleColumnIds = visibleColumnIdsProp?.length
    ? visibleColumnIdsProp
    : PM_PLAN_DEFAULT_COLUMN_IDS

  const renderCell = useCallback((plan, columnId) => {
    switch (columnId) {
      case 'plan_number':
        return plan.plan_number || '—'
      case 'name':
        return <span className="company-table__name">{plan.name || '—'}</span>
      case 'department':
        return plan.department?.name || '—'
      case 'activity':
        return plan.activity_type?.name || '—'
      case 'work_center':
        return plan.work_center || '—'
      case 'priority':
        return pmPriorityLabel(plan.priority)
      case 'location':
        return plan.location?.name || '—'
      case 'area':
        return plan.area?.name || '—'
      case 'equipment':
        return equipmentLabel(plan)
      case 'schedule':
        return formatScheduleSummary(plan)
      case 'schedule_type':
        return scheduleTypeLabel(plan.schedule_type)
      case 'calendar_unit':
        return calendarUnitLabel(normalizeCalendarUnit(plan.calendar_unit, plan.schedule_type))
      case 'every_n':
        return formatNumber(plan.every_n)
      case 'start_date':
        return formatDate(plan.start_date)
      case 'end_date':
        return formatDate(plan.end_date)
      case 'grace_days':
        return formatNumber(plan.grace_days)
      case 'generate_before_days':
        return formatNumber(plan.generate_before_days)
      case 'last_reading':
        return formatNumber(plan.last_reading)
      case 'last_service_date':
        return formatDate(plan.last_service_date)
      case 'reading_interval':
        return formatNumber(plan.reading_interval)
      case 'whichever_comes_first':
        if (plan.schedule_type !== 'both') return '—'
        return plan.whichever_comes_first === false ? 'No' : 'Yes'
      case 'next_due':
        return formatDate(plan.next_due_at)
      case 'technicians':
        return <AssignedToCell assignees={plan.technicians} />
      case 'checklist':
        return checklistLabel(plan)
      case 'status':
        return (
          <span className={`pm-status pm-status--${plan.status}`}>
            {pmPlanStatusLabel(plan.status)}
          </span>
        )
      case 'last_generated_at':
        return formatDate(plan.last_generated_at)
      case 'created_at':
        return formatDate(plan.created_at)
      default:
        return readCatalogText(plan, { id: columnId }) || '—'
    }
  }, [])

  const visibleDataColumns = useMemo(
    () => visibleColumnIds.filter((id) => id !== 'actions'),
    [visibleColumnIds],
  )
  const showActions = visibleColumnIds.includes('actions')
  const colSpan = visibleDataColumns.length + (showActions ? 1 : 0)

  return (
    <div>
      <div className="company-table-wrap">
      <div className="company-table-scroll">
        <table className="company-table master-table">
          <thead>
            <tr>
              {visibleDataColumns.map((columnId) => {
                const col = PM_PLAN_COLUMNS.find((item) => item.id === columnId)
                return (
                  <TableColumnHead
                    key={columnId}
                    columnId={columnId}
                    label={col?.label || columnId}
                    sort={headerSort}
                    onSort={onHeaderSort}
                    filterValue={columnFilters[columnId] || ''}
                    onFilter={onColumnFilter}
                  />
                )
              })}
              {showActions && <th>Actions</th>}
            </tr>
          </thead>
          {!plans.length ? (
            <tbody>
              <tr>
                <td colSpan={Math.max(colSpan, 1)} className="company-empty">
                  <strong>{totalCount ? 'No matching PM plans.' : 'No PM plans yet.'}</strong>
                  <p>
                    {totalCount
                      ? 'Try a different search or clear the filters.'
                      : 'Create a planned maintenance plan to generate scheduled work orders automatically.'}
                  </p>
                </td>
              </tr>
            </tbody>
          ) : (
            <VirtualTableBody
              items={plans}
              renderRow={(plan) => {
                const openPlan = () => (onOpen || onEdit)?.(plan)
                return (
                  <tr
                    key={plan.id}
                    className={openPlan ? 'company-table__row--clickable' : undefined}
                    onClick={openPlan || undefined}
                    onKeyDown={openPlan ? (event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        openPlan()
                      }
                    } : undefined}
                    tabIndex={openPlan ? 0 : undefined}
                    role={openPlan ? 'button' : undefined}
                    aria-label={openPlan ? `View PM plan ${plan.plan_number || plan.name || ''}` : undefined}
                  >
                    {visibleDataColumns.map((columnId) => (
                      <td key={columnId}>{renderCell(plan, columnId)}</td>
                    ))}
                    {showActions && (
                      <td onClick={(event) => event.stopPropagation()}>
                        <div className="pm-table-actions">
                          {canAdd && (plan.status === 'active' || plan.status === 'overdue') && (
                            <button
                              type="button"
                              className="company-btn company-btn--secondary company-btn--compact"
                              onClick={() => onGenerate?.(plan)}
                            >
                              Generate
                            </button>
                          )}
                          {canAdd && (
                            <button
                              type="button"
                              className="company-btn company-btn--secondary company-btn--compact company-btn--icon"
                              onClick={() => onDuplicate?.(plan)}
                              disabled={duplicatingId === plan.id}
                              aria-label="Duplicate plan"
                              title="Duplicate"
                            >
                              <DuplicateIcon />
                            </button>
                          )}
                          {canSaveTemplate ? (
                            <SaveAsTemplateButton
                              moduleKey="work_orders_scheduled"
                              sourceRecordId={plan.id}
                              defaultName={plan.name || plan.plan_number || 'PM plan'}
                              className="company-btn company-btn--secondary company-btn--compact"
                              label="Template"
                            />
                          ) : null}
                          {canEdit && (
                            <button
                              type="button"
                              className="company-btn company-btn--secondary company-btn--compact company-btn--icon"
                              onClick={() => onEdit?.(plan)}
                              aria-label="Edit plan"
                              title="Edit"
                            >
                              <EditIcon />
                            </button>
                          )}
                          {canRemove && (
                            <button
                              type="button"
                              className="company-btn company-btn--secondary company-btn--compact company-btn--icon"
                              onClick={() => onDelete?.(plan)}
                              aria-label="Delete plan"
                              title="Delete"
                            >
                              <TrashIcon />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                )
              }}
            />
          )}
        </table>
      </div>
    </div>
    </div>
  )
}
