import DOMPurify from 'dompurify'

const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'u',
  'ul', 'ol', 'li', 'a', 'span', 'mark',
]

const ALLOWED_ATTR = ['href', 'target', 'rel', 'style', 'class']

/** True when the string looks like stored rich-text HTML. */
export function looksLikeHtml(value) {
  return /<\/?[a-z][\s\S]*>/i.test(String(value || ''))
}

/** Strip tags for limits, CSV, PDF, and search. */
export function plainTextFromRich(value) {
  const raw = String(value ?? '')
  if (!raw) return ''
  if (!looksLikeHtml(raw)) return raw.replace(/\s+/g, ' ').trim()

  if (typeof document !== 'undefined') {
    const el = document.createElement('div')
    el.innerHTML = sanitizeRichText(raw)
    return String(el.textContent || '').replace(/\s+/g, ' ').trim()
  }

  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

export function richTextLength(value) {
  return plainTextFromRich(value).length
}

export function isRichTextEmpty(value) {
  return richTextLength(value) === 0
}

/** Sanitize editor HTML for safe storage/display. Plain text passes through. */
export function sanitizeRichText(value) {
  const raw = String(value ?? '')
  if (!raw) return ''
  if (!looksLikeHtml(raw)) return raw
  if (typeof window === 'undefined') {
    return raw
  }
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  })
}

/** Normalize empty TipTap docs to '' so DB stays clean. */
export function normalizeRichTextValue(value) {
  const sanitized = sanitizeRichText(value)
  if (isRichTextEmpty(sanitized)) return ''
  if (!looksLikeHtml(sanitized)) return sanitized
  return sanitized
}
