export function uomOptionLabel(uom) {
  const code = String(uom?.code || '').trim()
  const name = String(uom?.name || '').trim()
  if (!code) return name
  if (!name || name.toUpperCase() === code.toUpperCase()) return code
  return `${code} — ${name}`
}

/** Options for any UOM picker. A saved value missing from the master stays selectable. */
export function buildUomSelectOptions(uoms, currentValue = '') {
  const options = []
  const seen = new Set()
  for (const uom of uoms || []) {
    if (uom?.is_active === false) continue
    const code = String(uom?.code || '').trim()
    const key = code.toUpperCase()
    if (!code || seen.has(key)) continue
    seen.add(key)
    options.push({ value: code, label: uomOptionLabel(uom) })
  }
  options.sort((a, b) => a.label.localeCompare(b.label))

  const current = String(currentValue || '').trim()
  if (current && !seen.has(current.toUpperCase())) {
    options.unshift({
      value: current,
      label: `${current} (not in UOM master)`,
    })
  }
  return options
}

/** Match a saved unit to the master code even when the letter case differs. */
export function resolveUomValue(options, value) {
  const raw = String(value || '')
  const key = raw.trim().toUpperCase()
  if (!key) return ''
  const match = (options || []).find((option) => String(option?.value || '').trim().toUpperCase() === key)
  return match ? match.value : raw
}
