import { useCalendar } from '../../hooks/useCalendar'
import CalendarHeader, { CalendarToolbar } from '../../components/calendar/CalendarHeader'
import { CalendarFilters, CalendarGrid, CalendarTable } from '../../components/calendar/CalendarGrid'
import { QuickFilters, UpcomingTasksPanel, TaskSummaryPanel } from '../../components/calendar/CalendarSidebar'
import './Calendar.css'

export default function Calendar() {
  const {
    plants,
    workCenters,
    allFilteredTasks,
    tasksByDate,
    upcomingTasks,
    summary,
    quickFilterCounts,
    priorityLabels,
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
    loading,
    error,
  } = useCalendar()

  const plantOptions = plants || []
  const workCenterOptions = workCenters || []

  return (
    <div className="calendar-page">
      <CalendarHeader
        plants={plantOptions}
        plantFilter={plantFilter}
        onPlantChange={setPlantFilter}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
      />

      <div className="calendar-page__body">
        <div className="calendar-page__main">
          <CalendarToolbar
            monthLabel={monthLabel}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onToday={goToToday}
            onPrevMonth={goToPrevMonth}
            onNextMonth={goToNextMonth}
          />

          <div className="calendar-page__card">
            <CalendarFilters
              logFilter={logFilter}
              onLogFilterChange={setLogFilter}
              plantFilter={plantFilter}
              onPlantFilterChange={setPlantFilter}
              workCenterFilter={workCenterFilter}
              onWorkCenterFilterChange={setWorkCenterFilter}
              plants={plantOptions}
              workCenters={workCenterOptions}
            />

            {error && (
              <div className="wo-alert wo-alert--error" role="alert">{error}</div>
            )}
            {loading ? (
              <div className="company-loading">Loading calendar…</div>
            ) : viewMode === 'calendar' ? (
              <CalendarGrid
                year={year}
                month={month}
                tasksByDate={tasksByDate}
                todayDay={todayDay}
              />
            ) : (
              <CalendarTable tasks={allFilteredTasks} priorityLabels={priorityLabels} />
            )}
          </div>
        </div>

        <aside className="calendar-page__sidebar">
          <QuickFilters
            active={quickFilter}
            onChange={setQuickFilter}
            counts={quickFilterCounts}
          />
          <UpcomingTasksPanel
            tasks={upcomingTasks}
            priorityLabels={priorityLabels}
          />
          <TaskSummaryPanel summary={summary} />
        </aside>
      </div>
    </div>
  )
}
