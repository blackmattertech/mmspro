import { memo, useEffect, useRef, useState } from 'react'

const VIRTUALIZE_AFTER = 50
const ROW_HEIGHT = 48
const OVERSCAN = 8

export const VirtualTableBody = memo(function VirtualTableBody({
  items,
  renderRow,
  estimateRowHeight = ROW_HEIGHT,
  overscan = OVERSCAN,
}) {
  const bodyRef = useRef(null)
  const [range, setRange] = useState({ start: 0, end: items.length })

  useEffect(() => {
    if (items.length <= VIRTUALIZE_AFTER) {
      setRange({ start: 0, end: items.length })
      return undefined
    }
    const scroller = bodyRef.current?.closest('.company-table-scroll')
    if (!scroller) {
      setRange({ start: 0, end: items.length })
      return undefined
    }
    const update = () => {
      const start = Math.max(0, Math.floor(scroller.scrollTop / estimateRowHeight) - overscan)
      const visible = Math.ceil(scroller.clientHeight / estimateRowHeight) + overscan * 2
      setRange({ start, end: Math.min(items.length, start + visible) })
    }
    update()
    scroller.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      scroller.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [items.length, estimateRowHeight, overscan])

  if (items.length <= VIRTUALIZE_AFTER) {
    return <tbody ref={bodyRef}>{items.map((item, index) => renderRow(item, index))}</tbody>
  }

  const slice = items.slice(range.start, range.end)
  const top = range.start * estimateRowHeight
  const bottom = (items.length - range.end) * estimateRowHeight

  return (
    <tbody ref={bodyRef}>
      {top > 0 && (
        <tr aria-hidden="true">
          <td colSpan={99} style={{ height: top, padding: 0, border: 0 }} />
        </tr>
      )}
      {slice.map((item, index) => renderRow(item, range.start + index))}
      {bottom > 0 && (
        <tr aria-hidden="true">
          <td colSpan={99} style={{ height: bottom, padding: 0, border: 0 }} />
        </tr>
      )}
    </tbody>
  )
})
