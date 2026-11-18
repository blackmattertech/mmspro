import { supabaseAdmin } from '../services/supabase.js'
import { enforceCloneOfId } from './recordClone.js'
import {
  findDuplicateOptionLabel,
  nestedCloneCompareKeys,
  resolveNestedCloneUniqueKeys,
  toNestedCloneComparable,
} from '../../shared/nestedClone.js'

export function cloneSourceNotFound() {
  const err = new Error('Source record for duplicate was not found.')
  err.status = 404
  return err
}

/** Org-scoped single-row loader used as the default `loadSource`. */
export async function loadNestedCloneSource({ table, orgId, id, select = '*', match = {} }) {
  let query = supabaseAdmin
    .from(table)
    .select(select)
    .eq('id', id)
    .eq('org_id', orgId)
  for (const [column, value] of Object.entries(match)) {
    query = query.eq(column, value)
  }
  const { data, error } = await query.maybeSingle()
  if (error || !data) throw cloneSourceNotFound()
  return data
}

function optionLabelOf(option) {
  if (option == null) return ''
  if (typeof option === 'string' || typeof option === 'number') return String(option).trim()
  return String(option.label ?? option.value ?? '').trim()
}

/**
 * Duplicate guard for dropdown option lists (saved as a whole list, so a duplicate is a new
 * row in the submitted list). No-op unless `clones` is non-empty, so a normal save is unchanged.
 * Each clone is `{ clone_of_id: <source option label>, label: <new option label> }`; the source
 * must exist in `currentOptions`, the new label must differ, and labels must be unique in the field.
 *
 * @param {{ currentOptions: any[], nextOptions: any[], clones: Array<{ clone_of_id: string, label: string }> }} options
 */
export async function enforceOptionClonesOrThrow({ currentOptions = [], nextOptions = [], clones }) {
  if (!Array.isArray(clones) || !clones.length) return

  const currentByLabel = new Map(
    currentOptions.map((option) => [optionLabelOf(option).toLowerCase(), option]).filter(([key]) => key),
  )
  const nextLabels = nextOptions.map(optionLabelOf).filter(Boolean)

  for (const clone of clones) {
    const sourceLabel = String(clone?.clone_of_id ?? '').trim()
    const label = String(clone?.label ?? '').trim()
    await enforceNestedCloneOrThrow({
      body: { clone_of_id: sourceLabel, label, value: label },
      kind: 'form_option',
      loadSource: async () => {
        const source = currentByLabel.get(sourceLabel.toLowerCase())
        if (!source) throw cloneSourceNotFound()
        const sourceName = optionLabelOf(source)
        return { label: sourceName, value: sourceName }
      },
    })
    if (!nextLabels.some((item) => item.toLowerCase() === label.toLowerCase())) {
      const err = new Error('The duplicated option is missing from the submitted list.')
      err.status = 400
      throw err
    }
  }

  const repeated = findDuplicateOptionLabel(nextLabels)
  if (repeated) {
    const err = new Error(`Option "${repeated}" already exists in this field.`)
    err.status = 400
    throw err
  }
}

/**
 * Duplicate guard for nested create paths. No-op unless body.clone_of_id is present.
 * Throws (with `status`) when the source is missing or nothing meaningful changed, so
 * service functions can call it before inserting and routes keep their existing
 * `err.status` handling.
 *
 * @param {object} options
 * @param {object} options.body create payload
 * @param {string} options.kind one of NESTED_CLONE_KINDS
 * @param {(id: string) => Promise<object|null>} options.loadSource org-scoped source loader
 * @param {(source: object) => void} [options.authorizeSource] may throw
 */
export async function enforceNestedCloneOrThrow({ body, kind, loadSource, authorizeSource }) {
  const cloneOfId = body?.clone_of_id || body?.cloneOfId || null
  if (!cloneOfId) return null

  let source
  try {
    source = await loadSource(cloneOfId)
  } catch (err) {
    throw err?.status ? err : cloneSourceNotFound()
  }
  if (!source) throw cloneSourceNotFound()
  authorizeSource?.(source)

  await enforceCloneOfId({
    body,
    loadSource: async () => source,
    toComparable: (record) => toNestedCloneComparable(kind, record),
    uniqueKeys: resolveNestedCloneUniqueKeys(kind, source),
    compareKeys: nestedCloneCompareKeys(kind),
  })
  return source
}
