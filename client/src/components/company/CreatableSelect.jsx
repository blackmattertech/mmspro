import FilterableSelect from '../ui/FilterableSelect'

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
        <FilterableSelect
          value={value}
          onChange={onChange}
          options={options}
          getOptionValue={getOptionValue}
          getOptionLabel={getOptionLabel}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          className="company-form__input--select"
        />
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
