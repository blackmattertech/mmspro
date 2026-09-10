import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './DateField.css'

const TimeField = lazy(() => import('./TimeField'))

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
  const [datePart, timePart] = String(value).split('T')
  const [y, m, d] = datePart.split('-').map(Number)
  if (!y || !m || !d) return null
  return { y, m: m - 1, d, time: timePart ? timePart.slice(0, 5) : '' }
}

const toDateValue = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`

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

/**
 * Custom date (and optional time) picker with brand-red styling.
 * Value format matches native inputs: `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm`.
 * Popover is portaled to document.body so overflow:hidden parents cannot clip it.
 */
export default function DateField({
  id,
  value,
  onChange,
  disabled = false,
  withTime = false,
  className = 'company-form__input',
  placeholder,
}) {
  const parsed = parseValue(value)
  const now = new Date()
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(parsed ? parsed.y : now.getFullYear())
  const [viewMonth, setViewMonth] = useState(parsed ? parsed.m : now.getMonth())
  const [coords, setCoords] = useState({ top: 0, left: 0 })
  const wrapRef = useRef(null)
  const popoverRef = useRef(null)

  const updatePosition = () => {
    const anchor = wrapRef.current
    if (!anchor) return
    const rect = anchor.getBoundingClientRect()
    const popoverHeight = popoverRef.current?.offsetHeight || (withTime ? 340 : 300)
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
    // Re-measure after paint once popover height is known
    const frame = requestAnimationFrame(updatePosition)
    return () => cancelAnimationFrame(frame)
  }, [open, withTime, viewMonth, viewYear])

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
      const current = parseValue(value)
      setViewYear(current ? current.y : now.getFullYear())
      setViewMonth(current ? current.m : now.getMonth())
    }
    setOpen((prev) => !prev)
  }

  const emit = (y, m, d, time) => {
    if (withTime) {
      onChange(`${toDateValue(y, m, d)}T${time || '00:00'}`)
    } else {
      onChange(toDateValue(y, m, d))
    }
  }

  const selectDay = (cell) => {
    emit(cell.y, cell.m, cell.d, parsed?.time)
    if (cell.m !== viewMonth || cell.y !== viewYear) {
      setViewYear(cell.y)
      setViewMonth(cell.m)
    }
    if (!withTime) setOpen(false)
  }

  const selectToday = () => {
    const t = new Date()
    const time = withTime ? `${pad(t.getHours())}:${pad(t.getMinutes())}` : undefined
    emit(t.getFullYear(), t.getMonth(), t.getDate(), time)
    setViewYear(t.getFullYear())
    setViewMonth(t.getMonth())
    if (!withTime) setOpen(false)
  }

  const clearValue = () => {
    onChange('')
    setOpen(false)
  }

  const moveMonth = (delta) => {
    const next = new Date(viewYear, viewMonth + delta, 1)
    setViewYear(next.getFullYear())
    setViewMonth(next.getMonth())
  }

  const label = parsed
    ? `${pad(parsed.d)}/${pad(parsed.m + 1)}/${parsed.y}${withTime && parsed.time ? ` ${parsed.time}` : ''}`
    : ''

  const isToday = (cell) => (
    cell.y === now.getFullYear() && cell.m === now.getMonth() && cell.d === now.getDate()
  )
  const isSelected = (cell) => (
    parsed && cell.y === parsed.y && cell.m === parsed.m && cell.d === parsed.d
  )

  const popover = open
    ? createPortal(
      <div
        ref={popoverRef}
        className="date-field__popover"
        role="dialog"
        aria-label="Choose date"
        data-fixed-popover=""
        style={{ top: coords.top, left: coords.left }}
      >
        <div className="date-field__head">
          <span className="date-field__month-label">
            {MONTH_LABELS[viewMonth]} {viewYear}
          </span>
          <div className="date-field__nav">
            <button type="button" className="date-field__nav-btn" onClick={() => moveMonth(-1)} aria-label="Previous month">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M9 2.5L4.5 7L9 11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button type="button" className="date-field__nav-btn" onClick={() => moveMonth(1)} aria-label="Next month">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M5 2.5L9.5 7L5 11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>

        <div className="date-field__weekdays">
          {WEEKDAY_LABELS.map((day, i) => (
            <span key={`${day}-${i}`}>{day}</span>
          ))}
        </div>

        <div className="date-field__grid">
          {cells.map((cell) => (
            <button
              key={`${cell.y}-${cell.m}-${cell.d}`}
              type="button"
              className={[
                'date-field__day',
                cell.inMonth ? '' : 'date-field__day--muted',
                isToday(cell) ? 'date-field__day--today' : '',
                isSelected(cell) ? 'date-field__day--selected' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => selectDay(cell)}
            >
              {cell.d}
            </button>
          ))}
        </div>

        {withTime && (
          <div className="date-field__time">
            <span className="date-field__time-label">Time</span>
            <Suspense fallback={null}>
              <TimeField
                value={parsed?.time || ''}
                onChange={(time) => {
                  const base = parsed || {
                    y: now.getFullYear(), m: now.getMonth(), d: now.getDate(),
                  }
                  emit(base.y, base.m, base.d, time)
                }}
              />
            </Suspense>
          </div>
        )}

        <div className="date-field__footer">
          <button type="button" className="date-field__action" onClick={clearValue}>Clear</button>
          <button type="button" className="date-field__action" onClick={selectToday}>Today</button>
        </div>
      </div>,
      document.body,
    )
    : null

  return (
    <div className="date-field" ref={wrapRef}>
      <input
        id={id}
        type="text"
        readOnly
        className={`${className} date-field__input`}
        value={label}
        placeholder={placeholder || (withTime ? 'dd/mm/yyyy --:--' : 'dd/mm/yyyy')}
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
      <span className="date-field__icon" aria-hidden="true">
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
