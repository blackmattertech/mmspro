import { useEffect, useState } from 'react'

export const MOBILE_NAV_QUERY = '(max-width: 1024px)'

export default function useMobileNav() {
  const [open, setOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(MOBILE_NAV_QUERY).matches
  })

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_NAV_QUERY)
    const sync = () => {
      const matches = mq.matches
      setIsMobile(matches)
      if (!matches) setOpen(false)
    }
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    if (!open) return undefined
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return { open, setOpen, isMobile }
}
