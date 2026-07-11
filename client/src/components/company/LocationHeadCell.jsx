import EmployeeAvatar from './EmployeeAvatar'

export default function LocationHeadCell({ location }) {
  const head = location?.head_employee
  if (!head?.name) return '—'

  return (
    <span className="company-employee-ref">
      <EmployeeAvatar employee={head} size="sm" />
      <span className="company-employee-ref__name">{head.name}</span>
    </span>
  )
}
