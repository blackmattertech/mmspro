import { supabaseAdmin } from '../services/supabase.js'

const VALID_REFERENCE_TYPES = new Set([
  'work_order',
  'purchase_order',
  'purchase_request',
  'vendor_ref',
  'contract',
  'amc',
  'document',
  'custom',
])

function trimOrNull(value) {
  const text = String(value ?? '').trim()
  return text || null
}

export async function syncTaskReferences(orgId, taskId, references) {
  await supabaseAdmin.from('task_references').delete().eq('task_id', taskId)
  if (!Array.isArray(references) || !references.length) return

  const rows = references
    .map((ref, index) => {
      const referenceType = ref.reference_type || ref.type
      if (!VALID_REFERENCE_TYPES.has(referenceType)) return null
      const referenceNumber = trimOrNull(ref.reference_number || ref.number)
      const referenceLabel = trimOrNull(ref.reference_label || ref.label)
      const entityId = ref.reference_entity_id || ref.entity_id || null
      const entityType = trimOrNull(ref.reference_entity_type || ref.entity_type)

      if (!referenceNumber && !entityId && !referenceLabel) return null

      return {
        org_id: orgId,
        task_id: taskId,
        reference_type: referenceType,
        reference_entity_type: entityType,
        reference_entity_id: entityId,
        reference_label: referenceLabel,
        reference_number: referenceNumber,
        sort_order: index,
      }
    })
    .filter(Boolean)

  if (rows.length) {
    const { error } = await supabaseAdmin.from('task_references').insert(rows)
    if (error) throw error
  }
}

export async function loadReferencesForTasks(taskIds) {
  const map = new Map()
  if (!taskIds.length) return map

  const { data, error } = await supabaseAdmin
    .from('task_references')
    .select('*')
    .in('task_id', taskIds)
    .order('sort_order', { ascending: true })

  if (error) throw error

  for (const row of data || []) {
    const list = map.get(row.task_id) || []
    list.push(row)
    map.set(row.task_id, list)
  }

  return map
}

function shortWorkOrderId(id) {
  if (!id) return ''
  return String(id).replace(/-/g, '').slice(0, 8).toUpperCase()
}

export async function searchTaskReferenceEntities(orgId, query, { type } = {}) {
  const q = trimOrNull(query)
  if (!q) return []

  const results = []

  if (!type || type === 'work_order') {
    const { data: workOrders, error } = await supabaseAdmin
      .from('manual_work_orders')
      .select('id, summary, created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) throw error

    const needle = q.toLowerCase()
    for (const wo of workOrders || []) {
      const woNumber = shortWorkOrderId(wo.id)
      if (woNumber.toLowerCase().includes(needle) || (wo.summary || '').toLowerCase().includes(needle)) {
        results.push({
          reference_type: 'work_order',
          reference_entity_type: 'manual_work_order',
          reference_entity_id: wo.id,
          reference_label: wo.summary || 'Work Order',
          reference_number: woNumber,
        })
      }
    }
  }

  if (!type || type === 'vendor_ref') {
    const { data: vendors, error } = await supabaseAdmin
      .from('vendors')
      .select('id, vendor_code, name')
      .eq('org_id', orgId)
      .or(`vendor_code.ilike.%${q}%,name.ilike.%${q}%`)
      .limit(20)

    if (error) throw error

    for (const vendor of vendors || []) {
      results.push({
        reference_type: 'vendor_ref',
        reference_entity_type: 'vendor',
        reference_entity_id: vendor.id,
        reference_label: vendor.name,
        reference_number: vendor.vendor_code,
      })
    }
  }

  return results.slice(0, 30)
}

export { VALID_REFERENCE_TYPES }
