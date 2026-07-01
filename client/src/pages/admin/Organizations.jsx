import { useState } from 'react'
import { useAdminOrganizations } from '../../hooks/useAdminOrganizations'
import CreateOrgModal from '../../components/admin/CreateOrgModal'
import './AdminPage.css'

function StatusToggle({ active, disabled, onChange }) {
  return (
    <button
      type="button"
      className={`admin-toggle ${active ? 'admin-toggle--on' : ''}`}
      onClick={() => onChange(!active)}
      disabled={disabled}
      aria-label={active ? 'Disable organization' : 'Enable organization'}
    >
      <span className="admin-toggle__thumb" />
    </button>
  )
}

export default function Organizations() {
  const [showModal, setShowModal] = useState(false)
  const [success, setSuccess] = useState(null)
  const {
    organizations,
    loading,
    error,
    saving,
    createOrg,
    toggleOrgStatus,
  } = useAdminOrganizations()

  const handleToggle = async (org) => {
    try {
      await toggleOrgStatus(org.id, !org.is_active)
    } catch {
      // error shown via hook state
    }
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
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          Create Organization
        </button>
      </header>

      <div className="admin-page__content">
        {error && <div className="admin-alert">{error}</div>}
        {success && (
          <div className="admin-alert admin-alert--success">{success}</div>
        )}

        <div className="admin-card">
          <div className="admin-card__header">
            <h2 className="admin-card__title">All Organizations ({organizations.length})</h2>
          </div>

          {loading ? (
            <div className="admin-loading">Loading organizations...</div>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Organization</th>
                    <th>Plan</th>
                    <th>Members</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Enabled</th>
                  </tr>
                </thead>
                <tbody>
                  {organizations.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="admin-table__empty">
                        No organizations yet. Create your first organization to get started.
                      </td>
                    </tr>
                  ) : (
                    organizations.map((org) => (
                      <tr key={org.id}>
                        <td>
                          <div className="admin-table__name">{org.name}</div>
                          <div className="admin-table__slug">/{org.slug}</div>
                        </td>
                        <td>
                          <span className={`admin-plan-badge admin-plan-badge--${org.plan}`}>
                            {org.plan}
                          </span>
                        </td>
                        <td>{org.member_count ?? 0}</td>
                        <td>
                          <span className={`admin-status ${org.is_active ? 'admin-status--active' : 'admin-status--inactive'}`}>
                            <span className="admin-status__dot" />
                            {org.is_active ? 'Active' : 'Disabled'}
                          </span>
                        </td>
                        <td>{new Date(org.created_at).toLocaleDateString()}</td>
                        <td>
                          <StatusToggle
                            active={org.is_active}
                            disabled={saving}
                            onChange={() => handleToggle(org)}
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
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
                : org.owner_created
                  ? `Organization "${org.name}" created. Owner account ${org.owner_email} was created — configure Mailjet in server/.env to send the password setup email, or check server logs for the link.`
                  : `Organization "${org.name}" created. Owner ${org.owner_email} was linked to the organization.`
            )
            return org
          }}
          saving={saving}
        />
      )}
    </div>
  )
}
