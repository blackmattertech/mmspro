import { forwardRef, lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useSpellcheckSuggestions } from '../../hooks/useSpellcheckSuggestions'
import { preloadSpellchecker, replaceMisspelledWord } from '../../lib/spellcheck'
import { characterLimitError } from '../../lib/textFieldLimits'
import './SpellcheckInput.css'

const RichTextEditor = lazy(() => import('./RichTextEditor'))

export { characterLimitError } from '../../lib/textFieldLimits'

function emitChange(onChange, nextValue, name) {
  if (!onChange) return
  onChange({
    target: { value: nextValue, name: name || '' },
    currentTarget: { value: nextValue, name: name || '' },
  })
}

function assignRef(ref, node) {
  if (!ref) return
  if (typeof ref === 'function') ref(node)
  else ref.current = node
}

const PlainSpellcheckInput = forwardRef(function PlainSpellcheckInput({
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
  hardMax = false,
  autoGrow,
  rows,
  placeholder,
  ...props
}, ref) {
  const [armed, setArmed] = useState(false)
  const localRef = useRef(null)
  const text = value ?? ''
  const canCheck = armed && !disabled && !readOnly
  const misspellings = useSpellcheckSuggestions(text, { enabled: canCheck })
  const limit = Number(maxLength)
  const hasLimit = Number.isFinite(limit) && limit > 0
  const used = String(text).length
  const countVisible = hasLimit && showCount !== false
  const exceeded = Boolean(characterLimitError(text, limit))
  const shouldGrow = autoGrow != null
    ? Boolean(autoGrow)
    : Boolean(multiline || (hasLimit && limit > 120) || used > 80)
  const Control = shouldGrow ? 'textarea' : 'input'
  const inputType = shouldGrow ? undefined : (type || 'text')
  const minRows = Number(rows) > 0 ? Number(rows) : (multiline || (hasLimit && limit > 120) ? 3 : 1)

  const handleFocus = (event) => {
    setArmed(true)
    preloadSpellchecker()
    onFocus?.(event)
  }

  const applySuggestion = (item, suggestion) => {
    emitChange(onChange, replaceMisspelledWord(text, item, suggestion), name)
  }

  const setNode = (node) => {
    localRef.current = node
    assignRef(ref, node)
  }

  useLayoutEffect(() => {
    if (!shouldGrow) return
    const el = localRef.current
    if (!el || typeof el.scrollHeight !== 'number') return
    el.style.height = 'auto'
    el.style.height = `${Math.max(el.scrollHeight, 0)}px`
  }, [text, shouldGrow, minRows])

  useEffect(() => {
    const el = localRef.current
    if (!el || typeof el.setCustomValidity !== 'function') return
    el.setCustomValidity(exceeded ? 'Character exceeds' : '')
  }, [exceeded, text])

  useEffect(() => {
    if (!shouldGrow || typeof ResizeObserver === 'undefined') return undefined
    const el = localRef.current
    if (!el) return undefined
    const observer = new ResizeObserver(() => {
      el.style.height = 'auto'
      el.style.height = `${Math.max(el.scrollHeight, 0)}px`
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [shouldGrow])

  const showHints = canCheck && misspellings.length > 0
  const nearLimit = hasLimit && !exceeded && used >= Math.max(limit - 20, Math.ceil(limit * 0.9))
  const controlClass = [
    className,
    hasLimit ? 'spellcheck-field__input--limited' : '',
    shouldGrow ? 'spellcheck-field__input--grow' : '',
    exceeded ? 'is-invalid' : '',
  ].filter(Boolean).join(' ')

  const controlWrapClass = [
    'spellcheck-field__control',
    shouldGrow ? 'spellcheck-field__control--multiline' : '',
    hasLimit ? 'spellcheck-field__control--boxed' : '',
    exceeded ? 'spellcheck-field__control--exceeded' : '',
  ].filter(Boolean).join(' ')

  return (
    <div
      className={`spellcheck-field${variant === 'inline' ? ' spellcheck-field--inline' : ''}${wrapperClassName ? ` ${wrapperClassName}` : ''}`}
    >
      <div className={controlWrapClass}>
        <Control
          {...props}
          ref={setNode}
          {...(shouldGrow ? { rows: minRows } : { type: inputType })}
          className={controlClass}
          value={text}
          name={name}
          disabled={disabled}
          readOnly={readOnly}
          maxLength={hasLimit && hardMax ? limit : undefined}
          placeholder={placeholder}
          spellCheck={false}
          aria-invalid={exceeded || undefined}
          onChange={onChange}
          onFocus={handleFocus}
        />
        {countVisible && (
          <span
            className={`spellcheck-field__count${nearLimit ? ' spellcheck-field__count--limit' : ''}${exceeded ? ' spellcheck-field__count--exceeded' : ''}`}
            aria-live="polite"
          >
            {used} / {limit}
          </span>
        )}
      </div>
      {exceeded ? (
        <p className="spellcheck-field__error" role="alert">Character exceeds</p>
      ) : null}
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

function shouldUseRichText(props) {
  // Rich text is opt-in (modules forms). Masters and other plain fields stay as input/textarea.
  return props.richText === true
}

const SpellcheckInput = forwardRef(function SpellcheckInput(props, ref) {
  if (shouldUseRichText(props)) {
    const {
      className = '',
      wrapperClassName = '',
      value,
      onChange,
      disabled = false,
      readOnly = false,
      name,
      maxLength,
      showCount,
      placeholder,
      id,
      multiline = false,
    } = props
    const compact = !multiline && !/\bcompany-form__textarea\b/.test(className)
    const { richText: _richText, ...plainFallback } = props
    return (
      <Suspense fallback={<PlainSpellcheckInput ref={ref} {...plainFallback} richText={false} />}>
        <RichTextEditor
          id={id}
          className={[className, wrapperClassName].filter(Boolean).join(' ')}
          value={value}
          onChange={onChange}
          disabled={disabled}
          readOnly={readOnly}
          name={name}
          maxLength={maxLength}
          showCount={showCount}
          placeholder={placeholder}
          compact={compact}
        />
      </Suspense>
    )
  }

  const { richText: _richText, ...plainProps } = props
  return <PlainSpellcheckInput ref={ref} {...plainProps} />
})

export default SpellcheckInput
