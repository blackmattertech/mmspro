import { parseLayoutId, systemId } from './formLayoutIds'

const SYSTEM_CAPTIONS = {
  name: { label: 'Name', read: (equipment) => equipment?.name },
  code: { label: 'Code', read: (equipment) => equipment?.code },
  location_id: { label: 'Location', read: (equipment) => equipment?.org_locations?.name || equipment?.locations?.name },
  department_id: { label: 'Department', read: (equipment) => equipment?.departments?.name },
  area_id: { label: 'Area', read: (equipment) => equipment?.areas?.name },
}

export function defaultQrFieldId(layout) {
  const fields = layout?.fields || []
  const ids = new Set(fields.map((field) => field.id))
  if (layout?.qrFieldId && (!ids.size || ids.has(layout.qrFieldId))) return layout.qrFieldId
  if (!ids.size || ids.has(systemId('code'))) return systemId('code')
  if (ids.has(systemId('name'))) return systemId('name')
  return fields[0]?.id || systemId('code')
}

export function qrFieldCaption(equipment, layout) {
  const fieldId = defaultQrFieldId(layout)
  const parsed = parseLayoutId(fieldId)
  if (parsed.kind === 'system' && SYSTEM_CAPTIONS[parsed.value]) {
    const caption = SYSTEM_CAPTIONS[parsed.value]
    return { label: caption.label, value: String(caption.read(equipment) || '').trim() }
  }
  if (parsed.kind === 'catalog') {
    const row = (equipment?.field_values || []).find((item) => item.field_id === parsed.value)
    const value = Array.isArray(row?.value_json?.values)
      ? row.value_json.values.join(', ')
      : String(row?.value_text || '')
    return { label: row?.field_name || 'Field', value: value.trim() }
  }
  return { label: 'Code', value: String(equipment?.code || '').trim() }
}

export function parseEquipmentScan(text) {
  const raw = String(text || '').trim()
  const match = raw.match(/\/scan\/equipment\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)
  return { raw, equipmentId: match?.[1] || null }
}
