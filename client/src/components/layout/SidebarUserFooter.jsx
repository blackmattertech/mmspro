import { useState } from 'react'
import { useProfile } from '../../hooks/useProfile'
import ProfileModal from '../profile/ProfileModal'
import LogoutButton from '../ui/LogoutButton'

const formatRole = (role) => {
  const labels = { owner: 'Owner', admin: 'Admin', member: 'Member', admin_platform: 'Platform Admin' }
  return labels[role] ?? (role ? role.charAt(0).toUpperCase() + role.slice(1) : 'Member')
}

export default function SidebarUserFooter({
  collapsed = false,
  roleLabel,
  onSignOut,
}) {
  const { profile, avatarUrl, displayName, refresh } = useProfile()
  const [showProfile, setShowProfile] = useState(false)

  const resolvedRole = roleLabel ?? formatRole(profile?.role)
  const avatarLetter = (displayName[0] || 'U').toUpperCase()
  const tooltipLabel = `${displayName} · ${resolvedRole}`

  const openProfile = () => setShowProfile(true)

  return (
    <>
      <div className="sidebar__user">
        <button
          type="button"
          className="sidebar__user-trigger"
          onClick={openProfile}
          aria-label={`Open profile for ${displayName}`}
        >
          <div className="sidebar__avatar">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="sidebar__avatar-img" />
            ) : (
              avatarLetter
            )}
            {collapsed && (
              <span className="sidebar__tooltip" aria-hidden="true">{tooltipLabel}</span>
            )}
          </div>
          {!collapsed && (
            <div className="sidebar__user-info">
              <span className="sidebar__user-name">{displayName}</span>
              <span className="sidebar__user-role">{resolvedRole}</span>
            </div>
          )}
        </button>
        <LogoutButton onClick={onSignOut} className="sidebar__logout-btn" />
      </div>

      {showProfile && (
        <ProfileModal
          profile={profile}
          avatarUrl={avatarUrl}
          onClose={() => setShowProfile(false)}
          onUpdated={refresh}
        />
      )}
    </>
  )
}
