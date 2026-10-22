import { useState } from 'react'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import { addMeterReading } from '../../lib/api-logbook'
import { formatMeterValue } from '../../lib/meterReading'
import '../company/CompanyShared.css'

export default function MeterReadingModal({
  equipment,
  lastReading = null,
  nested = false,
  onClose,
  onSaved,
}) {
  const handleBackdropClick = useBackdropClose(onClose)
  const [reading, setReading] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const numeric = reading === '' ? null : Number(reading)
  const belowLast = lastReading != null
    && numeric != null
    && Number.isFinite(numeric)
    && numeric < Number(lastReading)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError(null)
    if (numeric == null || !Number.isFinite(numeric) || numeric < 0) {
      setError('Enter a meter reading of zero or greater.')
      return
    }
    setSaving(true)
    try {
      const saved = await addMeterReading(equipment.id, numeric)
      onSaved?.(saved)
    } catch (err) {
      setError(err.message || 'Could not save the meter reading')
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
        aria-labelledby="meter-reading-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="company-modal__header">
          <h2 id="meter-reading-title">Add reading</h2>
          <button type="button" className="company-modal__close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form className="company-modal__form" onSubmit={handleSubmit}>
          <p className="company-modal__hint">
            {equipment?.name || 'Equipment'}
            {equipment?.code ? ` · ${equipment.code}` : ''}
          </p>
          {lastReading != null && (
            <p className="company-form__hint">
              Last reading: {formatMeterValue(lastReading)}
            </p>
          )}
          <label className="company-form__field">
            <span className="company-form__label">Meter reading *</span>
            <input
              className="company-form__input"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={reading}
              onChange={(event) => setReading(event.target.value)}
              autoFocus
              required
            />
          </label>
          <p className="company-form__hint">
            Date, time, and your name are saved automatically.
          </p>
          {belowLast && (
            <p className="company-form__hint">
              This is lower than the last reading ({formatMeterValue(lastReading)}).
            </p>
          )}
          {error && <div className="company-alert" role="alert">{error}</div>}
          <div className="company-modal__actions">
            <button type="button" className="company-btn company-btn--ghost" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="company-btn company-btn--primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save reading'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
