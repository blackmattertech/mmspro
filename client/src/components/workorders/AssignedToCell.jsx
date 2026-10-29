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

const MAX_VISIBLE = 2

export default function AssignedToCell({
  assignees = [],
  assignedDepartment = null,
  assignedLocation = null,
}) {
  const people = Array.isArray(assignees) ? assignees.filter((a) => a?.id || a?.name) : []

  if (!people.length) {
    return (
      <div className="wo-assigned">
        <span className="wo-status wo-status--unassigned">Unassigned</span>
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
