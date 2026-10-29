import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useOrg } from '../../hooks/useOrg'
import { useProfile } from '../../hooks/useProfile'
import { orgPath } from '../../config/navigation'
import { DonutChart, MultiTrendChart } from './DashboardWidgets'
import '../../pages/admin/AdminDashboard.css'
import './DashboardBoard.css'

function hasModule(modules, id) {
  return (modules || []).some((mod) => mod.id === id)
}

function moduleKpi(modules, id, key) {
  const mod = (modules || []).find((item) => item.id === id)
  const kpi = mod?.kpis?.find((item) => item.key === key)
  if (!kpi) return null
  const value = Number(kpi.value)
  return Number.isFinite(value) ? value : 0
}

function chartById(list, id) {
  return (list || []).find((item) => item.id === id) || null
}

function formatCount(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n.toLocaleString() : '0'
}

function timeAgo(value) {
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return ''
  const hours = Math.max(0, Math.floor((Date.now() - time) / 3600000))
  if (hours < 1) return 'Just now'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return days === 1 ? '1 day ago' : `${days} days ago`
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10)
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function isToday(value) {
  if (!value) return false
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false
  const now = new Date()
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate()
}

function bucketPoints(points, series, size = 5) {
  const groups = []
  const rows = points || []
  for (let index = 0; index < rows.length; index += size) {
    const slice = rows.slice(index, index + size)
    const values = {}
    for (const item of series || []) {
      values[item.key] = slice.reduce((sum, point) => sum + (Number(point.values?.[item.key]) || 0), 0)
    }
    groups.push({ date: slice[0]?.date || '', values })
  }
  return groups
}

