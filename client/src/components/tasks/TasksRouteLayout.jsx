import { Outlet, useLocation } from 'react-router-dom'
import { TaskMetaProvider } from '../../context/TaskMetaContext'
import '../company/CompanyShared.css'
import '../workorders/WorkOrdersPage.css'
import './Tasks.css'

export default function TasksRouteLayout() {
  const location = useLocation()
  return (
    <TaskMetaProvider>
      <div className="company-page wo-page tasks-page">
        <Outlet key={location.pathname} />
      </div>
    </TaskMetaProvider>
  )
}
