import { useEffect, useState } from 'react'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import {
  formatScheduleSummary,
  pmPlanStatusLabel,
  pmPriorityLabel,
  scheduleTypeLabel,
  calendarUnitLabel,
  normalizeCalendarUnit,
  normalizeScheduleType,
} from '../../config/pm'
import { formatCalendarDate, formatDisplayDateTime } from '../../lib/displayDate'
import { getPmPlan } from '../../lib/api-pm'
import { getScheduledWorkOrder, getScheduledWorkOrders } from '../../lib/api-work-orders'
import { formatWorkOrderStatusLabel } from '../../lib/workOrderStatusLabel'
import { useOrgStatusOptions } from '../../hooks/useOrgStatusOptions'
import PageBack from '../shared/PageBack'
import SaveAsTemplateButton from '../templates/SaveAsTemplateButton'
import PersonChip from '../shared/PersonChip'
import AssignedToCell from '../workorders/AssignedToCell'
import ReceivedWorkOrderDetailModal from '../workorders/ReceivedWorkOrderDetailModal'
import '../company/CompanyShared.css'
import '../workrequests/WorkRequests.css'
import '../workorders/ManualWorkOrder.css'
import './Pm.css'

function formatDate(value) {
  if (!value) return '—'
  return formatCalendarDate(value) || '—'
}

function formatDateTime(value) {
  if (!value) return '—'
  return formatDisplayDateTime(value) || '—'
}

function formatNumber(value) {
  if (value === '' || value == null) return '—'
  const num = Number(value)
  return Number.isFinite(num) ? String(num) : '—'
}

function equipmentLabel(plan) {
  const name = plan?.equipment?.name
  const code = plan?.equipment?.code
  if (code && name) return `${code} — ${name}`
  return name || code || '—'
}

function checklistLabel(plan) {
  const name = plan?.checklist_template?.name
  if (!name) return '—'
  return plan.checklist_template?.version
    ? `${name} (v${plan.checklist_template.version})`
    : name
}

