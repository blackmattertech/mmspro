import { useState } from 'react'
import { formatAssignees } from '../../lib/workOrderTableUtils'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import { useWorkOrderDetail } from '../../hooks/useWorkOrderList'
import { getReceivedWorkOrder } from '../../lib/api-work-orders'
import { getWorkOrderFileSignedUrl } from '../../lib/workOrderAssets'
import { getStoredWorkOrderFiles } from '../../lib/workOrderFileValues'
import { fieldTypeLabel } from '../../lib/assetFieldTypes'
import WorkOrderAssignmentActions from './WorkOrderAssignmentActions'
import '../dashboard/CreateWorkOrderModal.css'
import '../company/CompanyShared.css'
import './ManualWorkOrder.css'

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function FieldValue({ field }) {
  const type = field.field_type

  if (type === 'checkbox') {
    return <span>{field.value_json?.checked ? 'Yes' : 'No'}</span>
  }

  if (type === 'file' || type === 'image') {
    const stored = getStoredWorkOrderFiles(field.value_json)
    if (!stored.length) return <span>—</span>

    const openFile = async (path) => {
      const url = await getWorkOrderFileSignedUrl(path)
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
    }

    return (
      <ul className="wo-received-detail__files">
        {stored.map((meta) => (
          <li key={meta.path}>
            <button
              type="button"
              className="wo-received-detail__file-link"
              onClick={() => openFile(meta.path)}
            >
              {meta.name || 'Download file'}
            </button>
          </li>
        ))}
      </ul>
    )
  }

  return <span>{field.value_text || '—'}</span>
}

export default function ReceivedWorkOrderDetailModal({
  orderId,
  onClose,
  fetchWorkOrder = getReceivedWorkOrder,
  onAssignmentUpdated,
}) {
  const { detail, loading, error, reload } = useWorkOrderDetail(orderId, fetchWorkOrder)
  const [localDetail, setLocalDetail] = useState(null)
  const handleBackdropClick = useBackdropClose(onClose)
  const view = localDetail || detail

  const handleUpdated = (updated) => {
    setLocalDetail(updated)
    onAssignmentUpdated?.(updated)
    reload()
  }

  return (
    <div className="modal-overlay" onClick={handleBackdropClick} role="presentation">
      <div
        className="modal wo-received-detail"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="wo-received-detail-title"
      >
        <div className="modal__header">
          <h2 id="wo-received-detail-title" className="modal__title">
            Work Order {view?.wo_number || ''}
          </h2>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="wo-received-detail__body">
          {loading && !view && <p className="wo-received-detail__status">Loading...</p>}
          {error && <p className="wo-alert wo-alert--error">{error}</p>}

          {view && (
            <>
              <div className="wo-received-detail__meta">
                <div>
                  <span className="wo-received-detail__label">Received</span>
                  <span>{formatDate(view.created_at)}</span>
                </div>
                <div>
                  <span className="wo-received-detail__label">Assigned to</span>
                  <span>{formatAssignees(view.assignees, view.assigned_department, view.assigned_location)}</span>
                </div>
                <div>
                  <span className="wo-received-detail__label">Created by</span>
                  <span>{view.creator?.email || '—'}</span>
                </div>
                <div>
                  <span className="wo-received-detail__label">Status</span>
                  <span className="wo-received-badge">{view.status}</span>
                </div>
              </div>

              {view.summary && (
                <p className="wo-received-detail__summary">{view.summary}</p>
              )}

              {view.assignment_actions && (
                <WorkOrderAssignmentActions detail={view} onUpdated={handleUpdated} />
              )}

              {view.sections?.map((section) => (
                <section key={section.id} className="wo-received-detail__section">
                  <h3>{section.name}</h3>
                  <dl className="wo-received-detail__fields">
                    {section.fields.map((field) => (
                      <div key={field.id} className="wo-received-detail__field">
                        <dt>
                          {field.name}
                          <span className="wo-received-detail__type">{fieldTypeLabel(field.field_type)}</span>
                        </dt>
                        <dd><FieldValue field={field} /></dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}

              {!view.sections?.length && (
                <p className="wo-received-detail__status">No field values recorded.</p>
              )}
            </>
          )}
        </div>

        <div className="modal__actions wo-received-detail__actions">
          <button type="button" className="company-btn company-btn--secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
