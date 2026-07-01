export default function CreatableSelect({
  label,
  value,
  onChange,
  options,
  getOptionValue,
  getOptionLabel,
  placeholder = 'Select...',
  onCreate,
  createLabel = '+ Create',
  disabled = false,
  required = false,
}) {
  return (
    <label className="company-form__field">
      <span className="company-form__label">
        {label}
        {required && ' *'}
      </span>
      <div className="company-creatable-select">
        <select
          className="company-form__input company-form__input--select"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          required={required}
        >
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option key={getOptionValue(option)} value={getOptionValue(option)}>
              {getOptionLabel(option)}
            </option>
          ))}
        </select>
        {onCreate && (
          <button
            type="button"
            className="company-btn company-btn--secondary company-btn--compact"
            onClick={onCreate}
            disabled={disabled}
          >
            {createLabel}
          </button>
        )}
      </div>
    </label>
  )
}