function MetaItem({ label, children, wide = false }) {
  return (
    <div className={`wr-detail-meta__item${wide ? ' wr-detail-meta__item--wide' : ''}`}>
      <span className="wo-received-detail__label">{label}</span>
      <div className="wr-detail-meta__value">{children ?? '—'}</div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div className="wo-received-detail__field">
      <dt>{label}</dt>
      <dd>{children ?? '—'}</dd>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <section className="wo-received-detail__section">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

export default function PmPlanDetailModal({
  planId,
  plan: planProp = null,
  onClose,
  canSaveTemplate = false,
}) {
  const [plan, setPlan] = useState(planProp)
  const [loading, setLoading] = useState(!planProp?.id && Boolean(planId))
  const [error, setError] = useState(null)
  const [orders, setOrders] = useState([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [ordersError, setOrdersError] = useState(null)
  const [openOrderId, setOpenOrderId] = useState(null)
  const handleBackdropClick = useBackdropClose(onClose)
  const { labelByKey: statusLabels } = useOrgStatusOptions('work_order', { includeInactive: true })

  const resolvedId = planId || planProp?.id || plan?.id || null

  useEffect(() => {
    if (planProp?.id) {
      setPlan(planProp)
      setLoading(false)
      setError(null)
    }
  }, [planProp])

  useEffect(() => {
    if (!resolvedId) return undefined
    let cancelled = false
    setLoading(true)
    setError(null)
    getPmPlan(resolvedId)
      .then((row) => {
        if (!cancelled) setPlan(row)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not load PM plan')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [resolvedId])

  useEffect(() => {
    if (!resolvedId) {
      setOrders([])
      return undefined
    }
    let cancelled = false
    setOrdersLoading(true)
    setOrdersError(null)
    getScheduledWorkOrders({
      filters: { pm_plan_id: resolvedId },
      limit: 100,
      sort: 'scheduled_at',
      sortDir: 'desc',
    })
      .then((rows) => {
        if (!cancelled) setOrders(Array.isArray(rows) ? rows : [])
      })
      .catch((err) => {
        if (!cancelled) {
          setOrders([])
          setOrdersError(err.message || 'Could not load scheduled work orders')
        }
      })
      .finally(() => {
        if (!cancelled) setOrdersLoading(false)
      })
    return () => { cancelled = true }
  }, [resolvedId])

  const scheduleType = normalizeScheduleType(plan?.schedule_type)
  const showCalendar = scheduleType === 'calendar' || scheduleType === 'both'
  const showMeter = scheduleType === 'reading' || scheduleType === 'both'
  const isRecurring = plan?.is_recurring !== false
  const technicians = plan?.technicians || []

  return (
    <>
      <div className="wr-detail-overlay" onClick={handleBackdropClick} role="presentation">
        <div
          className="wr-detail-sheet wo-received-detail pm-plan-detail-sheet"
          onClick={(event) => event.stopPropagation()}
          role="dialog"
          aria-labelledby="pm-plan-detail-title"
          aria-modal="true"
        >
          <header className="wr-detail-sheet__header">
            <div className="wr-detail-sheet__header-main">
              <PageBack onClick={onClose} label="Back to PM plans" />
              <div className="wr-detail-sheet__heading">
                <p className="wr-detail-sheet__eyebrow">PM plan</p>
                <h2 id="pm-plan-detail-title" className="wr-detail-sheet__title">
                  {plan?.plan_number || plan?.name || (loading ? 'Loading…' : '—')}
                </h2>
              </div>
            </div>
            <div className="record-detail-layout__actions">
              {canSaveTemplate && (plan?.id || resolvedId) ? (
                <SaveAsTemplateButton
                  moduleKey="work_orders_scheduled"
                  sourceRecordId={plan?.id || resolvedId}
                  defaultName={plan?.name || plan?.plan_number || 'PM plan'}
                />
              ) : null}
              <button type="button" className="wr-detail-sheet__close" onClick={onClose} aria-label="Close">
                ×
              </button>
            </div>
          </header>

          <div className="wr-detail-sheet__body">
            {loading && !plan && <p className="wo-received-detail__status">Loading...</p>}
            {error && <p className="wo-alert wo-alert--error" role="alert">{error}</p>}

            {plan && (
              <div className="wr-detail-main">
                <div className="wr-detail-meta">
                  <MetaItem label="Status">
                    <span className={`pm-status pm-status--${plan.status}`}>
                      {pmPlanStatusLabel(plan.status)}
                    </span>
                  </MetaItem>
                  <MetaItem label="Priority">
                    <span style={{ textTransform: 'capitalize' }}>{pmPriorityLabel(plan.priority)}</span>
                  </MetaItem>
                  <MetaItem label="Next due">{formatDate(plan.next_due_at)}</MetaItem>
                  <MetaItem label="Schedule">{formatScheduleSummary(plan)}</MetaItem>
                  <MetaItem label="Department">{plan.department?.name || '—'}</MetaItem>
                  <MetaItem label="Asset" wide>{equipmentLabel(plan)}</MetaItem>
                </div>

                {plan.name && plan.name !== plan.plan_number && (
                  <p className="wo-received-detail__summary">{plan.name}</p>
                )}

                <Section title="Plan details">
                  <dl className="wo-received-detail__fields">
                    <Field label="Plan #">{plan.plan_number || '—'}</Field>
                    <Field label="Name">{plan.name || '—'}</Field>
                    <Field label="Activity">{plan.activity_type?.name || '—'}</Field>
                    <Field label="Work center">{plan.work_center || '—'}</Field>
                    <Field label="Plant / Facility">{plan.location?.name || '—'}</Field>
                    <Field label="Area">{plan.area?.name || '—'}</Field>
                    <Field label="Asset">{equipmentLabel(plan)}</Field>
                    <Field label="Created">{formatDate(plan.created_at)}</Field>
                  </dl>
                </Section>

                <Section title="Schedule">
                  <dl className="wo-received-detail__fields">
                    <Field label="Recurring">{isRecurring ? 'Yes' : 'No'}</Field>
                    <Field label="Schedule type">{scheduleTypeLabel(scheduleType)}</Field>
                    <Field label="Summary">{formatScheduleSummary(plan)}</Field>
                    {showCalendar && (
                      <>
                        <Field label="Interval type">
                          {calendarUnitLabel(normalizeCalendarUnit(plan.calendar_unit, plan.schedule_type))}
                        </Field>
                        <Field label="Interval value">{formatNumber(plan.every_n)}</Field>
                      </>
                    )}
                    {showMeter && (
                      <>
                        <Field label="Reading interval">{formatNumber(plan.reading_interval)}</Field>
                        <Field label="Last reading">{formatNumber(plan.last_reading)}</Field>
                        <Field label="Last service date">{formatDate(plan.last_service_date)}</Field>
                      </>
                    )}
                    {scheduleType === 'both' && (
                      <Field label="Whichever comes first">
                        {plan.whichever_comes_first === false ? 'No' : 'Yes'}
                      </Field>
                    )}
                    <Field label="Start date">{formatDate(plan.start_date)}</Field>
                    <Field label="End date">
                      {isRecurring && !plan.never_ends
                        ? formatDate(plan.end_date)
                        : (plan.never_ends ? 'Never ends' : '—')}
                    </Field>
                    <Field label="Grace days">{formatNumber(plan.grace_days)}</Field>
                    <Field label="Generate before (days)">{formatNumber(plan.generate_before_days)}</Field>
                    <Field label="Next due">{formatDate(plan.next_due_at)}</Field>
                    <Field label="Last generated">{formatDateTime(plan.last_generated_at)}</Field>
                  </dl>
                </Section>

                <Section title="Technicians">
                  {technicians.length ? (
                    <div className="pm-detail-technicians">
                      {technicians.map((person) => (
                        <PersonChip key={person.id || person.employee_id} person={person} />
                      ))}
                    </div>
                  ) : (
                    <p className="wo-permit__hint">No technicians assigned to this plan.</p>
                  )}
                </Section>

                <Section title="Checklist">
                  <dl className="wo-received-detail__fields">
                    <Field label="Checklist template">{checklistLabel(plan)}</Field>
                  </dl>
                </Section>

                <Section title="Scheduled work orders">
                  {ordersError && (
                    <p className="wo-alert wo-alert--error" role="alert">{ordersError}</p>
                  )}
                  {ordersLoading ? (
                    <p className="wo-received-detail__status">Loading work orders…</p>
                  ) : !orders.length ? (
                    <p className="wo-permit__hint">
                      No scheduled work orders have been generated from this plan yet.
                    </p>
                  ) : (
                    <div className="company-table-wrap">
                      <div className="company-table-scroll">
                        <table className="company-table master-table pm-plan-orders-table">
                          <thead>
                            <tr>
                              <th>WO #</th>
                              <th>Summary</th>
                              <th>Scheduled</th>
                              <th>Status</th>
                              <th>Priority</th>
                              <th>Assignees</th>
                            </tr>
                          </thead>
                          <tbody>
                            {orders.map((order) => (
                              <tr
                                key={order.id}
                                className="company-table__row--clickable"
                                onClick={() => setOpenOrderId(order.id)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault()
                                    setOpenOrderId(order.id)
                                  }
                                }}
                                tabIndex={0}
                                role="button"
                                aria-label={`Open work order ${order.wo_number || order.id}`}
                              >
                                <td>{order.wo_number || '—'}</td>
                                <td>{order.short_description || order.summary || '—'}</td>
                                <td>{formatDateTime(order.scheduled_at)}</td>
                                <td>
                                  <span className={`wo-status wo-status--${order.status}`}>
                                    {formatWorkOrderStatusLabel(order, statusLabels)}
                                  </span>
                                </td>
                                <td style={{ textTransform: 'capitalize' }}>
                                  {order.priority || '—'}
                                </td>
                                <td>
                                  <AssignedToCell assignees={order.assignees} />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </Section>
              </div>
            )}
          </div>
        </div>
      </div>

      {openOrderId && (
        <ReceivedWorkOrderDetailModal
          orderId={openOrderId}
          fetchWorkOrder={getScheduledWorkOrder}
          onClose={() => setOpenOrderId(null)}
        />
      )}
    </>
  )
}
