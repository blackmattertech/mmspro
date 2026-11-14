import { useState, useMemo, useEffect, useCallback } from 'react'
import { useLocations } from './useLocations'
import { getCalendarEvents } from '../lib/api-calendar'
import { SOURCE_LABELS } from '../data/calendarDemo'
import { formatDisplayDate } from '../lib/displayDate'

const PRIORITY_LABELS = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  followup: 'Follow-up',
  ...SOURCE_LABELS,
}

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function pad(n) {
  return String(n).padStart(2, '0')
}

function toIsoDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function parseIsoDate(value) {
  return new Date(`${String(value).slice(0, 10)}T12:00:00`)
}

function startOfWeek(date) {
  const d = new Date(date)
  d.setHours(12, 0, 0, 0)
  const weekday = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - weekday)
  return d
}

function addDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function monthRange(year, month) {
  const from = `${year}-${pad(month + 1)}-01`
  const lastDay = new Date(year, month + 1, 0).getDate()
  const to = `${year}-${pad(month + 1)}-${pad(lastDay)}`
  return { from, to }
}

function weekRange(anchor) {
  const start = startOfWeek(anchor)
  const end = addDays(start, 6)
  return { from: toIsoDate(start), to: toIsoDate(end), start }
}

export function useCalendar() {
  const today = startOfToday()
  const [viewDate, setViewDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), today.getDate()))
  const [viewMode, setViewMode] = useState('month')
  const [selectedDate, setSelectedDate] = useState(() => toIsoDate(today))
  const [plantFilter, setPlantFilter] = useState('all')
  const [logFilter, setLogFilter] = useState('all')
  const [workCenterFilter, setWorkCenterFilter] = useState('all')
  const [quickFilter, setQuickFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const { locations } = useLocations()
  const locationOptions = useMemo(
    () => (locations || []).filter((loc) => loc.is_active !== false),
    [locations],
  )

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()

  const loadRange = useMemo(() => {
    if (dateFrom || dateTo) {
      const monthBounds = monthRange(year, month)
      return {
        from: dateFrom || monthBounds.from,
        to: dateTo || monthBounds.to,
      }
    }
    if (viewMode === 'day') {
      const iso = toIsoDate(viewDate)
      return { from: iso, to: iso }
    }
    if (viewMode === 'week') {
      const { from, to } = weekRange(viewDate)
      return { from, to }
    }
    return monthRange(year, month)
  }, [year, month, dateFrom, dateTo, viewMode, viewDate])

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getCalendarEvents({
        from: loadRange.from,
        to: loadRange.to,
        locationId: plantFilter !== 'all' ? plantFilter : undefined,
      })
      setEvents(data?.events || [])
    } catch (err) {
      setEvents([])
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [loadRange.from, loadRange.to, plantFilter])

  useEffect(() => {
    reload()
  }, [reload])

  const filteredTasks = useMemo(() => {
    let tasks = [...events]

    if (logFilter !== 'all') {
      tasks = tasks.filter((t) => t.source === logFilter || t.type === logFilter)
    }

    if (quickFilter === 'assigned') {
      tasks = tasks.filter((t) => t.assigned_to_me)
    } else if (quickFilter !== 'all') {
      tasks = tasks.filter((t) => (
        t.source === quickFilter
        || t.type === quickFilter
        || t.priority === quickFilter
      ))
    }

    if (dateFrom) {
      tasks = tasks.filter((t) => String(t.date).slice(0, 10) >= dateFrom)
    }
    if (dateTo) {
      tasks = tasks.filter((t) => String(t.date).slice(0, 10) <= dateTo)
    }

    return tasks
  }, [events, logFilter, quickFilter, dateFrom, dateTo])

  const periodTasks = useMemo(() => {
    if (viewMode === 'day') {
      const iso = toIsoDate(viewDate)
      return filteredTasks.filter((t) => String(t.date).slice(0, 10) === iso)
    }
    if (viewMode === 'week') {
      const { from, to } = weekRange(viewDate)
      return filteredTasks.filter((t) => {
        const d = String(t.date).slice(0, 10)
        return d >= from && d <= to
      })
    }
    return filteredTasks.filter((t) => {
      const d = parseIsoDate(t.date)
      return d.getFullYear() === year && d.getMonth() === month
    })
  }, [filteredTasks, viewMode, viewDate, year, month])

  const tasksByDate = useMemo(() => {
    const map = {}
    periodTasks.forEach((task) => {
      const key = String(task.date).slice(0, 10)
      if (!map[key]) map[key] = []
      map[key].push(task)
    })
    return map
  }, [periodTasks])

  const summary = useMemo(() => {
    const counts = {
      task: 0,
      work_order: 0,
      work_request: 0,
      pm_plan: 0,
      warranty: 0,
    }
    periodTasks.forEach((t) => {
      const key = t.source || t.type
      if (key in counts) counts[key] += 1
    })
    const total = periodTasks.length
    const segments = [
      { priority: 'task', count: counts.task, percent: total ? Math.round((counts.task / total) * 100) : 0, label: 'Tasks' },
      { priority: 'work_order', count: counts.work_order, percent: total ? Math.round((counts.work_order / total) * 100) : 0, label: 'Work orders' },
      { priority: 'work_request', count: counts.work_request, percent: total ? Math.round((counts.work_request / total) * 100) : 0, label: 'Work requests' },
      { priority: 'pm_plan', count: counts.pm_plan, percent: total ? Math.round((counts.pm_plan / total) * 100) : 0, label: 'PM schedules' },
      { priority: 'warranty', count: counts.warranty, percent: total ? Math.round((counts.warranty / total) * 100) : 0, label: 'Warranties' },
    ]
    return { total, segments }
  }, [periodTasks])

  const quickFilterCounts = useMemo(() => ({
    all: filteredTasks.length,
    assigned: filteredTasks.filter((t) => t.assigned_to_me).length,
    task: filteredTasks.filter((t) => t.source === 'task').length,
    work_order: filteredTasks.filter((t) => t.source === 'work_order').length,
    work_request: filteredTasks.filter((t) => t.source === 'work_request').length,
    pm_plan: filteredTasks.filter((t) => t.source === 'pm_plan').length,
  }), [filteredTasks])

  const upcomingTasks = useMemo(() => {
    const now = startOfToday()
    const until = addDays(now, 7)
    return filteredTasks
      .filter((t) => {
        const d = parseIsoDate(t.date)
        return d >= now && d <= until
      })
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .slice(0, 8)
      .map((t) => ({
        ...t,
        date: formatDisplayDate(t.date),
      }))
  }, [filteredTasks])

  const goToToday = () => {
    const d = startOfToday()
    setViewDate(new Date(d.getFullYear(), d.getMonth(), d.getDate()))
    setSelectedDate(toIsoDate(d))
  }

  const goToPrev = () => {
    if (viewMode === 'day') {
      setViewDate((prev) => addDays(prev, -1))
      return
    }
    if (viewMode === 'week') {
      setViewDate((prev) => addDays(prev, -7))
      return
    }
    setViewDate(new Date(year, month - 1, 1))
  }

  const goToNext = () => {
    if (viewMode === 'day') {
      setViewDate((prev) => addDays(prev, 1))
      return
    }
    if (viewMode === 'week') {
      setViewDate((prev) => addDays(prev, 7))
      return
    }
    setViewDate(new Date(year, month + 1, 1))
  }

  const selectDate = useCallback((isoDate) => {
    if (!isoDate) return
    setSelectedDate(isoDate)
    setViewDate(parseIsoDate(isoDate))
  }, [])

  const periodLabel = useMemo(() => {
    if (viewMode === 'day') {
      const weekday = viewDate.toLocaleDateString(undefined, { weekday: 'long' })
      return `${weekday}, ${formatDisplayDate(viewDate)}`
    }
    if (viewMode === 'week') {
      const { start } = weekRange(viewDate)
      const end = addDays(start, 6)
      return `${formatDisplayDate(start)} – ${formatDisplayDate(end)}`
    }
    return viewDate.toLocaleString('default', { month: 'long', year: 'numeric' })
  }, [viewMode, viewDate])

  const todayIso = toIsoDate(today)
  const weekDays = useMemo(() => {
    const start = startOfWeek(viewDate)
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(start, i)
      return {
        date: d,
        iso: toIsoDate(d),
        day: d.getDate(),
        weekday: d.toLocaleDateString(undefined, { weekday: 'short' }),
        currentMonth: d.getMonth() === month,
      }
    })
  }, [viewDate, month])

  return {
    plants: locationOptions,
    workCenters: [],
    tasks: periodTasks,
    allFilteredTasks: filteredTasks,
    tasksByDate,
    upcomingTasks,
    summary,
    quickFilterCounts,
    priorityLabels: PRIORITY_LABELS,
    loading,
    error,
    reload,
    viewDate,
    year,
    month,
    monthLabel: periodLabel,
    periodLabel,
    todayDay: today.getDate(),
    todayIso,
    selectedDate,
    selectDate,
    weekDays,
    viewMode,
    setViewMode,
    plantFilter,
    setPlantFilter,
    logFilter,
    setLogFilter,
    workCenterFilter,
    setWorkCenterFilter,
    quickFilter,
    setQuickFilter,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    goToToday,
    goToPrevMonth: goToPrev,
    goToNextMonth: goToNext,
    goToPrev,
    goToNext,
  }
}

export function buildCalendarGrid(year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7
  const prevMonthDays = new Date(year, month, 0).getDate()

  const cells = []

  for (let i = firstWeekday - 1; i >= 0; i--) {
    const day = prevMonthDays - i
    const date = new Date(year, month - 1, day)
    cells.push({
      day,
      currentMonth: false,
      iso: toIsoDate(date),
      date,
    })
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d)
    cells.push({
      day: d,
      currentMonth: true,
      iso: toIsoDate(date),
      date,
    })
  }

  const remaining = 42 - cells.length
  for (let d = 1; d <= remaining; d++) {
    const date = new Date(year, month + 1, d)
    cells.push({
      day: d,
      currentMonth: false,
      iso: toIsoDate(date),
      date,
    })
  }

  return cells
}

export { toIsoDate, parseIsoDate, startOfWeek, addDays }
