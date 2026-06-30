import { useDashboard } from '../../hooks/useDashboard'
import DashboardHeader from '../../components/dashboard/DashboardHeader'
import {
  KpiCards,
  DonutChart,
  TrendChart,
  PlantsBarChart,
  SlaGauge,
  RecentWorkOrders,
  CalendarWidget,
  UpcomingTasks,
} from '../../components/dashboard/DashboardWidgets'
import './Dashboard.css'

export default function Dashboard() {
  const {
    loading,
    plants,
    recentOrders,
    upcomingTasks,
    trendData,
    plantBreakdown,
    statusBreakdown,
    priorityBreakdown,
    stats,
    plantFilter,
    setPlantFilter,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    createWorkOrder,
  } = useDashboard()

  if (loading) {
    return (
      <div className="dashboard dashboard--loading">
        <p>Loading dashboard...</p>
      </div>
    )
  }

  return (
    <div className="dashboard">
      <DashboardHeader
        plants={plants}
        plantFilter={plantFilter}
        onPlantChange={setPlantFilter}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        onCreateWorkOrder={createWorkOrder}
      />

      <div className="dashboard__content">
        <KpiCards stats={stats} />

        <div className="dashboard__row dashboard__row--2">
          <DonutChart
            title="Work Orders by Status"
            total={stats.total}
            segments={statusBreakdown}
            filterLabel="All Plants"
          />
          <TrendChart data={trendData} filterLabel="Last 7 Days" />
        </div>

        <div className="dashboard__row dashboard__row--3">
          <PlantsBarChart data={plantBreakdown} filterLabel="This Month" />
          <RecentWorkOrders orders={recentOrders} />
          <CalendarWidget />
        </div>

        <div className="dashboard__row dashboard__row--3">
          <DonutChart
            title="Work Orders by Priority"
            total={stats.total}
            segments={priorityBreakdown}
          />
          <SlaGauge percent={stats.slaPercent} trend={stats.slaTrend} />
          <UpcomingTasks tasks={upcomingTasks} />
        </div>
      </div>
    </div>
  )
}
