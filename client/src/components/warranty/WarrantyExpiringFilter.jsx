import DateRangeField from '../ui/DateRangeField'
import {
  DEFAULT_WARRANTY_EXPIRING_FILTER,
  WARRANTY_EXPIRING_DAY_PRESETS,
} from '../../lib/warrantyExpiringFilter'
import './WarrantyExpiringFilter.css'

export default function WarrantyExpiringFilter({
  value = DEFAULT_WARRANTY_EXPIRING_FILTER,
  onChange,
  onApply,
  onCancel,
  applyDisabled = false,
}) {
  const setField = (key, fieldValue) => {
    onChange?.({ ...value, [key]: fieldValue })
  }

  const applyPreset = (preset) => {
    onChange?.({
      ...value,
      mode: 'days',
      minDays: preset.minDays,
      maxDays: preset.maxDays,
    })
  }

  const isPresetActive = (preset) => (
    value.mode === 'days'
    && String(value.minDays) === preset.minDays
    && String(value.maxDays) === preset.maxDays
  )

  return (
    <div className="warranty-expiring-filter" role="region" aria-label="Expiring soon filter">
      <span className="warranty-expiring-filter__title">Expiring soon</span>

      <div className="warranty-expiring-filter__mode" role="tablist" aria-label="Filter mode">
        <button
          type="button"
          role="tab"
          aria-selected={value.mode === 'days'}
          className={`warranty-expiring-filter__mode-btn${value.mode === 'days' ? ' warranty-expiring-filter__mode-btn--active' : ''}`}
          onClick={() => setField('mode', 'days')}
        >
          Within days
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={value.mode === 'dates'}
          className={`warranty-expiring-filter__mode-btn${value.mode === 'dates' ? ' warranty-expiring-filter__mode-btn--active' : ''}`}
          onClick={() => setField('mode', 'dates')}
        >
          Date range
        </button>
      </div>

      {value.mode === 'days' ? (
        <>
          <div className="warranty-expiring-filter__presets">
            {WARRANTY_EXPIRING_DAY_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`warranty-expiring-filter__preset${isPresetActive(preset) ? ' warranty-expiring-filter__preset--active' : ''}`}
                onClick={() => applyPreset(preset)}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="warranty-expiring-filter__range">
            <label className="warranty-expiring-filter__field">
              <span className="warranty-expiring-filter__label">From</span>
              <input
                type="number"
                min="0"
                className="company-form__input"
                value={value.minDays}
                onChange={(e) => setField('minDays', e.target.value)}
                placeholder="0"
                title="0 = today"
                aria-label="From days"
              />
            </label>
            <span className="warranty-expiring-filter__sep" aria-hidden="true">to</span>
            <label className="warranty-expiring-filter__field">
              <span className="warranty-expiring-filter__label">To</span>
              <input
                type="number"
                min="0"
                className="company-form__input"
                value={value.maxDays}
                onChange={(e) => setField('maxDays', e.target.value)}
                placeholder="30"
                aria-label="To days"
              />
            </label>
          </div>
        </>
      ) : (
        <div className="warranty-expiring-filter__date-range">
          <DateRangeField
            from={value.dateFrom}
            to={value.dateTo}
            onChange={({ from, to }) => onChange?.({ ...value, dateFrom: from, dateTo: to })}
            placeholder="Select date range"
          />
        </div>
      )}

      <div className="warranty-expiring-filter__actions">
        <button
          type="button"
          className="company-btn company-btn--secondary company-btn--compact"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="company-btn company-btn--primary company-btn--compact"
          onClick={onApply}
          disabled={applyDisabled}
        >
          Apply
        </button>
      </div>
    </div>
  )
}
