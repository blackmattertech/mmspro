export default function FormLabel({ children, limit, extra, htmlFor }) {
  const max = Number(limit)
  const showLimit = Number.isFinite(max) && max > 0
  const Tag = htmlFor ? 'label' : 'span'

  return (
    <Tag className="company-form__label" htmlFor={htmlFor || undefined}>
      <span className="company-form__label-text">{children}</span>
      {(showLimit || extra) && (
        <span className="company-form__label-meta">
          {extra}
          {showLimit && (
            <span className="company-form__char-limit">Max {max}</span>
          )}
        </span>
      )}
    </Tag>
  )
}
