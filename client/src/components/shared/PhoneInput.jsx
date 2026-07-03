import { useMemo } from 'react'
import {
  COUNTRY_DIAL_CODES,
  countryFlag,
  formatPhoneE164,
  getCountryByIso,
  parsePhoneE164,
} from '../../lib/countryCodes'
import './PhoneInput.css'

export default function PhoneInput({
  value = '',
  onChange,
  disabled = false,
  defaultIso = 'IN',
  placeholder = 'Mobile number',
  id,
}) {
  const { iso, national } = useMemo(
    () => parsePhoneE164(value, defaultIso),
    [value, defaultIso],
  )
  const selected = getCountryByIso(iso)

  const handleCountryChange = (e) => {
    const nextIso = e.target.value
    onChange?.(formatPhoneE164(nextIso, national))
  }

  const handleNumberChange = (e) => {
    const digits = e.target.value.replace(/\D/g, '')
    onChange?.(formatPhoneE164(iso, digits))
  }

  return (
    <div className={`phone-input${disabled ? ' phone-input--disabled' : ''}`}>
      <div className="phone-input__country">
        <span className="phone-input__flag" aria-hidden="true">{countryFlag(selected.iso)}</span>
        <select
          className="phone-input__dial-select"
          value={iso}
          onChange={handleCountryChange}
          disabled={disabled}
          aria-label="Country code"
        >
          {COUNTRY_DIAL_CODES.map((country) => (
            <option key={country.iso} value={country.iso}>
              {countryFlag(country.iso)} {country.dial} {country.name}
            </option>
          ))}
        </select>
        <span className="phone-input__dial">{selected.dial}</span>
      </div>
      <input
        id={id}
        type="tel"
        inputMode="numeric"
        className="phone-input__number company-form__input"
        value={national}
        onChange={handleNumberChange}
        placeholder={placeholder}
        disabled={disabled}
      />
    </div>
  )
}

export function formatPhoneDisplay(phone) {
  if (!phone) return '—'
  const { iso, national } = parsePhoneE164(phone)
  const country = getCountryByIso(iso)
  return `${countryFlag(iso)} ${country.dial} ${national}`
}
