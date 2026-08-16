import { getTasksList } from './api-tasks'
import { combineDateTime } from './taskDateUtils'
import { getVoicePeriodRange } from './taskVoiceDateUtils'

function sortTasksForVoice(tasks) {
  return [...tasks].sort((left, right) => {
    const leftDue = combineDateTime(left.due_date, left.due_time)?.getTime() ?? Number.MAX_SAFE_INTEGER
    const rightDue = combineDateTime(right.due_date, right.due_time)?.getTime() ?? Number.MAX_SAFE_INTEGER
    if (leftDue !== rightDue) return leftDue - rightDue
    return (left.title || '').localeCompare(right.title || '')
  })
}

function filterPendingTasks(tasks) {
  return (tasks || []).filter((task) => !task.status?.is_terminal)
}

export async function fetchVoiceTasks(periodId) {
  const range = getVoicePeriodRange(periodId)

  const [overdueRows, periodRows] = await Promise.all([
    getTasksList({
      tab: 'assigned_to_me',
      overdue: 'true',
      limit: 200,
    }),
    getTasksList({
      tab: 'assigned_to_me',
      ...range,
      limit: 200,
    }),
  ])

  const overdueTasks = sortTasksForVoice(filterPendingTasks(overdueRows))
  const overdueIds = new Set(overdueTasks.map((task) => task.id))
  const periodTasks = sortTasksForVoice(
    filterPendingTasks(periodRows).filter((task) => !overdueIds.has(task.id)),
  )

  return { overdueTasks, periodTasks }
}
