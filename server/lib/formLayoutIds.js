export const SYSTEM_PREFIX = 'system:'
export const CATALOG_PREFIX = 'catalog:'
export const MASTER_PREFIX = 'master:'
export const CUSTOM_PREFIX = 'custom:'
export const FIELD_PREFIX = 'field:'
export const GROUP_PREFIX = 'group:'
export const LAYOUT_VERSION = 1

export const FILLED_BY_VALUES = ['any', 'creator', 'order_to_dept_head', 'technician']
export const FILLED_BY_LABELS = {
  any: 'Anyone',
  creator: 'Creator',
  order_to_dept_head: 'Order To Department Head',
  technician: 'Technician',
}

const KNOWN_PREFIXES = [
  SYSTEM_PREFIX,
  CATALOG_PREFIX,
  MASTER_PREFIX,
  CUSTOM_PREFIX,
  FIELD_PREFIX,
  GROUP_PREFIX,
]

export function systemId(key) {
  return `${SYSTEM_PREFIX}${key}`
}

export function catalogId(uuid) {
  if (!uuid) return null
  const value = String(uuid)
  if (KNOWN_PREFIXES.some((prefix) => value.startsWith(prefix))) return value
  return `${CATALOG_PREFIX}${value}`
}

export function masterId(source) {
  return `${MASTER_PREFIX}${source}`
}

export function customSectionId() {
  const uuid = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
  return `${CUSTOM_PREFIX}${uuid}`
}

export function customFieldId() {
  const uuid = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
  return `${FIELD_PREFIX}${uuid}`
}

export function repeatableGroupId() {
  const uuid = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
  return `${GROUP_PREFIX}${uuid}`
}

export function parseLayoutId(id) {
  const value = String(id || '')
  if (value.startsWith(SYSTEM_PREFIX)) {
    return { kind: 'system', value: value.slice(SYSTEM_PREFIX.length), id: value }
  }
  if (value.startsWith(CATALOG_PREFIX)) {
    return { kind: 'catalog', value: value.slice(CATALOG_PREFIX.length), id: value }
  }
  if (value.startsWith(MASTER_PREFIX)) {
    return { kind: 'master', value: value.slice(MASTER_PREFIX.length), id: value }
  }
  if (value.startsWith(CUSTOM_PREFIX)) {
    return { kind: 'custom', value: value.slice(CUSTOM_PREFIX.length), id: value }
  }
  if (value.startsWith(FIELD_PREFIX)) {
    return { kind: 'field', value: value.slice(FIELD_PREFIX.length), id: value }
  }
  if (value.startsWith(GROUP_PREFIX)) {
    return { kind: 'group', value: value.slice(GROUP_PREFIX.length), id: value }
  }
  return { kind: 'catalog', value, id: catalogId(value) }
}

export function isSystemId(id) {
  return String(id || '').startsWith(SYSTEM_PREFIX)
}

export function isCatalogId(id) {
  return String(id || '').startsWith(CATALOG_PREFIX)
}

export function isMasterId(id) {
  return String(id || '').startsWith(MASTER_PREFIX)
}

export function isCustomId(id) {
  return String(id || '').startsWith(CUSTOM_PREFIX)
}

export function isCustomFieldId(id) {
  return String(id || '').startsWith(FIELD_PREFIX)
}

export function isGroupId(id) {
  return String(id || '').startsWith(GROUP_PREFIX)
}

export function normalizeFilledBy(value) {
  const raw = String(value || '').trim()
  if (FILLED_BY_VALUES.includes(raw)) return raw
  return 'any'
}

export function fieldLayoutId(field) {
  if (!field) return null
  if (field.layout_id) return field.layout_id
  const id = String(field.id || '')
  if (KNOWN_PREFIXES.some((prefix) => id.startsWith(prefix))) return id
  return catalogId(id)
}

export function emptyLayout() {
  return { v: LAYOUT_VERSION, sections: [], fields: [], groups: [] }
}

export function cloneLayout(layout) {
  return JSON.parse(JSON.stringify(layout || emptyLayout()))
}

export const FIELD_WIDTHS = [25, 33, 75, 100]

export function normalizeColSpan(value, fallback = 25) {
  const n = Number(value)
  if (FIELD_WIDTHS.includes(n)) return n
  if (n === 2) return 100
  if (n === 1) return 25
  if (FIELD_WIDTHS.includes(fallback)) return fallback
  return 25
}

export function defaultColSpanForType(fieldType) {
  return fieldType === 'textarea' || fieldType === 'file' || fieldType === 'image' ? 100 : 25
}

function fieldSignatureEntry(field) {
  return [
    field.id,
    field.sectionId || '',
    field.order,
    normalizeColSpan(field.colSpan),
    Boolean(field.required),
    field.label || '',
    field.fieldType || '',
    field.masterSource || '',
    field.bindKey || '',
    Array.isArray(field.options)
      ? field.options.map((opt) => (
        typeof opt === 'object'
          ? `${opt.label || ''}:${opt.value || ''}:${(opt.rules || []).map((r) => `${r.action}:${r.targetFieldId}:${r.sourceFieldId || ''}`).join(',')}`
          : String(opt)
      )).join('|')
      : '',
    field.dependsOnFieldId || '',
    Array.isArray(field.dependsOnOptions) ? field.dependsOnOptions.join('|') : '',
    field.filterByFieldId || '',
  ]
}

export function layoutSignature(layout) {
  if (!layout) return ''
  return JSON.stringify({
    sections: (layout.sections || []).map((section) => [
      section.id,
      section.order,
      section.label || '',
      normalizeFilledBy(section.filledBy),
    ]),
    fields: (layout.fields || []).map((field) => fieldSignatureEntry(field)),
    groups: (layout.groups || []).map((group) => [
      group.id,
      group.sectionId || '',
      group.order,
      group.label || '',
      Number(group.minRows) || 0,
      Number(group.maxRows) || 20,
      (group.childFields || []).map((field) => fieldSignatureEntry(field)),
    ]),
    qrFieldId: layout.qrFieldId || '',
  })
}

export function sortLayoutItems(items) {
  return [...(items || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

export function findLayoutGroup(layout, id) {
  if (!layout?.groups) return null
  const target = fieldLayoutId({ id })
  return layout.groups.find((group) => fieldLayoutId(group) === target) || null
}

export function layoutGroupsForSection(layout, sectionId) {
  const target = fieldLayoutId({ id: sectionId })
  return sortLayoutItems((layout?.groups || []).filter((group) => group.sectionId === target))
}

export function layoutHasField(layout, id) {
  if (!layout?.fields) return false
  const target = fieldLayoutId({ id })
  return layout.fields.some((field) => fieldLayoutId(field) === target)
}

export function layoutHasSection(layout, id) {
  if (!layout?.sections) return false
  const target = fieldLayoutId({ id })
  return layout.sections.some((section) => fieldLayoutId(section) === target)
}

export function findLayoutField(layout, id) {
  if (!layout?.fields) return null
  const target = fieldLayoutId({ id })
  return layout.fields.find((field) => fieldLayoutId(field) === target) || null
}

export function layoutFieldIsRequired(layout, id) {
  const field = findLayoutField(layout, id)
  return Boolean(field?.required)
}

export function shouldRequire(layout, id, defaultWhenNoLayout = false) {
  if (!layout) return defaultWhenNoLayout
  return layoutFieldIsRequired(layout, id)
}
