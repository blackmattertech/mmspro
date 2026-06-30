const ORG_SUFFIXES =
  /\b(technologies|technology|tech|inc|incorporated|llc|ltd|limited|corp|corporation|co|company|group|solutions|services|pvt|private)\b/gi

const STOP_WORDS = new Set(['the', 'a', 'an'])

export const RESERVED_SLUGS = new Set([
  'login', 'admin', 'onboard', 'invite', 'app', 'api', 'health',
])

/**
 * "BlackMatter Technologies" → "blackmatter"
 * Strips common business suffixes, joins remaining words, lowercases.
 */
export function generateOrgSlug(orgName) {
  const trimmed = orgName?.trim()
  if (!trimmed) return ''

  const withoutSuffixes = trimmed.replace(ORG_SUFFIXES, '').trim()
  const source = withoutSuffixes || trimmed

  const words = source
    .split(/\s+/)
    .filter((word) => word && !STOP_WORDS.has(word.toLowerCase()))

  const slug = words
    .join('')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

  return slug || 'org'
}
