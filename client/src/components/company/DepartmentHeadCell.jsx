import EmployeeAvatar from './EmployeeAvatar'

function EmployeeRef({ employee }) {
  if (!employee?.name) return null

  return (
    <span className="company-employee-ref">
      <EmployeeAvatar employee={employee} size="sm" />
      <span className="company-employee-ref__name">{employee.name}</span>
    </span>
  )
}

export default function DepartmentHeadCell({ department, locationFilter = '' }) {
  if (department?.per_location_heads && department?.location_heads?.length) {
    const assigned = department.location_heads.filter((row) => row.head_employee)

    if (locationFilter) {
      const entry = assigned.find((row) => row.location_id === locationFilter)
      return entry?.head_employee ? <EmployeeRef employee={entry.head_employee} /> : '—'
    }

    if (!assigned.length) return '—'

    return (
      <div className="company-location-heads-cell">
        {assigned.map((row) => (
          <div key={row.location_id} className="company-location-heads-cell__row">
            <span className="company-location-heads-cell__location">
              {row.org_locations?.name || 'Location'}
            </span>
            <EmployeeRef employee={row.head_employee} />
          </div>
        ))}
      </div>
    )
  }

  const head = department?.head_employee
  if (!head?.name) return '—'

  return <EmployeeRef employee={head} />
}
