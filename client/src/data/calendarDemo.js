import { DEMO_PLANTS } from './dashboardDemo'

export const TASK_TYPE_COLORS = {
  high: '#E63946',
  medium: '#FFB020',
  low: '#22C55E',
  followup: '#8B5CF6',
}

export const TASK_TYPE_BG = {
  high: '#FFF1F2',
  medium: '#FFFBEB',
  low: '#F0FDF4',
  followup: '#F5F3FF',
}

export const WORK_CENTERS = [
  { id: 'wc1', name: 'Assembly Line' },
  { id: 'wc2', name: 'Compressor Unit' },
  { id: 'wc3', name: 'HVAC System' },
  { id: 'wc4', name: 'Generator Bay' },
]

export const CALENDAR_TASKS = [
  { id: 'c1', title: 'Pump Inspection', plant: 'Plant 3', priority: 'high', date: '2026-06-02', type: 'log' },
  { id: 'c2', title: 'HVAC Maintenance', plant: 'Plant 1', priority: 'medium', date: '2026-06-03', type: 'log' },
  { id: 'c3', title: 'Motor Check', plant: 'Plant 2', priority: 'low', date: '2026-06-03', type: 'log' },
  { id: 'c4', title: 'Belt Replacement', plant: 'Plant 5', priority: 'high', date: '2026-06-08', type: 'log' },
  { id: 'c5', title: 'Sensor Calibration', plant: 'Plant 4', priority: 'followup', date: '2026-06-12', type: 'followup' },
  { id: 'c6', title: 'Emergency Drill', plant: 'Plant 1', priority: 'medium', date: '2026-06-15', type: 'log' },
  { id: 'c7', title: 'Filter Replacement', plant: 'Plant 3', priority: 'low', date: '2026-06-17', type: 'log' },
  { id: 'c8', title: 'Valve Check', plant: 'Plant 2', priority: 'medium', date: '2026-06-17', type: 'log' },
  { id: 'c9', title: 'Compressor Service', plant: 'Plant 2', priority: 'high', date: '2026-06-22', type: 'log' },
  { id: 'c10', title: 'Safety Audit', plant: 'Plant 5', priority: 'followup', date: '2026-06-25', type: 'followup' },
  { id: 'c11', title: 'Bearing Swap', plant: 'Plant 1', priority: 'high', date: '2026-06-28', type: 'log' },
  { id: 'c12', title: 'Oil Change', plant: 'Plant 4', priority: 'medium', date: '2026-06-05', type: 'log' },
  { id: 'c13', title: 'Conveyor Alignment', plant: 'Plant 2', priority: 'low', date: '2026-06-06', type: 'log' },
  { id: 'c14', title: 'Pressure Test', plant: 'Plant 3', priority: 'high', date: '2026-06-10', type: 'log' },
  { id: 'c15', title: 'Wiring Inspection', plant: 'Plant 1', priority: 'followup', date: '2026-06-11', type: 'followup' },
  { id: 'c16', title: 'Coolant Flush', plant: 'Plant 5', priority: 'low', date: '2026-06-14', type: 'log' },
  { id: 'c17', title: 'Gearbox Lubrication', plant: 'Plant 3', priority: 'medium', date: '2026-06-18', type: 'log' },
  { id: 'c18', title: 'Fan Belt Check', plant: 'Plant 4', priority: 'low', date: '2026-06-19', type: 'log' },
  { id: 'c19', title: 'Tank Cleaning', plant: 'Plant 1', priority: 'followup', date: '2026-06-20', type: 'followup' },
  { id: 'c20', title: 'Seal Replacement', plant: 'Plant 2', priority: 'high', date: '2026-06-23', type: 'log' },
  { id: 'c21', title: 'Panel Inspection', plant: 'Plant 5', priority: 'medium', date: '2026-06-24', type: 'log' },
  { id: 'c22', title: 'Drain Valve Service', plant: 'Plant 3', priority: 'low', date: '2026-06-26', type: 'log' },
  { id: 'c23', title: 'Coupling Check', plant: 'Plant 4', priority: 'followup', date: '2026-06-27', type: 'followup' },
  { id: 'c24', title: 'Lubrication Round', plant: 'Plant 2', priority: 'medium', date: '2026-06-29', type: 'log' },
  { id: 'c25', title: 'Filter Cleaning', plant: 'Plant 1', priority: 'low', date: '2026-06-30', type: 'log' },
  { id: 'c26', title: 'Hydraulic Test', plant: 'Plant 5', priority: 'high', date: '2026-06-07', type: 'log' },
  { id: 'c27', title: 'Alignment Check', plant: 'Plant 3', priority: 'followup', date: '2026-06-09', type: 'followup' },
  { id: 'c28', title: 'Startup Inspection', plant: 'Plant 4', priority: 'medium', date: '2026-06-13', type: 'log' },
]

export const UPCOMING_CALENDAR_TASKS = [
  { id: 'u1', title: 'Bearing Swap', plant: 'Plant 1', date: 'Jun 28, 2026', priority: 'high' },
  { id: 'u2', title: 'Lubrication Round', plant: 'Plant 2', date: 'Jun 29, 2026', priority: 'medium' },
  { id: 'u3', title: 'Filter Cleaning', plant: 'Plant 1', date: 'Jun 30, 2026', priority: 'low' },
  { id: 'u4', title: 'Coupling Check', plant: 'Plant 4', date: 'Jun 27, 2026', priority: 'followup' },
  { id: 'u5', title: 'Safety Audit', plant: 'Plant 5', date: 'Jun 25, 2026', priority: 'followup' },
]

export const QUICK_FILTERS = [
  { id: 'all', label: 'All Tasks', icon: 'list' },
  { id: 'assigned', label: 'Assigned To Me', icon: 'user' },
  { id: 'high', label: 'High Priority', icon: 'alert' },
  { id: 'medium', label: 'Medium Priority', icon: 'clock' },
  { id: 'low', label: 'Low Priority', icon: 'check' },
  { id: 'followup', label: 'Follow-ups', icon: 'flag' },
]

export { DEMO_PLANTS }
