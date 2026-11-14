import { fieldTypeLabel } from '../../lib/assetFieldTypes'

export default function FormLabel({ children, limit, extra, fieldType, htmlFor }) {
  const max = Number(limit)
  const showLimit = Number.isFinite(max) && max > 0
  const typeHint = fieldType ? fieldTypeLabel(fieldType) : null
  const showTypeHint = Boolean(typeHint && typeHint !== '—')
  const Tag = htmlFor ? 'label' : 'span'

  if (!showLimit && !extra && !showTypeHint) {
    return (
      <Tag className="company-form__label" htmlFor={htmlFor || undefined}>
        <span className="company-form__label-text">{children}</span>
      </Tag>
    )
  }

  return (
    <Tag className="company-form__label" htmlFor={htmlFor || undefined}>
      <span className="company-form__label-text">{children}</span>
      <span className="company-form__label-meta">
        {extra}
        {showTypeHint && (
          <span className="company-form__type-hint">({typeHint})</span>
        )}
        {showLimit && (
          <span className="company-form__char-limit">Max {max}</span>
        )}
      </span>
    </Tag>
  )
}
