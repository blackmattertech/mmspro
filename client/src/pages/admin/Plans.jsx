import { useEffect, useMemo, useRef, useState } from 'react'
import { createAdminPlan, deleteAdminPlan, getAdminPlans, updateAdminPlan } from '../../lib/api'
import { downloadClientCsv } from '../../lib/clientCsv'
import { ExportCsvButton } from '../../components/shared/ListTableChrome'
import TrashIcon from '../../components/ui/TrashIcon'
import { useAuth } from '../../hooks/useAuth'
import { useProfile } from '../../hooks/useProfile'
import './Plans.css'

const INTERVALS = [
  { value: 'monthly', label: 'Monthly', days: 30 },
  { value: 'quarterly', label: 'Quarterly', days: 90 },
  { value: 'half_yearly', label: 'Half yearly', days: 180 },
  { value: 'yearly', label: 'Yearly', days: 365 },
  { value: 'trial', label: 'Trial', days: 30 },
  { value: 'custom', label: 'Custom', days: '' },
]

const DAY_SHORTCUTS = [30, 60, 90, 180, 365]
const FILTERS = [
  { id: 'all', label: 'All plans' },
  { id: 'active', label: 'Active' },
  { id: 'inactive', label: 'Inactive' },
]

const TYPE_META = {
  yearly: { label: 'Yearly', tone: 'yearly', icon: 'crown' },
  quarterly: { label: 'Quarterly', tone: 'quarterly', icon: 'chart' },
  half_yearly: { label: 'Half yearly', tone: 'half', icon: 'chart' },
  monthly: { label: 'Monthly', tone: 'monthly', icon: 'leaf' },
  trial: { label: 'Trial', tone: 'trial', icon: 'flask' },
  custom: { label: 'Custom', tone: 'custom', icon: 'cube' },
}

const EMPTY_FORM = {
  name: '',
  interval_type: 'monthly',
  duration_days: '30',
  price: '',
  description: '',
  is_active: true,
}

function typeMeta(value) {
  return TYPE_META[value] || TYPE_META.custom
}

function formatPrice(price, currency = 'INR') {
  const amount = price == null || price === '' ? 0 : Number(price)
  if (!Number.isFinite(amount)) return '—'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currency || 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatCompactMoney(price, currency = 'INR') {
  const amount = Number(price) || 0
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currency || 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatCount(value) {
  return Number(value || 0).toLocaleString('en-IN')
}

function Icon({ name }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: '1.8', strokeLinecap: 'round', strokeLinejoin: 'round' }
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
  if (name === 'chevron') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>
        <path d="m7 10 5 5 5-5" />
      </svg>
    )
  }
  if (name === 'plus') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>
        <path d="M12 6v12M6 12h12" />
      </svg>
    )
  }
  if (name === 'bolt') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>
        <path d="M13 3 5 13h6l-1 8 8-11h-6l1-7Z" />
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
  if (name === 'chart') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>
        <path d="M4 16.5 9 11l3.2 3.2L20 7" />
        <path d="M14.5 7H20v5.5" />
      </svg>
    )
  }
  if (name === 'cube') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>
        <path d="M12 3.5 20 8v8l-8 4.5L4 16V8l8-4.5Z" />
        <path d="M12 12.2 20 8M12 12.2 4 8M12 12.2V20.5" />
      </svg>
    )
  }
  if (name === 'crown') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>
        <path d="M4 16.5 6.2 8l3.3 3.2L12 6.5l2.5 4.7L17.8 8 20 16.5H4Z" />
        <path d="M5 19h14" />
      </svg>
    )
  }
  if (name === 'leaf') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>
        <path d="M5 19s1-8 7.5-11.5S20 4 20 4s-.5 7.5-4 11.5S5 19 5 19Z" />
        <path d="M9 14.5c1.2-1.2 3-2.5 5.5-3.5" />
      </svg>
    )
  }
  if (name === 'flask') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>
        <path d="M9 3h6M10 3v6.2L5.8 18A3 3 0 0 0 8.4 22h7.2a3 3 0 0 0 2.6-4L14 9.2V3" />
        <path d="M8.2 15h7.6" />
      </svg>
    )
  }
  if (name === 'pencil') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>
        <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
        <path d="m13.5 6.5 3 3" />
      </svg>
    )
  }
  if (name === 'more') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>
        <circle cx="6" cy="12" r="1.2" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
        <circle cx="18" cy="12" r="1.2" fill="currentColor" stroke="none" />
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
  return null
}

