import EmployeeAvatar from '../company/EmployeeAvatar'
import './AssignedToCell.css'

function assigneeHoverText(employee, fallbackDepartment, fallbackLocation) {
  const department = employee?.department_name
    || employee?.departments?.name
    || fallbackDepartment?.name
    || null
  const location = employee?.location_name
    || employee?.org_locations?.name
    || fallbackLocation?.name
    || fallbackDepartment?.location_name
    || null

  return [department, location].filter(Boolean).join(' · ')
}

function PoolAssignee({ assignedDepartment, assignedLocation }) {
  const department = assignedDepartment?.name || null
  const location = assignedLocation?.name
    || assignedDepartment?.location_name
    || null
  const label = department || location || 'Unassigned'
  const hover = [department, location].filter(Boolean).join(' · ')
  const letter = (label[0] || '?').toUpperCase()

  return (
    <span className="wo-assigned__person" data-tooltip={hover || label}>
      <span className="company-employee-avatar company-employee-avatar--placeholder company-employee-avatar--sm" aria-hidden="true">
        {letter}
      </span>
      <span className="wo-assigned__name">{label}</span>
    </span>
  )
}

const MAX_VISIBLE = 2

export default function AssignedToCell({
  assignees = [],
  assignedDepartment = null,
  assignedLocation = null,
}) {
  const people = Array.isArray(assignees) ? assignees.filter((a) => a?.id || a?.name) : []

  if (!people.length) {
    if (!assignedDepartment?.name && !assignedLocation?.name && !assignedDepartment?.location_only) {
      return <span className="wo-assigned wo-assigned--empty">—</span>
    }
    return (
      <div className="wo-assigned">
        <PoolAssignee
          assignedDepartment={assignedDepartment}
          assignedLocation={assignedLocation}
        />
      </div>
    )
  }

  const visible = people.slice(0, MAX_VISIBLE)
  const overflow = people.length - visible.length

  return (
    <div className="wo-assigned">
      {visible.map((employee) => {
        const hover = assigneeHoverText(employee, assignedDepartment, assignedLocation)
        return (
          <span
            key={employee.id || employee.emp_id || employee.name}
            className="wo-assigned__person"
            data-tooltip={hover || undefined}
          >
            <EmployeeAvatar employee={employee} size="sm" />
            <span className="wo-assigned__name">{employee.name}</span>
          </span>
        )
      })}
      {overflow > 0 && (
        <span
          className="wo-assigned__more"
          data-tooltip={people.slice(MAX_VISIBLE).map((a) => a.name).join(', ')}
        >
          +{overflow}
        </span>
      )}
    </div>
  )
}
