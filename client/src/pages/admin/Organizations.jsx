import { useMemo, useState } from 'react'
import { useAdminOrganizations } from '../../hooks/useAdminOrganizations'
import CreateOrgModal from '../../components/admin/CreateOrgModal'
import OrgLimitsModal from '../../components/admin/OrgLimitsModal'
import GooToggle from '../../components/ui/GooToggle'
import { LIMIT_ITEMS, formatUsage, isAtOrOverLimit } from '../../lib/orgLimits'
import '../../components/admin/OrgLimitsModal.css'
import './AdminPage.css'
import './Organizations.css'

const PAGE_SIZE = 10

const KPI_CARDS = [
  { key: 'total', label: 'Total Organizations', icon: 'grid', tone: 'purple' },
  { key: 'active', label: 'Active Organizations', icon: 'check', tone: 'green' },
  { key: 'locations', label: 'Total Locations', icon: 'location', tone: 'blue' },
  { key: 'employees', label: 'Total Employees', icon: 'people', tone: 'orange' },
  { key: 'logins', label: 'Total Logins', icon: 'shield', tone: 'red' },
]

function KpiIcon({ name }) {
  if (name === 'grid') {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <rect x="2" y="2" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
        <rect x="10" y="2" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
        <rect x="2" y="10" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
        <rect x="10" y="10" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    )
  }
  if (name === 'check') {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.4" />
        <path d="M6 9L8 11L12 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (name === 'location') {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path d="M9 9.5C10.1046 9.5 11 8.60457 11 7.5C11 6.39543 10.1046 5.5 9 5.5C7.89543 5.5 7 6.39543 7 7.5C7 8.60457 7.89543 9.5 9 9.5Z" stroke="currentColor" strokeWidth="1.4" />
        <path d="M9 15.5C12 12.5 14 10.3954 14 7.5C14 4.46243 11.7614 2 9 2C6.23858 2 4 4.46243 4 7.5C4 10.3954 6 12.5 9 15.5Z" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    )
  }
  if (name === 'people') {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <circle cx="7" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.4" />
        <path d="M2.5 15C2.5 12.2386 4.46243 10 7 10C9.53757 10 11.5 12.2386 11.5 15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M12.5 6.5C13.6046 6.5 14.5 5.60457 14.5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M15.5 15C15.5 12.7909 14.2091 11 12.5 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M9 2.5L14 4.75V8.75C14 12.25 11.75 14.75 9 15.75C6.25 14.75 4 12.25 4 8.75V4.75L9 2.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M7 9L8.25 10.25L11 7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function UsageIcon({ type }) {
  if (type === 'locations') {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path d="M7 7.25C7.9665 7.25 8.75 6.4665 8.75 5.5C8.75 4.5335 7.9665 3.75 7 3.75C6.0335 3.75 5.25 4.5335 5.25 5.5C5.25 6.4665 6.0335 7.25 7 7.25Z" stroke="currentColor" strokeWidth="1.2" />
        <path d="M7 12.25C9.33333 9.58333 11.5 7.41667 11.5 5.5C11.5 3.01472 9.48528 1 7 1C4.51472 1 2.5 3.01472 2.5 5.5C2.5 7.41667 4.66667 9.58333 7 12.25Z" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    )
  }
  if (type === 'departments') {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path d="M2 12V4.5L7 2L12 4.5V12H2Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M5.5 12V8.5H8.5V12" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
    )
  }
  if (type === 'employees') {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <circle cx="7" cy="4.5" r="2.25" stroke="currentColor" strokeWidth="1.2" />
        <path d="M3 12C3 9.5 4.8 8 7 8C9.2 8 11 9.5 11 12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M7 1.75L10.5 3.25V6.25C10.5 8.75 8.75 10.5 7 11.25C5.25 10.5 3.5 8.75 3.5 6.25V3.25L7 1.75Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  )
}

function OrgLogo({ org }) {
  const letter = (org.name?.[0] || 'O').toUpperCase()

  if (org.logo_signed_url) {
    return (
      <img src={org.logo_signed_url} alt="" className="admin-org__logo" />
    )
  }

  return (
    <span className="admin-org__logo admin-org__logo--fallback">{letter}</span>
  )
}

