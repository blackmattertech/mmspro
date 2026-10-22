export function isLimitError(err) {
  if (err?.code === 'LIMIT_EXCEEDED') return true
  const msg = (err?.message || err || '').toLowerCase()
  return msg.includes('limit reached')
    || (msg.includes('beyond the') && msg.includes('limit'))
    || msg.includes('please delete')
}

export function getLimitResourceLabel(err) {
  if (err?.resource) return err.resource
  const msg = (err?.message || '').toLowerCase()
  if (msg.includes('login limit')) return 'Login'
  if (msg.includes('location limit')) return 'Location'
  if (msg.includes('department limit')) return 'Department'
  if (msg.includes('employee limit')) return 'Employee'
  return 'Resource'
}

export function getLimitOverflow(err) {
  const fromField = Number(err?.overflow)
  if (Number.isInteger(fromField) && fromField > 0) return fromField
  const match = String(err?.message || '').match(/please delete (\d+)/i)
  if (!match) return null
  const count = Number(match[1])
  return Number.isInteger(count) && count > 0 ? count : null
}
