import { supabaseAdmin } from '../services/supabase.js'
import { cloneLayout, parseLayoutId, sortLayoutItems, systemId } from './formLayoutIds.js'
import { getFormDef } from './formRegistry.js'
import { isWorkOrderProcessForm } from './workOrderForms.js'
import { normalizeOptions } from './formOptionRules.js'

export const PROCESS_TECHNICIAN_ACCEPTANCE = 'technician_acceptance'
export const CLOSEOUT_SECTION_ID = systemId('wo_closeout')
export const SKIP_KINDS = ['field', 'section', 'process']

const DEPENDENT_RULE_ACTIONS = new Set(['show', 'copyFrom'])

function httpError(message, status = 400) {
  const err = new Error(message)
  err.status = status
  return err
}

export const MISSING_FORM_SKIPS_MESSAGE =
  'Form skip settings are not available yet. Apply schema patch 108 and reload the PostgREST schema cache.'

export function isMissingFormSkipsTable(error) {
  const msg = String(error?.message || '')
  return /org_form_skips/i.test(msg) && /does not exist|schema cache/i.test(msg)
}

function missingFormSkipsError() {
  return httpError(MISSING_FORM_SKIPS_MESSAGE, 503)
}

export function isCloseoutSection(sectionOrId) {
  const id = String(sectionOrId?.id || sectionOrId || '')
  return id === CLOSEOUT_SECTION_ID || parseLayoutId(id).value === 'wo_closeout'
}

export function emptySkipSets() {
  return {
    fields: new Set(),
    sections: new Set(),
    process: new Set(),
  }
}

const SKIP_SET_KEYS = {
  field: 'fields',
  section: 'sections',
  process: 'process',
}

export function skipSetsFromRows(rows) {
  const skips = emptySkipSets()
  for (const row of rows || []) {
    const kind = String(row.kind || '')
    const target = String(row.target_id || '')
    const setKey = SKIP_SET_KEYS[kind]
    if (!target || !setKey) continue
    skips[setKey].add(target)
  }
  return skips
}

export async function loadFormSkips(orgId, formId, { required = false } = {}) {
  if (!orgId || !formId) return emptySkipSets()
  const { data, error } = await supabaseAdmin
    .from('org_form_skips')
    .select('kind, target_id')
    .eq('org_id', orgId)
    .eq('form_id', formId)
  if (error) {
    if (isMissingFormSkipsTable(error)) {
      if (required) throw missingFormSkipsError()
      return emptySkipSets()
    }
    throw error
  }
  return skipSetsFromRows(data)
}

export async function loadOrgProcessSkips(orgId) {
  const map = new Map()
  if (!orgId) return map
  const { data, error } = await supabaseAdmin
    .from('org_form_skips')
    .select('form_id, target_id')
    .eq('org_id', orgId)
    .eq('kind', 'process')
    .eq('target_id', PROCESS_TECHNICIAN_ACCEPTANCE)
  if (error) {
    if (isMissingFormSkipsTable(error)) return map
    throw error
  }
  for (const row of data || []) {
    map.set(row.form_id, true)
  }
  return map
}

export async function shouldSkipTechnicianAcceptance(orgId, formId) {
  if (!isWorkOrderProcessForm(formId)) return false
  const skips = await loadFormSkips(orgId, formId)
  return skips.process.has(PROCESS_TECHNICIAN_ACCEPTANCE)
}

export async function assignedStatusForTechnicians(orgId, formId, hasAssignees) {
  if (hasAssignees && await shouldSkipTechnicianAcceptance(orgId, formId)) return 'accepted'
  return 'assigned'
}

function systemFieldFor(formDef, fieldId) {
  return (formDef?.systemFields || []).find((item) => item.id === fieldId) || null
}

export function fieldCannotSkip(field, formDef) {
  if (!field?.id) return true
  if (field.required) return true
  if (field.locked) return true
  const system = systemFieldFor(formDef, field.id)
  if (system?.required && system?.locked) return true
  if (system?.locked) return true
  return false
}

function groupCannotSkip(group, formDef) {
  if (!group?.id) return true
  if ((group.childFields || []).some((child) => fieldCannotSkip(child, formDef))) return true
  return false
}

function layoutItemsById(layout) {
  const map = new Map()
  for (const field of layout?.fields || []) {
    if (field?.id) map.set(field.id, { type: 'field', item: field })
  }
  for (const group of layout?.groups || []) {
    if (group?.id) map.set(group.id, { type: 'group', item: group })
    for (const child of group.childFields || []) {
      if (child?.id) map.set(child.id, { type: 'child', item: child, group })
    }
  }
  return map
}