function Sparkline({ values, color, id }) {
  const nums = values?.length ? values.map((value) => Number(value) || 0) : [0, 0]
  const width = 92
  const height = 32
  const min = Math.min(...nums)
  const max = Math.max(...nums)
  const span = max - min || 1
  const xAt = (index) => (nums.length <= 1 ? width / 2 : (index * (width - 4)) / (nums.length - 1) + 2)
  const yAt = (value) => 3 + ((max - value) / span) * (height - 8)
  const line = nums.map((value, index) => `${index ? 'L' : 'M'}${xAt(index)},${yAt(value)}`).join(' ')
  const area = `${line} L${xAt(nums.length - 1)},${height} L${xAt(0)},${height} Z`
  return (
    <svg className="plans-spark" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function Delta({ value }) {
  if (value == null) return null
  const up = value >= 0
  return (
    <span className={`plans-delta ${up ? 'is-up' : 'is-down'}`}>
      <Icon name="arrow" />
      {up ? '+' : ''}{value}%
    </span>
  )
}

export default function Plans() {
  const { signOut } = useAuth()
  const { displayName, avatarUrl } = useProfile()
  const [plans, setPlans] = useState([])
  const [stats, setStats] = useState(null)
  const [tableReady, setTableReady] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [filterOpen, setFilterOpen] = useState(false)
  const [menuId, setMenuId] = useState(null)
  const [userOpen, setUserOpen] = useState(false)
  const formRef = useRef(null)
  const userRef = useRef(null)
  const filterRef = useRef(null)

  const load = () => {
    setLoading(true)
    getAdminPlans()
      .then((data) => {
        setPlans(data.plans || [])
        setStats(data.stats || null)
        setTableReady(data.tableReady !== false)
      })
      .catch((err) => setError(err.message || 'Could not load plans'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    const close = (event) => {
      if (!userRef.current?.contains(event.target)) setUserOpen(false)
      if (!filterRef.current?.contains(event.target)) setFilterOpen(false)
      if (!event.target.closest?.('.plans-menu')) setMenuId(null)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const setField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const chooseInterval = (interval) => {
    const preset = INTERVALS.find((item) => item.value === interval)
    setForm((current) => ({
      ...current,
      interval_type: interval,
      duration_days: preset?.days === '' ? current.duration_days : String(preset?.days ?? ''),
    }))
  }

  const revealForm = () => {
    setFormOpen(true)
    window.setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40)
  }

  const openCreate = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setError('')
    setNotice('')
    revealForm()
  }

  const startEdit = (plan) => {
    setEditingId(plan.id)
    setMenuId(null)
    setForm({
      name: plan.name,
      interval_type: plan.interval_type,
      duration_days: String(plan.duration_days),
      price: plan.price == null ? '' : String(plan.price),
      description: plan.description || '',
      is_active: plan.is_active !== false,
    })
    setError('')
    setNotice('')
    revealForm()
  }

  const resetForm = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  const quickTrial = () => {
    setEditingId(null)
    setError('')
    setNotice('')
    setForm({
      name: 'Trial',
      interval_type: 'trial',
      duration_days: '30',
      price: '0',
      description: 'Try before you buy',
      is_active: true,
    })
    revealForm()
  }

  const save = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    const body = {
      name: form.name,
      interval_type: form.interval_type,
      duration_days: Number(form.duration_days),
      price: form.price === '' ? null : Number(form.price),
      description: form.description.slice(0, 500),
      is_active: form.is_active,
    }
    try {
      if (editingId) await updateAdminPlan(editingId, body)
      else await createAdminPlan(body)
      setNotice(editingId ? 'Plan updated.' : 'Plan created.')
      resetForm()
      setFormOpen(false)
      load()
    } catch (err) {
      setError(err.message || 'Could not save plan')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (plan) => {
    setMenuId(null)
    if (!window.confirm(`Delete “${plan.name}”?`)) return
    setError('')
    setNotice('')
    try {
      await deleteAdminPlan(plan.id)
      if (editingId === plan.id) {
        resetForm()
        setFormOpen(false)
      }
      setNotice('Plan deleted.')
      load()
    } catch (err) {
      setError(err.message || 'Could not delete plan')
    }
  }

  const activeCount = plans.filter((plan) => plan.is_active !== false).length
  const inactiveCount = plans.length - activeCount
  const query = search.trim().toLowerCase()
  const visiblePlans = useMemo(() => {
    return [...plans]
      .filter((plan) => {
        if (filter === 'active' && plan.is_active === false) return false
        if (filter === 'inactive' && plan.is_active !== false) return false
        if (!query) return true
        const type = typeMeta(plan.interval_type).label
        return `${plan.name} ${plan.description || ''} ${type}`.toLowerCase().includes(query)
      })
      .sort((left, right) => (Number(right.price) || 0) - (Number(left.price) || 0) || left.name.localeCompare(right.name))
  }, [plans, filter, query])

  const name = displayName || 'Administrator'
  const currency = plans[0]?.currency || 'INR'
  const popular = stats?.popular_plan

  return (
    <div className="plans-page">
      <header className="plans-top">
        <div>
          <h1>Plans</h1>
          <p>Create and manage subscription plans. A trial can last 30 days, 60 days, or any number of days you set.</p>
        </div>
        <div className="plans-top__tools">
          <ExportCsvButton
            onClick={() => downloadClientCsv('plans.csv', visiblePlans, [
              { label: 'Name', value: (row) => row.name },
              { label: 'Description', value: (row) => row.description },
              { label: 'Interval', value: (row) => row.interval_type },
              { label: 'Amount', value: (row) => row.price },
              { label: 'Currency', value: (row) => row.currency },
              { label: 'Trial days', value: (row) => row.trial_days ?? '' },
              { label: 'Active', value: (row) => (row.is_active === false ? 'No' : 'Yes') },
              { label: 'Created', value: (row) => row.created_at },
            ])}
          />
          <label className="plans-search">
            <Icon name="search" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search plans..."
              aria-label="Search plans"
            />
          </label>
          <button type="button" className="plans-icon-btn" aria-label="Notifications" onClick={() => formRef.current?.scrollIntoView({ behavior: 'smooth' })}>
            <Icon name="bell" />
          </button>
          <div className="plans-user" ref={userRef}>
            <button type="button" className="plans-user__trigger" aria-expanded={userOpen} onClick={() => setUserOpen((open) => !open)}>
              <span className="plans-user__avatar">
                {avatarUrl ? <img src={avatarUrl} alt="" /> : (name[0] || 'A').toUpperCase()}
              </span>
              <span>
                <strong>{name}</strong>
                <small>Super Admin</small>
              </span>
              <Icon name="chevron" />
            </button>
            {userOpen && (
              <button type="button" className="plans-user__menu" onClick={signOut}>Sign out</button>
            )}
          </div>
        </div>
      </header>

      {!tableReady && (
        <p className="plans-alert">Apply supabase-patches/85-platform-plans.sql before creating plans.</p>
      )}
      {error && <p className="plans-alert">{error}</p>}
      {notice && <p className="plans-notice">{notice}</p>}

      <section className="plans-kpis" aria-busy={loading}>
        <article className="plans-kpi">
          <span className="plans-kpi__icon plans-kpi__icon--rose"><Icon name="calendar" /></span>
          <div>
            <p>Total Plans</p>
            <strong>{loading ? '—' : formatCount(plans.length)}</strong>
            <small>{loading ? 'Loading' : `${formatCount(activeCount)} active · ${formatCount(inactiveCount)} inactive`}</small>
          </div>
        </article>
        <article className="plans-kpi">
          <span className="plans-kpi__icon plans-kpi__icon--green"><Icon name="users" /></span>
          <div>
            <p>Total Subscribers</p>
            <strong>{loading ? '—' : formatCount(stats?.subscribers)}</strong>
            <Delta value={loading ? null : stats?.subscriber_delta} />
            <Sparkline values={stats?.subscriber_series} color="#22C55E" id="plans-spark-subscribers" />
          </div>
        </article>
        <article className="plans-kpi">
          <span className="plans-kpi__icon plans-kpi__icon--blue"><Icon name="rupee" /></span>
          <div>
            <p>Total Revenue</p>
            <strong>{loading ? '—' : formatCompactMoney(stats?.revenue, currency)}</strong>
            <Delta value={loading ? null : stats?.revenue_delta} />
            <Sparkline values={stats?.revenue_series} color="#3B82F6" id="plans-spark-revenue" />
          </div>
        </article>
        <article className="plans-kpi">
          <span className="plans-kpi__icon plans-kpi__icon--amber"><Icon name="chart" /></span>
          <div>
            <p>Average Purchase Value</p>
            <strong>{loading ? '—' : formatCompactMoney(stats?.average_purchase, currency)}</strong>
            <Delta value={loading ? null : stats?.average_delta} />
            <Sparkline values={stats?.average_series} color="#F59E0B" id="plans-spark-average" />
          </div>
        </article>
        <article className="plans-kpi">
          <span className="plans-kpi__icon plans-kpi__icon--violet"><Icon name="cube" /></span>
          <div>
            <p>Most Popular Plan</p>
            <strong>{loading ? '—' : (popular?.name || '—')}</strong>
            <small>{loading ? 'Loading' : popular ? `${formatCount(popular.subscribers)} subscribers` : 'No paid subscribers yet'}</small>
          </div>
        </article>
      </section>

      <section className="plans-card">
        <div className="plans-card__head plans-card__head--table">
          <div>
            <h2>All Plans ({plans.length})</h2>
            <p>Manage your subscription plans, pricing, and status.</p>
          </div>
          <div className="plans-table__tools">
            <label className="plans-search plans-search--table">
              <Icon name="search" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search plans..."
                aria-label="Filter the plans table"
              />
            </label>
            <div className="plans-filter" ref={filterRef}>
              <button type="button" className="plans-filter__btn" aria-expanded={filterOpen} onClick={() => setFilterOpen((open) => !open)}>
                Filter
                <Icon name="chevron" />
              </button>
              {filterOpen && (
                <div className="plans-filter__menu" role="menu">
                  {FILTERS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="menuitem"
                      className={filter === item.id ? 'is-active' : ''}
                      onClick={() => {
                        setFilter(item.id)
                        setFilterOpen(false)
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button type="button" className="plans-create plans-create--header" onClick={openCreate}>
              <Icon name="plus" />
              Create Plan
            </button>
          </div>
        </div>

        {loading ? (
          <p className="plans-empty">Loading plans...</p>
        ) : (
          <div className="plans-table-wrap">
            <table className="plans-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Plan Name</th>
                  <th>Type</th>
                  <th>Duration</th>
                  <th>Price</th>
                  <th>Subscribers</th>
                  <th>Total Revenue</th>
                  <th>Avg. Purchase Value</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visiblePlans.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="plans-table__empty">
                      {plans.length === 0
                        ? 'No plans yet. Use Create Plan to add a trial, monthly, quarterly, or custom plan.'
                        : 'No plans match this search.'}
                    </td>
                  </tr>
                ) : visiblePlans.map((plan, index) => {
                  const meta = typeMeta(plan.interval_type)
                  return (
                    <tr key={plan.id}>
                      <td className="plans-table__index">{index + 1}</td>
                      <td>
                        <div className="plans-plan">
                          <span className={`plans-plan__icon plans-plan__icon--${meta.tone}`}><Icon name={meta.icon} /></span>
                          <span>
                            <strong>{plan.name}</strong>
                            {plan.description && <small>{plan.description}</small>}
                          </span>
                        </div>
                      </td>
                      <td><span className={`plans-type plans-type--${meta.tone}`}>{meta.label}</span></td>
                      <td>{Number(plan.duration_days).toLocaleString('en-IN')} days</td>
                      <td>{formatPrice(plan.price, plan.currency)}</td>
                      <td>{formatCount(plan.subscribers)}</td>
                      <td>{formatPrice(plan.revenue, plan.currency)}</td>
                      <td>{formatPrice(plan.average_purchase, plan.currency)}</td>
                      <td>
                        <span className={`plans-status ${plan.is_active === false ? 'is-off' : 'is-on'}`}>
                          <span />
                          {plan.is_active === false ? 'Inactive' : 'Active'}
                        </span>
                      </td>
                      <td>
                        <div className="plans-actions">
                          <button type="button" onClick={() => startEdit(plan)}>
                            <Icon name="pencil" />
                            Edit
                          </button>
                          <div className="plans-menu">
                            <button
                              type="button"
                              aria-label={`More actions for ${plan.name}`}
                              aria-expanded={menuId === plan.id}
                              onClick={() => setMenuId((current) => (current === plan.id ? null : plan.id))}
                            >
                              <Icon name="more" />
                            </button>
                            {menuId === plan.id && (
                              <div className="plans-menu__pop" role="menu">
                                <button type="button" role="menuitem" onClick={() => remove(plan)}>
                                  <TrashIcon />
                                  Delete
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {formOpen && (
        <section className="plans-card" ref={formRef}>
          <div className="plans-card__head">
            <div className="plans-card__title">
              <span className="plans-card__mark"><Icon name="plus" /></span>
              <div>
                <h2>{editingId ? 'Edit Plan' : 'Create New Plan'}</h2>
                <p>{editingId ? 'Update this subscription plan.' : 'Set up a subscription plan with custom duration and pricing.'}</p>
              </div>
            </div>
            <button type="button" className="plans-quick" onClick={quickTrial}>
              <Icon name="bolt" />
              Quick Add Trial Plan
            </button>
          </div>

          <form className="plans-form" onSubmit={save}>
            <label>
              <span>Plan Name <em>*</em></span>
              <input value={form.name} onChange={(event) => setField('name', event.target.value)} placeholder="e.g. Starter, Growing, Enterprise" required />
            </label>
            <label>
              <span>Plan Type <em>*</em></span>
              <select value={form.interval_type} onChange={(event) => chooseInterval(event.target.value)}>
                {INTERVALS.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>
            <label className="plans-form__validity">
              <span>Validity (Days) <em>*</em></span>
              <input
                type="number"
                min="1"
                max="3650"
                value={form.duration_days}
                onChange={(event) => setField('duration_days', event.target.value)}
                required
              />
              <div className="plans-chips">
                {DAY_SHORTCUTS.map((days) => (
                  <button
                    key={days}
                    type="button"
                    className={String(form.duration_days) === String(days) ? 'is-active' : ''}
                    onClick={() => setField('duration_days', String(days))}
                  >
                    {days} days
                  </button>
                ))}
              </div>
            </label>
            <label className="plans-form__price">
              <span>Price (₹) (Optional)</span>
              <span className="plans-money">
                <span aria-hidden="true">₹</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={(event) => setField('price', event.target.value)}
                  placeholder="0"
                />
              </span>
              <small>Leave blank or set 0 if the plan is free.</small>
            </label>
            <label className="plans-form__description">
              <span>Description</span>
              <textarea
                rows={4}
                maxLength={500}
                value={form.description}
                onChange={(event) => setField('description', event.target.value.slice(0, 500))}
                placeholder="Describe what this plan includes (features, user limit, etc.)"
              />
              <small className="plans-form__count">{form.description.length}/500</small>
            </label>
            <div className="plans-form__footer">
              <button type="button" className={`plans-toggle ${form.is_active ? 'is-on' : ''}`} onClick={() => setField('is_active', !form.is_active)} aria-pressed={form.is_active}>
                <span />
                <strong>Active</strong>
                <small>Users can subscribe to this plan</small>
              </button>
              <div className="plans-form__actions">
                <button type="button" className="plans-clear" onClick={() => { resetForm(); setFormOpen(false) }}>Cancel</button>
                <button type="button" className="plans-clear" onClick={resetForm}>Clear</button>
                <button type="submit" className="plans-create" disabled={saving || !tableReady}>
                  <Icon name="plus" />
                  {saving ? 'Saving...' : (editingId ? 'Save changes' : 'Create Plan')}
                </button>
              </div>
            </div>
          </form>
        </section>
      )}
    </div>
  )
}
