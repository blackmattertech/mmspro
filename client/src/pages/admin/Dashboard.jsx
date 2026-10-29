import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAdminStats } from '../../lib/api'
import { downloadClientCsv } from '../../lib/clientCsv'
import { ExportCsvButton } from '../../components/shared/ListTableChrome'
import { useAuth } from '../../hooks/useAuth'
import { useProfile } from '../../hooks/useProfile'
import './AdminDashboard.css'

const PLAN_META = {
  enterprise: { label: 'Enterprise', tone: 'enterprise' },
  pro: { label: 'Professional', tone: 'pro' },
  free: { label: 'Starter', tone: 'free' },
}

const AVATAR_COLORS = ['#7C3AED', '#2563EB', '#0F766E', '#EA580C', '#DB2777']

const STATUS_LEGEND = [
  { key: 'active', label: 'Active', color: '#22C55E' },
  { key: 'trial', label: 'Trial', color: '#86EFAC' },
  { key: 'expired', label: 'Expired', color: '#3B82F6' },
  { key: 'cancelled', label: 'Cancelled', color: '#EF4444' },
]

const RANGE_OPTIONS = [
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
]

function formatNumber(value) {
  return Number(value || 0).toLocaleString('en-IN')
}

function timeAgo(value) {
  const then = new Date(value).getTime()
  if (!Number.isFinite(then)) return ''
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60000))
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

function formatRange(days) {
  const end = new Date()
  const start = new Date()
  start.setDate(end.getDate() - (days - 1))
  const startLabel = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const endLabel = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return `${startLabel} – ${endLabel}`
}

function formatDay(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '—'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatMoney(amount, currency = 'INR') {
  const value = Number(amount)
  if (!Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currency || 'INR',
    maximumFractionDigits: 2,
  }).format(value)
}

function subscriptionState(row) {
  if (row.status === 'PAID' && row.expiresAt && new Date(row.expiresAt).getTime() <= Date.now()) {
    return { label: 'Expired', tone: 'inactive' }
  }
  if (row.status === 'PAID') return { label: 'Active', tone: 'active' }
  if (row.status === 'ACTIVE') return { label: 'Trial', tone: 'pending' }
  if (row.status === 'EXPIRED') return { label: 'Expired', tone: 'inactive' }
  if (row.status === 'TERMINATED') return { label: 'Cancelled', tone: 'inactive' }
  return { label: 'Failed', tone: 'inactive' }
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return 'C'
  return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

function CompanyMark({ company, color }) {
  const [failed, setFailed] = useState(false)
  if (company.logo_signed_url && !failed) {
    return (
      <img
        src={company.logo_signed_url}
        alt=""
        className="sa-company__logo"
        onError={() => setFailed(true)}
      />
    )
  }
  return <span style={{ background: color }}>{initials(company.name)}</span>
}

function withinRange(value, days) {
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return false
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - (days - 1))
  return time >= start.getTime()
}

function percent(part, whole) {
  if (!whole) return 0
  return Math.max(0, Math.min(100, Math.round((part / whole) * 100)))
}

