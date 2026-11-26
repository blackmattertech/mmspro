import { useEffect, useMemo, useState } from 'react'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import FilterableSelect from '../ui/FilterableSelect'
import DateField from '../ui/DateField'
import { createManualRunningHours } from '../../lib/api-reliability'

export default function ManualHoursModal({
  equipmentOptions = [],
  defaultEquipmentId = '',
  defaultFrom = '',
  defaultTo = '',
  saving: externalSaving = false,
  onClose,
  onSaved,
}) {
  const [equipmentId, setEquipmentId] = useState(defaultEquipmentId || '')
  const [periodStart, setPeriodStart] = useState(defaultFrom || '')
  const [periodEnd, setPeriodEnd] = useState(defaultTo || '')
  const [hours, setHours] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const handleBackdropClick = useBackdropClose(onClose)

  const options = useMemo(
    () => equipmentOptions.map((row) => ({
      value: row.id,
      label: row.code ? `${row.name} (${row.code})` : row.name,
    })),
    [equipmentOptions],
  )

  useEffect(() => {
    setEquipmentId(defaultEquipmentId || '')
  }, [defaultEquipmentId])

  const busy = saving || externalSaving

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    if (!equipmentId) {
      setError('Select equipment.')
      return
    }
    if (!periodStart || !periodEnd) {
      setError('Period start and end are required.')
      return
    }
    if (periodEnd < periodStart) {
      setError('Period end must be on or after period start.')
      return
    }
    const hoursNum = Number(hours)
    if (!Number.isFinite(hoursNum) || hoursNum < 0) {
      setError('Hours must be a non-negative number.')
      return
    }
    setSaving(true)
    try {
      const row = await createManualRunningHours({
        equipment_id: equipmentId,
        period_start: periodStart,
        period_end: periodEnd,
        hours: hoursNum,
        notes: notes.trim() || null,
      })
      onSaved?.(row)
      onClose?.()
    } catch (err) {
      setError(err.message || 'Failed to save manual hours.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="company-modal-overlay company-modal-overlay--popup" onClick={handleBackdropClick} role="presentation">
      <div
        className="company-modal company-modal--popup reliability-manual-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reliability-manual-hours-title"
      >
        <div className="company-modal__header">
          <h2 id="reliability-manual-hours-title">
            Add manual running hours
          </h2>
          <button type="button" className="company-modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <form className="company-modal__form" onSubmit={handleSubmit}>
          <p className="company-modal__hint">
            For non-metered assets only. Metered assets use Logbook readings.
          </p>
          {error ? <div className="company-error">{error}</div> : null}

          <div className="company-form__field">
            <label className="company-form__label" htmlFor="reliability-manual-equipment">
              Equipment
            </label>
            <FilterableSelect
              id="reliability-manual-equipment"
              value={equipmentId}
              onChange={setEquipmentId}
              options={options}
              getOptionValue={(opt) => opt.value}
              getOptionLabel={(opt) => opt.label}
              allowEmpty
              emptyLabel="Select equipment"
            />
          </div>

          <div className="company-form__row">
            <div className="company-form__field">
              <label className="company-form__label" htmlFor="reliability-manual-from">
                Period start
              </label>
              <DateField
                id="reliability-manual-from"
                value={periodStart}
                onChange={setPeriodStart}
              />
            </div>
            <div className="company-form__field">
              <label className="company-form__label" htmlFor="reliability-manual-to">
                Period end
              </label>
              <DateField
                id="reliability-manual-to"
                value={periodEnd}
                onChange={setPeriodEnd}
              />
            </div>
          </div>

          <div className="company-form__field">
            <label className="company-form__label" htmlFor="reliability-manual-hours">
              Running hours
            </label>
            <input
              id="reliability-manual-hours"
              className="company-form__input"
              type="number"
              min="0"
              step="0.01"
              value={hours}
              onChange={(event) => setHours(event.target.value)}
              required
            />
          </div>

          <div className="company-form__field">
            <label className="company-form__label" htmlFor="reliability-manual-notes">
              Notes
            </label>
            <input
              id="reliability-manual-notes"
              className="company-form__input"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={500}
            />
          </div>

          <div className="company-modal__actions">
            <button type="button" className="company-btn company-btn--secondary" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="company-btn company-btn--primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
