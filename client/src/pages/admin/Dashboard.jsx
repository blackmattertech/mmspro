import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getAdminStats } from '../../lib/api'
import './AdminPage.css'

export default function AdminDashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getAdminStats()
      .then(setStats)
      .catch(() => setStats({ totalOrganizations: 0, activeOrganizations: 0, totalUsers: 0 }))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="admin-loading">Loading dashboard...</div>
  }

  const cards = [
    { label: 'Total Organizations', value: stats?.totalOrganizations ?? 0 },
    { label: 'Active Organizations', value: stats?.activeOrganizations ?? 0 },
    { label: 'Total Users', value: stats?.totalUsers ?? 0 },
  ]

  return (
    <div className="admin-page">
      <header className="admin-page__header">
        <div>
          <h1 className="admin-page__title">Admin Dashboard</h1>
          <p className="admin-page__subtitle">Manage organizations and platform users</p>
        </div>
      </header>

      <div className="admin-page__content">
        <div className="admin-kpi-grid">
          {cards.map((card) => (
            <div key={card.label} className="admin-kpi-card">
              <span className="admin-kpi-card__label">{card.label}</span>
              <span className="admin-kpi-card__value">{card.value}</span>
            </div>
          ))}
        </div>

        <div className="admin-card">
          <div className="admin-card__header">
            <h2 className="admin-card__title">Quick Actions</h2>
          </div>
          <div style={{ padding: '20px 24px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <Link to="/admin/organizations" className="admin-page__create-btn">
              Manage Organizations &amp; Assets
            </Link>
            <Link
              to="/admin/users"
              className="admin-page__create-btn"
              style={{ background: 'var(--color-dark-navy)' }}
            >
              View Users
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
