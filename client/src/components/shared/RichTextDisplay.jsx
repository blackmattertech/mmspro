import { looksLikeHtml, sanitizeRichText } from '../../lib/richText'
import './RichTextEditor.css'

export default function RichTextDisplay({ value, className = '', empty = '—' }) {
  const raw = String(value ?? '')
  if (!raw.trim()) {
    return <span className={className}>{empty}</span>
  }

  if (!looksLikeHtml(raw)) {
    return (
      <span className={`rich-text-display rich-text-display--plain${className ? ` ${className}` : ''}`}>
        {raw}
      </span>
    )
  }

  return (
    <div
      className={`rich-text-display${className ? ` ${className}` : ''}`}
      dangerouslySetInnerHTML={{ __html: sanitizeRichText(raw) }}
    />
  )
}
