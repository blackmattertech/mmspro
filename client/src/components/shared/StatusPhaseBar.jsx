import { useMemo, useState } from 'react'
import {
  phaseCountsFromFine,
  totalFromCounts,
  togglePhaseSelection,
  toggleFineSelection,
  selectionIsActiveForPhase,
  selectionIsActiveForFine,
  labelForFineStatus,
  fineCountForStatus,
  resolveStatusFilters,
} from '../../lib/statusPhases'
import './StatusCountBar.css'
import './StatusPhaseBar.css'

export { resolveStatusFilters }

export default function StatusPhaseBar({
  counts = [],
  phases = [],
  selectedKeys = [],
  onChange,
  labelByKey = {},
  ariaLabel = 'Filter by status',
  flat = false,
}) {
  const [expandedPhaseId, setExpandedPhaseId] = useState(null)
  const phaseRows = useMemo(() => phaseCountsFromFine(counts, phases), [counts, phases])
  const allCount = useMemo(() => totalFromCounts(counts), [counts])
  const selected = selectedKeys || []
  const allActive = selected.length === 0

  if (!phases.length) return null

  const handleAll = () => onChange?.([])

  const handlePhase = (phase) => {
    onChange?.(togglePhaseSelection(selected, phase))
  }

  const handleFine = (statusKey) => {
    onChange?.(toggleFineSelection(selected, statusKey, phases))
  }

  const expandedPhase = phaseRows.find((row) => row.id === expandedPhaseId) || null
  const fineItems = expandedPhase
    ? expandedPhase.statuses
      .map((status) => ({
        key: status,
        label: labelForFineStatus(status, labelByKey),
        count: fineCountForStatus(counts, status),
        color: expandedPhase.color,
      }))
      .filter((item) => item.count > 0)
    : []

  return (
    <div className="status-phase-bar" aria-label={ariaLabel}>
      <ul className="status-count-bar status-phase-bar__phases">
        <li>
          <button
            type="button"
            className={`status-count-bar__item status-count-bar__item--button${allActive ? ' status-count-bar__item--active' : ''}`}
            aria-pressed={allActive}
            onClick={handleAll}
          >
            <span className="status-count-bar__label">All</span>
            <span className="status-count-bar__count">{allCount}</span>
          </button>
        </li>
        {phaseRows.map((phase) => {
          const active = selectionIsActiveForPhase(selected, phase)
          const canExpand = !flat && phase.statuses.length > 1
          const expanded = expandedPhaseId === phase.id
          const muted = phase.count === 0
          return (
            <li key={phase.id} className="status-phase-bar__phase">
              <button
                type="button"
                className={`status-count-bar__item status-count-bar__item--button${active ? ' status-count-bar__item--active' : ''}${muted ? ' status-phase-bar__item--muted' : ''}`}
                aria-pressed={active}
                disabled={muted && !active}
                onClick={() => handlePhase(phase)}
              >
                <span
                  className="status-count-bar__dot"
                  style={phase.color ? { background: phase.color } : undefined}
                  aria-hidden="true"
                />
                <span className="status-count-bar__label">{phase.label}</span>
                <span className="status-count-bar__count">{phase.count}</span>
              </button>
              {canExpand && (
                <button
                  type="button"
                  className={`status-phase-bar__chevron${expanded ? ' status-phase-bar__chevron--open' : ''}`}
                  aria-expanded={expanded}
                  aria-label={expanded ? `Hide ${phase.label} statuses` : `Show ${phase.label} statuses`}
                  onClick={() => setExpandedPhaseId(expanded ? null : phase.id)}
                >
                  ▾
                </button>
              )}
            </li>
          )
        })}
      </ul>

      {fineItems.length > 0 && (
        <ul className="status-count-bar status-phase-bar__fines" aria-label="Statuses in phase">
          {fineItems.map((item) => {
            const active = selectionIsActiveForFine(selected, item.key, phases)
            return (
              <li key={item.key}>
                <button
                  type="button"
                  className={`status-count-bar__item status-count-bar__item--button${active ? ' status-count-bar__item--active' : ''}`}
                  aria-pressed={active}
                  onClick={() => handleFine(item.key)}
                >
                  <span
                    className="status-count-bar__dot"
                    style={item.color ? { background: item.color } : undefined}
                    aria-hidden="true"
                  />
                  <span className="status-count-bar__label">{item.label}</span>
                  <span className="status-count-bar__count">{item.count}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
