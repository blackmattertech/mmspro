import EmployeeAvatar from './EmployeeAvatar'

function resolveLocationHeads(location) {
  if (location?.location_heads?.length) return location.location_heads
  if (location?.head_employee?.name) return [location.head_employee]
  return []
}

export default function LocationHeadCell({ location }) {
  const heads = resolveLocationHeads(location)
  if (!heads.length) return '—'

  if (heads.length === 1) {
    const head = heads[0]
    return (
      <span className="company-employee-ref">
        <EmployeeAvatar employee={head} size="sm" />
        <span className="company-employee-ref__name">{head.name}</span>
      </span>
    )
  }

  return (
    <div className="company-employee-ref-list">
      {heads.map((head) => (
        <span key={head.id} className="company-employee-ref">
          <EmployeeAvatar employee={head} size="sm" />
          <span className="company-employee-ref__name">{head.name}</span>
        </span>
      ))}
    </div>
  )
}
