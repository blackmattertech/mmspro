import { formatStatusCountItems } from '../../lib/statusCounts'
import './StatusCountBar.css'

export default function StatusCountBar({
  counts,
  statuses,
  labelByKey,
  colorByKey,
  items: itemsProp,
  ariaLabel = 'Status counts',
  selectedKeys = [],
  onToggle,
}) {
  const items = itemsProp || formatStatusCountItems(counts, { statuses, labelByKey, colorByKey })
  if (!items.length) return null
  const interactive = typeof onToggle === 'function'
  const selected = new Set(selectedKeys || [])

  return (
    <ul className="status-count-bar" aria-label={ariaLabel}>
      {items.map((item) => {
        const active = selected.has(item.key)
        const className = `status-count-bar__item${active ? ' status-count-bar__item--active' : ''}${interactive ? ' status-count-bar__item--button' : ''}`
        const inner = (
          <>
            <span
              className="status-count-bar__dot"
              style={item.color ? { background: item.color } : undefined}
              aria-hidden="true"
            />
            <span className="status-count-bar__label">{item.label}</span>
            <span className="status-count-bar__count">{item.count}</span>
          </>
        )
        if (!interactive) {
          return (
            <li key={item.key} className={className}>
              {inner}
            </li>
          )
        }
        return (
          <li key={item.key}>
            <button
              type="button"
              className={className}
              aria-pressed={active}
              onClick={() => onToggle(item.key)}
            >
              {inner}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
