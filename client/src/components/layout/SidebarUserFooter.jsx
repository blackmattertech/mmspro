import { lazy, Suspense, useState } from 'react'
import { useProfile } from '../../hooks/useProfile'
import { formatAccountRole } from '../../lib/accountRoles'
import LogoutButton from '../ui/LogoutButton'

const ProfileModal = lazy(() => import('../profile/ProfileModal'))

export default function SidebarUserFooter({
  collapsed = false,
  roleLabel,
  onSignOut,
}) {
  const { profile, avatarUrl, displayName, employee, loading, refresh } = useProfile()
  const [showProfile, setShowProfile] = useState(false)

  const showSkeleton = loading && !displayName
  const resolvedName = displayName || 'User'
  const resolvedRole = roleLabel
    || employee?.access_role?.name
    || formatAccountRole(profile?.role)
    || 'No role assigned'
  const avatarLetter = (resolvedName[0] || 'U').toUpperCase()
  const tooltipLabel = showSkeleton ? 'Loading profile' : `${resolvedName} · ${resolvedRole}`

  const openProfile = () => {
    if (showSkeleton) return
    setShowProfile(true)
  }

  return (
    <>
      <div className="sidebar__user">
        <button
          type="button"
          className="sidebar__user-trigger"
          onClick={openProfile}
          aria-label={showSkeleton ? 'Loading profile' : `Open profile for ${resolvedName}`}
          disabled={showSkeleton}
        >
          <div className={`sidebar__avatar ${showSkeleton ? 'sidebar__avatar--loading' : ''}`}>
            {showSkeleton ? (
              <span className="sidebar__avatar-skeleton" aria-hidden="true" />
            ) : avatarUrl ? (
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
              {showSkeleton ? (
                <>
                  <span className="sidebar__user-skeleton sidebar__user-skeleton--name" />
                  <span className="sidebar__user-skeleton sidebar__user-skeleton--role" />
                </>
              ) : (
                <>
                  <span className="sidebar__user-name">{resolvedName}</span>
                  <span className="sidebar__user-role">{resolvedRole}</span>
                </>
              )}
            </div>
          )}
        </button>
        <LogoutButton onClick={onSignOut} className="sidebar__logout-btn" />
      </div>

      {showProfile && (
        <Suspense fallback={null}>
          <ProfileModal
            profile={profile}
            employee={employee}
            avatarUrl={avatarUrl}
            onClose={() => setShowProfile(false)}
            onUpdated={refresh}
          />
        </Suspense>
      )}
    </>
  )
}
