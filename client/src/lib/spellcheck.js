import nspell from 'nspell'

const IGNORE_WORDS = new Set([
  'bm',
  'bom',
  'btu',
  'cmms',
  'erp',
  'fifo',
  'gstin',
  'hvac',
  'inr',
  'kpi',
  'kwh',
  'lifo',
  'mms',
  'mmspro',
  'oem',
  'pm',
  'ppm',
  'rfq',
  'sap',
  'sku',
  'sla',
  'sop',
  'wo',
])

const WORD_RE = /[A-Za-z]+(?:'[A-Za-z]+)?/g
const MAX_MISSPELLINGS = 6
const MAX_SUGGESTIONS = 3

let loadPromise = null
let spellchecker = null

function decodeDictionaryBytes(bytes) {
  if (typeof bytes === 'string') return bytes
  if (bytes instanceof Uint8Array) return new TextDecoder('utf-8').decode(bytes)
  if (bytes && typeof bytes.buffer === 'object') {
    return new TextDecoder('utf-8').decode(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength))
  }
  return String(bytes)
}

export function preloadSpellchecker() {
  if (spellchecker) return Promise.resolve(spellchecker)
  if (!loadPromise) {
    loadPromise = Promise.all([
      import('virtual:en-aff'),
      import('virtual:en-dic'),
    ])
      .then(([affMod, dicMod]) => {
        const aff = decodeDictionaryBytes(affMod.default ?? affMod)
        const dic = decodeDictionaryBytes(dicMod.default ?? dicMod)
        spellchecker = nspell(aff, dic)
        return spellchecker
      })
      .catch((error) => {
        loadPromise = null
        throw error
      })
  }
  return loadPromise
}

export function getSpellchecker() {
  return spellchecker
}

function isAllCaps(word) {
  return word.length > 2 && word === word.toUpperCase()
}

function isIgnoredContext(text, start, end) {
  const before = start > 0 ? text[start - 1] : ''
  const after = end < text.length ? text[end] : ''
  if (before === '@' || after === '@') return true

  const prefix = text.slice(Math.max(0, start - 8), start).toLowerCase()
  if (prefix.includes('://') || prefix.endsWith('www.')) return true

  if (after === '.') {
    const tld = text.slice(end + 1, end + 5).toLowerCase()
    if (/^(com|org|net|edu|gov|in|io|co)\b/.test(tld)) return true
  }
  return false
}

function shouldCheckWord(word, text, start, end) {
  if (word.length < 3) return false
  if (isAllCaps(word)) return false
  if (IGNORE_WORDS.has(word.toLowerCase())) return false
  if (isIgnoredContext(text, start, end)) return false
  return true
}

function applyCasing(original, suggestion) {
  if (!suggestion) return suggestion
  if (original === original.toUpperCase()) return suggestion.toUpperCase()
  if (original[0] === original[0].toUpperCase()) {
    return suggestion.charAt(0).toUpperCase() + suggestion.slice(1)
  }
  return suggestion
}

export function replaceRange(text, start, end, replacement) {
  return `${String(text).slice(0, start)}${replacement}${String(text).slice(end)}`
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function replaceMisspelledWord(text, item, replacement) {
  const source = String(text ?? '')
  const word = item?.word
  if (!word) return source
  const start = Number(item.start) || 0
  const end = start + word.length
  if (source.slice(start, end) === word) {
    return replaceRange(source, start, end, replacement)
  }
  return source.replace(new RegExp(`\\b${escapeRegExp(word)}\\b`), replacement)
}

export function findMisspellings(text, spell = spellchecker) {
  if (!spell || !text) return []

  const source = String(text)
  const results = []
  const seen = new Set()
  WORD_RE.lastIndex = 0

  let match = WORD_RE.exec(source)
  while (match) {
    const word = match[0]
    const start = match.index
    const end = start + word.length
    const key = word.toLowerCase()

    if (shouldCheckWord(word, source, start, end) && !seen.has(key) && !spell.correct(word)) {
      seen.add(key)
      const suggestions = (spell.suggest(word) || [])
        .slice(0, MAX_SUGGESTIONS)
        .map((item) => applyCasing(word, item))
        .filter(Boolean)
      if (suggestions.length) {
        results.push({ word, start, end, suggestions })
        if (results.length >= MAX_MISSPELLINGS) break
      }
    }

    match = WORD_RE.exec(source)
  }

  return results
}
