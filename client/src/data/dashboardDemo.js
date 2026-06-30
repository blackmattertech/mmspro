// Demo data used when Supabase has no work orders yet
export const DEMO_PLANTS = [
  { id: 'p1', name: 'Plant 1' },
  { id: 'p2', name: 'Plant 2' },
  { id: 'p3', name: 'Plant 3' },
  { id: 'p4', name: 'Plant 4' },
  { id: 'p5', name: 'Plant 5' },
]

export const DEMO_WORK_ORDERS = [
  { id: '1', work_order_number: 'WO-1265', title: 'Motor overheating issue', status: 'open', priority: 'high', plant_id: 'p1', plants: { name: 'Plant 1' }, created_at: new Date(Date.now() - 2 * 3600000).toISOString(), scheduled_at: new Date(Date.now() + 2 * 86400000).toISOString() },
  { id: '2', work_order_number: 'WO-1264', title: 'Conveyor belt alignment', status: 'in_progress', priority: 'medium', plant_id: 'p2', plants: { name: 'Plant 2' }, created_at: new Date(Date.now() - 5 * 3600000).toISOString(), scheduled_at: new Date(Date.now() + 86400000).toISOString() },
  { id: '3', work_order_number: 'WO-1263', title: 'Hydraulic leak repair', status: 'scheduled', priority: 'high', plant_id: 'p3', plants: { name: 'Plant 3' }, created_at: new Date(Date.now() - 86400000).toISOString(), scheduled_at: new Date(Date.now() + 3 * 86400000).toISOString() },
  { id: '4', work_order_number: 'WO-1262', title: 'Filter replacement', status: 'completed', priority: 'low', plant_id: 'p4', plants: { name: 'Plant 4' }, created_at: new Date(Date.now() - 2 * 86400000).toISOString(), scheduled_at: new Date(Date.now() - 86400000).toISOString() },
  { id: '5', work_order_number: 'WO-1261', title: 'Pump vibration check', status: 'overdue', priority: 'medium', plant_id: 'p5', plants: { name: 'Plant 5' }, created_at: new Date(Date.now() - 4 * 86400000).toISOString(), scheduled_at: new Date(Date.now() - 2 * 86400000).toISOString() },
]

export const STATUS_COLORS = {
  open: '#E63946',
  in_progress: '#FFB020',
  scheduled: '#3B82F6',
  completed: '#22C55E',
  overdue: '#8B5CF6',
}

export const STATUS_LABELS = {
  open: 'Open',
  in_progress: 'In Progress',
  scheduled: 'Scheduled',
  completed: 'Completed',
  overdue: 'Overdue',
}

export const PRIORITY_COLORS = {
  high: '#E63946',
  medium: '#FFB020',
  low: '#22C55E',
}

export const TREND_DATA = [
  { date: 'May 22', value: 98 },
  { date: 'May 23', value: 112 },
  { date: 'May 24', value: 105 },
  { date: 'May 25', value: 118 },
  { date: 'May 26', value: 132 },
  { date: 'May 27', value: 125 },
  { date: 'May 28', value: 140 },
]

export const PLANT_COUNTS = [
  { name: 'Plant 1', count: 320 },
  { name: 'Plant 2', count: 245 },
  { name: 'Plant 3', count: 210 },
  { name: 'Plant 4', count: 160 },
  { name: 'Plant 5', count: 111 },
]

export const UPCOMING_TASKS = [
  { id: 't1', title: 'Bearing replacement', location: 'Compressor Unit A · Plant 1', scheduled_at: 'Jun 30, 2026 · 09:00 AM', priority: 'high' },
  { id: 't2', title: 'Oil change schedule', location: 'Generator B2 · Plant 3', scheduled_at: 'Jul 01, 2026 · 11:30 AM', priority: 'medium' },
  { id: 't3', title: 'Safety inspection', location: 'Assembly Line 4 · Plant 2', scheduled_at: 'Jul 02, 2026 · 02:00 PM', priority: 'low' },
]
