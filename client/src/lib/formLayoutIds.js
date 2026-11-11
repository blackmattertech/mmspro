export const SYSTEM_PREFIX = 'system:'
export const CATALOG_PREFIX = 'catalog:'
export const MASTER_PREFIX = 'master:'
export const CUSTOM_PREFIX = 'custom:'
export const FIELD_PREFIX = 'field:'
export const GROUP_PREFIX = 'group:'
export const LAYOUT_VERSION = 1

export const FILLED_BY_VALUES = ['any', 'creator', 'order_to_dept_head', 'technician', 'supervisor']
export const FILLED_BY_LABELS = {
  any: 'Anyone',
  creator: 'Creator',
  order_to_dept_head: 'Order To Department Head',
  technician: 'Technician',
  supervisor: 'Supervisor',
}

export const SECTION_STAGE_VALUES = ['', 'create', 'assignment', 'execution', 'closeout']
export const SECTION_STAGE_LABELS = {
  '': 'Any stage',
  create: 'Create',
  assignment: 'Assignment',
  execution: 'Execution',
  closeout: 'Closeout',
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

/** Shared keys that map to the compound Asset picker block. */
export const ASSET_PICKER_KEYS = new Set(['asset_picker', 'equipment_id', 'area_id'])

/** True when this layout field is the compound Asset picker (or a legacy alias of it). */
export function isPrimaryAssetPickerField(field) {
  if (!field) return false
  const parsed = parseLayoutId(field.id)
  if (parsed.kind === 'system' && ASSET_PICKER_KEYS.has(parsed.value)) return true
  if (field.bindKey === 'area_id' || field.bindKey === 'equipment_id' || field.bindKey === 'asset_picker') {
    return true
  }
  if (/^asset\s*picker$/i.test(String(field.label || '').trim())) return true
  return false
}

/** Legacy area/equipment masters and auto-from-equipment mirrors that collapse into the picker. */
export function isAssetPickerControlField(field) {
  if (!field) return false
  if (field.autoFromEquipment) return true
  if (isPrimaryAssetPickerField(field)) return true
  const parsed = parseLayoutId(field.id)
  if (parsed.kind === 'master' && (parsed.value === 'areas' || parsed.value === 'equipment')) return true
  if (field.masterSource === 'areas' || field.masterSource === 'equipment') return true
  return false
}

/** Alias used by hosts — the compound Asset picker block. */
export function isAssetPickerLayoutField(field) {
  return isPrimaryAssetPickerField(field)
}

function collapseAssetControls(layout) {
  if (!layout?.fields?.length) return layout
  const assetFields = layout.fields.filter(isAssetPickerControlField)
  if (!assetFields.length) return layout

  // Keep the first asset control's section (admin placement). Do not relocate by label.
  const sectionId = assetFields[0].sectionId
  const order = Math.min(...assetFields.map((field) => Number(field.order) || 0))
  const required = assetFields.some((field) => {
    const parsed = parseLayoutId(field.id)
    if (parsed.kind === 'system' && parsed.value === 'area_id') return false
    return Boolean(field.required)
  })
  const existingPicker = assetFields.find((field) => {
    const parsed = parseLayoutId(field.id)
    return parsed.kind === 'system' && parsed.value === 'asset_picker'
  })

  const picker = {
    ...(existingPicker || {}),
    id: systemId('asset_picker'),
    sectionId,
    order,
    colSpan: 100,
    required: existingPicker ? (existingPicker.required ?? required) : required,
    bindKey: 'asset_picker',
    masterSource: '',
    label: existingPicker?.label || 'Asset picker',
    autoFromEquipment: undefined,
    filterByFieldId: undefined,
  }

  const fields = []
  let inserted = false
  for (const field of layout.fields) {
    if (isAssetPickerControlField(field)) {
      if (inserted) continue
      fields.push(picker)
      inserted = true
      continue
    }
    fields.push(field)
  }
  return { ...layout, fields }
}

function stripEquipmentCatalogMirrors(layout, catalogFields) {
  if (!layout?.fields?.length || !catalogFields?.length) return layout
  const hasPicker = (layout.fields || []).some(isPrimaryAssetPickerField)
  if (!hasPicker) return layout
  const catalogById = new Map((catalogFields || []).map((row) => [String(row.id), row]))
  return {
    ...layout,
    fields: layout.fields.filter((field) => {
      const parsed = parseLayoutId(field.id)
      if (parsed.kind !== 'catalog') return true
      const source = catalogById.get(String(parsed.value))
      return source?.field_source !== 'equipment'
    }),
  }
}

/**
 * Idempotent layout normalizer for Asset picker.
 * Collapses legacy area/equipment controls into one system:asset_picker and strips
 * equipment catalog mirrors. Preserves the admin's section (no label-based relocate).
 */
export function normalizeAssetLayout(layout, { catalogFields = null } = {}) {
  if (!layout?.fields?.length) return layout
  let next = collapseAssetControls(layout)
  if (catalogFields) next = stripEquipmentCatalogMirrors(next, catalogFields)
  return next
}

/** @deprecated Prefer normalizeAssetLayout — kept for Form Builder / callers. */
export function collapseToAssetPickerBlock(layout) {
  return normalizeAssetLayout(layout)
}

/** @deprecated Prefer normalizeAssetLayout. */
export function layoutWithoutAreasMaster(layout) {
  return normalizeAssetLayout(layout)
}

function isPmAssetControlField(field) {
  return isAssetPickerControlField(field)
}

function isPmScheduleField(field) {
  const parsed = parseLayoutId(field?.id)
  return parsed.kind === 'system' && parsed.value === 'schedule'
}

/**
 * Rescue Asset picker / Schedule if they landed under Checklist.
 * Otherwise keep each field in the section configured in Form Builder.
 */
export function normalizePmPlanLayout(layout) {
  if (!layout?.fields?.length) return layout

  const sections = layout.sections || []
  const detailsId = sections.find((section) => section.id === systemId('pm_details'))?.id
    || sections.find((section) => /plan\s*details/i.test(String(section.label || '')))?.id
    || sections[0]?.id
  if (!detailsId) return layout

  const checklistId = sections.find((section) => section.id === systemId('pm_checklist'))?.id
    || sections.find((section) => /checklist/i.test(String(section.label || '')))?.id
  const assetSectionId = sections.find((section) => /asset/i.test(String(section.label || '')))?.id
    || detailsId
  const scheduleSectionId = sections.find((section) => /schedule/i.test(String(section.label || '')))?.id
    || detailsId

  let fields = layout.fields.map((field) => {
    if (!checklistId || field.sectionId !== checklistId) return field
    if (isPmScheduleField(field)) return { ...field, sectionId: scheduleSectionId }
    if (isPmAssetControlField(field)) return { ...field, sectionId: assetSectionId }
    return field
  })

  if (!fields.some(isPmScheduleField)) {
    const maxOrder = fields
      .filter((field) => field.sectionId === scheduleSectionId)
      .reduce((max, field) => Math.max(max, Number(field.order) || 0), 0)
    fields = [
      ...fields,
      {
        id: systemId('schedule'),
        sectionId: scheduleSectionId,
        order: maxOrder + 1,
        colSpan: 100,
        required: true,
      },
    ]
  }

  const hasAssetControl = fields.some(isPmAssetControlField)
  if (!hasAssetControl) {
    const maxOrder = fields
      .filter((field) => field.sectionId === assetSectionId)
      .reduce((max, field) => Math.max(max, Number(field.order) || 0), 0)
    fields = [
      ...fields,
      {
        id: systemId('asset_picker'),
        sectionId: assetSectionId,
        order: maxOrder + 1,
        colSpan: 100,
        required: true,
        bindKey: 'asset_picker',
      },
    ]
  }

  return normalizeAssetLayout({ ...layout, fields })
}

export function normalizeFilledBy(value) {
  const raw = String(value || '').trim()
  if (FILLED_BY_VALUES.includes(raw)) return raw
  return 'any'
}

export function normalizeStage(value) {
  const raw = String(value || '').trim()
  if (raw && SECTION_STAGE_VALUES.includes(raw)) return raw
  return ''
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

export const FIELD_WIDTHS = [25, 33, 50, 75, 100]
export const FIELD_WIDTH_LABELS = {
  25: '25%',
  33: '33%',
  50: '50%',
  75: '75%',
  100: '100%',
}

export function normalizeColSpan(value, fallback = 25) {
  const n = Number(value)
  if (FIELD_WIDTHS.includes(n)) return n
  // Legacy half / full
  if (n === 2) return 100
  if (n === 1) return 25
  if (FIELD_WIDTHS.includes(fallback)) return fallback
  return 25
}

export function defaultColSpanForType(fieldType) {
  return fieldType === 'textarea' || fieldType === 'file' || fieldType === 'image' ? 100 : 25
}

export function nextFieldWidth(value) {
  const current = normalizeColSpan(value, 25)
  const index = FIELD_WIDTHS.indexOf(current)
  return FIELD_WIDTHS[(index + 1) % FIELD_WIDTHS.length]
}

export function fieldWidthFromDelta(startWidth, deltaPx) {
  const start = normalizeColSpan(startWidth, 25)
  const startIndex = Math.max(0, FIELD_WIDTHS.indexOf(start))
  const step = Math.round(deltaPx / 48)
  const nextIndex = Math.min(FIELD_WIDTHS.length - 1, Math.max(0, startIndex + step))
  return FIELD_WIDTHS[nextIndex]
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
    field.defaultToCurrentUser ? '1' : '',
    field.equipmentColumnId || '',
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
      normalizeStage(section.stage),
      [...(section.sharedWith || [])].sort().join(','),
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

export function findLayoutGroup(layout, id) {
  if (!layout?.groups) return null
  const target = fieldLayoutId({ id })
  return layout.groups.find((group) => fieldLayoutId(group) === target) || null
}

export function layoutGroupsForSection(layout, sectionId) {
  const target = fieldLayoutId({ id: sectionId })
  return sortLayoutItems((layout?.groups || []).filter((group) => group.sectionId === target))
}

export function sortLayoutItems(items) {
  return [...(items || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
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

/** Layout slice for sections that are not equipment catalog fields. */
export function layoutWithoutCatalogFields(layout) {
  if (!layout) return null
  const fields = (layout.fields || []).filter((field) => parseLayoutId(field.id).kind !== 'catalog')
  const groups = layout.groups || []
  const sectionIds = new Set([
    ...fields.map((field) => field.sectionId),
    ...groups.map((group) => group.sectionId),
  ])
  const sections = (layout.sections || []).filter((section) => sectionIds.has(section.id))
  if (!sections.length) return null
  return { ...layout, sections, fields, groups }
}

export function findLayoutField(layout, id) {
  if (!layout?.fields) return null
  const target = fieldLayoutId({ id })
  return layout.fields.find((field) => fieldLayoutId(field) === target) || null
}

export function layoutFieldIsRequired(layout, id) {
  const field = findLayoutField(layout, id)
  if (!field || field.skipped) return false
  return Boolean(field.required)
}

export function shouldRequire(layout, id, defaultWhenNoLayout = false) {
  if (!layout) return defaultWhenNoLayout
  return layoutFieldIsRequired(layout, id)
}

export function formFieldClassName(field, extras = '') {
  if (field?.colSpan == null && field?.width == null) {
    return ['company-form__field', extras].filter(Boolean).join(' ')
  }
  const width = normalizeColSpan(field?.colSpan ?? field?.width, 25)
  return ['company-form__field', `company-form__field--w-${width}`, extras].filter(Boolean).join(' ')
}
