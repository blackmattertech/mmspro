import { useDashboard } from '../../hooks/useDashboard'
import DashboardHeader from '../../components/dashboard/DashboardHeader'
import DashboardBoard from '../../components/dashboard/DashboardBoard'
import './Dashboard.css'

export default function Dashboard() {
  const {
    loading,
    refreshing,
    error,
    locations,
    canSeeAllLocations,
    charts,
    modules,
    locationFilter,
    setLocationFilter,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    createWorkOrder,
    createWorkRequest,
    canCreateWorkOrder,
    canCreateWorkRequest,
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
        onCreateWorkRequest={createWorkRequest}
        canCreateWorkOrder={canCreateWorkOrder}
        canCreateWorkRequest={canCreateWorkRequest}
      />

      {loading && !modules?.length && !charts ? (
        <div className="dashboard--loading">
          <p>Loading dashboard...</p>
        </div>
      ) : (
        <div className={`dashboard__content${refreshing ? ' is-refreshing' : ''}`}>
          {refreshing ? <p className="dashboard__refresh">Updating charts…</p> : null}
          {error && <div className="company-alert" role="alert">{error}</div>}

          {!modules?.length ? (
            <section className="dash-section">
              <p className="dash-empty">No module KPIs available for your role.</p>
            </section>
          ) : (
            <DashboardBoard
              modules={modules}
              charts={charts}
              locationLabel={locationFilterLabel}
            />
          )}
        </div>
      )}
    </div>
  )
}
