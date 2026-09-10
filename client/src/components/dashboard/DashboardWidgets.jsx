import { Link } from 'react-router-dom'
import { STATUS_COLORS, STATUS_LABELS, PRIORITY_COLORS } from '../../data/dashboardDemo'
import { useOrg } from '../../hooks/useOrg'
import { orgPath } from '../../config/navigation'

function finiteNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function statusLegendLabel(seg) {
  if (STATUS_LABELS[seg.status]) return STATUS_LABELS[seg.status]
  if (seg.priority) return seg.priority.charAt(0).toUpperCase() + seg.priority.slice(1)
  if (seg.status) return String(seg.status).replace(/_/g, ' ')
  return 'Unknown'
}

export function KpiCards({ stats }) {
  const total = finiteNumber(stats.total)
  const share = (n) => (total ? `${((n / total) * 100).toFixed(1)}% of total` : '0% of total')
  const trendPercent = finiteNumber(stats.trendPercent)
  const trendLabel = trendPercent === 0
    ? 'No change vs prior 30 days'
    : `${trendPercent > 0 ? '+' : ''}${trendPercent}% vs prior 30 days`

  const cards = [
    {
      label: 'Total Work Orders',
      value: total.toLocaleString(),
      sub: trendLabel,
      subClass: trendPercent > 0 ? 'kpi-card__sub--green' : '',
      iconBg: 'kpi-card__icon--red',
      icon: (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <path d="M6 3H14L18 7V18C18 18.55 17.55 19 17 19H5C4.45 19 4 18.55 4 18V4C4 3.45 4.45 3 5 3H6Z" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M8 11H14M8 14H12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      ),
    },
    {
      label: 'Created',
      value: (stats.created || 0).toLocaleString(),
      sub: share(stats.created || 0),
      iconBg: 'kpi-card__icon--yellow',
      icon: (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <rect x="5" y="3" width="12" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M8 8H14M8 11H14M8 14H11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      ),
    },
    {
      label: 'Draft',
      value: (stats.draft || 0).toLocaleString(),
      sub: share(stats.draft || 0),
      iconBg: 'kpi-card__icon--blue',
      icon: (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <path d="M11 4V11L15 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.5"/>
        </svg>
      ),
    },
    {
      label: 'With Assignees',
      value: (stats.assigned || 0).toLocaleString(),
      sub: share(stats.assigned || 0),
      iconBg: 'kpi-card__icon--green',
      icon: (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M8 11L10 13L14 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
    },
    {
      label: 'Assigned to Me',
      value: (stats.received || 0).toLocaleString(),
      sub: share(stats.received || 0),
      iconBg: 'kpi-card__icon--red',
      icon: (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M11 7V11L13.5 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      ),
    },
  ]

  return (
    <div className="kpi-grid">
      {cards.map((card) => (
        <div key={card.label} className="kpi-card">
          <div className="kpi-card__content">
            <span className="kpi-card__label">{card.label}</span>
            <span className="kpi-card__value">{card.value}</span>
            <span className={`kpi-card__sub ${card.subClass || ''}`}>{card.sub}</span>
          </div>
          <div className={`kpi-card__icon ${card.iconBg}`}>{card.icon}</div>
        </div>
      ))}
    </div>
  )
}

export function DonutChart({ title, total, segments, filterLabel }) {
  const radius = 70
  const circumference = 2 * Math.PI * radius
  let offset = 0
  const safeTotal = finiteNumber(total)
  const legend = (segments || []).map((seg) => ({
    ...seg,
    count: finiteNumber(seg.count),
    percent: finiteNumber(seg.percent),
    label: statusLegendLabel(seg),
  }))

  const arcs = legend.filter((s) => s.count > 0).map((seg) => {
    const pct = seg.count / (safeTotal || 1)
    const dash = pct * circumference
    const arc = { ...seg, dash, offset, color: seg.color || STATUS_COLORS[seg.status] || PRIORITY_COLORS[seg.priority] }
    offset += dash
    return arc
  })

  return (
    <div className="dash-card">
      <div className="dash-card__header">
        <h3 className="dash-card__title">{title}</h3>
        {filterLabel && <span className="dash-card__filter">{filterLabel}</span>}
      </div>
      <div className="donut-chart">
        <div className="donut-chart__ring">
          <svg width="180" height="180" viewBox="0 0 180 180">
            <circle cx="90" cy="90" r={radius} fill="none" stroke="#F1F5F9" strokeWidth="24"/>
            {arcs.map((arc, i) => (
              <circle
                key={i}
                cx="90"
                cy="90"
                r={radius}
                fill="none"
                stroke={arc.color}
                strokeWidth="24"
                strokeDasharray={`${arc.dash} ${circumference - arc.dash}`}
                strokeDashoffset={-arc.offset + circumference / 4}
                transform="rotate(-90 90 90)"
              />
            ))}
          </svg>
          <div className="donut-chart__center">
            <span className="donut-chart__total">{safeTotal.toLocaleString()}</span>
            <span className="donut-chart__label">Total</span>
          </div>
        </div>
        <div className="donut-chart__legend">
          {legend.map((seg) => (
            <div key={seg.status || seg.priority} className="donut-chart__legend-item">
              <span
                className="donut-chart__dot"
                style={{ background: seg.color || STATUS_COLORS[seg.status] || PRIORITY_COLORS[seg.priority] }}
              />
              <span className="donut-chart__legend-label">{seg.label}</span>
              <span className="donut-chart__legend-value">{seg.count}</span>
              <span className="donut-chart__legend-pct">{seg.percent}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function TrendChart({ data, filterLabel }) {
  const values = (data || []).map((d) => d.value)
  const max = Math.max(...values, 1)
  const width = 500
  const height = 200
  const padding = { top: 20, right: 20, bottom: 30, left: 40 }
  const chartW = width - padding.left - padding.right
  const chartH = height - padding.top - padding.bottom
  const empty = !data?.length || values.every((v) => v === 0)

  const points = (data || []).map((d, i) => {
    const x = padding.left + (data.length <= 1 ? chartW / 2 : (i / (data.length - 1)) * chartW)
    const y = padding.top + chartH - (d.value / max) * chartH
    return { x, y, ...d }
  })

  const linePath = points.length
    ? points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
    : ''
  const areaPath = points.length
    ? `${linePath} L ${points[points.length - 1].x} ${padding.top + chartH} L ${points[0].x} ${padding.top + chartH} Z`
    : ''

  return (
    <div className="dash-card">
      <div className="dash-card__header">
        <h3 className="dash-card__title">Work Orders Trend</h3>
        <span className="dash-card__filter">{filterLabel}</span>
      </div>
      {empty ? (
        <p className="dash-empty">No work orders created in the last 7 days.</p>
      ) : (
        <svg viewBox={`0 0 ${width} ${height}`} className="trend-chart">
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#E63946" stopOpacity="0.2"/>
              <stop offset="100%" stopColor="#E63946" stopOpacity="0"/>
            </linearGradient>
          </defs>
          <path d={areaPath} fill="url(#trendFill)"/>
          <path d={linePath} fill="none" stroke="#E63946" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          {points.map((p) => (
            <g key={p.date}>
              <circle cx={p.x} cy={p.y} r="4" fill="#E63946"/>
              <text x={p.x} y={height - 8} textAnchor="middle" className="trend-chart__label">{p.date}</text>
            </g>
          ))}
        </svg>
      )}
    </div>
  )
}

export function LocationsBarChart({ data, filterLabel }) {
  const rows = (data || []).map((item) => ({
    ...item,
    count: Number.isFinite(Number(item.count)) ? Number(item.count) : 0,
  }))
  const max = Math.max(...rows.map((d) => d.count), 1)

  return (
    <div className="dash-card">
      <div className="dash-card__header">
        <h3 className="dash-card__title">Top 5 Locations by Work Orders</h3>
        <span className="dash-card__filter">{filterLabel}</span>
      </div>
      {!rows.length ? (
        <p className="dash-empty">No location breakdown for the current filters.</p>
      ) : (
        <div className="bar-chart">
          {rows.map((item) => (
            <div key={item.name} className="bar-chart__row">
              <span className="bar-chart__label">{item.name}</span>
              <div className="bar-chart__track">
                <div
                  className="bar-chart__fill"
                  style={{ width: `${(item.count / max) * 100}%` }}
                />
              </div>
              <span className="bar-chart__value">{item.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** @deprecated use LocationsBarChart */
export const PlantsBarChart = LocationsBarChart

export function SlaGauge({ percent, trend }) {
  const angle = (percent / 100) * 180

  return (
    <div className="dash-card">
      <div className="dash-card__header">
        <h3 className="dash-card__title">SLA Performance</h3>
      </div>
      <div className="sla-gauge">
        <svg width="200" height="120" viewBox="0 0 200 120">
          <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#F1F5F9" strokeWidth="16" strokeLinecap="round"/>
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke="#22C55E"
            strokeWidth="16"
            strokeLinecap="round"
            strokeDasharray={`${(angle / 180) * 251} 251`}
          />
        </svg>
        <div className="sla-gauge__text">
          <span className="sla-gauge__percent">{percent}%</span>
          <span className="sla-gauge__label">SLA Achieved</span>
        </div>
        <span className="sla-gauge__trend">↑ {trend}% vs last 30 days</span>
      </div>
    </div>
  )
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const hours = Math.floor(diff / 3600000)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function RecentWorkOrders({ orders }) {
  const { org } = useOrg()
  const viewAllPath = org ? orgPath(org.slug, 'work-orders/manual') : '#'

  return (
    <div className="dash-card">
      <div className="dash-card__header">
        <h3 className="dash-card__title">Recent Work Orders</h3>
        <Link to={viewAllPath} className="dash-card__link">View All</Link>
      </div>
      {!orders?.length ? (
        <p className="dash-empty">No work orders yet.</p>
      ) : (
        <div className="recent-list">
          {orders.map((order) => (
            <div key={order.id} className="recent-list__item">
              <span className="recent-list__id">{order.wo_number || order.work_order_number}</span>
              <span className="recent-list__title">{order.short_description || order.title || order.summary}</span>
              <span className="recent-list__plant">{order.location_name || '—'}</span>
              <span className="recent-list__time">{timeAgo(order.created_at)}</span>
              <span className={`status-badge status-badge--${order.status}`}>
                {STATUS_LABELS[order.status] || order.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function CalendarWidget() {
  const today = new Date()
  const year = today.getFullYear()
  const month = today.getMonth()
  const monthName = today.toLocaleString('default', { month: 'long', year: 'numeric' })
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const days = []

  for (let i = 0; i < firstDay; i++) days.push(null)
  for (let d = 1; d <= daysInMonth; d++) days.push(d)

  return (
    <div className="dash-card">
      <div className="dash-card__header">
        <h3 className="dash-card__title">{monthName}</h3>
      </div>
      <div className="calendar-widget">
        <div className="calendar-widget__weekdays">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="calendar-widget__days">
          {days.map((day, i) => (
            <span
              key={i}
              className={`calendar-widget__day ${day === today.getDate() ? 'calendar-widget__day--today' : ''} ${!day ? 'calendar-widget__day--empty' : ''}`}
            >
              {day || ''}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
