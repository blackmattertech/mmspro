import { useState, useMemo } from 'react'
import {
  CALENDAR_TASKS,
  UPCOMING_CALENDAR_TASKS,
  DEMO_PLANTS,
  WORK_CENTERS,
} from '../data/calendarDemo'

const PRIORITY_LABELS = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  followup: 'Follow-up',
}

export function useCalendar() {
  const [viewDate, setViewDate] = useState(new Date(2026, 5, 1))
  const [viewMode, setViewMode] = useState('calendar')
  const [plantFilter, setPlantFilter] = useState('all')
  const [logFilter, setLogFilter] = useState('all')
  const [workCenterFilter, setWorkCenterFilter] = useState('all')
  const [quickFilter, setQuickFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('2026-05-28')
  const [dateTo, setDateTo] = useState('2026-06-28')

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()

  const filteredTasks = useMemo(() => {
    let tasks = [...CALENDAR_TASKS]

    if (plantFilter !== 'all') {
      const plantName = DEMO_PLANTS.find((p) => p.id === plantFilter)?.name
      if (plantName) tasks = tasks.filter((t) => t.plant === plantName)
    }

    if (logFilter === 'logs') {
      tasks = tasks.filter((t) => t.type === 'log')
    } else if (logFilter === 'followups') {
      tasks = tasks.filter((t) => t.type === 'followup')
    }

    if (quickFilter === 'assigned') {
      tasks = tasks.filter((_, i) => i % 2 === 0)
    } else if (quickFilter !== 'all') {
      tasks = tasks.filter((t) => t.priority === quickFilter)
    }

    return tasks
  }, [plantFilter, logFilter, quickFilter])

  const monthTasks = useMemo(
    () => filteredTasks.filter((t) => {
      const d = new Date(t.date)
      return d.getFullYear() === year && d.getMonth() === month
    }),
    [filteredTasks, year, month]
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
    CALENDAR_TASKS.forEach((t) => {
      counts[t.priority] = (counts[t.priority] || 0) + 1
    })
    const total = CALENDAR_TASKS.length
    return {
      total,
      segments: [
        { priority: 'high', count: counts.high, percent: Math.round((counts.high / total) * 100), label: 'High' },
        { priority: 'medium', count: counts.medium, percent: Math.round((counts.medium / total) * 100), label: 'Medium' },
        { priority: 'low', count: counts.low, percent: Math.round((counts.low / total) * 100), label: 'Low' },
        { priority: 'followup', count: counts.followup, percent: Math.round((counts.followup / total) * 100), label: 'Follow-up' },
      ],
    }
  }, [])

  const quickFilterCounts = useMemo(() => ({
    all: CALENDAR_TASKS.length,
    assigned: Math.ceil(CALENDAR_TASKS.length / 2),
    high: CALENDAR_TASKS.filter((t) => t.priority === 'high').length,
    medium: CALENDAR_TASKS.filter((t) => t.priority === 'medium').length,
    low: CALENDAR_TASKS.filter((t) => t.priority === 'low').length,
    followup: CALENDAR_TASKS.filter((t) => t.priority === 'followup').length,
  }), [])

  const goToToday = () => setViewDate(new Date(2026, 5, 28))
  const goToPrevMonth = () => setViewDate(new Date(year, month - 1, 1))
  const goToNextMonth = () => setViewDate(new Date(year, month + 1, 1))

  const monthLabel = viewDate.toLocaleString('default', { month: 'long', year: 'numeric' })

  return {
    plants: DEMO_PLANTS,
    workCenters: WORK_CENTERS,
    tasks: monthTasks,
    allFilteredTasks: filteredTasks,
    tasksByDate,
    upcomingTasks: UPCOMING_CALENDAR_TASKS,
    summary,
    quickFilterCounts,
    priorityLabels: PRIORITY_LABELS,
    viewDate,
    year,
    month,
    monthLabel,
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
