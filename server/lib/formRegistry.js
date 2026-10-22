/**
 * Per-module form registry for Super Admin Form Builder.
 * Keep in sync with client/src/lib/formRegistry.js.
 */
import {
  LAYOUT_VERSION,
  catalogId,
  defaultColSpanForType,
  systemId,
} from './formLayoutIds.js'

function field(key, label, opts = {}) {
  return {
    id: systemId(key),
    key,
    label,
    fieldType: opts.type || 'text',
    required: Boolean(opts.required),
    locked: false,
    colSpan: opts.colSpan || 25,
    compound: Boolean(opts.compound),
  }
}

function section(key, label, fields) {
  return {
    id: systemId(key),
    key,
    label,
    locked: false,
    fields,
  }
}

function form(formId, label, systemSections, extra = {}) {
  const fields = systemSections.flatMap((item) => item.fields)
  return {
    formId,
    label,
    permissionKey: extra.permissionKey,
    allowCatalogFields: extra.allowCatalogFields !== false,
    catalogMode: extra.catalogMode || 'none',
    info: extra.info || null,
    systemSections,
    systemFields: fields,
    ...extra,
  }
}

function layoutFromSections(sections) {
  return {
    v: LAYOUT_VERSION,
    sections: sections.map((item, index) => ({ id: item.id, order: index, label: item.label })),
    fields: sections.flatMap((item) => item.fields.map((itemField, index) => ({
      id: itemField.id,
      sectionId: item.id,
      order: index,
      colSpan: itemField.colSpan || 25,
      required: Boolean(itemField.required),
    }))),
    groups: [],
  }
}

const WARRANTY_WARRANTY = form('warranty.warranty', 'Warranty', [
  section('warranty_details', 'Details', [
    field('serial_number', 'Serial number'),
    field('vendor_id', 'Vendor', { type: 'dropdown' }),
    field('contact_name', 'Contact name'),
    field('contact_phone', 'Contact phone', { type: 'tel' }),
    field('contact_email', 'Contact email', { type: 'email' }),
  ]),
  section('warranty_items', 'Items', [
    field('items', 'Warranty items', { compound: true, colSpan: 100 }),
  ]),
  section('warranty_documents', 'Documents', [
    field('documents', 'Documents', { type: 'file', compound: true, colSpan: 100 }),
  ]),
], { permissionKey: 'warranty_manager', catalogMode: 'all' })

const WORK_REQUEST_CREATE = form('work_request.create', 'Work request', [
  section('wr_request', 'Request information', [
    field('request_type', 'Request type', { type: 'dropdown', required: true }),
    field('order_from_department_id', 'Order from', { type: 'dropdown', required: true }),
    field('order_to_department_id', 'Order to', { type: 'dropdown', required: true }),
  ]),
  section('wr_asset', 'Asset', [
    field('asset_picker', 'Equipment picker', { compound: true, required: true, colSpan: 100 }),
  ]),
  section('wr_details', 'Details', [
    field('short_description', 'Short description', { required: true }),
    field('problem_description', 'Problem description', { type: 'textarea', required: true, colSpan: 100 }),
    field('job_nature', 'Job nature', { type: 'dropdown' }),
    field('priority', 'Priority', { type: 'dropdown' }),
    field('remarks', 'Remarks', { type: 'textarea', colSpan: 100 }),
  ]),
  section('wr_attachments', 'Attachments', [
    field('attachments', 'Attachments', { type: 'file', compound: true, colSpan: 100 }),
  ]),
  section('wr_breakdown', 'Breakdown fields', [
    field('breakdown', 'Breakdown fields', { compound: true, colSpan: 100 }),
  ]),
], { permissionKey: 'work_request_create', catalogMode: 'all' })

const WORK_ORDERS_MANUAL = form('work_orders.manual', 'Manual work order', [
  section('wo_assignment', 'Assignment', [
    field('assignment', 'Work order assignment', { compound: true, required: true, colSpan: 100 }),
  ]),
], { permissionKey: 'work_orders_manual', catalogMode: 'all' })

const PM_PLAN = form('pm.plan', 'PM plan', [
  section('pm_details', 'Plan details', [
    field('name', 'Name', { required: true }),
    field('department_id', 'Department', { type: 'dropdown', required: true }),
    field('activity_type_id', 'Activity type', { type: 'dropdown', required: true }),
    field('work_center', 'Work center', { required: true }),
    field('priority', 'Priority', { required: true }),
    field('status', 'Status', { required: true }),
    field('location_id', 'Location', { type: 'dropdown' }),
    field('area_id', 'Area', { type: 'dropdown' }),
    field('equipment_id', 'Equipment', { type: 'dropdown', required: true }),
    field('schedule', 'Schedule', { compound: true, required: true, colSpan: 100 }),
  ]),
  section('pm_technicians', 'Technicians', [
    field('technician_ids', 'Technicians', { compound: true, colSpan: 100 }),
  ]),
  section('pm_checklist', 'Checklist', [
    field('checklist_template_id', 'Checklist template', { type: 'dropdown' }),
  ]),
], { permissionKey: 'work_orders_scheduled', catalogMode: 'all' })

