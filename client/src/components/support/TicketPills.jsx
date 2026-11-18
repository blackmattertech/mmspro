import { priorityLabel, resolutionSnapshot, statusLabel } from '../../../../shared/supportTickets.js'

export function StatusPill({ status }) {
  return <span className={`company-badge company-badge--support company-badge--support-${status}`}>{statusLabel(status)}</span>
}

export function PriorityPill({ priority }) {
  return <span className={`company-badge company-badge--support company-badge--priority-${priority}`}>{priorityLabel(priority)}</span>
}

export function SlaPill({ ticket }) {
  const snap = resolutionSnapshot(ticket)
  return <span className={`company-badge company-badge--support company-badge--sla-${snap.state}`}>{snap.label}</span>
}
