import { useEffect, useRef, useState } from 'react'

/**
 * Ellipsis for long table text; click toggles the full value.
 */
export default function TruncatedText({
  children,
  text,
  className = '',
  as: Comp = 'span',
}) {
  const ref = useRef(null)
  const [expanded, setExpanded] = useState(false)
  const [overflows, setOverflows] = useState(false)
  const full = text != null
    ? String(text)
    : (typeof children === 'string' || typeof children === 'number' ? String(children) : '')

  useEffect(() => {
    setExpanded(false)
  }, [full])

  useEffect(() => {
    const node = ref.current
    if (!node || expanded) return undefined

    const measure = () => {
      setOverflows(node.scrollWidth > node.clientWidth + 1)
    }
    measure()
    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(measure)
      : null
    observer?.observe(node)
    window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [full, expanded, className])

  const canToggle = overflows || expanded
  const classes = [
    'company-table__truncated',
    expanded ? 'company-table__truncated--expanded' : '',
    canToggle ? 'company-table__truncated--toggle' : '',
    className,
  ].filter(Boolean).join(' ')

  return (
    <Comp
      ref={ref}
      className={classes}
      title={!expanded && full && full !== '—' ? full : undefined}
      aria-expanded={canToggle ? expanded : undefined}
      onClick={canToggle ? (event) => {
        event.stopPropagation()
        setExpanded((value) => !value)
      } : undefined}
      onKeyDown={canToggle ? (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        event.stopPropagation()
        setExpanded((value) => !value)
      } : undefined}
      role={canToggle ? 'button' : undefined}
      tabIndex={canToggle ? 0 : undefined}
    >
      {children ?? full}
    </Comp>
  )
}
