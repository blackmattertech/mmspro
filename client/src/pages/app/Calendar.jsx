import { useCalendar } from '../../hooks/useCalendar'
import CalendarHeader, { CalendarToolbar } from '../../components/calendar/CalendarHeader'
import { CalendarGrid } from '../../components/calendar/CalendarGrid'
import { QuickFilters, UpcomingTasksPanel, TaskSummaryPanel } from '../../components/calendar/CalendarSidebar'
import './Calendar.css'

export default function Calendar() {
  const {
    plants,
    tasksByDate,
    upcomingTasks,
    summary,
    quickFilterCounts,
    year,
    month,
    periodLabel,
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
    quickFilter,
    setQuickFilter,
    goToToday,
    goToPrev,
    goToNext,
    loading,
    error,
    tasks,
  } = useCalendar()

  const plantOptions = plants || []
  const dayTasks = selectedDate ? (tasksByDate[selectedDate] || []) : tasks

  return (
    <div className="calendar-page">
      <CalendarHeader
        plants={plantOptions}
        plantFilter={plantFilter}
        onPlantChange={setPlantFilter}
      />

      <div className="calendar-page__body">
        <div className="calendar-page__main">
          <CalendarToolbar
            monthLabel={periodLabel}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onToday={goToToday}
            onPrevMonth={goToPrev}
            onNextMonth={goToNext}
            logFilter={logFilter}
            onLogFilterChange={setLogFilter}
          />

          <div className="calendar-page__card">
            {error && (
              <div className="wo-alert wo-alert--error" role="alert">{error}</div>
            )}
            {loading ? (
              <div className="company-loading">Loading calendar…</div>
            ) : (
              <CalendarGrid
                year={year}
                month={month}
                tasksByDate={tasksByDate}
                todayIso={todayIso}
                selectedDate={selectedDate}
                onSelectDate={selectDate}
                onOpenDay={(iso) => {
                  selectDate(iso)
                  setViewMode('day')
                }}
                viewMode={viewMode}
                weekDays={weekDays}
                dayTasks={viewMode === 'day' ? tasks : dayTasks}
              />
            )}
          </div>
        </div>

        <aside className="calendar-page__sidebar">
          <QuickFilters
            active={quickFilter}
            onChange={setQuickFilter}
            counts={quickFilterCounts}
          />
          <UpcomingTasksPanel tasks={upcomingTasks} />
          <TaskSummaryPanel summary={summary} periodLabel={periodLabel} />
        </aside>
      </div>
    </div>
  )
}
