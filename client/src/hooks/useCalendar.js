import { useState, useMemo } from 'react'
import { useLocations } from './useLocations'

const PRIORITY_LABELS = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  followup: 'Follow-up',
}

const EMPTY_TASKS = []

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
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

  const { locations } = useLocations()
  const locationOptions = useMemo(
    () => (locations || []).filter((loc) => loc.is_active !== false),
    [locations],
  )

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()

  const filteredTasks = useMemo(() => {
    let tasks = [...EMPTY_TASKS]

    if (plantFilter !== 'all') {
      const locationName = locationOptions.find((p) => p.id === plantFilter)?.name
      if (locationName) tasks = tasks.filter((t) => t.plant === locationName || t.location_id === plantFilter)
    }

    if (logFilter === 'logs') {
      tasks = tasks.filter((t) => t.type === 'log')
    } else if (logFilter === 'followups') {
      tasks = tasks.filter((t) => t.type === 'followup')
    }

    if (quickFilter === 'assigned') {
      tasks = tasks.filter((t) => t.assigned_to_me)
    } else if (quickFilter !== 'all') {
      tasks = tasks.filter((t) => t.priority === quickFilter)
    }

    return tasks
  }, [plantFilter, logFilter, quickFilter, locationOptions])

  const monthTasks = useMemo(
    () => filteredTasks.filter((t) => {
      const d = new Date(t.date)
      return d.getFullYear() === year && d.getMonth() === month
    }),
    [filteredTasks, year, month],
  )

  const tasksByDate = useMemo(() => {
    const map = {}
    monthTasks.forEach((task) => {
      const day = new Date(task.date).getDate()
      if (!map[day]) map[day] = []
      map[day].push(task)
    })
    return map
  }, [monthTasks])

  const summary = useMemo(() => {
    const counts = { high: 0, medium: 0, low: 0, followup: 0 }
    filteredTasks.forEach((t) => {
      counts[t.priority] = (counts[t.priority] || 0) + 1
    })
    const total = filteredTasks.length
    return {
      total,
      segments: [
        { priority: 'high', count: counts.high, percent: total ? Math.round((counts.high / total) * 100) : 0, label: 'High' },
        { priority: 'medium', count: counts.medium, percent: total ? Math.round((counts.medium / total) * 100) : 0, label: 'Medium' },
        { priority: 'low', count: counts.low, percent: total ? Math.round((counts.low / total) * 100) : 0, label: 'Low' },
        { priority: 'followup', count: counts.followup, percent: total ? Math.round((counts.followup / total) * 100) : 0, label: 'Follow-up' },
      ],
    }
  }, [filteredTasks])

  const quickFilterCounts = useMemo(() => ({
    all: filteredTasks.length,
    assigned: filteredTasks.filter((t) => t.assigned_to_me).length,
    high: filteredTasks.filter((t) => t.priority === 'high').length,
    medium: filteredTasks.filter((t) => t.priority === 'medium').length,
    low: filteredTasks.filter((t) => t.priority === 'low').length,
    followup: filteredTasks.filter((t) => t.priority === 'followup').length,
  }), [filteredTasks])

  const upcomingTasks = useMemo(() => {
    const now = startOfToday()
    return filteredTasks
      .filter((t) => new Date(t.date) >= now)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, 8)
      .map((t) => ({
        ...t,
        date: new Date(t.date).toLocaleDateString(undefined, {
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
