import { combineDateTime } from './taskDateUtils'
import { getVoicePeriodSpeechLabel } from './taskVoiceDateUtils'

function getTimeGreeting(date = new Date()) {
  const hour = date.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function formatSpeechDue(task, referenceDate = new Date()) {
  if (!task.due_date) return 'No due date set.'

  const due = combineDateTime(task.due_date, task.due_time)
  if (!due) return 'No due date set.'

  const startOfToday = new Date(referenceDate)
  startOfToday.setHours(0, 0, 0, 0)
  const startOfTomorrow = new Date(startOfToday)
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1)
  const startOfDayAfter = new Date(startOfTomorrow)
  startOfDayAfter.setDate(startOfDayAfter.getDate() + 1)

  const timeLabel = due.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })

  if (due >= startOfToday && due < startOfTomorrow) {
    return task.due_time ? `Due today at ${timeLabel}.` : 'Due today.'
  }
  if (due >= startOfTomorrow && due < startOfDayAfter) {
    return task.due_time ? `Due tomorrow at ${timeLabel}.` : 'Due tomorrow.'
  }

  const dateLabel = due.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  return task.due_time ? `Due on ${dateLabel} at ${timeLabel}.` : `Due on ${dateLabel}.`
}

function buildTaskSpeechSegments(task, index, { isOverdue = false } = {}) {
  const title = task.title || 'Untitled task'
  const priority = task.priority?.name || 'No priority'
  const status = task.status?.name || 'Unknown status'
  const assignedBy = task.assigned_by_name || 'Unknown'
  const due = formatSpeechDue(task)

  const fields = [
    `Task ${index + 1}.`,
    `${title}.`,
  ]

  if (isOverdue) {
    fields.push('This task is overdue.')
  }

  fields.push(
    `Priority ${priority}.`,
    `Status ${status}.`,
    `Assigned by ${assignedBy}.`,
    due,
  )

  return fields.map((text, fieldIndex) => ({
    text,
    type: 'task-field',
    taskId: task.id,
    taskIndex: index,
    pauseAfter: fieldIndex === fields.length - 1 ? 'task' : 'field',
  }))
}

export function buildVoiceSummaryText({
  overdueTasks = [],
  periodTasks = [],
  periodId = 'today',
} = {}) {
  const periodLabel = getVoicePeriodSpeechLabel(periodId)
  const overdueCount = overdueTasks.length
  const periodCount = periodTasks.length

  if (!overdueCount && !periodCount) {
    return `No overdue tasks and no pending tasks for ${periodLabel}.`
  }

  const parts = []
  if (overdueCount) {
    parts.push(`${overdueCount} overdue task${overdueCount === 1 ? '' : 's'}`)
  }
  if (periodCount) {
    parts.push(`${periodCount} for ${periodLabel}`)
  }

  return `${parts.join(' and ')}. Press Play to listen.`
}

/**
 * @returns {{ text: string, type: string, taskId?: string, taskIndex?: number }[]}
 */
export function buildTaskVoiceScript({
  userName = 'there',
  periodId = 'today',
  overdueTasks = [],
  periodTasks = [],
}) {
  const periodLabel = getVoicePeriodSpeechLabel(periodId)
  const greeting = `${getTimeGreeting()}, ${userName}.`
  const segments = [{ text: greeting, type: 'greeting', pauseAfter: 'section' }]

  if (!overdueTasks.length && !periodTasks.length) {
    segments.push({
      text: `You have no overdue tasks and no pending tasks scheduled for ${periodLabel}.`,
      type: 'empty',
      pauseAfter: 'section',
    })
    segments.push({ text: 'Enjoy your day.', type: 'closing' })
    return segments
  }

  if (overdueTasks.length) {
    segments.push({
      text: `You have ${overdueTasks.length} overdue task${overdueTasks.length === 1 ? '' : 's'} that need your attention.`,
      type: 'overdue-intro',
      pauseAfter: 'section',
    })

    overdueTasks.forEach((task, index) => {
      segments.push(...buildTaskSpeechSegments(task, index, { isOverdue: true }))
    })
  } else {
    segments.push({
      text: 'You have no overdue tasks.',
      type: 'overdue-empty',
      pauseAfter: 'section',
    })
  }

  if (periodTasks.length) {
    segments.push({
      text: `Now, for ${periodLabel}, you have ${periodTasks.length} task${periodTasks.length === 1 ? '' : 's'} scheduled.`,
      type: 'intro',
      pauseAfter: 'section',
    })

    periodTasks.forEach((task, index) => {
      segments.push(...buildTaskSpeechSegments(task, index))
    })
  } else {
    segments.push({
      text: `You have no other tasks scheduled for ${periodLabel}.`,
      type: 'period-empty',
      pauseAfter: 'section',
    })
  }

  segments.push({
    text: overdueTasks.length
      ? `Please prioritize your overdue tasks, then continue with ${periodLabel}. Have a productive day.`
      : `These are all your tasks for ${periodLabel}. Have a productive day.`,
    type: 'closing',
  })

  return segments
}
