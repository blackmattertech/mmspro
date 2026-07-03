import { useState, useRef, useCallback, useEffect } from 'react'
import { searchIndianAddresses } from '../../lib/addressGeocoder'
import './AddressAutocomplete.css'

export default function AddressAutocomplete({
  value = '',
  onChange,
  onSelect,
  placeholder = 'Street, area, landmark...',
  disabled = false,
  className = '',
}) {
  const [query, setQuery] = useState(value)
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef(null)
  const rootRef = useRef(null)

  useEffect(() => {
    setQuery(value || '')
  }, [value])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const search = useCallback((text) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      if (text.trim().length < 3) {
        setResults([])
        setOpen(false)
        setSearching(false)
        return
      }
      setSearching(true)
      try {
        const suggestions = await searchIndianAddresses(text)
        setResults(suggestions)
        setOpen(suggestions.length > 0)
      } catch {
        setResults([])
        setOpen(false)
      } finally {
        setSearching(false)
      }
    }, 350)
  }, [])

  const handleChange = (e) => {
    const val = e.target.value
    setQuery(val)
    onChange?.(val)
    search(val)
  }

  const handleSelect = (suggestion) => {
    setQuery(suggestion.address_line1)
    setResults([])
    setOpen(false)
    onChange?.(suggestion.address_line1)
    onSelect?.(suggestion)
  }

  return (
    <div className={`address-autocomplete ${className}`} ref={rootRef}>
      <input
        type="text"
        value={query}
        onChange={handleChange}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder={placeholder}
        disabled={disabled}
        className="company-form__input"
        autoComplete="off"
      />
      {searching && <p className="address-autocomplete__hint">Searching addresses...</p>}
      {open && results.length > 0 && (
        <ul className="address-autocomplete__list" role="listbox">
          {results.map((suggestion) => (
            <li key={suggestion.id}>
              <button
                type="button"
                className="address-autocomplete__option"
                onClick={() => handleSelect(suggestion)}
              >
                <span className="address-autocomplete__option-main">{suggestion.shortLabel}</span>
                {suggestion.label !== suggestion.shortLabel && (
                  <span className="address-autocomplete__option-sub">{suggestion.label}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
