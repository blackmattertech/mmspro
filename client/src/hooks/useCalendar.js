import { useState, useMemo, useEffect, useCallback } from 'react'
import { useLocations } from './useLocations'
import { getCalendarEvents } from '../lib/api-calendar'
import { SOURCE_LABELS } from '../data/calendarDemo'

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

function monthRange(year, month) {
  const from = `${year}-${pad(month + 1)}-01`
  const lastDay = new Date(year, month + 1, 0).getDate()
  const to = `${year}-${pad(month + 1)}-${pad(lastDay)}`
  return { from, to }
}

export function useCalendar() {
  const today = startOfToday()
  const [viewDate, setViewDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [viewMode, setViewMode] = useState('calendar')
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
    const monthBounds = monthRange(year, month)
    return {
      from: dateFrom || monthBounds.from,
      to: dateTo || monthBounds.to,
    }
  }, [year, month, dateFrom, dateTo])

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

  const monthTasks = useMemo(
    () => filteredTasks.filter((t) => {
      const d = new Date(`${String(t.date).slice(0, 10)}T12:00:00`)
      return d.getFullYear() === year && d.getMonth() === month
    }),
    [filteredTasks, year, month],
  )

  const tasksByDate = useMemo(() => {
    const map = {}
    monthTasks.forEach((task) => {
      const day = new Date(`${String(task.date).slice(0, 10)}T12:00:00`).getDate()
      if (!map[day]) map[day] = []
      map[day].push(task)
    })
    return map
  }, [monthTasks])

  const summary = useMemo(() => {
    const counts = {
      task: 0,
      work_order: 0,
      work_request: 0,
      pm_plan: 0,
      warranty: 0,
    }
    filteredTasks.forEach((t) => {
      const key = t.source || t.type
      if (key in counts) counts[key] += 1
    })
    const total = filteredTasks.length
    const segments = [
      { priority: 'task', count: counts.task, percent: total ? Math.round((counts.task / total) * 100) : 0, label: 'Tasks' },
      { priority: 'work_order', count: counts.work_order, percent: total ? Math.round((counts.work_order / total) * 100) : 0, label: 'Work orders' },
      { priority: 'work_request', count: counts.work_request, percent: total ? Math.round((counts.work_request / total) * 100) : 0, label: 'Work requests' },
      { priority: 'pm_plan', count: counts.pm_plan, percent: total ? Math.round((counts.pm_plan / total) * 100) : 0, label: 'PM schedules' },
      { priority: 'warranty', count: counts.warranty, percent: total ? Math.round((counts.warranty / total) * 100) : 0, label: 'Warranties' },
    ]
    return { total, segments }
  }, [filteredTasks])

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
    return filteredTasks
      .filter((t) => new Date(`${String(t.date).slice(0, 10)}T12:00:00`) >= now)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .slice(0, 8)
      .map((t) => ({
        ...t,
        date: new Date(`${String(t.date).slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
      }))
  }, [filteredTasks])

  const goToToday = () => {
    const d = startOfToday()
    setViewDate(new Date(d.getFullYear(), d.getMonth(), 1))
  }
  const goToPrevMonth = () => setViewDate(new Date(year, month - 1, 1))
  const goToNextMonth = () => setViewDate(new Date(year, month + 1, 1))

  const monthLabel = viewDate.toLocaleString('default', { month: 'long', year: 'numeric' })
  const todayDay = (
    year === today.getFullYear() && month === today.getMonth()
  ) ? today.getDate() : null

  return {
    plants: locationOptions,
    workCenters: [],
    tasks: monthTasks,
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
    monthLabel,
    todayDay,
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
    goToPrevMonth,
    goToNextMonth,
  }
}

export function buildCalendarGrid(year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7
  const prevMonthDays = new Date(year, month, 0).getDate()

  const cells = []

  for (let i = firstWeekday - 1; i >= 0; i--) {
    cells.push({ day: prevMonthDays - i, currentMonth: false })
  }

  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, currentMonth: true })
  }

  const remaining = 42 - cells.length
  for (let d = 1; d <= remaining; d++) {
    cells.push({ day: d, currentMonth: false })
  }

  return cells
}
