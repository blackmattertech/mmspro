import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  countryFlag,
  filterCountries,
  formatPhoneE164,
  getCountryByIso,
  parsePhoneE164,
} from '../../lib/countryCodes'
import './PhoneInput.css'

function CountryDialPicker({ iso, disabled, onSelect }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [panelStyle, setPanelStyle] = useState(null)
  const triggerRef = useRef(null)
  const panelRef = useRef(null)
  const searchRef = useRef(null)
  const selected = getCountryByIso(iso)

  const filteredCountries = useMemo(() => filterCountries(search), [search])

  const updatePanelPosition = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return

    const rect = trigger.getBoundingClientRect()
    const panelWidth = 320
    const panelMaxHeight = 320
    const margin = 8
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    let left = rect.left
    if (left + panelWidth > viewportWidth - margin) {
      left = Math.max(margin, viewportWidth - panelWidth - margin)
    }

    const spaceBelow = viewportHeight - rect.bottom - margin
    const spaceAbove = rect.top - margin
    const openUp = spaceBelow < 220 && spaceAbove > spaceBelow
    const maxHeight = Math.min(panelMaxHeight, openUp ? spaceAbove : spaceBelow)

    setPanelStyle({
      position: 'fixed',
      left,
      top: openUp ? rect.top - margin : rect.bottom + margin,
      width: panelWidth,
      maxHeight: Math.max(180, maxHeight),
      transform: openUp ? 'translateY(-100%)' : undefined,
      zIndex: 1200,
    })
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    setSearch('')
  }, [])

  const openPicker = () => {
    if (disabled) return
    setOpen(true)
  }

  const handleSelect = (nextIso) => {
    onSelect(nextIso)
    close()
  }

  useLayoutEffect(() => {
    if (!open) return undefined
    updatePanelPosition()
    const frame = window.requestAnimationFrame(() => searchRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [open, updatePanelPosition])

  useEffect(() => {
    if (!open) return undefined

    const handlePointerDown = (event) => {
      const target = event.target
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return
      close()
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') close()
    }

    const handleReposition = () => updatePanelPosition()

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', handleReposition)
    window.addEventListener('scroll', handleReposition, true)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', handleReposition)
      window.removeEventListener('scroll', handleReposition, true)
    }
  }, [open, close, updatePanelPosition])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="phone-input__country-trigger"
        onClick={openPicker}
        disabled={disabled}
        aria-label={`Country code ${selected.name} ${selected.dial}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="phone-input__flag" aria-hidden="true">{countryFlag(selected.iso)}</span>
        <span className="phone-input__dial">{selected.dial}</span>
        <span className="phone-input__chevron" aria-hidden="true">▾</span>
      </button>

      {open && panelStyle && createPortal(
        <div
          ref={panelRef}
          className="phone-input__picker"
          style={panelStyle}
          role="dialog"
          aria-label="Select country code"
        >
          <div className="phone-input__picker-search-wrap">
            <input
              ref={searchRef}
              type="search"
              className="phone-input__picker-search"
              placeholder="Search country or code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search countries"
            />
          </div>
          <ul className="phone-input__picker-list" role="listbox">
            {filteredCountries.length ? filteredCountries.map((country) => {
              const isSelected = country.iso === iso
              return (
                <li key={country.iso} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`phone-input__picker-option${isSelected ? ' phone-input__picker-option--selected' : ''}`}
                    onClick={() => handleSelect(country.iso)}
                  >
                    <span className="phone-input__picker-flag" aria-hidden="true">{countryFlag(country.iso)}</span>
                    <span className="phone-input__picker-dial">{country.dial}</span>
                    <span className="phone-input__picker-name">{country.name}</span>
                    {isSelected && <span className="phone-input__picker-check" aria-hidden="true">✓</span>}
                  </button>
                </li>
              )
            }) : (
              <li className="phone-input__picker-empty" role="presentation">No countries found</li>
            )}
          </ul>
        </div>,
        document.body,
      )}
    </>
  )
}

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

  const handleCountryChange = (nextIso) => {
    onChange?.(formatPhoneE164(nextIso, national))
  }

  const handleNumberChange = (e) => {
    const digits = e.target.value.replace(/\D/g, '')
    onChange?.(formatPhoneE164(iso, digits))
  }

  return (
    <div className={`phone-input${disabled ? ' phone-input--disabled' : ''}`}>
      <CountryDialPicker
        iso={iso}
        disabled={disabled}
        onSelect={handleCountryChange}
      />
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