function Icon({ name }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: '1.8', strokeLinecap: 'round', strokeLinejoin: 'round' }
  if (name === 'building') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>
        <path d="M4 20V6.5A1.5 1.5 0 0 1 5.5 5H14v15" />
        <path d="M14 9h4.5A1.5 1.5 0 0 1 20 10.5V20" />
        <path d="M4 20h16M8 9h2M8 13h2M8 17h2" />
      </svg>
    )
  }
  if (name === 'card') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <path d="M3 10h18M7 15h4" />
      </svg>
    )
  }
  if (name === 'users') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>
        <circle cx="9" cy="9" r="3" />
        <path d="M3.5 18.5a5.5 5.5 0 0 1 11 0" />
        <circle cx="17" cy="9.5" r="2.2" />
        <path d="M16.2 18.5a4.5 4.5 0 0 1 4.3-3" />
      </svg>
    )
  }
  if (name === 'rupee') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>
        <path d="M7 6h10M7 10h10M7 6c4 0 6 2 6 4s-2 4-6 4l7 6" />
      </svg>
    )
  }
  if (name === 'shield') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>
        <path d="M12 3.5 19 6.2v5.3c0 4.2-2.8 7.2-7 8.9-4.2-1.7-7-4.7-7-8.9V6.2L12 3.5Z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    )
  }
  if (name === 'search') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>
        <circle cx="11" cy="11" r="6.5" />
        <path d="m16 16 4 4" />
      </svg>
    )
  }
  if (name === 'bell') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>
        <path d="M6 16V10a6 6 0 1 1 12 0v6l1.5 2H4.5L6 16Z" />
        <path d="M10 19a2 2 0 0 0 4 0" />
      </svg>
    )
  }
  if (name === 'mail') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>
        <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
        <path d="m4 7 8 6 8-6" />
      </svg>
    )
  }
  if (name === 'calendar') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M8 3.5v3M16 3.5v3M4 10h16" />
      </svg>
    )
  }
  if (name === 'chevron') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>
        <path d="m7 10 5 5 5-5" />
      </svg>
    )
  }
  if (name === 'arrow') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>
        <path d="M12 19V6M7 10l5-5 5 5" />
      </svg>
    )
  }
  if (name === 'chart') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>
        <path d="M4 19h16M7 16v-4M12 16V8M17 16v-6" />
      </svg>
    )
  }
  if (name === 'sync') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>
        <path d="M20 12a8 8 0 0 1-13.5 5.8" />
        <path d="M4 12a8 8 0 0 1 13.5-5.8" />
        <path d="M16 3.5v4h4M8 20.5v-4H4" />
      </svg>
    )
  }
  if (name === 'pulse') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>
        <path d="M4 12h3l2-5 3 10 2-5h6" />
      </svg>
    )
  }
  if (name === 'grid') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>
        <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
        <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
        <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
        <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
      </svg>
    )
  }
  if (name === 'more') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>
        <circle cx="12" cy="6" r="1" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="12" cy="18" r="1" fill="currentColor" stroke="none" />
      </svg>
    )
  }
  return null
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

function UptimeBars() {
  const heights = [10, 14, 12, 18, 16, 22, 15, 24, 18, 26, 20, 28, 22, 30]
  return (
    <div className="sa-bars" aria-hidden="true">
      {heights.map((height, index) => <span key={index} style={{ height }} />)}
    </div>
  )
}

function GrowthChart({ points }) {
  const width = 560
  const height = 220
  const pad = { top: 16, right: 16, bottom: 28, left: 32 }
  const max = Math.max(4, ...points.flatMap((point) => [point.total, point.active]))
  const step = Math.ceil(max / 4)
  const yMax = step * 4
  const xAt = (index) => {
    if (points.length <= 1) return (pad.left + width - pad.right) / 2
    return pad.left + (index * (width - pad.left - pad.right)) / (points.length - 1)
  }
  const yAt = (value) => pad.top + ((yMax - value) / yMax) * (height - pad.top - pad.bottom)
  const line = (key) => points.map((point, index) => `${index ? 'L' : 'M'}${xAt(index)},${yAt(point[key])}`).join(' ')
  const totalLine = line('total')
  const area = `${totalLine} L${xAt(points.length - 1)},${yAt(0)} L${xAt(0)},${yAt(0)} Z`

  return (
    <svg className="sa-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Companies growth">
      <defs>
        <linearGradient id="sa-growth-fill" x1="0" y1="0" x2="0" y2="1">
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
      <path d={area} fill="url(#sa-growth-fill)" />
      <path d={line('active')} className="sa-chart__line sa-chart__line--active" />
      <path d={totalLine} className="sa-chart__line sa-chart__line--total" />
      {points.map((point, index) => (
        <g key={point.label}>
          <circle cx={xAt(index)} cy={yAt(point.total)} r="3.2" className="sa-chart__dot sa-chart__dot--total" />
          <circle cx={xAt(index)} cy={yAt(point.active)} r="3.2" className="sa-chart__dot sa-chart__dot--active" />
          <text x={xAt(index)} y={height - 8} className="sa-chart__axis" textAnchor="middle">
            {point.label}
          </text>
        </g>
      ))}
    </svg>
  )
}