function LimitsSummary({ org, onManage, disabled }) {
  return (
    <div className="admin-org__limits">
      <div className="admin-org__limits-row">
        {LIMIT_ITEMS.map((item) => {
          const usage = org.usage?.[item.usageKey] ?? 0
          const limit = org[item.key]
          const warn = isAtOrOverLimit(usage, limit)
          return (
            <span
              key={item.key}
              className={`admin-org__limit-item${warn ? ' admin-org__limit-item--warn' : ''}`}
              title={item.label}
            >
              <UsageIcon type={item.usageKey} />
              <span>{formatUsage(usage, limit)}</span>
            </span>
          )
        })}
      </div>
      <button
        type="button"
        className="admin-org__limits-btn"
        onClick={onManage}
        disabled={disabled}
      >
        Manage limits
      </button>
    </div>
  )
}

function computeStats(organizations) {
  const totals = organizations.reduce(
    (acc, org) => {
      acc.locations += org.usage?.locations ?? 0
      acc.employees += org.usage?.employees ?? 0
      acc.logins += org.usage?.logins ?? 0
      return acc
    },
    { locations: 0, employees: 0, logins: 0 },
  )

  return {
    total: organizations.length,
    active: organizations.filter((org) => org.is_active !== false).length,
    locations: `${totals.locations} / ∞`,
    employees: `${totals.employees} / ∞`,
    logins: `${totals.logins} / ∞`,
  }
}

function filterAndSort(organizations, { search, statusFilter, sortBy }) {
  let rows = [...organizations]
  const query = search.trim().toLowerCase()

  if (query) {
    rows = rows.filter((org) => {
      const haystack = [org.name, org.slug, org.plan].filter(Boolean).join(' ').toLowerCase()
      return haystack.includes(query)
    })
  }

  if (statusFilter === 'active') {
    rows = rows.filter((org) => org.is_active !== false)
  } else if (statusFilter === 'inactive') {
    rows = rows.filter((org) => org.is_active === false)
  }

  rows.sort((a, b) => {
    if (sortBy === 'oldest') {
      return new Date(a.created_at) - new Date(b.created_at)
    }
    if (sortBy === 'name') {
      return a.name.localeCompare(b.name)
    }
    return new Date(b.created_at) - new Date(a.created_at)
  })

  return rows
}

