import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import { useProfile } from '../../hooks/useProfile'
import { formatTaskDateTime } from '../../lib/taskDateUtils'
import { fetchVoiceTasks } from '../../lib/taskVoiceService'
import { buildTaskVoiceScript, buildVoiceSummaryText } from '../../lib/taskVoiceSummary'
import { VOICE_PERIOD_OPTIONS } from '../../lib/taskVoiceDateUtils'
import { getSpeechBlockReason, textToSpeech } from '../../lib/textToSpeech'
import VoiceAgentIcon from '../ui/VoiceAgentIcon'
import '../company/CompanyShared.css'
import './TaskVoiceAssistant.css'

const tts = textToSpeech

function TaskVoiceList({ tasks, activeTaskId, onOpenTask, emptyLabel }) {
  if (!tasks.length) {
    return <div className="company-empty task-voice-panel__section-empty">{emptyLabel}</div>
  }

  return (
    <ul className="task-voice-panel__list">
      {tasks.map((task) => (
        <li key={task.id}>
          <button
            type="button"
            className={`task-voice-panel__task${activeTaskId === task.id ? ' task-voice-panel__task--active' : ''}`}
            data-task-id={task.id}
            onClick={() => onOpenTask?.(task)}
          >
            <span className="task-voice-panel__task-title">{task.title}</span>
            <span className="task-voice-panel__task-meta">
              <span>{task.status?.name || '—'}</span>
              <span>{task.priority?.name || '—'}</span>
              <span>{formatTaskDateTime(task.due_date, task.due_time)}</span>
              <span>By {task.assigned_by_name || '—'}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

export default function TaskVoiceAssistant({ onClose, onOpenTask }) {
  const { displayName } = useProfile()
  const listRef = useRef(null)
  const scriptRef = useRef([])

  const [period, setPeriod] = useState('today')
  const [overdueTasks, setOverdueTasks] = useState([])
  const [periodTasks, setPeriodTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [voiceError, setVoiceError] = useState(null)
  const [playbackState, setPlaybackState] = useState('idle')
  const [activeTaskId, setActiveTaskId] = useState(null)

  const script = useMemo(() => buildTaskVoiceScript({
    userName: displayName || 'there',
    periodId: period,
    overdueTasks,
    periodTasks,
  }), [displayName, period, overdueTasks, periodTasks])

  const summaryText = useMemo(() => buildVoiceSummaryText({
    overdueTasks,
    periodTasks,
    periodId: period,
  }), [overdueTasks, periodTasks, period])

  const periodLabel = VOICE_PERIOD_OPTIONS.find((option) => option.id === period)?.label || 'Today'
  const hasTasks = overdueTasks.length > 0 || periodTasks.length > 0

  scriptRef.current = script

  const loadTasks = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const { overdueTasks: overdue, periodTasks: scheduled } = await fetchVoiceTasks(period)
      setOverdueTasks(overdue)
      setPeriodTasks(scheduled)
    } catch (err) {
      setError(err.message || 'Failed to load tasks.')
      setOverdueTasks([])
      setPeriodTasks([])
    } finally {
      if (!silent) setLoading(false)
    }
  }, [period])

  useEffect(() => {
    const blockReason = getSpeechBlockReason()
    if (blockReason) setVoiceError(blockReason)
  }, [])

  useEffect(() => {
    setActiveTaskId(null)
    loadTasks()
  }, [loadTasks])

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'hidden') return
      loadTasks({ silent: true })
    }
    const timer = window.setInterval(refresh, 30000)
    window.addEventListener('focus', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      window.clearInterval(timer)
    }
  }, [loadTasks])

  useEffect(() => {
    tts.onStateChange = setPlaybackState
    tts.onSegmentChange = (index) => {
      const segment = scriptRef.current[index]
      setActiveTaskId(segment?.taskId || null)
      if (segment?.taskId && listRef.current) {
        const row = listRef.current.querySelector(`[data-task-id="${segment.taskId}"]`)
        row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      }
    }
    return () => {
      tts.onStateChange = null
      tts.onSegmentChange = null
    }
  }, [])

  const handlePlay = () => {
    setVoiceError(null)

    const blockReason = getSpeechBlockReason()
    if (blockReason) {
      setVoiceError(blockReason)
      return
    }

    if (playbackState === 'paused' && tts.isPaused) {
      tts.resume()
      return
    }

    const result = tts.speakFromUserGesture(scriptRef.current, {
      onError: (event) => {
        const code = event?.error || 'unknown'
        setVoiceError(
          code === 'not-started'
            ? 'Speech did not start. Open http://localhost:5173 and try Play again.'
            : `Voice playback failed (${code}).`,
        )
      },
    })

    if (!result.ok) {
      setVoiceError(result.reason || 'Could not start voice playback.')
    }
  }

  const handlePause = () => {
    tts.pause()
  }

  const handleStop = () => {
    tts.stop()
    setActiveTaskId(null)
    setVoiceError(null)
  }

  const handleClose = useCallback(() => {
    tts.stop()
    onClose?.()
  }, [onClose])

  const handleBackdropClick = useBackdropClose(handleClose)

  const handlePeriodChange = (nextPeriod) => {
    if (nextPeriod === period) return
    tts.stop()
    setActiveTaskId(null)
    setVoiceError(null)
    setPeriod(nextPeriod)
  }

  const isPlaying = playbackState === 'playing'
  const isPaused = playbackState === 'paused'

  return (
    <div className="company-modal-overlay task-voice-overlay" onMouseDown={handleBackdropClick}>
      <div
        className="task-voice-panel"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-labelledby="task-voice-title"
        aria-modal="true"
      >
        <header className="task-voice-panel__header">
          <div className="task-voice-panel__title-wrap">
            <span className="task-voice-panel__icon">
              <VoiceAgentIcon active={isPlaying || isPaused} size={56} />
            </span>
            <div>
              <h2 id="task-voice-title" className="task-voice-panel__title">AI Summary</h2>
              <p className="task-voice-panel__subtitle">
                Listen to overdue tasks first, then pending tasks for the selected period.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="company-modal__close"
            onClick={handleClose}
            aria-label="Close AI Summary"
          >
            ×
          </button>
        </header>

        <div className="task-voice-panel__filters" role="group" aria-label="Task period">
          {VOICE_PERIOD_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`task-voice-panel__filter${period === option.id ? ' task-voice-panel__filter--active' : ''}`}
              onClick={() => handlePeriodChange(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>

        {(error || voiceError) && (
          <div className="company-alert" role="alert">
            {error || voiceError}
          </div>
        )}

        <div className="task-voice-panel__controls">
          <button
            type="button"
            className="company-btn company-btn--primary"
            onClick={handlePlay}
            disabled={loading || Boolean(error)}
          >
            {isPaused ? 'Resume' : 'Play'}
          </button>
          <button
            type="button"
            className="company-btn company-btn--secondary"
            onClick={handlePause}
            disabled={!isPlaying}
          >
            Pause
          </button>
          <button
            type="button"
            className="company-btn company-btn--secondary"
            onClick={handleStop}
            disabled={playbackState === 'idle'}
          >
            Stop
          </button>
        </div>

        <div className="task-voice-panel__summary">
          {loading ? 'Loading tasks…' : summaryText}
        </div>

        <div className="task-voice-panel__list-wrap" ref={listRef}>
          {loading ? (
            <div className="company-loading">Loading tasks…</div>
          ) : !hasTasks ? (
            <div className="company-empty">No overdue or pending tasks for this period.</div>
          ) : (
            <div className="task-voice-panel__sections">
              <section className="task-voice-panel__section">
                <h3 className="task-voice-panel__section-title">
                  Overdue
                  <span className="task-voice-panel__section-count">{overdueTasks.length}</span>
                </h3>
                <TaskVoiceList
                  tasks={overdueTasks}
                  activeTaskId={activeTaskId}
                  onOpenTask={onOpenTask}
                  emptyLabel="No overdue tasks."
                />
              </section>

              <section className="task-voice-panel__section">
                <h3 className="task-voice-panel__section-title">
                  {periodLabel}
                  <span className="task-voice-panel__section-count">{periodTasks.length}</span>
                </h3>
                <TaskVoiceList
                  tasks={periodTasks}
                  activeTaskId={activeTaskId}
                  onOpenTask={onOpenTask}
                  emptyLabel={`No tasks scheduled for ${periodLabel.toLowerCase()}.`}
                />
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
