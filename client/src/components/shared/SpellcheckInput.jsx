import { forwardRef, useState } from 'react'
import { useSpellcheckSuggestions } from '../../hooks/useSpellcheckSuggestions'
import { preloadSpellchecker, replaceMisspelledWord } from '../../lib/spellcheck'
import './SpellcheckInput.css'

function emitChange(onChange, nextValue, name) {
  if (!onChange) return
  onChange({
    target: { value: nextValue, name: name || '' },
    currentTarget: { value: nextValue, name: name || '' },
  })
}

const SpellcheckInput = forwardRef(function SpellcheckInput({
  multiline = false,
  variant,
  className = '',
  wrapperClassName = '',
  value,
  onChange,
  onFocus,
  disabled = false,
  readOnly = false,
  name,
  type,
  maxLength,
  showCount,
  ...props
}, ref) {
  const [armed, setArmed] = useState(false)
  const text = value ?? ''
  const canCheck = armed && !disabled && !readOnly
  const misspellings = useSpellcheckSuggestions(text, { enabled: canCheck })
  const limit = Number(maxLength)
  const hasLimit = Number.isFinite(limit) && limit > 0
  const used = String(text).length
  const countVisible = hasLimit && showCount !== false

  const handleFocus = (event) => {
    setArmed(true)
    preloadSpellchecker()
    onFocus?.(event)
  }

  const applySuggestion = (item, suggestion) => {
    emitChange(onChange, replaceMisspelledWord(text, item, suggestion), name)
  }

  const Control = multiline ? 'textarea' : 'input'
  const inputType = multiline ? undefined : (type || 'text')
  const showHints = canCheck && misspellings.length > 0
  const nearLimit = hasLimit && used >= Math.max(limit - 20, Math.ceil(limit * 0.9))
  const controlClass = [className, hasLimit ? 'spellcheck-field__input--limited' : '']
    .filter(Boolean)
    .join(' ')

  const controlWrapClass = [
    'spellcheck-field__control',
    multiline ? 'spellcheck-field__control--multiline' : '',
    hasLimit ? 'spellcheck-field__control--boxed' : '',
  ].filter(Boolean).join(' ')

  return (
    <div
      className={`spellcheck-field${variant === 'inline' ? ' spellcheck-field--inline' : ''}${wrapperClassName ? ` ${wrapperClassName}` : ''}`}
    >
      <div className={controlWrapClass}>
        <Control
          {...props}
          ref={ref}
          {...(multiline ? {} : { type: inputType })}
          className={controlClass}
          value={text}
          name={name}
          disabled={disabled}
          readOnly={readOnly}
          maxLength={hasLimit ? limit : undefined}
          placeholder={props.placeholder}
          spellCheck={false}
          onChange={onChange}
          onFocus={handleFocus}
        />
        {countVisible && (
          <span
            className={`spellcheck-field__count${nearLimit ? ' spellcheck-field__count--limit' : ''}`}
            aria-live="polite"
          >
            {used} / {limit}
          </span>
        )}
      </div>
      {showHints && (
        <div className="spellcheck-field__hints" role="status">
          <span className="spellcheck-field__label">Did you mean</span>
          {misspellings.map((item) => (
            <span key={`${item.start}-${item.word}`} className="spellcheck-field__group">
              <span className="spellcheck-field__word">{item.word}</span>
              <span className="spellcheck-field__arrow" aria-hidden="true">→</span>
              {item.suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="spellcheck-field__suggestion"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => applySuggestion(item, suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </span>
          ))}
        </div>
      )}
    </div>
  )
})

export default SpellcheckInput
