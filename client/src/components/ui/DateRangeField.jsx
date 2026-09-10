import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './DateRangeField.css'

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const POPOVER_WIDTH = 264
const POPOVER_GAP = 6

const pad = (n) => String(n).padStart(2, '0')

function parseValue(value) {
  if (!value) return null
  const [datePart] = String(value).split('T')
  const [y, m, d] = datePart.split('-').map(Number)
  if (!y || !m || !d) return null
  return { y, m: m - 1, d }
}

const toDateValue = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`

function cellTimestamp(cell) {
  return new Date(cell.y, cell.m, cell.d).getTime()
}

function formatDisplay(value) {
  const parsed = parseValue(value)
  if (!parsed) return ''
  return `${pad(parsed.d)}/${pad(parsed.m + 1)}/${parsed.y}`
}

function buildCalendarCells(viewYear, viewMonth) {
  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay()
  const cells = []
  const start = new Date(viewYear, viewMonth, 1 - firstWeekday)
  for (let i = 0; i < 42; i += 1) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    cells.push({
      y: date.getFullYear(),
      m: date.getMonth(),
      d: date.getDate(),
      inMonth: date.getMonth() === viewMonth,
    })
  }
  return cells
}

function getRangeClasses(cell, from, to) {
  const fromParsed = parseValue(from)
  if (!fromParsed) return {}

  const ts = cellTimestamp(cell)
  const fromTs = cellTimestamp(fromParsed)
  const toParsed = parseValue(to)

  if (!toParsed) {
    return {
      isStart: ts === fromTs,
      isEnd: ts === fromTs,
      inRange: false,
    }
  }

  const toTs = cellTimestamp(toParsed)
  const startTs = Math.min(fromTs, toTs)
  const endTs = Math.max(fromTs, toTs)

  return {
    isStart: ts === startTs,
    isEnd: ts === endTs,
    inRange: ts > startTs && ts < endTs,
  }
}

/**
 * Date range picker with a single trigger and calendar dialog.
 * Values use `YYYY-MM-DD`. Selected range is highlighted in brand red.
 */
export default function DateRangeField({
  from = '',
  to = '',
  onChange,
  disabled = false,
  className = 'company-form__input',
  placeholder = 'Select date range',
}) {
  const now = new Date()
  const anchorDate = parseValue(from) || parseValue(to)
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(anchorDate ? anchorDate.y : now.getFullYear())
  const [viewMonth, setViewMonth] = useState(anchorDate ? anchorDate.m : now.getMonth())
  const [coords, setCoords] = useState({ top: 0, left: 0 })
  const wrapRef = useRef(null)
  const popoverRef = useRef(null)

  const updatePosition = () => {
    const anchor = wrapRef.current
    if (!anchor) return
    const rect = anchor.getBoundingClientRect()
    const popoverHeight = popoverRef.current?.offsetHeight || 300
    const spaceBelow = window.innerHeight - rect.bottom
    const openAbove = spaceBelow < popoverHeight + POPOVER_GAP && rect.top > spaceBelow

    let left = rect.left
    if (left + POPOVER_WIDTH > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - POPOVER_WIDTH - 8)
    }
    left = Math.max(8, left)

    const top = openAbove
      ? Math.max(8, rect.top - popoverHeight - POPOVER_GAP)
      : rect.bottom + POPOVER_GAP

    setCoords({ top, left })
  }

  useLayoutEffect(() => {
    if (!open) return undefined
    updatePosition()
    const frame = requestAnimationFrame(updatePosition)
    return () => cancelAnimationFrame(frame)
  }, [open, viewMonth, viewYear])

  useEffect(() => {
    if (!open) return undefined
    const handleClick = (event) => {
      const inTrigger = wrapRef.current?.contains(event.target)
      const inPopover = popoverRef.current?.contains(event.target)
      if (!inTrigger && !inPopover) setOpen(false)
    }
    const handleKey = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const handleReposition = () => updatePosition()
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    window.addEventListener('resize', handleReposition)
    window.addEventListener('scroll', handleReposition, true)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
      window.removeEventListener('resize', handleReposition)
      window.removeEventListener('scroll', handleReposition, true)
    }
  }, [open])

  const cells = useMemo(() => buildCalendarCells(viewYear, viewMonth), [viewYear, viewMonth])

  const togglePopover = () => {
    if (disabled) return
    if (!open) {
      const current = parseValue(from) || parseValue(to)
      setViewYear(current ? current.y : now.getFullYear())
      setViewMonth(current ? current.m : now.getMonth())
    }
    setOpen((prev) => !prev)
  }

  const selectDay = (cell) => {
    const nextDate = toDateValue(cell.y, cell.m, cell.d)

    if (!from || (from && to)) {
      onChange?.({ from: nextDate, to: '' })
    } else {
      const fromTs = cellTimestamp(parseValue(from))
      const nextTs = cellTimestamp(cell)
      const nextFrom = nextTs < fromTs ? nextDate : from
      const nextTo = nextTs < fromTs ? from : nextDate
      onChange?.({ from: nextFrom, to: nextTo })
    }

    if (cell.m !== viewMonth || cell.y !== viewYear) {
      setViewYear(cell.y)
      setViewMonth(cell.m)
    }
  }

  const clearValue = () => {
    onChange?.({ from: '', to: '' })
    setOpen(false)
  }

  const moveMonth = (delta) => {
    const next = new Date(viewYear, viewMonth + delta, 1)
    setViewYear(next.getFullYear())
    setViewMonth(next.getMonth())
  }

  const label = (() => {
    if (from && to) return `${formatDisplay(from)} – ${formatDisplay(to)}`
    if (from) return `${formatDisplay(from)} – …`
    return ''
  })()

  const isToday = (cell) => (
    cell.y === now.getFullYear() && cell.m === now.getMonth() && cell.d === now.getDate()
  )

  const popover = open
    ? createPortal(
      <div
        ref={popoverRef}
        className="date-range-field__popover"
        role="dialog"
        aria-label="Choose date range"
        data-fixed-popover=""
        style={{ top: coords.top, left: coords.left }}
      >
        <div className="date-range-field__head">
          <span className="date-range-field__month-label">
            {MONTH_LABELS[viewMonth]} {viewYear}
          </span>
          <div className="date-range-field__nav">
            <button type="button" className="date-range-field__nav-btn" onClick={() => moveMonth(-1)} aria-label="Previous month">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M9 2.5L4.5 7L9 11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button type="button" className="date-range-field__nav-btn" onClick={() => moveMonth(1)} aria-label="Next month">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M5 2.5L9.5 7L5 11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>

        <p className="date-range-field__hint">
          {!from || to ? 'Select start date' : 'Select end date'}
        </p>

        <div className="date-range-field__weekdays">
          {WEEKDAY_LABELS.map((day, i) => (
            <span key={`${day}-${i}`}>{day}</span>
          ))}
        </div>

        <div className="date-range-field__grid">
          {cells.map((cell) => {
            const range = getRangeClasses(cell, from, to)
            return (
              <button
                key={`${cell.y}-${cell.m}-${cell.d}`}
                type="button"
                className={[
                  'date-range-field__day',
                  cell.inMonth ? '' : 'date-range-field__day--muted',
                  isToday(cell) ? 'date-range-field__day--today' : '',
                  range.inRange ? 'date-range-field__day--in-range' : '',
                  range.isStart ? 'date-range-field__day--range-start' : '',
                  range.isEnd ? 'date-range-field__day--range-end' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => selectDay(cell)}
              >
                {cell.d}
              </button>
            )
          })}
        </div>

        <div className="date-range-field__footer">
          <button type="button" className="date-range-field__action" onClick={clearValue}>Clear</button>
        </div>
      </div>,
      document.body,
    )
    : null

  return (
    <div className="date-range-field" ref={wrapRef}>
      <input
        type="text"
        readOnly
        className={`${className} date-range-field__input`}
        value={label}
        placeholder={placeholder}
        onClick={togglePopover}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            togglePopover()
          }
        }}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
      />
      <span className="date-range-field__icon" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="2" y="3" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.3" />
          <path d="M2 6.5H14" stroke="currentColor" strokeWidth="1.3" />
          <path d="M5.5 1.5V4M10.5 1.5V4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      </span>
      {popover}
    </div>
  )
}
