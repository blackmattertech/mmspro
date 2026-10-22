import util from 'node:util'

const MAX_ENTRIES = 500
const originals = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
}

const entries = []

function push(level, args) {
  let message = ''
  try {
    message = util.format(...args)
  } catch {
    message = args.map((value) => String(value)).join(' ')
  }
  entries.push({
    at: new Date().toISOString(),
    level,
    message: message.slice(0, 4000),
  })
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES)
}

console.log = (...args) => {
  push('info', args)
  originals.log(...args)
}
console.info = (...args) => {
  push('info', args)
  originals.info(...args)
}
console.warn = (...args) => {
  push('warn', args)
  originals.warn(...args)
}
console.error = (...args) => {
  push('error', args)
  originals.error(...args)
}

export function listServerLogs({ level = 'all', search = '', limit = 200 } = {}) {
  const needle = String(search || '').trim().toLowerCase()
  const wanted = String(level || 'all').toLowerCase()
  const rows = entries.filter((entry) => {
    if (wanted !== 'all' && entry.level !== wanted) return false
    if (needle && !entry.message.toLowerCase().includes(needle)) return false
    return true
  })
  const cap = Math.max(1, Math.min(500, Number(limit) || 200))
  return rows.slice(-cap).reverse()
}