function itemLabel(entry, formDef) {
  const item = entry?.item
  if (!item) return 'Field'
  return item.label || systemFieldFor(formDef, item.id)?.label || 'Field'
}

function collectDependents(layout) {
  const dependents = new Map()
  const add = (parentId, childId) => {
    if (!parentId || !childId || parentId === childId) return
    const list = dependents.get(parentId) || []
    if (!list.includes(childId)) list.push(childId)
    dependents.set(parentId, list)
  }
  for (const field of layout?.fields || []) {
    if (field.dependsOnFieldId) add(field.dependsOnFieldId, field.id)
    for (const option of normalizeOptions(field.options)) {
      for (const rule of option.rules || []) {
        if (DEPENDENT_RULE_ACTIONS.has(rule.action)) add(field.id, rule.targetFieldId)
      }
    }
  }
  for (const group of layout?.groups || []) {
    for (const child of group.childFields || []) {
      if (child.dependsOnFieldId) add(child.dependsOnFieldId, child.id)
    }
  }
  return dependents
}

function walkDependents(rootId, dependents) {
  const out = []
  const seen = new Set()
  const queue = [...(dependents.get(rootId) || [])]
  while (queue.length) {
    const id = queue.shift()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
    for (const child of dependents.get(id) || []) queue.push(child)
  }
  return out
}

function requiredDependentReason(fieldId, layout, formDef, dependents) {
  const byId = layoutItemsById(layout)
  for (const childId of walkDependents(fieldId, dependents)) {
    const entry = byId.get(childId)
    if (!entry) continue
    if (entry.type === 'group') {
      if (groupCannotSkip(entry.item, formDef)) {
        return `Cannot skip: required field ${itemLabel(entry, formDef)} depends on this`
      }
      continue
    }
    if (fieldCannotSkip(entry.item, formDef)) {
      return `Cannot skip: required field ${itemLabel(entry, formDef)} depends on this`
    }
  }
  return ''
}

function skippableIdsInSection(layout, sectionId, formDef, dependents) {
  const ids = []
  for (const field of layout?.fields || []) {
    if (field.sectionId !== sectionId) continue
    if (fieldCannotSkip(field, formDef)) continue
    if (requiredDependentReason(field.id, layout, formDef, dependents)) continue
    ids.push(field.id)
  }
  for (const group of layout?.groups || []) {
    if (group.sectionId !== sectionId) continue
    if (groupCannotSkip(group, formDef)) continue
    if (requiredDependentReason(group.id, layout, formDef, dependents)) continue
    ids.push(group.id)
  }
  return ids
}

export function sectionCanSkip(layout, section, formDef, dependents = collectDependents(layout)) {
  if (isCloseoutSection(section)) return false
  return skippableIdsInSection(layout, section.id, formDef, dependents).length > 0
}

export function effectiveSkippedFieldIds(layout, skips, formDef) {
  const dependents = collectDependents(layout)
  const explicit = new Set(skips?.fields || [])
  for (const section of layout?.sections || []) {
    if (!skips?.sections?.has(section.id)) continue
    if (!sectionCanSkip(layout, section, formDef, dependents)) continue
    for (const id of skippableIdsInSection(layout, section.id, formDef, dependents)) {
      explicit.add(id)
    }
  }
  const effective = new Set()
  for (const id of explicit) {
    const byId = layoutItemsById(layout)
    const entry = byId.get(id)
    if (!entry) continue
    if (entry.type === 'group') {
      if (groupCannotSkip(entry.item, formDef)) continue
    } else if (fieldCannotSkip(entry.item, formDef)) continue
    if (requiredDependentReason(id, layout, formDef, dependents)) continue
    effective.add(id)
  }
  for (const id of [...effective]) {
    for (const childId of walkDependents(id, dependents)) {
      const byId = layoutItemsById(layout)
      const entry = byId.get(childId)
      if (!entry) continue
      if (entry.type === 'group') {
        if (groupCannotSkip(entry.item, formDef)) continue
      } else if (fieldCannotSkip(entry.item, formDef)) continue
      effective.add(childId)
    }
  }
  return { effective, dependents }
}

