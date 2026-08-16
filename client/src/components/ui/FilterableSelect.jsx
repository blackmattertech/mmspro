import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import '../company/CompanyShared.css'

function normalizeOptions(options, getOptionValue, getOptionLabel) {
  return (options || []).map((opt) => {
    if (opt === null || opt === undefined) {
      return { value: '', label: '' }
    }
    if (typeof opt === 'string' || typeof opt === 'number') {
      const text = String(opt)
      return { value: text, label: text }
    }
    const value = getOptionValue ? getOptionValue(opt) : opt.value
    const label = getOptionLabel
      ? getOptionLabel(opt)
      : (opt.label ?? opt.name ?? value)
    return {
      value: value === null || value === undefined ? '' : String(value),
      label: label === null || label === undefined ? '' : String(label),
    }
  })
}

export default function FilterableSelect({
  label,
  value,
  onChange,
  options = [],
  getOptionValue,
  getOptionLabel,
  placeholder = 'Select…',
  disabled = false,
  required = false,
  id: idProp,
  name,
  className = '',
  inputClassName = 'company-form__input',
  'aria-label': ariaLabel,
  allowEmpty = true,
  emptyLabel,
  onCreate,
  createLabel = 'Create',
  onQueryChange,
}) {
  const autoId = useId()
  const id = idProp || autoId
  const listId = `${id}-listbox`
  const rootRef = useRef(null)
  const inputRef = useRef(null)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)

  useEffect(() => {
    onQueryChange?.(query)
  }, [query, onQueryChange])

  const normalized = useMemo(
    () => normalizeOptions(options, getOptionValue, getOptionLabel),
    [options, getOptionValue, getOptionLabel],
  )

  const selectedValue = value === null || value === undefined ? '' : String(value)
  const selected = normalized.find((o) => o.value === selectedValue)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return normalized
    return normalized.filter((o) => o.label.toLowerCase().includes(q))
  }, [normalized, query])

  const showCreate = Boolean(onCreate) && filtered.length === 0

  const listItems = useMemo(() => {
    const items = []
    if (allowEmpty && !required && !showCreate) {
      items.push({
        value: '',
        label: emptyLabel ?? placeholder,
        isPlaceholder: true,
      })
    }
    for (const opt of filtered) {
      items.push({ ...opt, isPlaceholder: false })
    }
    return items
  }, [allowEmpty, required, emptyLabel, placeholder, filtered, showCreate])

  const handleCreate = () => {
    onCreate?.(query.trim())
    close()
  }

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setHighlightedIndex(0)
  }, [])

  useEffect(() => {
    if (!open) return undefined
    const handlePointer = (e) => {
      if (!rootRef.current?.contains(e.target)) {
        close()
      }
    }
    document.addEventListener('mousedown', handlePointer)
    return () => document.removeEventListener('mousedown', handlePointer)
  }, [open, close])

  useEffect(() => {
    if (!open) return
    if (query.trim()) {
      setHighlightedIndex(0)
      return
    }
    const idx = listItems.findIndex((item) => item.value === selectedValue)
    setHighlightedIndex(idx >= 0 ? idx : 0)
  }, [query, open, listItems, selectedValue])

  const pick = (nextValue) => {
    onChange(nextValue)
    close()
  }

  const openMenu = () => {
    if (disabled) return
    setOpen(true)
    setQuery('')
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const onInputFocus = () => {
    if (disabled) return
    setOpen(true)
    setQuery('')
  }

  const onInputChange = (e) => {
    setQuery(e.target.value)
    if (!open) setOpen(true)
  }

  const onKeyDown = (e) => {
    if (disabled) return

    if (e.key === 'Escape') {
      e.preventDefault()
      close()
      inputRef.current?.blur()
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) setOpen(true)
      setHighlightedIndex((i) => Math.min(i + 1, listItems.length - 1))
      return
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) setOpen(true)
      setHighlightedIndex((i) => Math.max(i - 1, 0))
      return
    }

    if (e.key === 'Enter' && open) {
      e.preventDefault()
      if (showCreate) {
        handleCreate()
        return
      }
      const item = listItems[highlightedIndex]
      if (item) pick(item.value)
    }
  }

  const inputDisplay = open ? query : (selected?.label || '')
  const showPlaceholder = !open && !selected?.label

  const control = (
    <div
      className={`filterable-select ${className}`.trim()}
      ref={rootRef}
    >
      {required ? (
        <input
          tabIndex={-1}
          aria-hidden="true"
          className="filterable-select__validator"
          value={selectedValue}
          required
          onChange={() => {}}
        />
      ) : null}
      <div className="filterable-select__control">
        <input
          ref={inputRef}
          id={id}
          type="text"
          className={`${inputClassName} filterable-select__input${showPlaceholder ? ' filterable-select__input--placeholder' : ''}`}
          value={inputDisplay}
          placeholder={showPlaceholder ? placeholder : undefined}
          onChange={onInputChange}
          onFocus={onInputFocus}
          onKeyDown={onKeyDown}
          disabled={disabled}
          aria-label={ariaLabel || (typeof label === 'string' ? label : undefined)}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          role="combobox"
          autoComplete="off"
        />
        <button
          type="button"
          className="filterable-select__toggle"
          tabIndex={-1}
          aria-label="Toggle options"
          disabled={disabled}
          onClick={() => (open ? close() : openMenu())}
        >
          <span aria-hidden>▾</span>
        </button>
      </div>

      {open && (
        <ul
          id={listId}
          className="filterable-select__menu"
          role="listbox"
        >
          {showCreate ? (
            <li className="filterable-select__empty" role="presentation">
              <span className="filterable-select__empty-text">
                {query.trim() ? 'No vendors found' : 'No vendors yet'}
              </span>
              <button
                type="button"
                className="filterable-select__create company-btn company-btn--secondary company-btn--compact"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleCreate}
              >
                {createLabel}
              </button>
            </li>
          ) : listItems.length === 0 ? (
            <li className="filterable-select__empty" role="presentation">
              No matches
            </li>
          ) : (
            listItems.map((item, index) => (
              <li key={item.value || `empty-${index}`} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={item.value === selectedValue}
                  className={[
                    'filterable-select__option',
                    item.value === selectedValue ? 'filterable-select__option--selected' : '',
                    index === highlightedIndex ? 'filterable-select__option--highlighted' : '',
                    item.isPlaceholder ? 'filterable-select__option--placeholder' : '',
                  ].filter(Boolean).join(' ')}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(item.value)}
                >
                  {item.label}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )

  if (label) {
    return (
      <label className="company-form__field">
        <span className="company-form__label">
          {label}
          {required && ' *'}
        </span>
        {control}
      </label>
    )
  }

  return control
}
