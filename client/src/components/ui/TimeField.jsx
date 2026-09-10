import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './TimeField.css'

const POPOVER_WIDTH = 220
const POPOVER_GAP = 6
const HOURS_12 = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
const MINUTES = Array.from({ length: 60 }, (_, index) => index)
const PERIODS = ['AM', 'PM']

const pad = (value) => String(value).padStart(2, '0')

function parseTime(value) {
  if (!value) return null
  const [hourPart, minutePart] = String(value).split(':')
  const hour24 = Number(hourPart)
  const minute = Number(minutePart)
  if (Number.isNaN(hour24) || Number.isNaN(minute)) return null
  if (hour24 < 0 || hour24 > 23 || minute < 0 || minute > 59) return null
  return { hour24, minute }
}

function toTimeValue(hour24, minute) {
  return `${pad(hour24)}:${pad(minute)}`
}

function to12Hour(hour24) {
  const period = hour24 >= 12 ? 'PM' : 'AM'
  let hour12 = hour24 % 12
  if (hour12 === 0) hour12 = 12
  return { hour12, period }
}

function to24Hour(hour12, period) {
  if (period === 'AM') return hour12 === 12 ? 0 : hour12
  return hour12 === 12 ? 12 : hour12 + 12
}

function formatDisplay(value) {
  const parsed = parseTime(value)
  if (!parsed) return ''
  const { hour12, period } = to12Hour(parsed.hour24)
  return `${pad(hour12)}:${pad(parsed.minute)} ${period}`
}

function TimeColumn({ label, options, selected, onSelect, formatOption }) {
  const listRef = useRef(null)

  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    const active = list.querySelector('.time-field__cell--selected')
    if (active) {
      active.scrollIntoView({ block: 'center' })
    }
  }, [selected, options])

  return (
    <div className="time-field__column" role="listbox" aria-label={label}>
      <div className="time-field__column-list" ref={listRef}>
        {options.map((option) => {
          const value = formatOption ? formatOption(option) : option
          const isSelected = value === selected
          return (
            <button
              key={value}
              type="button"
              role="option"
              aria-selected={isSelected}
              className={`time-field__cell${isSelected ? ' time-field__cell--selected' : ''}`}
              onClick={() => onSelect(option)}
            >
              {value}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Custom time picker with brand styling matching DateField.
 * Value format: `HH:mm` (24-hour).
 */
export default function TimeField({
  id,
  value,
  onChange,
  disabled = false,
  className = 'company-form__input',
  placeholder = '--:-- --',
}) {
  const parsed = parseTime(value)
  const now = new Date()
  const initial = parsed || {
    hour24: now.getHours(),
    minute: now.getMinutes(),
  }
  const initial12 = to12Hour(initial.hour24)

  const [open, setOpen] = useState(false)
  const [draftHour12, setDraftHour12] = useState(initial12.hour12)
  const [draftMinute, setDraftMinute] = useState(initial.minute)
  const [draftPeriod, setDraftPeriod] = useState(initial12.period)
  const [coords, setCoords] = useState({ top: 0, left: 0 })

  const wrapRef = useRef(null)
  const popoverRef = useRef(null)

  const displayLabel = useMemo(() => formatDisplay(value), [value])

  const updatePosition = () => {
    const anchor = wrapRef.current
    if (!anchor) return
    const rect = anchor.getBoundingClientRect()
    const popoverHeight = popoverRef.current?.offsetHeight || 260
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
  }, [open, draftHour12, draftMinute, draftPeriod])

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

  const syncDraftFromValue = () => {
    const current = parseTime(value)
    const base = current || {
      hour24: now.getHours(),
      minute: now.getMinutes(),
    }
    const hour12 = to12Hour(base.hour24)
    setDraftHour12(hour12.hour12)
    setDraftMinute(base.minute)
    setDraftPeriod(hour12.period)
  }

  const emitDraft = (hour12, minute, period) => {
    onChange(toTimeValue(to24Hour(hour12, period), minute))
  }

  const togglePopover = () => {
    if (disabled) return
    if (!open) syncDraftFromValue()
    setOpen((prev) => !prev)
  }

  const selectHour = (hour12) => {
    setDraftHour12(hour12)
    emitDraft(hour12, draftMinute, draftPeriod)
  }

  const selectMinute = (minute) => {
    setDraftMinute(minute)
    emitDraft(draftHour12, minute, draftPeriod)
  }

  const selectPeriod = (period) => {
    setDraftPeriod(period)
    emitDraft(draftHour12, draftMinute, period)
  }

  const selectNow = () => {
    const current = new Date()
    const hour24 = current.getHours()
    const minute = current.getMinutes()
    const hour12 = to12Hour(hour24)
    setDraftHour12(hour12.hour12)
    setDraftMinute(minute)
    setDraftPeriod(hour12.period)
    onChange(toTimeValue(hour24, minute))
    setOpen(false)
  }

  const clearValue = () => {
    onChange('')
    setOpen(false)
  }

  const popover = open
    ? createPortal(
      <div
        ref={popoverRef}
        className="time-field__popover"
        role="dialog"
        aria-label="Choose time"
        data-fixed-popover=""
        style={{ top: coords.top, left: coords.left }}
      >
        <div className="time-field__head">
          <span className="time-field__head-label">Select time</span>
        </div>

        <div className="time-field__columns">
          <TimeColumn
            label="Hour"
            options={HOURS_12}
            selected={pad(draftHour12)}
            onSelect={selectHour}
            formatOption={(hour) => pad(hour)}
          />
          <TimeColumn
            label="Minute"
            options={MINUTES}
            selected={pad(draftMinute)}
            onSelect={selectMinute}
            formatOption={(minute) => pad(minute)}
          />
          <TimeColumn
            label="Period"
            options={PERIODS}
            selected={draftPeriod}
            onSelect={selectPeriod}
          />
        </div>

        <div className="time-field__footer">
          <button type="button" className="time-field__action" onClick={clearValue}>Clear</button>
          <button type="button" className="time-field__action" onClick={selectNow}>Now</button>
        </div>
      </div>,
      document.body,
    )
    : null

  return (
    <div className="time-field" ref={wrapRef}>
      <input
        id={id}
        type="text"
        readOnly
        className={`${className} time-field__input`}
        value={displayLabel}
        placeholder={placeholder}
        onClick={togglePopover}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            togglePopover()
          }
        }}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
      />
      <span className="time-field__icon" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
          <path d="M8 4.5V8L10.5 9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      </span>
      {popover}
    </div>
  )
}
