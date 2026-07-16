import { useDashboard } from '../../hooks/useDashboard'
import { useCalendar } from '../../hooks/useCalendar'
import CalendarHeader, { CalendarToolbar } from '../../components/calendar/CalendarHeader'
import { CalendarFilters, CalendarGrid, CalendarTable } from '../../components/calendar/CalendarGrid'
import { QuickFilters, UpcomingTasksPanel, TaskSummaryPanel } from '../../components/calendar/CalendarSidebar'
import './Calendar.css'

export default function Calendar() {
  const { createWorkOrder } = useDashboard()
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
        onCreateTask={createWorkOrder}
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
            onCreateTask={createWorkOrder}
            plants={plantOptions}
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

            {viewMode === 'calendar' ? (
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
