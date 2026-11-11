import './WorkOrderStatusPicker.css'

const STATUS_ORDER = [
  'draft',
  'assigned',
  'accepted',
  'started',
  'in_progress',
  'waiting_material',
  'waiting_shutdown',
  'on_hold',
  'completed',
  'verified',
  'closed',
  'returned_rework',
]

function StatusIcon({ status }) {
  if (status === 'started') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M8 5.14v13.72L19 12 8 5.14Z" />
      </svg>
    )
  }
  if (status === 'in_progress' || status === 'waiting_material' || status === 'waiting_shutdown') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" strokeDasharray="3.2 3.6" />
        <circle cx="12" cy="12" r="2.5" fill="currentColor" />
      </svg>
    )
  }
  if (status === 'returned_rework') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M7.5 8.5A5.5 5.5 0 0 1 18 10.2"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path d="M16.2 7.2 18.2 10.3 15 11.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path
          d="M16.5 15.5A5.5 5.5 0 0 1 6 13.8"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path d="M7.8 16.8 5.8 13.7 9 12.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (status === 'completed' || status === 'verified' || status === 'closed') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="currentColor" />
        <path d="M8.2 12.2 10.6 14.6 15.8 9.4" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (status === 'on_hold') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="currentColor" />
        <rect x="9" y="8" width="2.2" height="8" rx="1" fill="#fff" />
        <rect x="12.8" y="8" width="2.2" height="8" rx="1" fill="#fff" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 7.2v9.6L17.2 12 9 7.2Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CheckBadge() {
  return (
    <span className="wo-status-picker__check" aria-hidden="true">
      <svg viewBox="0 0 16 16" width="10" height="10">
        <path d="M3.5 8.2 6.4 11 12.5 4.8" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}

export function orderStatusOptions(statuses) {
  const unique = [...new Set((statuses || []).filter(Boolean))]
  const ranked = STATUS_ORDER.filter((status) => unique.includes(status))
  const rest = unique.filter((status) => !STATUS_ORDER.includes(status))
  return [...ranked, ...rest]
}

export default function WorkOrderStatusPicker({
  options = [],
  value = '',
  onChange,
  disabled = false,
  getLabel,
  blockedStatuses = null,
}) {
  return (
    <div className="wo-status-picker" role="radiogroup" aria-label="Update task status">
      {options.map((status) => {
        const selected = value === status
        const blocked = Boolean(blockedStatuses?.[status])
        const tone = status === 'returned_rework'
          ? 'rework'
          : status === 'on_hold'
            ? 'hold'
            : status === 'completed' || status === 'verified' || status === 'closed'
              ? 'done'
              : status === 'started' || status === 'in_progress'
                ? 'active'
                : 'idle'
        return (
          <button
            key={status}
            type="button"
            role="radio"
            aria-checked={selected}
            className={[
              'wo-status-picker__option',
              `wo-status-picker__option--${tone}`,
              selected ? 'is-selected' : '',
            ].filter(Boolean).join(' ')}
            disabled={disabled || blocked}
            title={blocked ? blockedStatuses[status] : undefined}
            onClick={() => onChange?.(status)}
          >
            <span className={`wo-status-picker__icon wo-status-picker__icon--${tone}`}>
              <StatusIcon status={status} />
            </span>
            <span className="wo-status-picker__label">{getLabel?.(status) || status}</span>
            {selected ? <CheckBadge /> : null}
            <span className={`wo-status-picker__radio${selected ? ' is-selected' : ''}`} aria-hidden="true" />
          </button>
        )
      })}
    </div>
  )
}