function StatusDonut({ counts }) {
  const rows = STATUS_LEGEND.map((slice) => ({ ...slice, value: Number(counts?.[slice.key] || 0) }))
  const total = rows.reduce((sum, slice) => sum + slice.value, 0)
  const radius = 54
  const circumference = 2 * Math.PI * radius
  let offset = 0
  const drawn = rows.filter((slice) => slice.value > 0)

  return (
    <div className="sa-donut">
      <svg viewBox="0 0 160 160" role="img" aria-label="Subscription status">
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
              strokeLinecap="butt"
              transform="rotate(-90 80 80)"
            />
          )
          offset += length
          return element
        })}
        <text x="80" y="78" className="sa-donut__value" textAnchor="middle">{formatNumber(total)}</text>
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
                <strong>{formatNumber(slice.value)} ({share}%)</strong>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function RowMenu({ label, items }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const close = (event) => {
      if (!ref.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div className="sa-menu" ref={ref}>
      <button
        type="button"
        className="sa-menu__btn"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="more" />
      </button>
      {open && (
        <div className="sa-menu__pop" role="menu">
          {items.map((item) => (
            item.to ? (
              <Link key={item.label} to={item.to} role="menuitem" onClick={() => setOpen(false)}>
                {item.label}
              </Link>
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  item.onClick?.()
                  setOpen(false)
                }}
              >
                {item.label}
              </button>
            )
          ))}
        </div>
      )}
    </div>
  )
}

