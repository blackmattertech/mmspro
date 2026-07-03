export default function EmployeeAvatar({ employee, size = 'md' }) {
  const sizeClass = size === 'sm' ? ' company-employee-avatar--sm' : ''

  if (employee?.photo_signed_url) {
    return (
      <img
        src={employee.photo_signed_url}
        alt=""
        className={`company-employee-avatar${sizeClass}`}
      />
    )
  }

  const letter = (employee?.name?.[0] || employee?.emp_id?.[0] || '?').toUpperCase()
  return (
    <span className={`company-employee-avatar company-employee-avatar--placeholder${sizeClass}`}>
      {letter}
    </span>
  )
}