export function applyCompanySkipsToLayout(layout, skips, formDef) {
  if (!layout) return layout
  const next = cloneLayout(layout)
  const { effective } = effectiveSkippedFieldIds(next, skips, formDef)
  next.fields = (next.fields || []).map((field) => {
    if (!effective.has(field.id)) return field
    return { ...field, skipped: true, required: false }
  })
  next.groups = (next.groups || []).map((group) => {
    if (!effective.has(group.id)) {
      return {
        ...group,
        childFields: (group.childFields || []).map((child) => (
          effective.has(child.id) ? { ...child, skipped: true, required: false } : child
        )),
      }
    }
    return {
      ...group,
      skipped: true,
      childFields: (group.childFields || []).map((child) => ({ ...child, skipped: true, required: false })),
    }
  })
  next.processSkips = {
    technician_acceptance: Boolean(skips?.process?.has(PROCESS_TECHNICIAN_ACCEPTANCE) && isWorkOrderProcessForm(formDef?.formId)),
  }
  return next
}

export async function applyLoadedCompanySkips(orgId, formId, layout) {
  if (!layout) return layout
  const formDef = getFormDef(formId)
  const skips = await loadFormSkips(orgId, formId)
  const applied = applyCompanySkipsToLayout(layout, skips, formDef)
  applied.processSkips = {
    technician_acceptance: Boolean(
      isWorkOrderProcessForm(formId) && skips.process.has(PROCESS_TECHNICIAN_ACCEPTANCE),
    ),
  }
  return applied
}

function fieldTypeOf(field, formDef) {
  return field.fieldType || systemFieldFor(formDef, field.id)?.fieldType || (field.compound ? 'block' : 'text')
}

export function describeSkipBoard(formId, layout, skips, {
  formDef = getFormDef(formId),
  optionFieldIds = new Set(),
} = {}) {
  const dependents = collectDependents(layout)
  const { effective } = effectiveSkippedFieldIds(layout, skips, formDef)
  const byId = layoutItemsById(layout)
  const parentOf = new Map()
  for (const [parentId, children] of dependents) {
    for (const childId of children) {
      if (!parentOf.has(childId)) parentOf.set(childId, parentId)
    }
  }

  const skippedBecauseOf = (id) => {
    if (!effective.has(id)) return ''
    if (skips.fields.has(id)) return ''
    const entry = byId.get(id)
    const sectionId = entry?.item?.sectionId || entry?.group?.sectionId
    if (sectionId && skips.sections.has(sectionId)) return ''
    const parentId = parentOf.get(id)
    if (!parentId || !effective.has(parentId)) return ''
    return itemLabel(byId.get(parentId), formDef)
  }

  const sections = sortLayoutItems(layout?.sections || []).map((section) => {
    const fields = []
    for (const field of sortLayoutItems((layout.fields || []).filter((item) => item.sectionId === section.id))) {
      const required = Boolean(field.required)
      const locked = Boolean(field.locked || systemFieldFor(formDef, field.id)?.locked)
      const blocked = requiredDependentReason(field.id, layout, formDef, dependents)
      const autoBecause = skippedBecauseOf(field.id)
      const skippable = !required && !locked && !blocked
      fields.push({
        id: field.id,
        kind: 'field',
        label: field.label || systemFieldFor(formDef, field.id)?.label || 'Field',
        fieldType: fieldTypeOf(field, formDef),
        required,
        locked,
        skippable,
        skipped: effective.has(field.id),
        skippedExplicit: skips.fields.has(field.id),
        skippedBecause: autoBecause,
        skipBlockedReason: required || locked
          ? 'Required by Superadmin'
          : (blocked || ''),
        hasOptions: optionFieldIds.has(field.id),
      })
    }
    for (const group of sortLayoutItems((layout.groups || []).filter((item) => item.sectionId === section.id))) {
      const required = groupCannotSkip(group, formDef)
      const blocked = requiredDependentReason(group.id, layout, formDef, dependents)
      const autoBecause = skippedBecauseOf(group.id)
      const skippable = !required && !blocked
      fields.push({
        id: group.id,
        kind: 'group',
        label: group.label || 'Repeatable group',
        fieldType: 'group',
        required,
        locked: false,
        skippable,
        skipped: effective.has(group.id),
        skippedExplicit: skips.fields.has(group.id),
        skippedBecause: autoBecause,
        skipBlockedReason: required ? 'Required by Superadmin' : (blocked || ''),
        hasOptions: false,
      })
    }
    const canSkipSection = sectionCanSkip(layout, section, formDef, dependents)
    const skippableFields = fields.filter((field) => field.skippable || field.skipped)
    const hasRequired = fields.some((field) => field.required || field.locked)
    const allOptionalSkipped = skippableFields.length > 0
      && skippableFields.every((field) => field.skipped)
    return {
      id: section.id,
      label: section.label || 'Section',
      closeout: isCloseoutSection(section),
      skippable: canSkipSection,
      skipped: skips.sections.has(section.id) || (canSkipSection && allOptionalSkipped),
      skipBlockedReason: isCloseoutSection(section)
        ? 'Supervisor verification stays on the work order'
        : (canSkipSection
          ? (hasRequired ? 'Required Superadmin fields in this section stay visible.' : '')
          : 'Every field in this section is required by Superadmin'),
      fields,
    }
  })

  return {
    formId,
    supportsTechnicianAcceptance: isWorkOrderProcessForm(formId),
    skipTechnicianAcceptance: isWorkOrderProcessForm(formId)
      && skips.process.has(PROCESS_TECHNICIAN_ACCEPTANCE),
    sections,
  }
}

