/**
 * Compact linked-asset summary for warranty lines:
 * equipment Name + the field mapped to the QR code (often Code / Equipment ID).
 *
 * Kept dependency-light so unit tests run under node --test without the Vite resolver.
 */

function catalogFieldCaption(equipment, fieldId) {
  const row = (equipment?.field_values || []).find((item) => item.field_id === fieldId)
  if (!row) return { label: 'Field', value: '' }
  const value = Array.isArray(row.value_json?.values)
    ? row.value_json.values.join(', ')
    : String(row.value_text || '')
  return { label: row.field_name || 'Field', value: value.trim() }
}

function resolveQrCaption(equipment, layout) {
  const fieldId = String(layout?.qrFieldId || 'system:code')
  if (fieldId === 'system:name') {
    return { label: 'Name', value: String(equipment?.name || '').trim() }
  }
  if (fieldId === 'system:code' || !fieldId.startsWith('catalog:')) {
    return { label: 'Code', value: String(equipment?.code || '').trim() }
  }
  if (fieldId.startsWith('catalog:')) {
    return catalogFieldCaption(equipment, fieldId.slice('catalog:'.length))
  }
  return { label: 'Code', value: String(equipment?.code || '').trim() }
}

export function warrantyLinkedAssetSteps(equipment, layout = null) {
  if (!equipment) return []
  const steps = []
  const name = String(equipment.name || '').trim()
  if (name) {
    steps.push({ field_id: 'name', field_name: 'Name', value: name })
  }

  const caption = resolveQrCaption(equipment, layout)
  const qrValue = String(caption?.value || '').trim()
  const qrLabel = String(caption?.label || 'Code').trim() || 'Code'
  if (qrValue && !(qrLabel.toLowerCase() === 'name' && qrValue === name)) {
    steps.push({
      field_id: 'qr',
      field_name: qrLabel,
      value: qrValue,
    })
  } else if (!qrValue) {
    const code = String(equipment.code || '').trim()
    if (code && code !== name) {
      steps.push({ field_id: 'code', field_name: 'Code', value: code })
    }
  }

  return steps
}

/** Prefer compact Name/QR rows; repair legacy UUID-labeled client rows. */
export function displayWarrantyLinkedSteps(hierarchy = []) {
  const rows = (hierarchy || [])
    .map((step) => ({
      field_id: String(step?.field_id || ''),
      field_name: String(step?.field_name || '').trim(),
      value: String(step?.value ?? '').trim(),
    }))
    .filter((step) => step.value)

  const nameRow = rows.find((step) => (
    step.field_id === 'name' || step.field_name.toLowerCase() === 'name'
  ))
  const qrRow = rows.find((step) => (
    step.field_id === 'qr'
    || step.field_id === 'code'
    || /^(code|equipment id|qr)$/i.test(step.field_name)
  ))

  if (nameRow || qrRow) {
    return [nameRow, qrRow].filter(Boolean)
  }

  const uuidLabel = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (rows.length && rows.every((step) => uuidLabel.test(step.field_name) || uuidLabel.test(step.field_id))) {
    const out = []
    if (rows[0]) out.push({ field_id: 'name', field_name: 'Name', value: rows[0].value })
    const last = rows[rows.length - 1]
    if (last && last.value !== rows[0]?.value) {
      out.push({ field_id: 'qr', field_name: 'Code', value: last.value })
    }
    return out
  }

  return rows.slice(0, 2)
}