const EQUIPMENT_CREATE = form('equipment.create', 'Equipment', [
  section('equipment_identity', 'Identity', [
    field('name', 'Name', { required: true }),
    field('code', 'Code'),
  ]),
  section('equipment_placement', 'Placement', [
    field('location_id', 'Location', { type: 'dropdown', required: true }),
    field('department_id', 'Department', { type: 'dropdown', required: true }),
    field('area_id', 'Area', { type: 'dropdown', required: true }),
  ]),
  section('equipment_image', 'Image', [
    field('image', 'Image', { type: 'file', compound: true, colSpan: 100 }),
  ]),
], { permissionKey: 'equipment', catalogMode: 'equipment' })

export const MODULE_FORM_GROUPS = [
  {
    moduleId: 'work_request',
    label: 'Work Request',
    forms: [WORK_REQUEST_CREATE],
  },
  {
    moduleId: 'work_orders',
    label: 'Work Orders',
    forms: [WORK_ORDERS_MANUAL],
  },
  {
    moduleId: 'work_orders_scheduled',
    label: 'PM Schedule',
    forms: [PM_PLAN],
  },
  {
    moduleId: 'warranty_manager',
    label: 'Warranty Manager',
    forms: [WARRANTY_WARRANTY],
  },
  {
    moduleId: 'equipment',
    label: 'Equipment',
    forms: [EQUIPMENT_CREATE],
  },
]

export const FORM_REGISTRY = MODULE_FORM_GROUPS.flatMap((group) => (
  group.forms.map((item) => ({
    ...item,
    moduleId: group.moduleId,
    moduleLabel: group.label,
  }))
))

const FORM_BY_ID = new Map(FORM_REGISTRY.map((item) => [item.formId, item]))

export function getFormDef(formId) {
  return FORM_BY_ID.get(formId) || null
}

export function isFormId(formId) {
  return FORM_BY_ID.has(formId)
}

export function getModuleFormGroup(moduleId) {
  return MODULE_FORM_GROUPS.find((group) => group.moduleId === moduleId) || null
}

export function requiredSystemFields(formDef) {
  return (formDef?.systemFields || []).filter((item) => item.required || item.locked)
}

function filterCatalogParents(formDef, catalogFields) {
  const parents = (catalogFields || []).filter((row) => (
    row.kind === 'parent' && row.is_active !== false
  ))
  if (formDef.catalogMode === 'equipment') {
    return parents.filter((row) => row.field_source === 'equipment')
  }
  if (formDef.catalogMode === 'all') return parents
  return []
}

export function buildDefaultLayout(formDef, catalogFields = []) {
  const systemLayout = formDef?.formId === 'equipment.create'
    ? { v: LAYOUT_VERSION, sections: [], fields: [], groups: [] }
    : layoutFromSections(formDef.systemSections || [])
  if (formDef.catalogMode === 'none' || !formDef.allowCatalogFields) return systemLayout

  const sections = (catalogFields || [])
    .filter((row) => row.kind === 'section' && row.is_active !== false)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.name).localeCompare(String(b.name)))
  const parents = filterCatalogParents(formDef, catalogFields)
  const extraSections = []
  const extraFields = []
  const offset = systemLayout.sections.length

  sections.forEach((catalogSection, index) => {
    const sectionId = catalogId(catalogSection.id)
    const sectionParents = parents
      .filter((parent) => parent.section_id === catalogSection.id)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.name).localeCompare(String(b.name)))
    if (!sectionParents.length) return
    extraSections.push({ id: sectionId, order: offset + extraSections.length })
    sectionParents.forEach((parent, fieldIndex) => {
      extraFields.push({
        id: catalogId(parent.id),
        sectionId,
        order: fieldIndex,
        colSpan: defaultColSpanForType(parent.field_type),
      })
    })
  })

  return {
    v: LAYOUT_VERSION,
    sections: [...systemLayout.sections, ...extraSections.map((item, index) => ({ ...item, order: offset + index }))],
    fields: [...systemLayout.fields, ...extraFields],
    groups: [],
  }
}

export function publicFormMeta(formDef) {
  if (!formDef) return null
  return {
    formId: formDef.formId,
    label: formDef.label,
    moduleId: formDef.moduleId,
    moduleLabel: formDef.moduleLabel,
    permissionKey: formDef.permissionKey,
    allowCatalogFields: formDef.allowCatalogFields,
    catalogMode: formDef.catalogMode,
    info: formDef.info || null,
    systemSections: formDef.systemSections,
    systemFields: formDef.systemFields,
  }
}
