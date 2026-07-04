import { useNavigate } from 'react-router-dom'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import { useOrg } from '../../hooks/useOrg'
import { orgPath } from '../../config/navigation'
import { WORK_ORDER_CREATE_TYPES } from '../../config/workOrders'
import '../company/CompanyShared.css'
import './WorkOrderTypeModal.css'

export default function WorkOrderTypeModal({ onClose }) {
  const navigate = useNavigate()
  const { org } = useOrg()
  const handleBackdropClick = useBackdropClose(onClose)

  const handleSelect = (type) => {
    if (!type.available) return
    onClose()
    if (org?.slug && type.segment) {
      navigate(orgPath(org.slug, type.segment))
    }
  }

  return (
    <div className="company-modal-overlay" onMouseDown={handleBackdropClick}>
      <div className="company-modal wo-type-modal" onClick={(e) => e.stopPropagation()}>
        <div className="company-modal__header">
          <h2>Create Work Order</h2>
          <button type="button" className="company-modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="wo-type-modal__body">
          <p className="wo-type-modal__intro">Select the type of work order you want to create.</p>
          <div className="wo-type-modal__grid">
            {WORK_ORDER_CREATE_TYPES.map((type) => (
              <button
                key={type.id}
                type="button"
                className={`wo-type-modal__option${type.available ? '' : ' wo-type-modal__option--disabled'}`}
                onClick={() => handleSelect(type)}
                disabled={!type.available}
              >
                <span className="wo-type-modal__option-label">{type.label}</span>
                <span className="wo-type-modal__option-desc">{type.description}</span>
                {!type.available && (
                  <span className="wo-type-modal__option-soon">Coming soon</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="company-modal__actions wo-type-modal__actions">
          <button type="button" className="company-btn company-btn--secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
