export {
  RECORD_TEMPLATE_MODULES,
  RECORD_TEMPLATE_MODULE_KEYS,
  RECORD_TEMPLATE_MAX_PER_MODULE,
  isRecordTemplateModuleKey,
  normalizeTemplateName,
  recordTemplateModule,
  validateTemplateName,
} from '../../../shared/recordTemplates.js'

const FIELD_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function templateScalar(value) {
  if (value == null || typeof value === 'object') return ''
  return String(value).trim()
}

function hierarchyFieldId(key) {
  const id = String(key || '')
  if (id.startsWith('catalog:') || id.startsWith('field:')) return id.slice(id.indexOf(':') + 1)
  if (FIELD_UUID.test(id)) return id
  return ''
}

/**
 * Hierarchy values to put on the asset picker when a template is applied.
 * Catalog layout ids (`catalog:<fieldId>`) map onto the picker field id.
 * Live equipment values win when both are present.
 */
export function templateAssetFieldValues(payload) {
  const out = {}
  for (const [key, raw] of Object.entries(payload?.form_values || {})) {
    const fieldId = hierarchyFieldId(key)
    const text = templateScalar(raw)
    if (!fieldId || !text) continue
    out[fieldId] = text
  }
  const fromEquipment = payload?.asset_field_values
  if (fromEquipment && typeof fromEquipment === 'object' && !Array.isArray(fromEquipment)) {
    for (const [fieldId, raw] of Object.entries(fromEquipment)) {
      const text = templateScalar(raw)
      if (fieldId && text) out[fieldId] = text
    }
  }
  return out
}

/** `navigate(path, { state: templateNavState(id) })` */
export function templateNavState(templateFromId) {
  return { templateFromId }
}

export function readTemplateFromId(location) {
  const id = location?.state?.templateFromId
  return id ? String(id) : ''
}

export function defaultTemplateName(label) {
  const base = String(label || '').trim() || 'Record'
  return `${base} template`.slice(0, 120)
}

/** Download template attachment signed URLs into browser File objects. */
export async function filesFromTemplateAttachments(attachments = []) {
  const files = []
  for (const item of attachments || []) {
    if (!item?.signed_url) continue
    const response = await fetch(item.signed_url)
    if (!response.ok) {
      throw new Error(`Could not download template file: ${item.name || 'attachment'}`)
    }
    const blob = await response.blob()
    const file = new File(
      [blob],
      item.name || 'attachment',
      { type: item.mime_type || blob.type || 'application/octet-stream' },
    )
    files.push({
      file,
      field_id: item.field_id || null,
      kind: item.kind || 'file',
      name: item.name || file.name,
      mime_type: item.mime_type || file.type,
      size: item.size || file.size,
    })
  }
  return files
}
