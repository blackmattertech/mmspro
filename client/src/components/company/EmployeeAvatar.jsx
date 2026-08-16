import { useEffect, useState } from 'react'
import { getOrgAssetSignedUrl } from '../../lib/orgAssets'

function resolveImmediateUrl(employee) {
  if (employee?.photo_signed_url) return employee.photo_signed_url
  if (typeof employee?.avatar_url === 'string' && employee.avatar_url.startsWith('http')) {
    return employee.avatar_url
  }
  if (typeof employee?.photo_url === 'string' && employee.photo_url.startsWith('http')) {
    return employee.photo_url
  }
  return null
}

export default function EmployeeAvatar({ employee, size = 'md', className = '' }) {
  const [imageUrl, setImageUrl] = useState(() => resolveImmediateUrl(employee))

  useEffect(() => {
    let cancelled = false
    const immediate = resolveImmediateUrl(employee)
    if (immediate) {
      setImageUrl(immediate)
      return undefined
    }

    const path = employee?.photo_url
    if (!path || typeof path !== 'string') {
      setImageUrl(null)
      return undefined
    }

    setImageUrl(null)
    getOrgAssetSignedUrl(path)
      .then((url) => {
        if (!cancelled) setImageUrl(url)
      })
      .catch(() => {
        if (!cancelled) setImageUrl(null)
      })

    return () => {
      cancelled = true
    }
  }, [employee?.photo_signed_url, employee?.photo_url, employee?.avatar_url])

  const sizeClass = size === 'sm'
    ? ' company-employee-avatar--sm'
    : size === 'lg'
      ? ' company-employee-avatar--lg'
      : size === 'xl'
        ? ' company-employee-avatar--xl'
        : ''
  const extra = className ? ` ${className}` : ''

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt=""
        className={`company-employee-avatar${sizeClass}${extra}`}
        loading="lazy"
        decoding="async"
      />
    )
  }

  const letter = (employee?.name?.[0] || employee?.emp_id?.[0] || '?').toUpperCase()
  return (
    <span
      className={`company-employee-avatar company-employee-avatar--placeholder${sizeClass}${extra}`}
      aria-hidden="true"
    >
      {letter}
    </span>
  )
}
