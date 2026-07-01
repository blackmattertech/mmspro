import { useEffect, useRef } from 'react'

/**
 * Prevents the opening click from immediately closing a modal backdrop.
 */
export function useBackdropClose(onClose) {
  const ignoreRef = useRef(true)

  useEffect(() => {
    const id = window.setTimeout(() => {
      ignoreRef.current = false
    }, 0)
    return () => window.clearTimeout(id)
  }, [])

  return (event) => {
    if (ignoreRef.current) return
    if (event.target === event.currentTarget) onClose()
  }
}
