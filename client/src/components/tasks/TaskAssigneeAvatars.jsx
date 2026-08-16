import EmployeeAvatar from '../company/EmployeeAvatar'
import './TaskAssigneeAvatars.css'

function PoolAvatar({ label, size = 'sm' }) {
  const letter = (label?.[0] || '?').toUpperCase()
  const sizeClass = size === 'sm' ? ' company-employee-avatar--sm' : ''
  return (
    <span
      className={`company-employee-avatar company-employee-avatar--placeholder${sizeClass}`}
      aria-hidden="true"
    >
      {letter}
    </span>
  )
}

export function resolveTaskAssignees({
  assignees = [],
  creator = null,
  visibility_type = null,
} = {}) {
  const people = (assignees || []).filter((person) => person?.id || person?.name)
  if (people.length) return people

  if (visibility_type === 'self' && creator?.id) {
    return [{
      id: creator.id,
      name: creator.full_name || creator.email || 'Assignee',
      avatar_url: creator.avatar_url || null,
    }]
  }

  return []
}

export default function TaskAssigneeAvatars({
  assignees = [],
  creator = null,
  visibility_type = null,
  department = null,
  location = null,
  max = 3,
  variant = 'stack',
  avatarSize = 'sm',
  showTooltip = false,
}) {
  const people = resolveTaskAssignees({ assignees, creator, visibility_type })

  if (!people.length) {
    const poolLabel = department?.name || location?.name
    if (!poolLabel) {
      return variant === 'list' ? <span className="task-assignees task-assignees--empty">—</span> : null
    }
    return (
      <div className={`task-assignees task-assignees--${variant}`}>
        <span
          className="task-assignees__pool"
          {...(showTooltip ? { 'data-tooltip': poolLabel } : { title: poolLabel })}
        >
          <PoolAvatar label={poolLabel} size={avatarSize} />
          {variant === 'list' && <span className="task-assignees__name">{poolLabel}</span>}
        </span>
      </div>
    )
  }

  const visible = people.slice(0, max)
  const overflow = people.length - visible.length
  const title = people.map((person) => person.name).join(', ')

  if (variant === 'list') {
    return (
      <div className="task-assignees task-assignees--list">
        {visible.map((employee) => (
          <span
            key={employee.id || employee.emp_id || employee.name}
            className="task-assignees__person"
            title={employee.name}
          >
            <EmployeeAvatar employee={employee} size="sm" />
            <span className="task-assignees__name">{employee.name}</span>
          </span>
        ))}
        {overflow > 0 && (
          <span className="task-assignees__overflow" title={people.slice(max).map((p) => p.name).join(', ')}>
            +{overflow}
          </span>
        )}
      </div>
    )
  }

  return (
    <div
      className={`task-assignees task-assignees--stack${avatarSize === 'md' ? ' task-assignees--stack-md' : ''}`}
      {...(!showTooltip && title ? { title } : {})}
    >
      {visible.map((employee, index) => (
        <span
          key={employee.id || employee.emp_id || employee.name}
          className="task-assignees__stack-item"
          style={{ zIndex: visible.length - index }}
          {...(showTooltip ? { 'data-tooltip': employee.name } : { title: employee.name })}
        >
          <EmployeeAvatar employee={employee} size={avatarSize} />
        </span>
      ))}
      {overflow > 0 && (
        <span
          className="task-assignees__overflow task-assignees__overflow--stack"
          {...(showTooltip ? { 'data-tooltip': people.slice(max).map((p) => p.name).join(', ') } : { title: people.slice(max).map((p) => p.name).join(', ') })}
        >
          +{overflow}
        </span>
      )}
    </div>
  )
}
