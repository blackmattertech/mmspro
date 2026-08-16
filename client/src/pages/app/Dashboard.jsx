import { useDashboard } from '../../hooks/useDashboard'
import DashboardHeader from '../../components/dashboard/DashboardHeader'
import {
  KpiCards,
  DonutChart,
  TrendChart,
  LocationsBarChart,
  RecentWorkOrders,
  CalendarWidget,
} from '../../components/dashboard/DashboardWidgets'
import './Dashboard.css'

export default function Dashboard() {
  const {
    loading,
    error,
    locations,
    canSeeAllLocations,
    recentOrders,
    trendData,
    locationBreakdown,
    statusBreakdown,
    stats,
    locationFilter,
    setLocationFilter,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    createWorkOrder,
  } = useDashboard()

  const locationFilterLabel = canSeeAllLocations && locationFilter === 'all'
    ? 'All Locations'
    : (locations.find((loc) => loc.id === locationFilter)?.name || 'Location')

  return (
    <div className="dashboard">
      <DashboardHeader
        locations={locations}
        locationFilter={locationFilter}
        onLocationChange={setLocationFilter}
        canSeeAllLocations={canSeeAllLocations}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        onCreateWorkOrder={createWorkOrder}
      />

      {loading ? (
        <div className="dashboard--loading">
          <p>Loading dashboard...</p>
        </div>
      ) : (
        <div className="dashboard__content">
          {error && <div className="company-alert" role="alert">{error}</div>}

          <KpiCards stats={stats} />

          <div className="dashboard__row dashboard__row--2">
            <DonutChart
              title="Work Orders by Status"
              total={stats.total}
              segments={statusBreakdown}
              filterLabel={locationFilterLabel}
            />
            <TrendChart data={trendData} filterLabel="Last 7 Days" />
          </div>

          <div className="dashboard__row dashboard__row--3">
            <LocationsBarChart data={locationBreakdown} filterLabel="Current filters" />
            <RecentWorkOrders orders={recentOrders} />
            <CalendarWidget />
          </div>
        </div>
      )}
    </div>
  )
}
