import { useBackdropClose } from '../../hooks/useBackdropClose'
import WorkOrderMaterialRowsTable, { normalizeMaterialRows } from './WorkOrderMaterialRowsTable'
import '../company/CompanyShared.css'
import './ManualWorkOrder.css'

function formatDayLabel(log) {
  if (!log?.log_date) return '—'
  try {
    return new Date(`${log.log_date}T12:00:00`).toLocaleDateString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return log.log_date
  }
}

function formatTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export default function WorkOrderMaterialDetailsModal({ logs = [], onClose }) {
  const handleBackdropClick = useBackdropClose(onClose)
  const days = (logs || [])
    .map((log) => ({
      ...log,
      materials: normalizeMaterialRows(log.materials).filter((row) => (
        row.code || row.description || row.uom || row.qty
      )),
    }))
    .filter((log) => log.materials.length > 0)

  return (
    <div className="modal-overlay company-modal-overlay--nested" onClick={handleBackdropClick} role="presentation">
      <div
        className="modal wo-material-details-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="wo-material-details-title"
      >
        <div className="modal__header">
          <h2 id="wo-material-details-title" className="modal__title">Material consumed — day wise</h2>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal__body wo-material-details-modal__body">
          {!days.length ? (
            <p className="wo-permit__hint">No day-wise material entries yet.</p>
          ) : (
            days.map((log) => (
              <section key={log.id} className="wo-material-details-modal__day">
                <header className="wo-material-details-modal__day-head">
                  <strong>{formatDayLabel(log)}</strong>
                  <span>
                    {formatTime(log.started_at)}
                    {log.ended_at ? ` → ${formatTime(log.ended_at)}` : ''}
                  </span>
                </header>
                <WorkOrderMaterialRowsTable rows={log.materials} readOnly />
              </section>
            ))
          )}
        </div>
        <div className="modal__actions">
          <button type="button" className="company-btn company-btn--secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
