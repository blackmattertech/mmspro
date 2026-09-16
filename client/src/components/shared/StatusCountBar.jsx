import { formatStatusCountItems } from '../../lib/statusCounts'
import './StatusCountBar.css'

export default function StatusCountBar({
  counts,
  statuses,
  labelByKey,
  colorByKey,
  items: itemsProp,
  ariaLabel = 'Status counts',
}) {
  const items = itemsProp || formatStatusCountItems(counts, { statuses, labelByKey, colorByKey })
  if (!items.length) return null

  return (
    <ul className="status-count-bar" aria-label={ariaLabel}>
      {items.map((item) => (
        <li key={item.key} className="status-count-bar__item">
          <span
            className="status-count-bar__dot"
            style={item.color ? { background: item.color } : undefined}
            aria-hidden="true"
          />
          <span className="status-count-bar__label">{item.label}</span>
          <span className="status-count-bar__count">{item.count}</span>
        </li>
      ))}
    </ul>
  )
}
