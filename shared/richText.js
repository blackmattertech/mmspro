/** Isomorphic rich-text helpers (no DOM). Used by API + UI validation. */

export function looksLikeHtml(value) {
  return /<\/?[a-z][\s\S]*>/i.test(String(value || ''))
}

/** Strip tags for limits, search, and plain-text checks. */
export function plainTextFromRich(value) {
  const raw = String(value ?? '')
  if (!raw) return ''
  if (!looksLikeHtml(raw)) return raw.replace(/\s+/g, ' ').trim()
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|div|h[1-6])>/gi, '\n')
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

/** Raw HTML storage ceiling (visible text limits stay lower in validators). */
export const RICH_TEXT_STORAGE_MAX = 50000