export default function Organizations() {
  const [showModal, setShowModal] = useState(false)
  const [limitsOrg, setLimitsOrg] = useState(null)
  const [success, setSuccess] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState('newest')
  const [page, setPage] = useState(1)
  const [togglingId, setTogglingId] = useState(null)

  const {
    organizations,
    loading,
    error,
    saving,
    createOrg,
    toggleOrgStatus,
    updateOrgLimits,
  } = useAdminOrganizations()

  const stats = useMemo(() => computeStats(organizations), [organizations])

  const filtered = useMemo(
    () => filterAndSort(organizations, { search, statusFilter, sortBy }),
    [organizations, search, statusFilter, sortBy],
  )

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const rangeStart = filtered.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, filtered.length)

  const handleToggle = async (org, isActive) => {
    setTogglingId(org.id)
    try {
      await toggleOrgStatus(org.id, isActive)
    } catch {
      // error shown via hook state
    } finally {
      setTogglingId(null)
    }
  }

  const kpiValues = {
    total: stats.total,
    active: stats.active,
    locations: stats.locations,
    employees: stats.employees,
    logins: stats.logins,
  }

  return (
    <div className="admin-page">
      <header className="admin-page__header">
        <div>
          <h1 className="admin-page__title">Organizations</h1>
          <p className="admin-page__subtitle">Create and manage tenant organizations</p>
        </div>
        <button
          type="button"
          className="admin-page__create-btn"
          onClick={() => setShowModal(true)}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          Create Organization
        </button>
      </header>

      <div className="admin-page__content">
        {error && <div className="admin-alert">{error}</div>}
        {success && (
          <div className="admin-alert admin-alert--success">{success}</div>
        )}

        <div className="admin-org-kpi-grid">
          {KPI_CARDS.map((card) => (
            <div key={card.key} className="admin-org-kpi">
              <span className={`admin-org-kpi__icon admin-org-kpi__icon--${card.tone}`}>
                <KpiIcon name={card.icon} />
              </span>
              <div>
                <span className="admin-org-kpi__label">{card.label}</span>
                <span className="admin-org-kpi__value">{kpiValues[card.key]}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="admin-card admin-org-card">
          <div className="admin-org-toolbar">
            <div className="admin-org-toolbar__search">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.3" />
                <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              <input
                type="search"
                className="admin-org-toolbar__input"
                placeholder="Search organizations..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
              />
            </div>

            <div className="admin-org-toolbar__filters">
              <label className="admin-org-filter">
                <span>Status</span>
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value)
                    setPage(1)
                  }}
                >
                  <option value="all">All</option>
                  <option value="active">Active</option>
                  <option value="inactive">Disabled</option>
                </select>
              </label>

              <label className="admin-org-filter">
                <span>Sort by</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                >
                  <option value="newest">Newest</option>
                  <option value="oldest">Oldest</option>
                  <option value="name">Name A–Z</option>
                </select>
              </label>
            </div>
          </div>

          {loading ? (
            <div className="admin-loading">Loading organizations...</div>
          ) : (
            <>
              <div className="admin-table-wrap">
                <table className="admin-table admin-org-table">
                  <thead>
                    <tr>
                      <th>Organization</th>
                      <th>Plan</th>
                      <th>Usage / Limits</th>
                      <th>Created</th>
                      <th>Enabled</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!pageRows.length ? (
                      <tr>
                        <td colSpan={5} className="admin-table__empty">
                          {organizations.length
                            ? 'No organizations match your search.'
                            : 'No organizations yet. Create your first organization to get started.'}
                        </td>
                      </tr>
                    ) : (
                      pageRows.map((org) => (
                        <tr key={org.id}>
                          <td>
                            <div className="admin-org__cell">
                              <OrgLogo org={org} />
                              <div>
                                <div className="admin-table__name">{org.name}</div>
                                <div className="admin-table__slug">/{org.slug}</div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className={`admin-plan-badge admin-plan-badge--${org.plan}`}>
                              {org.plan}
                            </span>
                          </td>
                          <td>
                            <LimitsSummary
                              org={org}
                              disabled={saving}
                              onManage={() => setLimitsOrg(org)}
                            />
                          </td>
                          <td>{new Date(org.created_at).toLocaleDateString()}</td>
                          <td>
                            <GooToggle
                              checked={org.is_active !== false}
                              disabled={togglingId === org.id || saving}
                              onChange={(checked) => handleToggle(org, checked)}
                              ariaLabel={`${org.is_active !== false ? 'Disable' : 'Enable'} ${org.name}`}
                            />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <footer className="admin-org-footer">
                <span className="admin-org-footer__count">
                  Showing {rangeStart} to {rangeEnd} of {filtered.length} organizations
                </span>
                <div className="admin-org-pagination">
                  <button
                    type="button"
                    className="admin-org-pagination__btn"
                    disabled={currentPage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    aria-label="Previous page"
                  >
                    ‹
                  </button>
                  <span className="admin-org-pagination__page">{currentPage}</span>
                  <button
                    type="button"
                    className="admin-org-pagination__btn"
                    disabled={currentPage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    aria-label="Next page"
                  >
                    ›
                  </button>
                </div>
              </footer>
            </>
          )}
        </div>
      </div>

      {showModal && (
        <CreateOrgModal
          onClose={() => setShowModal(false)}
          onSubmit={async (payload) => {
            const org = await createOrg(payload)
            setSuccess(
              org.email_sent
                ? `Organization "${org.name}" created. A password setup email was sent to ${org.owner_email}.`
                : `Organization "${org.name}" created for ${org.owner_email}, but the password setup email was not sent. Check Mailjet settings in server/.env and the server logs for the setup link.`
            )
            return org
          }}
          saving={saving}
        />
      )}

      {limitsOrg && (
        <OrgLimitsModal
          org={limitsOrg}
          onClose={() => setLimitsOrg(null)}
          onSubmit={async (id, payload) => {
            const updated = await updateOrgLimits(id, payload)
            setSuccess(`Limits updated for "${updated.name}".`)
            setLimitsOrg(null)
          }}
          saving={saving}
        />
      )}
    </div>
  )
}
