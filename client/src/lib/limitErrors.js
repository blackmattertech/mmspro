export function isLimitError(err) {
  const msg = (err?.message || err || '').toLowerCase()
  return msg.includes('limit reached')
}

export function getLimitResourceLabel(err) {
  const msg = (err?.message || '').toLowerCase()
  if (msg.includes('login limit')) return 'Login'
  if (msg.includes('location limit')) return 'Location'
  if (msg.includes('department limit')) return 'Department'
  if (msg.includes('employee limit')) return 'Employee'
  return 'Resource'
}
