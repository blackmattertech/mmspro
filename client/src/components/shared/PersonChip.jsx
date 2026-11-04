import EmployeeAvatar from '../company/EmployeeAvatar'
import '../company/CompanyShared.css'

export function personDisplayName(person) {
  if (!person) return ''
  return person.name
    || person.display_name
    || person.full_name
    || person.email
    || ''
}

export default function PersonChip({ person, name, subtitle, size = 'sm' }) {
  const label = name || personDisplayName(person)
  if (!label) return '—'
  return (
    <span className="company-employee-ref">
      <EmployeeAvatar
        employee={{
          ...(person || {}),
          name: person?.name || label,
        }}
        size={size}
      />
      <span className="company-employee-ref__copy">
        <span className="company-employee-ref__name">{label}</span>
        {subtitle ? <span className="company-employee-ref__sub">{subtitle}</span> : null}
      </span>
    </span>
  )
}