export function normalizeSkipPayload(formId, layout, body, formDef) {
  const dependents = collectDependents(layout)
  const requestedFields = new Set(
    (Array.isArray(body?.skippedFieldIds) ? body.skippedFieldIds : []).map((id) => String(id || '')).filter(Boolean),
  )
  const requestedSections = new Set(
    (Array.isArray(body?.skippedSectionIds) ? body.skippedSectionIds : []).map((id) => String(id || '')).filter(Boolean),
  )
  const byId = layoutItemsById(layout)

  const fieldRows = []
  for (const id of requestedFields) {
    const entry = byId.get(id)
    if (!entry) continue
    if (entry.type === 'group') {
      if (groupCannotSkip(entry.item, formDef)) {
        throw httpError(`Cannot skip required field ${itemLabel(entry, formDef)}`)
      }
    } else if (fieldCannotSkip(entry.item, formDef)) {
      throw httpError(`Cannot skip required field ${itemLabel(entry, formDef)}`)
    }
    const blocked = requiredDependentReason(id, layout, formDef, dependents)
    if (blocked) throw httpError(blocked)
    fieldRows.push({ kind: 'field', target_id: id })
  }

  const sectionRows = []
  for (const section of layout?.sections || []) {
    if (!requestedSections.has(section.id)) continue
    if (!sectionCanSkip(layout, section, formDef, dependents)) {
      throw httpError(
        isCloseoutSection(section)
          ? 'Supervisor verification cannot be skipped'
          : `Cannot skip section ${section.label || 'Section'} because every field is required`,
      )
    }
    sectionRows.push({ kind: 'section', target_id: section.id })
  }

  const processRows = []
  if (isWorkOrderProcessForm(formId) && body?.skipTechnicianAcceptance) {
    processRows.push({ kind: 'process', target_id: PROCESS_TECHNICIAN_ACCEPTANCE })
  }

  return [...fieldRows, ...sectionRows, ...processRows]
}

export async function saveFormSkips(orgId, formId, rows) {
  const now = new Date().toISOString()
  const { error: deleteError } = await supabaseAdmin
    .from('org_form_skips')
    .delete()
    .eq('org_id', orgId)
    .eq('form_id', formId)
  if (deleteError) {
    if (isMissingFormSkipsTable(deleteError)) {
      throw missingFormSkipsError()
    }
    throw deleteError
  }
  if (!rows.length) return
  const payload = rows.map((row) => ({
    org_id: orgId,
    form_id: formId,
    kind: row.kind,
    target_id: row.target_id,
    updated_at: now,
  }))
  const { error } = await supabaseAdmin.from('org_form_skips').insert(payload)
  if (error) {
    if (isMissingFormSkipsTable(error)) throw missingFormSkipsError()
    throw error
  }
}

export async function maybePromoteAssignedToAccepted(orgId, {
  formId,
  workOrderId,
  currentStatus,
  hasAssignees,
} = {}) {
  if (currentStatus !== 'assigned' || !hasAssignees || !workOrderId) return currentStatus
  if (!await shouldSkipTechnicianAcceptance(orgId, formId)) return currentStatus
  const { error } = await supabaseAdmin
    .from('manual_work_orders')
    .update({ status: 'accepted', updated_at: new Date().toISOString() })
    .eq('org_id', orgId)
    .eq('id', workOrderId)
    .eq('status', 'assigned')
  if (error) throw error
  return 'accepted'
}