export default function AdminDashboard() {
  const { signOut } = useAuth()
  const { displayName, avatarUrl } = useProfile()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [months, setMonths] = useState(6)
  const [rangeDays, setRangeDays] = useState(30)
  const [userOpen, setUserOpen] = useState(false)
  const [rangeOpen, setRangeOpen] = useState(false)
  const userRef = useRef(null)
  const rangeRef = useRef(null)

  const load = () => {
    setLoading(true)
    setError('')
    getAdminStats()
      .then((data) => {
        setStats(data)
        setError('')
      })
      .catch((err) => {
        setError(err.message || 'Could not load the dashboard')
        setStats(null)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (!userOpen && !rangeOpen) return undefined
    const close = (event) => {
      if (userOpen && !userRef.current?.contains(event.target)) setUserOpen(false)
      if (rangeOpen && !rangeRef.current?.contains(event.target)) setRangeOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [userOpen, rangeOpen])

  const growth = useMemo(() => (stats?.growth || []).slice(-months), [stats, months])
  const query = search.trim().toLowerCase()
  const companies = useMemo(() => {
    const rows = stats?.companies || []
    const filtered = query
      ? rows.filter((row) => `${row.name} ${row.slug} ${row.plan}`.toLowerCase().includes(query))
      : rows
    return filtered.slice(0, 5)
  }, [stats, query])

  const name = displayName || 'Administrator'
  const subscriptions = stats?.subscriptions
  const cashfreeLabel = subscriptions?.environment === 'production' ? 'Cashfree Production' : 'Cashfree Sandbox'
  const statusCounts = subscriptions?.statusCounts || {
    active: subscriptions?.active || 0,
    trial: subscriptions?.pending || 0,
    expired: 0,
    cancelled: 0,
  }
  const companySeries = (stats?.growth || []).map((point) => point.total)
  const userSeries = (stats?.growth || []).map((point) => point.users ?? 0)
  const activeSeries = subscriptions?.sparklines?.active?.length
    ? subscriptions.sparklines.active
    : [0, subscriptions?.active || 0]
  const paidSeries = subscriptions?.sparklines?.paid?.length
    ? subscriptions.sparklines.paid
    : [0, subscriptions?.paid || 0]
  const companyShare = percent(stats?.activeOrganizations, stats?.totalOrganizations)
  const userShare = stats?.totalUsers ? 100 : 0
  const subscriptionShare = subscriptions?.paid ? percent(subscriptions.active, subscriptions.paid) : (subscriptions?.active ? 100 : 0)
  const paidShare = subscriptions?.paid ? 100 : 0
  const uptimeShare = error ? 0 : 100

  const activity = (stats?.activity || []).filter((item) => !query || item.title.toLowerCase().includes(query))
  const visibleActivity = activity.filter((item) => withinRange(item.at, rangeDays))
  const subscriptionRows = (subscriptions?.recent || []).filter((row) => {
    const haystack = `${row.planName} ${row.orderId} ${row.status}`.toLowerCase()
    if (query && !haystack.includes(query)) return false
    return withinRange(row.paidAt || row.createdAt, rangeDays)
  })

  const overview = [
    { label: 'Total Companies', value: formatNumber(stats?.totalOrganizations), share: companyShare, icon: 'building', tone: 'violet', bar: '#7C3AED' },
    { label: 'Total Users', value: formatNumber(stats?.totalUsers), share: userShare, icon: 'users', tone: 'blue', bar: '#3B82F6' },
    { label: 'Active Subscriptions', value: formatNumber(subscriptions?.active), share: subscriptionShare || (subscriptions?.active ? 100 : 0), icon: 'card', tone: 'green', bar: '#22C55E' },
    { label: 'Paid Plans', value: formatNumber(subscriptions?.paid), share: paidShare, icon: 'rupee', tone: 'orange', bar: '#F97316' },
    {
      label: 'Platform Status',
      value: error ? 'Check connection' : 'Operational',
      share: uptimeShare,
      icon: 'shield',
      tone: 'mint',
      bar: '#22C55E',
      valueTone: error ? 'warn' : 'ok',
    },
  ]

  const cards = [
    {
      label: 'Total Companies',
      value: formatNumber(stats?.totalOrganizations),
      delta: `+${formatNumber(stats?.newOrganizationsThisMonth)} this month`,
      icon: 'building',
      tone: 'violet',
      series: companySeries,
      color: '#8B5CF6',
    },
    {
      label: 'Active Subscriptions',
      value: formatNumber(subscriptions?.active),
      delta: `${formatNumber(subscriptions?.active)} currently active`,
      icon: 'users',
      tone: 'green',
      series: activeSeries,
      color: '#22C55E',
    },
    {
      label: 'Total Users',
      value: formatNumber(stats?.totalUsers),
      delta: `+${formatNumber(stats?.newUsersThisMonth)} this month`,
      icon: 'users',
      tone: 'blue',
      series: userSeries,
      color: '#3B82F6',
    },
    {
      label: 'Paid Plans',
      value: formatNumber(subscriptions?.paid),
      delta: cashfreeLabel,
      deltaTone: 'muted',
      icon: 'rupee',
      tone: 'orange',
      series: paidSeries,
      color: '#F97316',
    },
  ]

  return (
    <div className="sa-dash">
      <header className="sa-topbar">
        <p className="sa-topbar__title">Dashboard</p>
        <div className="sa-topbar__tools">
          <label className="sa-search">
            <Icon name="search" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search companies, users, orders..."
              aria-label="Search companies, users, and orders"
            />
          </label>
          <button
            type="button"
            className="sa-icon-btn"
            aria-label="Recent activity"
            onClick={() => document.getElementById('sa-activity')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          >
            <Icon name="bell" />
            {visibleActivity.length > 0 && <span className="sa-icon-btn__badge" />}
          </button>
          <button type="button" className="sa-icon-btn" aria-label="Messages">
            <Icon name="mail" />
          </button>
          <div className="sa-user" ref={userRef}>
            <button type="button" className="sa-user__trigger" onClick={() => setUserOpen((open) => !open)} aria-expanded={userOpen}>
              <span className="sa-user__avatar">
                {avatarUrl ? <img src={avatarUrl} alt="" /> : (name[0] || 'A').toUpperCase()}
              </span>
              <span>
                <strong>{name}</strong>
                <small>Super Admin</small>
              </span>
              <Icon name="chevron" />
            </button>
            {userOpen && (
              <button type="button" className="sa-user__menu" onClick={signOut}>
                Sign out
              </button>
            )}
          </div>
        </div>
      </header>

      <section className="sa-welcome">
        <div>
          <h1>Welcome back, {name}! <span aria-hidden="true">👋</span></h1>
          <p>Here&apos;s what&apos;s happening in your system today.</p>
        </div>
        <div className="sa-range" ref={rangeRef}>
          <button type="button" className="sa-range__btn" aria-expanded={rangeOpen} onClick={() => setRangeOpen((open) => !open)}>
            <Icon name="calendar" />
            {formatRange(rangeDays)}
            <Icon name="chevron" />
          </button>
          {rangeOpen && (
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
          )}
        </div>
      </section>

      {error && <p className="sa-dash__error">{error}</p>}
      {subscriptions?.tableReady === false && (
        <p className="sa-dash__error">Apply supabase-patches/86-platform-subscriptions.sql so Cashfree payments show up here.</p>
      )}

      <section className="sa-kpis" aria-busy={loading}>
        {cards.map((card) => (
          <article key={card.label} className="sa-kpi">
            <div className="sa-kpi__top">
              <span className={`sa-kpi__icon sa-kpi__icon--${card.tone}`}>
                <Icon name={card.icon} />
              </span>
              <div>
                <p>{card.label}</p>
                <strong>{loading ? '—' : card.value}</strong>
                <span className={card.deltaTone === 'muted' ? 'is-muted' : ''}>
                  {card.deltaTone !== 'muted' && <Icon name="arrow" />}
                  {loading ? 'Loading' : card.delta}
                </span>
              </div>
            </div>
            <Sparkline values={card.series} color={card.color} id={`spark-${card.tone}`} />
          </article>
        ))}
        <article className="sa-kpi">
          <div className="sa-kpi__top">
            <span className="sa-kpi__icon sa-kpi__icon--mint">
              <Icon name="shield" />
            </span>
            <div>
              <p>System Uptime</p>
              <strong className={error ? 'is-warn' : 'is-ok'}>{loading ? '—' : error ? 'Offline' : '99.9%'}</strong>
              <span className={error ? 'is-warn' : ''}>{loading ? 'Loading' : error ? 'Stats request failed' : 'All systems operational'}</span>
            </div>
          </div>
          <UptimeBars />
        </article>
      </section>

      <section className="sa-panel sa-subs">
        <header className="sa-panel__head">
          <h2>
            <span className="sa-panel__icon sa-panel__icon--orange"><Icon name="card" /></span>
            Cashfree Subscriptions
          </h2>
          <div className="sa-panel__links">
            <span className="sa-subs__env">{cashfreeLabel}</span>
            <Link to="/admin/plans">View All</Link>
          </div>
        </header>
        <div className="sa-table-wrap">
          <table className="sa-table">
            <thead>
              <tr>
                <th>Plan</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Order ID</th>
                <th>Started On</th>
                <th>Expires On</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {subscriptionRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="sa-empty">No Cashfree checkouts in this range. A plan purchase on the landing page will show up here.</td>
                </tr>
              )}
              {subscriptionRows.map((row) => {
                const state = subscriptionState(row)
                return (
                  <tr key={row.id}>
                    <td><strong>{row.planName}</strong></td>
                    <td>{formatMoney(row.amount, row.currency)}</td>
                    <td><span className={`sa-status sa-status--${state.tone}`}>{state.label}</span></td>
                    <td><span className="sa-subs__order">{row.orderId}</span></td>
                    <td>{formatDay(row.paidAt || row.createdAt)}</td>
                    <td>{formatDay(row.expiresAt)}</td>
                    <td>
                      <div className="sa-actions">
                        <Link to="/admin/plans">View</Link>
                        <RowMenu
                          label={`Actions for ${row.orderId}`}
                          items={[{
                            label: 'Copy order ID',
                            onClick: () => navigator.clipboard?.writeText(row.orderId),
                          }]}
                        />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="sa-grid">
        <article className="sa-panel">
          <header className="sa-panel__head">
            <h2>
              <span className="sa-panel__icon sa-panel__icon--violet"><Icon name="chart" /></span>
              Companies Growth
            </h2>
            <select value={months} onChange={(event) => setMonths(Number(event.target.value))} aria-label="Growth range">
              <option value={3}>Last 3 Months</option>
              <option value={6}>Last 6 Months</option>
              <option value={12}>Last 12 Months</option>
            </select>
          </header>
          <div className="sa-chart-legend">
            <span><i className="sa-chart-legend__total" /> Total Companies</span>
            <span><i className="sa-chart-legend__active" /> Active Companies</span>
          </div>
          {growth.length ? <GrowthChart points={growth} /> : <p className="sa-empty">No company history yet.</p>}
        </article>

        <article className="sa-panel">
          <header className="sa-panel__head">
            <h2>
              <span className="sa-panel__icon sa-panel__icon--green"><Icon name="sync" /></span>
              Subscription Status
            </h2>
          </header>
          <StatusDonut counts={statusCounts} />
        </article>

        <article className="sa-panel sa-panel--scroll" id="sa-activity">
          <header className="sa-panel__head">
            <h2>
              <span className="sa-panel__icon sa-panel__icon--violet"><Icon name="pulse" /></span>
              Recent System Activities
            </h2>
            <ExportCsvButton
              label="Export"
              onClick={() => downloadClientCsv('activity.csv', visibleActivity, [
                { label: 'Title', value: (row) => row.title },
                { label: 'When', value: (row) => row.at },
                { label: 'Kind', value: (row) => row.kind },
              ])}
            />
            <Link to="/admin/users">View All</Link>
          </header>
          <ul className="sa-activity">
            {visibleActivity.length === 0 && <li className="sa-empty">No activity in this range.</li>}
            {visibleActivity.map((item) => (
              <li key={item.id}>
                <span className={`sa-activity__icon sa-activity__icon--${item.kind}`}>
                  <Icon name={item.kind === 'company' ? 'building' : item.kind === 'subscription' ? 'card' : 'users'} />
                </span>
                <div>
                  <p>{item.title}</p>
                  <small>{timeAgo(item.at)}</small>
                </div>
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="sa-grid sa-grid--bottom">
        <article className="sa-panel">
          <header className="sa-panel__head">
            <h2>
              <span className="sa-panel__icon sa-panel__icon--violet"><Icon name="building" /></span>
              Top Companies
            </h2>
            <ExportCsvButton
              label="Export"
              onClick={() => downloadClientCsv('companies.csv', companies, [
                { label: 'Company', value: (row) => row.name },
                { label: 'Plan', value: (row) => row.plan },
                { label: 'Users', value: (row) => row.users },
                { label: 'Status', value: (row) => (row.is_active ? 'Active' : 'Inactive') },
                { label: 'Created', value: (row) => row.created_at },
              ])}
            />
            <Link to="/admin/organizations">View All</Link>
          </header>
          <div className="sa-table-wrap">
            <table className="sa-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Plan</th>
                  <th>Users</th>
                  <th>Status</th>
                  <th>Created On</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {companies.length === 0 && (
                  <tr>
                    <td colSpan={6} className="sa-empty">No companies match this view.</td>
                  </tr>
                )}
                {companies.map((company, index) => {
                  const plan = PLAN_META[company.plan] || PLAN_META.free
                  return (
                    <tr key={company.id}>
                      <td>
                        <div className="sa-company">
                          <CompanyMark company={company} color={AVATAR_COLORS[index % AVATAR_COLORS.length]} />
                          <div>
                            <strong>{company.name}</strong>
                            <small>{company.slug}</small>
                          </div>
                        </div>
                      </td>
                      <td><span className={`sa-plan sa-plan--${plan.tone}`}>{plan.label}</span></td>
                      <td>{formatNumber(company.users)}</td>
                      <td>
                        <span className={`sa-status ${company.is_active ? 'sa-status--active' : 'sa-status--inactive'}`}>
                          {company.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>{formatDay(company.created_at)}</td>
                      <td>
                        <div className="sa-actions">
                          <Link to={`/admin/organizations/${company.id}/assets`}>View</Link>
                          <RowMenu
                            label={`Actions for ${company.name}`}
                            items={[
                              { label: 'Fields', to: `/admin/organizations/${company.id}/assets` },
                              { label: 'Assets', to: `/admin/organizations/${company.id}/equipment` },
                            ]}
                          />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </article>

        <article className="sa-panel">
          <header className="sa-panel__head">
            <h2>
              <span className="sa-panel__icon sa-panel__icon--violet"><Icon name="grid" /></span>
              System Overview
            </h2>
          </header>
          <ul className="sa-overview">
            {overview.map((item) => (
              <li key={item.label}>
                <span className={`sa-overview__icon sa-overview__icon--${item.tone}`}><Icon name={item.icon} /></span>
                <div className="sa-overview__body">
                  <div className="sa-overview__top">
                    <p>{item.label}</p>
                    <strong className={item.valueTone ? `is-${item.valueTone}` : ''}>{loading ? '—' : item.value}</strong>
                    <em>{loading ? '—' : `${item.share}%`}</em>
                  </div>
                  <div className="sa-overview__bar" aria-hidden="true">
                    <div style={{ width: `${item.share}%`, background: item.bar }} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </article>
      </section>
    </div>
  )
}
