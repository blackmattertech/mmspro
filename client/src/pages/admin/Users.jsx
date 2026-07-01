import { useState, useEffect } from 'react'
import { getAdminUsers } from '../../lib/api'
import './AdminPage.css'

const ROLE_LABELS = {
  owner: 'Owner',
  admin: 'Platform Admin',
  member: 'Member',
}

export default function Users() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    getAdminUsers()
      .then(setUsers)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="admin-page">
      <header className="admin-page__header">
        <div>
          <h1 className="admin-page__title">Users</h1>
          <p className="admin-page__subtitle">View all registered platform users</p>
        </div>
      </header>

      <div className="admin-page__content">
        {error && <div className="admin-alert">{error}</div>}

        <div className="admin-card">
          <div className="admin-card__header">
            <h2 className="admin-card__title">All Users ({users.length})</h2>
          </div>

          {loading ? (
            <div className="admin-loading">Loading users...</div>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Organization</th>
                    <th>Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="admin-table__empty">No users found.</td>
                    </tr>
                  ) : (
                    users.map((user) => (
                      <tr key={user.id}>
                        <td className="admin-table__name">{user.email || '—'}</td>
                        <td>{ROLE_LABELS[user.role] || user.role}</td>
                        <td>{user.organizations?.name || '—'}</td>
                        <td>{new Date(user.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
