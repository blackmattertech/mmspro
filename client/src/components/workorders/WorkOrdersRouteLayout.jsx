import { WorkOrderToolbarProvider } from '../../hooks/useWorkOrderToolbar'
import WorkOrdersLayout from './WorkOrdersLayout'

export default function WorkOrdersRouteLayout() {
  return (
    <WorkOrderToolbarProvider>
      <WorkOrdersLayout />
    </WorkOrderToolbarProvider>
  )
}
