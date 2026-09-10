import { useCallback, useLayoutEffect, useRef, useState } from 'react'

export const FIXED_POPOVER_ATTR = 'data-fixed-popover'

const MARGIN = 8

function stylesEqual(a, b) {
  if (a === b) return true
  if (!a || !b) return false
  return a.top === b.top
    && a.bottom === b.bottom
    && a.left === b.left
    && a.width === b.width
    && a.minWidth === b.minWidth
    && a.maxHeight === b.maxHeight
}

export function isEventInFixedPopover(event) {
  const el = event?.target
  if (!el || typeof el.closest !== 'function') return false
  return Boolean(el.closest(`[${FIXED_POPOVER_ATTR}]`))
}

/**
 * Positions a popover with position:fixed so overflow:hidden ancestors cannot clip it.
 * Render the popover with createPortal(..., document.body) and spread popoverProps.
 */
export function useFixedPopover({
  open,
  anchorRef,
  matchWidth = true,
  maxHeight = 320,
  minWidth = 0,
  gap = 4,
  align = 'start',
} = {}) {
  const popoverRef = useRef(null)
  const [style, setStyle] = useState(null)

  const updatePosition = useCallback(() => {
    const anchor = anchorRef?.current
    if (!anchor) return

    const rect = anchor.getBoundingClientRect()
    const popover = popoverRef.current
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const measuredWidth = popover?.offsetWidth || minWidth
    const panelWidth = matchWidth
      ? rect.width
      : Math.max(minWidth, measuredWidth)
    const estimatedHeight = popover?.offsetHeight || Math.min(maxHeight, 240)
    const spaceBelow = viewportHeight - rect.bottom - MARGIN
    const spaceAbove = rect.top - MARGIN
    const openAbove = spaceBelow < estimatedHeight + gap && spaceAbove > spaceBelow
    const available = (openAbove ? spaceAbove : spaceBelow) - gap
    const heightLimit = Math.max(120, Math.min(maxHeight, available))

    let left = align === 'end' ? rect.right - panelWidth : rect.left
    if (left + panelWidth > viewportWidth - MARGIN) {
      left = Math.max(MARGIN, viewportWidth - panelWidth - MARGIN)
    }
    left = Math.max(MARGIN, left)

    const next = {
      position: 'fixed',
      top: openAbove ? undefined : rect.bottom + gap,
      bottom: openAbove ? viewportHeight - rect.top + gap : undefined,
      left,
      width: matchWidth ? rect.width : undefined,
      minWidth: matchWidth ? undefined : (minWidth || undefined),
      maxHeight: heightLimit,
      zIndex: 1400,
    }

    setStyle((prev) => (stylesEqual(prev, next) ? prev : next))
  }, [align, anchorRef, gap, matchWidth, maxHeight, minWidth])

  useLayoutEffect(() => {
    if (!open) {
      setStyle(null)
      return undefined
    }

    let observer
    const observe = () => {
      updatePosition()
      const node = popoverRef.current
      if (!node || typeof ResizeObserver === 'undefined') return
      observer?.disconnect()
      observer = new ResizeObserver(updatePosition)
      observer.observe(node)
    }

    observe()
    const frame = requestAnimationFrame(observe)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open, updatePosition])

  return {
    popoverRef,
    style,
    popoverProps: {
      [FIXED_POPOVER_ATTR]: '',
      ref: popoverRef,
      style: style || undefined,
    },
  }
}
