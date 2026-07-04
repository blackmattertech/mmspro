import { useBackdropClose } from '../../hooks/useBackdropClose'
import { useWorkOrderDetail } from '../../hooks/useWorkOrderList'
import { getReceivedWorkOrder } from '../../lib/api-work-orders'
import { getWorkOrderFileSignedUrl } from '../../lib/workOrderAssets'
import { getStoredWorkOrderFiles } from '../../lib/workOrderFileValues'
import { fieldTypeLabel } from '../../lib/assetFieldTypes'
import '../dashboard/CreateWorkOrderModal.css'
import '../company/CompanyShared.css'
import './ManualWorkOrder.css'

function formatAssignees(assignees) {
  if (!assignees?.length) return '—'
  return assignees.map((a) => a.name).join(', ')
}

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
}) {
  const { detail, loading, error } = useWorkOrderDetail(orderId, fetchWorkOrder)
  const handleBackdropClick = useBackdropClose(onClose)

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
            Work Order {detail?.wo_number || ''}
          </h2>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="wo-received-detail__body">
          {loading && <p className="wo-received-detail__status">Loading...</p>}
          {error && <p className="wo-alert wo-alert--error">{error}</p>}

          {detail && !loading && (
            <>
              <div className="wo-received-detail__meta">
                <div>
                  <span className="wo-received-detail__label">Received</span>
                  <span>{formatDate(detail.created_at)}</span>
                </div>
                <div>
                  <span className="wo-received-detail__label">Assigned to</span>
                  <span>{formatAssignees(detail.assignees)}</span>
                </div>
                <div>
                  <span className="wo-received-detail__label">Created by</span>
                  <span>{detail.creator?.email || '—'}</span>
                </div>
                <div>
                  <span className="wo-received-detail__label">Status</span>
                  <span className="wo-received-badge">{detail.status}</span>
                </div>
              </div>

              {detail.summary && (
                <p className="wo-received-detail__summary">{detail.summary}</p>
              )}

              {detail.sections?.map((section) => (
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

              {!detail.sections?.length && (
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
