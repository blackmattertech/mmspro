import { useState, useEffect } from 'react'
import { getAdminUsers } from '../../lib/api'
import TablePagination from '../../components/shared/TablePagination'
import { useTablePagination } from '../../hooks/useTablePagination'
import '../../components/company/CompanyShared.css'
import './AdminPage.css'

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  user: 'User',
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

  const pagination = useTablePagination(users.length)
  const pagedUsers = pagination.paginate(users)

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
                    pagedUsers.map((user) => (
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
              <TablePagination
                page={pagination.page}
                totalPages={pagination.totalPages}
                pageSize={pagination.pageSize}
                pageSizeOptions={pagination.pageSizeOptions}
                totalCount={users.length}
                rangeStart={pagination.rangeStart}
                rangeEnd={pagination.rangeEnd}
                onPageChange={pagination.setPage}
                onPageSizeChange={pagination.setPageSize}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
