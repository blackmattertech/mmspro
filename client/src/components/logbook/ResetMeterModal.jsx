import { useState } from 'react'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import { resetMeterReading } from '../../lib/api-logbook'
import { formatMeterValue } from '../../lib/meterReading'
import '../company/CompanyShared.css'

export default function ResetMeterModal({
  equipment,
  assetLabel = '',
  nested = false,
  onClose,
  onReset,
}) {
  const handleBackdropClick = useBackdropClose(onClose)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const label = assetLabel || [equipment?.name, equipment?.code].filter(Boolean).join(' · ') || 'This asset'
  const lastReading = equipment?.last_reading ?? equipment?.last_meter_reading
  const cumulative = equipment?.cumulative_reading ?? lastReading

  const handleConfirm = async () => {
    setError(null)
    setSaving(true)
    try {
      const saved = await resetMeterReading(equipment.id)
      await onReset?.(saved)
    } catch (err) {
      setError(err.message || 'Could not reset the meter')
      setSaving(false)
    }
  }

  return (
    <div
      className={`company-modal-overlay${nested ? ' company-modal-overlay--nested' : ''}`}
      onMouseDown={handleBackdropClick}
      role="presentation"
    >
      <div
        className="company-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-meter-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="company-modal__header">
          <h2 id="reset-meter-title">Reset meter</h2>
          <button type="button" className="company-modal__close" onClick={onClose} aria-label="Close" disabled={saving}>×</button>
        </div>
        <div className="company-modal__form">
          <p className="company-modal__hint">{label}</p>
          <p className="company-form__hint">
            Last reading becomes 0. Cumm. Reading stays at {formatMeterValue(cumulative)}, and readings you add after this keep adding onto that total. The reset is saved in history.
          </p>
          <p className="company-form__hint">
            Last reading: {formatMeterValue(lastReading)} → 0
            <br />
            Cumm. Reading: {formatMeterValue(cumulative)}
          </p>
          {error && <div className="company-alert" role="alert">{error}</div>}
          <div className="company-modal__actions">
            <button type="button" className="company-btn company-btn--ghost" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="button" className="company-btn company-btn--primary" onClick={handleConfirm} disabled={saving}>
              {saving ? 'Resetting…' : 'Reset meter'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
