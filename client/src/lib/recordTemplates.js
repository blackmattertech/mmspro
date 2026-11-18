export {
  RECORD_TEMPLATE_MODULES,
  RECORD_TEMPLATE_MODULE_KEYS,
  RECORD_TEMPLATE_MAX_PER_MODULE,
  isRecordTemplateModuleKey,
  normalizeTemplateName,
  recordTemplateModule,
  validateTemplateName,
} from '../../../shared/recordTemplates.js'

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