function Glyph({ name }) {
  const common = { width: 18, height: 18, viewBox: '0 0 18 18', fill: 'none', 'aria-hidden': true }
  if (name === 'clipboard') {
    return (
      <svg {...common}>
        <rect x="4" y="3" width="10" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M7 3.5h4M6.5 8h5M6.5 11h3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    )
  }
  if (name === 'document') {
    return (
      <svg {...common}>
        <path d="M5 2.5h5l3.5 3.5V15.5H5V2.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M10 2.8V6.2h3.2M7 9.5h4M7 12h2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    )
  }
  if (name === 'calendar') {
    return (
      <svg {...common}>
        <rect x="3" y="4" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M3 7.5h12M6.5 2.8v3M11.5 2.8v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    )
  }
  if (name === 'box') {
    return (
      <svg {...common}>
        <path d="M3.5 6.2 9 3.5l5.5 2.7v6.2L9 15.1 3.5 12.4V6.2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M3.6 6.3 9 9l5.4-2.7M9 9v6" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    )
  }
  if (name === 'shield') {
    return (
      <svg {...common}>
        <path d="M9 2.5 14 4.5v4.2c0 3.2-2.1 5.4-5 6.8-2.9-1.4-5-3.6-5-6.8V4.5L9 2.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    )
  }
  if (name === 'alert') {
    return (
      <svg {...common}>
        <circle cx="9" cy="9" r="6.2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M9 5.8v3.6M9 11.8h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    )
  }
  if (name === 'chart') {
    return (
      <svg {...common}>
        <path d="M3.5 14.5h11M5.5 14.5V9M9 14.5V5.5M12.5 14.5V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <circle cx="9" cy="9" r="3" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function TrendNote({ item, fallback }) {
  if (item?.trendPercent == null || item.trendPercent === '') {
    return <span className="sum-card__note">{fallback}</span>
  }
  const trend = Number(item.trendPercent)
  if (!Number.isFinite(trend)) return <span className="sum-card__note">{fallback}</span>
  const rising = trend > 0
  const good = item.trendInverse ? trend < 0 : rising
  const bad = item.trendInverse ? rising : trend < 0
  const tone = good ? 'sum-card__note--up' : (bad ? 'sum-card__note--down' : '')
  return (
    <span className={`sum-card__note ${tone}`}>
      {trend > 0 ? '↑' : trend < 0 ? '↓' : ''} {trend > 0 ? '+' : ''}{trend}% vs last month
    </span>
  )
}

function SummaryCard({ tone, icon, label, value, note, trendItem }) {
  return (
    <article className={`sum-card sum-card--${tone}`}>
      <span className={`sum-card__icon sum-card__icon--${tone}`} aria-hidden="true"><Glyph name={icon} /></span>
      <div>
        <p className="sum-card__label">{label}</p>
        <p className="sum-card__value">{formatCount(value)}</p>
        {trendItem ? <TrendNote item={trendItem} fallback={note} /> : <span className="sum-card__note">{note}</span>}
      </div>
    </article>
  )
}

function Panel({ title, tone, icon = 'chart', to, children, className = '' }) {
  return (
    <section className={`board-panel ${className}`}>
      <header className="board-panel__head">
        <h2 className="board-panel__title">
          <span className={`board-panel__mark board-panel__mark--${tone}`} aria-hidden="true"><Glyph name={icon} /></span>
          {title}
        </h2>
        {to ? <Link to={to} className="board-panel__link">View All</Link> : null}
      </header>
      {children}
    </section>
  )
}

function MiniStats({ items }) {
  return (
    <div className="mini-stats">
      {items.map((item) => (
        <div key={item.label} className="mini-stats__item">
          <span className={`mini-stats__icon mini-stats__icon--${item.tone}`} aria-hidden="true"><Glyph name={item.icon || 'chart'} /></span>
          <span>
            <span className="mini-stats__label">{item.label}</span>
            <span className="mini-stats__value">{formatCount(item.value)}</span>
          </span>
        </div>
      ))}
    </div>
  )
}

function RankBars({ rows, empty }) {
  const items = rows || []
  const max = Math.max(1, ...items.map((row) => Number(row.count) || 0))
  if (!items.length) return <p className="dash-empty">{empty}</p>
  return (
    <div className="rank-bars">
      {items.map((row) => (
        <div key={row.name} className="rank-bars__row">
          <span className="rank-bars__name">{row.name}</span>
          <span className="rank-bars__track">
            <span className="rank-bars__fill" style={{ width: `${((Number(row.count) || 0) / max) * 100}%` }} />
          </span>
          <span className="rank-bars__count">{formatCount(row.count)}</span>
        </div>
      ))}
    </div>
  )
}

function GroupedBars({ series, points, empty }) {
  const rows = bucketPoints(points, series, points?.length > 12 ? 5 : 1)
  const max = Math.max(1, ...rows.flatMap((row) => (series || []).map((item) => Number(row.values?.[item.key]) || 0)))
  const blank = !rows.length || rows.every((row) => (series || []).every((item) => !row.values?.[item.key]))
  if (blank) return <p className="dash-empty">{empty}</p>
  return (
    <div className="grouped-bars">
      <div className="grouped-bars__plot">
        {rows.map((row) => (
          <div key={row.date} className="grouped-bars__group">
            <div className="grouped-bars__cols">
              {(series || []).map((item) => (
                <span
                  key={item.key}
                  className="grouped-bars__bar"
                  style={{
                    height: `${Math.max(4, ((Number(row.values?.[item.key]) || 0) / max) * 100)}%`,
                    background: item.color,
                  }}
                  title={`${item.label}: ${row.values?.[item.key] || 0}`}
                />
              ))}
            </div>
            <span className="grouped-bars__label">{row.date}</span>
          </div>
        ))}
      </div>
      <div className="grouped-bars__legend">
        {(series || []).map((item) => (
          <span key={item.key}><i style={{ background: item.color }} />{item.label}</span>
        ))}
      </div>
    </div>
  )
}

const RANGE_OPTIONS = [
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
]

function sliceTrend(trend, days) {
  if (!trend?.points?.length) return trend
  return { ...trend, points: trend.points.slice(-days) }
}

function dayTotal(point) {
  return Object.values(point?.values || {}).reduce((sum, value) => sum + (Number(value) || 0), 0)
}

function Sparkline({ values, color, id }) {
  const nums = values?.length ? values : [0, 0]
  const width = 180
  const height = 42
  const min = Math.min(...nums)
  const max = Math.max(...nums)
  const span = max - min || 1
  const xAt = (index) => (nums.length <= 1 ? width / 2 : (index * (width - 4)) / (nums.length - 1) + 2)
  const yAt = (value) => 4 + ((max - value) / span) * (height - 10)
  const line = nums.map((value, index) => `${index ? 'L' : 'M'}${xAt(index)},${yAt(value)}`).join(' ')
  const area = `${line} L${xAt(nums.length - 1)},${height} L${xAt(0)},${height} Z`
  return (
    <svg className="sa-spark" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function GrowthChart({ points }) {
  const width = 560
  const height = 220
  const pad = { top: 16, right: 16, bottom: 28, left: 32 }
  const max = Math.max(4, ...points.flatMap((point) => [point.total, point.completed]))
  const step = Math.ceil(max / 4)
  const yMax = step * 4
  const xAt = (index) => {
    if (points.length <= 1) return (pad.left + width - pad.right) / 2
    return pad.left + (index * (width - pad.left - pad.right)) / (points.length - 1)
  }
  const yAt = (value) => pad.top + ((yMax - value) / yMax) * (height - pad.top - pad.bottom)
  const line = (key) => points.map((point, index) => `${index ? 'L' : 'M'}${xAt(index)},${yAt(point[key])}`).join(' ')
  const totalLine = line('total')
  const area = points.length ? `${totalLine} L${xAt(points.length - 1)},${yAt(0)} L${xAt(0)},${yAt(0)} Z` : ''

  return (
    <svg className="sa-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Work order trend">
      <defs>
        <linearGradient id="co-growth-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {[0, 1, 2, 3, 4].map((tick) => {
        const value = step * tick
        const y = yAt(value)
        return (
          <g key={value}>
            <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} className="sa-chart__grid" />
            <text x={pad.left - 8} y={y + 4} className="sa-chart__axis" textAnchor="end">{value}</text>
          </g>
        )
      })}
      {area ? <path d={area} fill="url(#co-growth-fill)" /> : null}
      <path d={line('completed')} className="sa-chart__line sa-chart__line--active" />
      <path d={totalLine} className="sa-chart__line sa-chart__line--total" />
      {points.map((point, index) => (
        <g key={`${point.label}-${index}`}>
          <circle cx={xAt(index)} cy={yAt(point.total)} r="3.2" className="sa-chart__dot sa-chart__dot--total" />
          <circle cx={xAt(index)} cy={yAt(point.completed)} r="3.2" className="sa-chart__dot sa-chart__dot--active" />
          <text x={xAt(index)} y={height - 8} className="sa-chart__axis" textAnchor="middle">{point.label}</text>
        </g>
      ))}
    </svg>
  )
}

function StatusDonut({ segments }) {
  const rows = (segments || []).map((slice) => ({
    key: slice.key || slice.status || slice.label,
    label: slice.label,
    color: slice.color,
    value: Number(slice.count) || 0,
  }))
  const total = rows.reduce((sum, slice) => sum + slice.value, 0)
  const radius = 54
  const circumference = 2 * Math.PI * radius
  let offset = 0
  const drawn = rows.filter((slice) => slice.value > 0)

  return (
    <div className="sa-donut">
      <svg viewBox="0 0 160 160" role="img" aria-label="Status mix">
        <circle cx="80" cy="80" r={radius} className="sa-donut__track" />
        {drawn.length === 1 && (
          <circle cx="80" cy="80" r={radius} fill="none" stroke={drawn[0].color} strokeWidth="18" />
        )}
        {drawn.length > 1 && drawn.map((slice) => {
          const length = (slice.value / total) * circumference
          const element = (
            <circle
              key={slice.key}
              cx="80"
              cy="80"
              r={radius}
              fill="none"
              stroke={slice.color}
              strokeWidth="18"
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 80 80)"
            />
          )
          offset += length
          return element
        })}
        <text x="80" y="78" className="sa-donut__value" textAnchor="middle">{formatCount(total)}</text>
        <text x="80" y="96" className="sa-donut__caption" textAnchor="middle">Total</text>
      </svg>
      <ul className="sa-donut__legend">
        {rows.map((slice) => {
          const share = total ? Math.round((slice.value / total) * 100) : 0
          return (
            <li key={slice.key}>
              <span className="sa-donut__swatch" style={{ background: slice.color }} />
              <span>
                {slice.label}
                <strong>{formatCount(slice.value)} ({share}%)</strong>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function expiryLabel(days) {
  if (days <= 0) return 'Today'
  if (days === 1) return '1 day'
  return `${days}d`
}

function ExpiringItemList({ rows, pathFor }) {
  if (!rows?.length) return <p className="dash-empty">No items expiring in the next 30 days.</p>
  return (
    <ul className="vendor-rank">
      {rows.map((row) => {
        const to = row.warranty_id ? pathFor(`warranty-manager/${row.warranty_id}`) : null
        const body = (
          <>
            <span className="vendor-rank__copy">
              <span className="vendor-rank__name">{row.name}</span>
              {row.detail ? <span className="vendor-rank__detail">{row.detail}</span> : null}
            </span>
            <span className="vendor-rank__count">{expiryLabel(row.days)}</span>
          </>
        )
        return (
          <li key={row.id}>
            {to && to !== '#' ? <Link className="vendor-rank__row" to={to}>{body}</Link> : <div className="vendor-rank__row">{body}</div>}
          </li>
        )
      })}
    </ul>
  )
}

export default function DashboardBoard({
  modules,
  charts,
  locationLabel,
  onCreateWorkRequest = null,
  onCreateWorkOrder = null,
}) {
  const { org } = useOrg()
  const { displayName } = useProfile()
  const [rangeDays, setRangeDays] = useState(30)
  const [rangeOpen, setRangeOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rangeRef = useRef(null)
  const pathFor = (segment) => (org?.slug ? orgPath(org.slug, segment) : '#')
  const board = charts?.board || {}
  const headlines = charts?.kpis || []
  const headline = (key) => headlines.find((item) => item.key === key) || null
  const show = (id) => hasModule(modules, id)
  const rangeLabel = RANGE_OPTIONS.find((option) => option.days === rangeDays)?.label || 'Last 30 days'
  const search = query.trim().toLowerCase()

  useEffect(() => {
    if (!rangeOpen) return undefined
    const close = (event) => {
      if (!rangeRef.current?.contains(event.target)) setRangeOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [rangeOpen])

  const summary = [
    show('work_requests') ? {
      key: 'wr', tone: 'blue', icon: 'clipboard', label: 'Work Requests', value: moduleKpi(modules, 'work_requests', 'total'), note: 'vs last month', trendItem: headline('work_requests.total'),
    } : null,
    show('work_orders') ? {
      key: 'wo', tone: 'green', icon: 'document', label: 'Work Orders', value: moduleKpi(modules, 'work_orders', 'total'), note: 'vs last month', trendItem: headline('work_orders.total'),
    } : null,
    show('pm') ? {
      key: 'pm', tone: 'teal', icon: 'calendar', label: 'PM Schedules', value: moduleKpi(modules, 'pm', 'total'), note: 'vs last month', trendItem: headline('pm.total'),
    } : null,
    show('assets') ? {
      key: 'assets', tone: 'purple', icon: 'box', label: 'Assets', value: moduleKpi(modules, 'assets', 'equipment'), note: 'Active records',
    } : null,
    show('warranties') ? {
      key: 'warranty', tone: 'orange', icon: 'shield', label: 'Warranty Expiring', value: moduleKpi(modules, 'warranties', 'expiring_soon'), note: 'Next 30 days',
    } : null,
    show('work_orders') ? {
      key: 'overdue', tone: 'red', icon: 'alert', label: 'Overdue', value: moduleKpi(modules, 'work_orders', 'overdue'), note: 'Action required', trendItem: headline('work_orders.overdue'),
    } : null,
  ].filter((item) => item && item.value != null)

  const wrDonut = chartById(charts?.donuts, 'work_requests_status')
  const statusDonut = chartById(charts?.donuts, 'work_orders_status') || wrDonut
  const wrTrend = sliceTrend(chartById(charts?.trends, 'work_requests'), rangeDays)
  const woTrend = sliceTrend(chartById(charts?.trends, 'work_orders'), rangeDays)
  const pmTrend = sliceTrend(chartById(charts?.trends, 'pm'), rangeDays)
  const priority = chartById(charts?.donuts, 'work_orders_priority')
  const pmFrequency = (board.pm_frequency || []).map((item) => ({
    status: item.key,
    label: item.label,
    count: item.count,
    color: item.color,
    percent: 0,
  }))
  const frequencyTotal = pmFrequency.reduce((sum, item) => sum + item.count, 0)
  pmFrequency.forEach((item) => {
    item.percent = frequencyTotal ? Math.round((item.count / frequencyTotal) * 1000) / 10 : 0
  })

  const finished = (moduleKpi(modules, 'work_orders', 'completed') || 0)
    + (moduleKpi(modules, 'work_orders', 'verified') || 0)
    + (moduleKpi(modules, 'work_orders', 'closed') || 0)
  const assetStats = board.assets

  const orgTiles = [
    show('company') ? { label: 'Locations', value: moduleKpi(modules, 'company', 'locations'), to: pathFor('masters/company') } : null,
    show('company') ? { label: 'Departments', value: moduleKpi(modules, 'company', 'departments'), to: pathFor('masters/company') } : null,
    show('company') ? { label: 'Employees', value: moduleKpi(modules, 'company', 'employees'), to: pathFor('masters/company') } : null,
    show('vendors') ? { label: 'Vendors', value: moduleKpi(modules, 'vendors', 'total'), to: pathFor('masters/vendors') } : null,
    show('calendar') ? { label: 'Calendar', value: moduleKpi(modules, 'calendar', 'upcoming'), to: pathFor('calendar') } : null,
    show('others') ? { label: 'Checklists', value: moduleKpi(modules, 'others', 'checklists'), to: pathFor('masters/others/checklists') } : null,
    show('roles') ? { label: 'Roles', value: moduleKpi(modules, 'roles', 'total'), to: pathFor('configuration/roles') } : null,
    show('notifications') ? { label: 'Unread', value: moduleKpi(modules, 'notifications', 'unread'), to: null } : null,
  ].filter((item) => item && item.value != null)

  const growth = useMemo(() => {
    const points = woTrend?.points || wrTrend?.points || []
    const size = points.length > 10 ? Math.ceil(points.length / 8) : 1
    const groups = []
    for (let index = 0; index < points.length; index += size) {
      const slice = points.slice(index, index + size)
      groups.push({
        label: String(slice[0]?.date || '').slice(5),
        total: slice.reduce((sum, point) => sum + dayTotal(point), 0),
        completed: slice.reduce((sum, point) => sum + (Number(point.values?.completed) || Number(point.values?.approved) || 0), 0),
      })
    }
    return groups
  }, [woTrend, wrTrend])

  const trendDelta = (item, fallback) => {
    const trend = Number(item?.trendPercent)
    if (!Number.isFinite(trend)) return { text: fallback, deltaTone: 'muted' }
    return {
      text: `${trend > 0 ? '+' : ''}${trend}%`,
      deltaTone: trend > 0 ? 'up' : trend < 0 ? 'down' : 'muted',
    }
  }
  const newRequests = (moduleKpi(modules, 'work_requests', 'submitted') || 0)
    + (moduleKpi(modules, 'work_requests', 'draft') || 0)
  const cards = [
    show('work_requests') ? {
      label: 'New Requests',
      value: formatCount(newRequests),
      ...trendDelta(headline('work_requests.total'), '0%'),
      icon: 'clipboard',
      tone: 'green',
      color: '#22C55E',
      series: (wrTrend?.points || []).map(dayTotal),
    } : null,
    show('work_orders') ? {
      label: 'In Progress',
      value: formatCount(moduleKpi(modules, 'work_orders', 'in_progress')),
      ...trendDelta(headline('work_orders.in_progress'), '0%'),
      icon: 'chart',
      tone: 'blue',
      color: '#3B82F6',
      series: (woTrend?.points || []).map((point) => Number(point.values?.in_progress) || 0),
    } : null,
    show('pm') ? {
      label: 'PM Schedules',
      value: formatCount(moduleKpi(modules, 'pm', 'total')),
      ...trendDelta(headline('pm.total'), '0%'),
      icon: 'calendar',
      tone: 'violet',
      color: '#8B5CF6',
      series: (pmTrend?.points || []).map(dayTotal),
    } : null,
    show('work_orders') ? {
      label: 'Overdue',
      value: formatCount(moduleKpi(modules, 'work_orders', 'overdue')),
      ...trendDelta(headline('work_orders.overdue'), '0%'),
      icon: 'alert',
      tone: 'orange',
      color: '#F97316',
      series: (woTrend?.points || []).map((point) => Number(point.values?.overdue) || 0),
    } : null,
  ].filter(Boolean)
  const createLabel = onCreateWorkRequest ? 'New Work Request' : (onCreateWorkOrder ? 'New Work Order' : '')
  const onCreate = onCreateWorkRequest || onCreateWorkOrder || null

  const matchesSearch = (value) => !search || String(value || '').toLowerCase().includes(search)
  const overdueOrders = (board.overdue_orders || []).filter((order) => matchesSearch(`${order.wo_number} ${order.title} ${order.location_name}`))
  const upcomingTasks = (charts?.upcoming_tasks || []).filter((task) => matchesSearch(`${task.title} ${task.assignee} ${task.location_name}`))
  const activity = (board.activity || []).filter((item) => {
    if (search && !`${item.title} ${item.detail || ''}`.toLowerCase().includes(search)) return false
    const at = new Date(item.at).getTime()
    if (!Number.isFinite(at)) return true
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    start.setDate(start.getDate() - (rangeDays - 1))
    return at >= start.getTime()
  })
  const firstName = String(displayName || org?.name || 'there').trim().split(' ')[0]

  return (
    <div className="dash-board">
      <section className="sa-dash co-command">
        <div className="sa-welcome">
          <div>
            <h1>Welcome back, {firstName}</h1>
            <p>Here&apos;s what&apos;s happening in your maintenance operations.</p>
          </div>
          {onCreate ? (
            <button type="button" className="co-command__create" onClick={onCreate}>
              + {createLabel}
            </button>
          ) : null}
          <div className="co-command__tools">
            <label className="sa-search">
              <Glyph name="chart" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search activity and orders"
                aria-label="Search activity and orders"
              />
            </label>
            <div className="sa-range" ref={rangeRef}>
              <button type="button" className="sa-range__btn" aria-expanded={rangeOpen} onClick={() => setRangeOpen((open) => !open)}>
                <Glyph name="calendar" />
                {rangeLabel}
              </button>
              {rangeOpen ? (
                <div className="sa-range__menu" role="menu">
                  {RANGE_OPTIONS.map((option) => (
                    <button
                      key={option.days}
                      type="button"
                      role="menuitem"
                      className={option.days === rangeDays ? 'is-active' : ''}
                      onClick={() => {
                        setRangeDays(option.days)
                        setRangeOpen(false)
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {cards.length ? (
          <section className="sa-kpis" aria-label="Company totals">
            {cards.map((card) => (
              <article key={card.label} className={`sa-kpi sa-kpi--${card.tone}`}>
                <div className="sa-kpi__top">
                  <span className={`sa-kpi__icon sa-kpi__icon--${card.tone}`}><Glyph name={card.icon} /></span>
                  <div>
                    <p>{card.label}</p>
                    <strong>{card.value}</strong>
                    <span className={card.deltaTone === 'down' ? 'is-warn' : card.deltaTone === 'up' ? 'is-up' : 'is-muted'}>{card.text}</span>
                  </div>
                </div>
                <Sparkline values={card.series} color={card.color} id={`co-spark-${card.tone}`} />
              </article>
            ))}
          </section>
        ) : null}

        <section className="sa-grid">
          <article className="sa-panel">
            <header className="sa-panel__head">
              <h2><span className="sa-panel__icon sa-panel__icon--violet"><Glyph name="chart" /></span>Work trend</h2>
            </header>
            <div className="sa-chart-legend">
              <span><i className="sa-chart-legend__total" /> All activity</span>
              <span><i className="sa-chart-legend__active" /> Completed</span>
            </div>
            {growth.length ? <GrowthChart points={growth} /> : <p className="sa-empty">No activity in this range.</p>}
          </article>
          <article className="sa-panel">
            <header className="sa-panel__head">
              <h2><span className="sa-panel__icon sa-panel__icon--green"><Glyph name="chart" /></span>Status mix</h2>
            </header>
            {statusDonut?.segments?.length ? (
              <StatusDonut segments={statusDonut.segments} />
            ) : <p className="sa-empty">No status mix yet.</p>}
          </article>
          <article className="sa-panel sa-panel--scroll" id="company-activity">
            <header className="sa-panel__head">
              <h2><span className="sa-panel__icon sa-panel__icon--violet"><Glyph name="alert" /></span>Recent activity</h2>
            </header>
            <ul className="sa-activity">
              {activity.length === 0 ? <li className="sa-empty">No activity in this range.</li> : null}
              {activity.slice(0, 8).map((item) => (
                <li key={item.id}>
                  <span className={`sa-activity__icon sa-activity__icon--${item.kind === 'request' ? 'company' : 'user'}`}>
                    <Glyph name={item.kind === 'request' ? 'clipboard' : 'document'} />
                  </span>
                  <div>
                    <p>{item.title}</p>
                    <small>{item.detail ? `${item.detail} · ` : ''}{timeAgo(item.at)}</small>
                  </div>
                </li>
              ))}
            </ul>
          </article>
        </section>
      </section>

      {!cards.length && summary.length ? (
        <div className="sum-grid">
          {summary.map((item) => (
            <SummaryCard key={item.key} {...item} />
          ))}
        </div>
      ) : null}

      {show('work_requests') ? (
        <div className="board-grid board-grid--3">
          <Panel title="Work Requests by Status" tone="blue" icon="clipboard">
            {wrDonut ? (
              <DonutChart title="" total={wrDonut.total} segments={wrDonut.segments} filterLabel={locationLabel} />
            ) : <p className="dash-empty">No work requests yet.</p>}
          </Panel>
          <Panel title="Work Request Trend" tone="blue">
            {wrTrend ? (
              <MultiTrendChart title="" filterLabel={rangeLabel} series={wrTrend.series} points={wrTrend.points} />
            ) : <p className="dash-empty">No work request activity.</p>}
          </Panel>
          <Panel title="Top Request Categories" tone="blue">
            <RankBars rows={board.request_categories} empty="No request categories yet." />
          </Panel>
        </div>
      ) : null}

      {show('work_orders') ? (
        <Panel title="Work Orders" tone="green" icon="document" to={pathFor('work-orders/received')} className="board-panel--split">
          <div className="split-panel">
            <MiniStats items={[
              { label: 'Total', value: moduleKpi(modules, 'work_orders', 'total'), tone: 'blue', icon: 'document' },
              { label: 'Open', value: moduleKpi(modules, 'work_orders', 'queue'), tone: 'red', icon: 'alert' },
              { label: 'In Progress', value: moduleKpi(modules, 'work_orders', 'in_progress'), tone: 'orange', icon: 'chart' },
              { label: 'Completed', value: finished, tone: 'green', icon: 'document' },
              { label: 'Overdue', value: moduleKpi(modules, 'work_orders', 'overdue'), tone: 'purple', icon: 'alert' },
            ]} />
            <div>
              <div className="split-panel__chart-title">
                <h3>Work Orders Trend</h3>
                <span>{rangeLabel}</span>
              </div>
              <GroupedBars
                series={woTrend?.series}
                points={woTrend?.points}
                empty="No work orders created in this range."
              />
            </div>
          </div>
        </Panel>
      ) : null}

      {show('pm') ? (
        <div className="board-grid board-grid--3">
          <Panel title="PM Schedules" tone="teal" icon="calendar" to={pathFor('work-orders/scheduled')}>
            <MiniStats items={[
              { label: 'Total', value: moduleKpi(modules, 'pm', 'total'), tone: 'blue', icon: 'calendar' },
              { label: 'Active', value: moduleKpi(modules, 'pm', 'active'), tone: 'green', icon: 'calendar' },
              { label: 'Overdue', value: moduleKpi(modules, 'pm', 'overdue'), tone: 'red', icon: 'alert' },
              { label: 'Inactive', value: moduleKpi(modules, 'pm', 'inactive'), tone: 'slate', icon: 'calendar' },
            ]} />
          </Panel>
          <Panel title="PM Schedules Trend" tone="teal">
            <GroupedBars series={pmTrend?.series} points={pmTrend?.points} empty="No PM plans created in this range." />
          </Panel>
          <Panel title="PM by Frequency" tone="teal">
            {frequencyTotal ? (
              <DonutChart title="" total={frequencyTotal} segments={pmFrequency} filterLabel={locationLabel} />
            ) : <p className="dash-empty">No PM schedules yet.</p>}
          </Panel>
        </div>
      ) : null}

      {show('warranties') ? (
        <div className="board-grid board-grid--3">
          <Panel title="Warranty Manager" tone="orange" icon="shield" to={pathFor('warranty-manager/in-warranty')}>
            <MiniStats items={[
              { label: 'In Warranty', value: moduleKpi(modules, 'warranties', 'in_warranty') || moduleKpi(modules, 'warranties', 'active'), tone: 'green', icon: 'shield' },
              { label: 'Out of warranty', value: moduleKpi(modules, 'warranties', 'out_of_warranty'), tone: 'blue', icon: 'shield' },
              { label: 'Soon to Expired', value: moduleKpi(modules, 'warranties', 'expiring_soon'), tone: 'orange', icon: 'alert' },
              { label: 'Expired', value: moduleKpi(modules, 'warranties', 'expired'), tone: 'red', icon: 'alert' },
            ]} />
            <p className="mini-stats__hint">Soon to Expired is the next 30 days.</p>
          </Panel>
          <Panel title="Warranty Expiry Trend" tone="orange">
            <GroupedBars
              series={[
                { key: 'expiring', label: 'Expiring soon', color: '#F59E0B' },
                { key: 'expired', label: 'Expired', color: '#E63946' },
              ]}
              points={board.warranty_trend}
              empty="No warranty end dates in the last 6 months."
            />
          </Panel>
          <Panel title="Items Expiring Soon" tone="orange" to={pathFor('warranty-manager/soon-to-expired')}>
            <ExpiringItemList rows={board.expiring_items} pathFor={pathFor} />
          </Panel>
        </div>
      ) : null}

      {show('assets') ? (
        <div className="board-grid board-grid--3">
          <Panel title="Assets" tone="purple" icon="box" to={pathFor('masters/equipment')}>
            <MiniStats items={[
              { label: 'Total', value: assetStats?.total ?? moduleKpi(modules, 'assets', 'equipment'), tone: 'blue', icon: 'box' },
              { label: 'Operational', value: assetStats?.operational ?? 0, tone: 'green', icon: 'box' },
              { label: 'Under Maintenance', value: assetStats?.maintenance ?? 0, tone: 'orange', icon: 'alert' },
              { label: 'Inactive', value: assetStats?.inactive ?? 0, tone: 'red', icon: 'box' },
            ]} />
          </Panel>
          <Panel title="Assets by Department" tone="purple">
            <RankBars rows={assetStats?.departments} empty="No asset departments yet." />
          </Panel>
          <Panel title="Assets by Location" tone="purple">
            <RankBars rows={assetStats?.locations} empty="No asset locations yet." />
          </Panel>
        </div>
      ) : null}

      {show('tasks') ? (
        <div className="board-grid board-grid--tasks">
          <Panel title="Tasks & Follow-ups" tone="blue" icon="clipboard" to={pathFor('tasks-and-followups')}>
            <MiniStats items={[
              { label: 'Total', value: moduleKpi(modules, 'tasks', 'total'), tone: 'blue', icon: 'clipboard' },
              { label: 'Open', value: moduleKpi(modules, 'tasks', 'open'), tone: 'orange', icon: 'clipboard' },
              { label: 'Done', value: moduleKpi(modules, 'tasks', 'done'), tone: 'green', icon: 'document' },
              { label: 'Reminders', value: moduleKpi(modules, 'tasks', 'reminders'), tone: 'purple', icon: 'alert' },
            ]} />
          </Panel>
          <Panel title="Recent Activity" tone="green">
            {(board.activity || []).length ? (
              <ul className="activity-list">
                {board.activity.map((item) => (
                  <li key={item.id} className={`activity-list__item activity-list__item--${item.kind}`}>
                    <span>
                      <strong>{item.title}</strong>
                      <em>{item.detail || '—'}</em>
                    </span>
                    <time>{timeAgo(item.at)}</time>
                  </li>
                ))}
              </ul>
            ) : <p className="dash-empty">No recent activity.</p>}
          </Panel>
          <Panel title="Upcoming Tasks" tone="blue" to={pathFor('tasks-and-followups')}>
            <div className="dash-table-wrap">
              <table className="board-table">
                <thead>
                  <tr>
                    <th>Task</th>
                    <th>Due Date</th>
                    <th>Priority</th>
                    <th>Assignee</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {upcomingTasks.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="company-empty">No open tasks with a due date.</td>
                    </tr>
                  ) : upcomingTasks.map((task) => (
                    <tr key={task.id}>
                      <td>
                        <strong>{task.title}</strong>
                        <em>{task.location_name || ''}</em>
                      </td>
                      <td className={isToday(task.due_at) ? 'is-today' : ''}>
                        {isToday(task.due_at) ? 'Today' : formatDate(task.due_at)}
                      </td>
                      <td>{task.priority ? <span className={`priority-badge priority-badge--${String(task.priority).toLowerCase()}`}>{task.priority}</span> : '—'}</td>
                      <td>{task.assignee || '—'}</td>
                      <td><span className="status-badge">{task.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      ) : null}

      {(show('work_requests') || show('work_orders')) ? (
        <div className="board-grid board-grid--3">
          {show('work_requests') ? (
            <Panel title="Work Requests by Location" tone="purple">
              <RankBars rows={board.request_locations} empty="No location split for work requests." />
            </Panel>
          ) : null}
          {show('work_orders') ? (
            <Panel title="Work Orders by Priority" tone="green">
              {priority ? (
                <DonutChart title="" total={priority.total} segments={priority.segments} filterLabel={locationLabel} />
              ) : <p className="dash-empty">No work order priorities yet.</p>}
            </Panel>
          ) : null}
          {show('work_orders') ? (
            <Panel title="Overdue Work Orders" tone="red" icon="alert" to={pathFor('work-orders/received')}>
              <div className="dash-table-wrap">
                <table className="board-table">
                  <thead>
                    <tr>
                      <th>WO No.</th>
                      <th>Description</th>
                      <th>Location</th>
                      <th>Due Date</th>
                      <th>Days Overdue</th>
                      <th>Priority</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overdueOrders.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="company-empty">No overdue work orders.</td>
                      </tr>
                    ) : overdueOrders.map((order) => (
                      <tr key={order.id}>
                        <td><strong>{order.wo_number}</strong></td>
                        <td>{order.title}</td>
                        <td>{order.location_name}</td>
                        <td>{formatDate(order.due_at)}</td>
                        <td className="is-overdue">{order.days} days</td>
                        <td>{order.priority ? <span className={`priority-badge priority-badge--${order.priority}`}>{order.priority}</span> : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          ) : null}
        </div>
      ) : null}

      {orgTiles.length ? (
        <Panel title="Organization" tone="slate">
          <div className="org-tiles">
            {orgTiles.map((item) => {
              const body = (
                <>
                  <span>{item.label}</span>
                  <strong>{formatCount(item.value)}</strong>
                </>
              )
              return item.to ? (
                <Link key={item.label} to={item.to} className="org-tiles__item">{body}</Link>
              ) : (
                <div key={item.label} className="org-tiles__item">{body}</div>
              )
            })}
          </div>
        </Panel>
      ) : null}
    </div>
  )
}
