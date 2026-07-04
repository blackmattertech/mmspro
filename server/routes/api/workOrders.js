import { Router } from 'express'
import { verifyAuth } from '../../middleware/auth.js'
import { requireOrgAccess, assertOrgOwnership } from '../../middleware/orgAccess.js'
import { requireOrgRole } from '../../middleware/orgRole.js'
import { supabaseAdmin } from '../../services/supabase.js'

const router = Router()
const canManage = requireOrgRole('owner', 'admin')

router.use(verifyAuth, requireOrgAccess)

async function loadOrgAssetFields(orgId) {
  const { data, error } = await supabaseAdmin
    .from('asset_fields')
    .select('*')
    .eq('org_id', orgId)
    .order('sort_order')
    .order('name')

  if (error) throw error
  return data || []
}

function enrichAssetFields(rows) {
  const byId = new Map(rows.map((row) => [row.id, row]))

  return rows.map((row) => {
    const section = row.section_id ? byId.get(row.section_id) : null
    const parent = row.parent_id ? byId.get(row.parent_id) : null
    const sectionFromParent = parent?.section_id ? byId.get(parent.section_id) : null

    const children = row.kind === 'parent'
      ? rows.filter((f) => f.parent_id === row.id && f.kind === 'child' && f.is_active !== false)
      : []

    return {
      ...row,
      section_name: section?.name || sectionFromParent?.name || null,
      parent_name: parent?.name || null,
      dropdown_options: row.field_type === 'dropdown'
        ? children.map((c) => c.name)
        : undefined,
    }
  })
}

async function loadFieldSettings(orgId) {
  const { data, error } = await supabaseAdmin
    .from('work_order_field_settings')
    .select('field_id, is_visible')
    .eq('org_id', orgId)

  if (error) throw error
  return new Map((data || []).map((row) => [row.field_id, row.is_visible]))
}

function isFieldVisible(field, settingsMap) {
  if (field.is_active === false) return false
  if (settingsMap.has(field.id)) return settingsMap.get(field.id)
  return true
}

function buildFormSchema(fields, settingsMap) {
  const enriched = enrichAssetFields(fields)
  const sections = enriched
    .filter((f) => f.kind === 'section')
    .filter((f) => isFieldVisible(f, settingsMap))
    .map((section) => {
      const parents = enriched
        .filter((f) => f.kind === 'parent' && f.section_id === section.id)
        .filter((f) => isFieldVisible(f, settingsMap))
        .map((parent) => ({
          id: parent.id,
          name: parent.name,
          field_type: parent.field_type,
          sort_order: parent.sort_order,
          is_visible: true,
          dropdown_options: parent.dropdown_options || [],
          depends_on_parent_id: parent.depends_on_parent_id || null,
          depends_on_option: parent.depends_on_option || null,
        }))
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))

      return {
        id: section.id,
        name: section.name,
        sort_order: section.sort_order,
        is_visible: true,
        icon_path: section.icon_path || null,
        fields: parents,
      }
    })
    .filter((section) => section.fields.length > 0)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))

  return { sections }
}

async function attachSectionIconUrls(schema) {
  const sections = await Promise.all((schema.sections || []).map(async (section) => {
    if (!section.icon_path) return section
    const { data, error } = await supabaseAdmin.storage
      .from('org-assets')
      .createSignedUrl(section.icon_path, 3600)
    if (error || !data?.signedUrl) return section
    return { ...section, icon_signed_url: data.signedUrl }
  }))
  return { sections }
}

function buildAllowedFieldsMap(schema) {
  const allowedFields = new Map()
  for (const section of schema.sections) {
    for (const field of section.fields) {
      allowedFields.set(field.id, field.field_type)
    }
  }
  return allowedFields
}

async function upsertWorkOrderValues(orgId, workOrderId, values, allowedFields) {
  const valueRows = []
  for (const [fieldId, raw] of Object.entries(values)) {
    if (!allowedFields.has(fieldId)) continue
    const fieldType = allowedFields.get(fieldId)
    const normalized = normalizeValue(fieldType, raw)
    if (normalized.value_text === null && normalized.value_json === null) continue
    valueRows.push({
      org_id: orgId,
      work_order_id: workOrderId,
      field_id: fieldId,
      ...normalized,
      updated_at: new Date().toISOString(),
    })
  }

  if (!valueRows.length) return 0

  const { error } = await supabaseAdmin
    .from('manual_work_order_values')
    .upsert(valueRows, { onConflict: 'work_order_id,field_id' })

  if (error) throw error
  return valueRows.length
}

function buildSettingsList(fields, settingsMap) {
  const enriched = enrichAssetFields(fields)
  const sections = enriched.filter((f) => f.kind === 'section' && f.is_active !== false)
  const parents = enriched.filter((f) => f.kind === 'parent' && f.is_active !== false)

  return sections
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    .map((section) => ({
      id: section.id,
      name: section.name,
      kind: 'section',
      is_visible: isFieldVisible(section, settingsMap),
      fields: parents
        .filter((p) => p.section_id === section.id)
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
        .map((parent) => ({
          id: parent.id,
          name: parent.name,
          kind: 'parent',
          field_type: parent.field_type,
          is_visible: isFieldVisible(parent, settingsMap),
        })),
    }))
}

async function getEmployeeByProfile(orgId, profileId) {
  const { data, error } = await supabaseAdmin
    .from('org_employees')
    .select('id, name, emp_id, email')
    .eq('org_id', orgId)
    .eq('profile_id', profileId)
    .eq('is_active', true)
    .maybeSingle()

  if (error) throw error
  return data
}

async function validateAssignedEmployees(orgId, rawIds) {
  const ids = Array.isArray(rawIds)
    ? rawIds
    : rawIds
      ? [rawIds]
      : []

  const unique = [...new Set(ids.filter(Boolean))]
  if (!unique.length) return []

  const { data, error } = await supabaseAdmin
    .from('org_employees')
    .select('id')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .in('id', unique)

  if (error) throw error
  if ((data || []).length !== unique.length) {
    throw new Error('One or more assigned employees are invalid')
  }
  return unique
}

async function syncWorkOrderAssignees(orgId, workOrderId, employeeIds) {
  const { error: deleteError } = await supabaseAdmin
    .from('manual_work_order_assignees')
    .delete()
    .eq('org_id', orgId)
    .eq('work_order_id', workOrderId)

  if (deleteError) throw deleteError
  if (!employeeIds.length) return

  const rows = employeeIds.map((employeeId) => ({
    org_id: orgId,
    work_order_id: workOrderId,
    employee_id: employeeId,
  }))

  const { error } = await supabaseAdmin
    .from('manual_work_order_assignees')
    .insert(rows)

  if (error) throw error
}

async function loadAssigneesForWorkOrders(orgId, workOrderIds) {
  if (!workOrderIds.length) return new Map()

  const { data, error } = await supabaseAdmin
    .from('manual_work_order_assignees')
    .select('work_order_id, employee_id, org_employees(id, name, emp_id, location_id, org_locations(id, name))')
    .eq('org_id', orgId)
    .in('work_order_id', workOrderIds)

  if (error) throw error

  const byWorkOrder = new Map()
  for (const row of data || []) {
    const employee = row.org_employees
    if (!employee) continue
    if (!byWorkOrder.has(row.work_order_id)) byWorkOrder.set(row.work_order_id, [])
    byWorkOrder.get(row.work_order_id).push(employee)
  }

  for (const list of byWorkOrder.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name))
  }

  return byWorkOrder
}

function shortWorkOrderId(id) {
  return String(id || '').slice(0, 8).toUpperCase()
}

async function attachSummaries(orgId, workOrders) {
  if (!workOrders.length) return workOrders

  const ids = workOrders.map((row) => row.id)
  const { data: values, error } = await supabaseAdmin
    .from('manual_work_order_values')
    .select('work_order_id, value_text, created_at')
    .eq('org_id', orgId)
    .in('work_order_id', ids)
    .not('value_text', 'is', null)
    .order('created_at')

  if (error) throw error

  const summaryByWo = new Map()
  for (const row of values || []) {
    if (!summaryByWo.has(row.work_order_id) && row.value_text) {
      summaryByWo.set(row.work_order_id, row.value_text.slice(0, 120))
    }
  }

  return workOrders.map((row) => ({
    ...row,
    wo_number: shortWorkOrderId(row.id),
    summary: summaryByWo.get(row.id) || 'Work order',
  }))
}

async function buildWorkOrderListResponse(orgId, rows) {
  if (!rows.length) return []

  const withSummaries = await attachSummaries(orgId, rows)
  const assigneesByWo = await loadAssigneesForWorkOrders(orgId, withSummaries.map((r) => r.id))
  const creatorIds = [...new Set(withSummaries.map((r) => r.created_by).filter(Boolean))]

  const { data: creators } = creatorIds.length
    ? await supabaseAdmin.from('profiles').select('id, email').in('id', creatorIds)
    : { data: [] }

  const creatorById = new Map((creators || []).map((c) => [c.id, c]))

  return withSummaries.map((row) => ({
    ...row,
    assignees: assigneesByWo.get(row.id) || [],
    creator: creatorById.get(row.created_by) || null,
  }))
}

async function listReceivedWorkOrders(orgId, profileId, { status = 'created' } = {}) {
  const employee = await getEmployeeByProfile(orgId, profileId)
  if (!employee) return []

  const { data: assignments, error: assignmentError } = await supabaseAdmin
    .from('manual_work_order_assignees')
    .select('work_order_id')
    .eq('org_id', orgId)
    .eq('employee_id', employee.id)

  if (assignmentError) throw assignmentError

  const workOrderIds = [...new Set((assignments || []).map((row) => row.work_order_id))]
  if (!workOrderIds.length) return []

  let query = supabaseAdmin
    .from('manual_work_orders')
    .select('id, status, created_at, updated_at, created_by')
    .eq('org_id', orgId)
    .in('id', workOrderIds)
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) throw error
  return buildWorkOrderListResponse(orgId, data || [])
}

async function listAssignedByMeWorkOrders(orgId, profileId, { status = 'created' } = {}) {
  const employee = await getEmployeeByProfile(orgId, profileId)
  const myEmployeeId = employee?.id

  let query = supabaseAdmin
    .from('manual_work_orders')
    .select('id, status, created_at, updated_at, created_by')
    .eq('org_id', orgId)
    .eq('created_by', profileId)
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)

  const { data: workOrders, error } = await query
  if (error) throw error
  if (!workOrders?.length) return []

  const assigneesByWo = await loadAssigneesForWorkOrders(
    orgId,
    workOrders.map((row) => row.id),
  )

  const filtered = workOrders.filter((wo) => {
    const assignees = assigneesByWo.get(wo.id) || []
    if (!assignees.length) return false
    if (!myEmployeeId) return true
    return assignees.some((a) => a.id !== myEmployeeId)
  })

  return buildWorkOrderListResponse(orgId, filtered)
}

async function loadAssignedByMeDetail(orgId, workOrderId, profileId) {
  const employee = await getEmployeeByProfile(orgId, profileId)
  const myEmployeeId = employee?.id

  const detail = await loadWorkOrderDetail(orgId, workOrderId)
  if (!detail) return null
  if (detail.created_by !== profileId) return null
  if (detail.status !== 'created') return null

  const assignees = detail.assignees || []
  if (!assignees.length) return null
  if (myEmployeeId && assignees.every((a) => a.id === myEmployeeId)) return null

  return detail
}

async function enrichWorkOrderRow(orgId, row, assigneesByWo = null) {
  const [withSummary] = await attachSummaries(orgId, [row])
  const assignees = assigneesByWo?.get(row.id)
    ?? (await loadAssigneesForWorkOrders(orgId, [row.id])).get(row.id)
    ?? []

  const creator = row.created_by
    ? await supabaseAdmin
      .from('profiles')
      .select('id, email')
      .eq('id', row.created_by)
      .maybeSingle()
      .then(({ data }) => data)
    : null

  return {
    ...withSummary,
    assignees,
    creator,
  }
}

async function loadWorkOrderDetail(orgId, workOrderId, { employeeId = null } = {}) {
  if (employeeId) {
    const { data: assignment, error: assignmentError } = await supabaseAdmin
      .from('manual_work_order_assignees')
      .select('id')
      .eq('org_id', orgId)
      .eq('work_order_id', workOrderId)
      .eq('employee_id', employeeId)
      .maybeSingle()

    if (assignmentError) throw assignmentError
    if (!assignment) return null
  }

  const { data: workOrder, error } = await supabaseAdmin
    .from('manual_work_orders')
    .select('*')
    .eq('org_id', orgId)
    .eq('id', workOrderId)
    .maybeSingle()

  if (error) throw error
  if (!workOrder) return null
  if (employeeId && workOrder.status !== 'created') return null

  const { data: values, error: valuesError } = await supabaseAdmin
    .from('manual_work_order_values')
    .select('*')
    .eq('org_id', orgId)
    .eq('work_order_id', workOrderId)

  if (valuesError) throw valuesError

  const fields = await loadOrgAssetFields(orgId)
  const fieldById = new Map(fields.map((f) => [f.id, f]))

  const sections = []
  const sectionMap = new Map()

  for (const field of fields.filter((f) => f.kind === 'section')) {
    sectionMap.set(field.id, { id: field.id, name: field.name, fields: [] })
  }

  for (const val of values || []) {
    const field = fieldById.get(val.field_id)
    if (!field || field.kind !== 'parent') continue

    const sectionId = field.section_id
    if (!sectionMap.has(sectionId)) continue

    sectionMap.get(sectionId).fields.push({
      id: field.id,
      name: field.name,
      field_type: field.field_type,
      value_text: val.value_text,
      value_json: val.value_json,
    })
  }

  for (const section of sectionMap.values()) {
    if (section.fields.length) sections.push(section)
  }

  const enriched = await enrichWorkOrderRow(orgId, workOrder)
  return { ...enriched, sections }
}

function normalizeValue(fieldType, raw) {
  if (raw === null || raw === undefined || raw === '') return { value_text: null, value_json: null }

  if (fieldType === 'checkbox') {
    const checked = Boolean(raw)
    return { value_text: checked ? 'true' : 'false', value_json: { checked } }
  }

  if (fieldType === 'number') {
    const num = Number(raw)
    if (Number.isNaN(num)) throw new Error('Invalid number value')
    return { value_text: String(num), value_json: { number: num } }
  }

  if (fieldType === 'file' || fieldType === 'image') {
    if (typeof raw === 'object' && raw !== null && raw.path) {
      return {
        value_text: raw.name || raw.path,
        value_json: {
          path: raw.path,
          name: raw.name || null,
          mime_type: raw.mime_type || null,
          size: raw.size ?? null,
          bucket: raw.bucket || 'work-order-assets',
        },
      }
    }
    return { value_text: null, value_json: null }
  }

  return { value_text: String(raw), value_json: null }
}

router.get('/manual/form', async (req, res) => {
  try {
    const orgId = req.userProfile.org_id
    const [fields, settingsMap] = await Promise.all([
      loadOrgAssetFields(orgId),
      loadFieldSettings(orgId),
    ])
    res.json(await attachSectionIconUrls(buildFormSchema(fields, settingsMap)))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/manual/form-settings', async (req, res) => {
  try {
    const orgId = req.userProfile.org_id
    const [fields, settingsMap] = await Promise.all([
      loadOrgAssetFields(orgId),
      loadFieldSettings(orgId),
    ])
    res.json({ sections: buildSettingsList(fields, settingsMap) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/manual/form-settings', canManage, async (req, res) => {
  const orgId = req.userProfile.org_id
  try {
    const updates = Array.isArray(req.body?.settings) ? req.body.settings : []
    if (!updates.length) {
      return res.status(400).json({ error: 'No settings provided' })
    }

    const fields = await loadOrgAssetFields(orgId)
    const validIds = new Set(
      fields
        .filter((f) => (f.kind === 'section' || f.kind === 'parent') && f.is_active !== false)
        .map((f) => f.id)
    )

    const now = new Date().toISOString()
    for (const item of updates) {
      if (!item?.field_id || !validIds.has(item.field_id)) {
        return res.status(400).json({ error: 'Invalid field in settings' })
      }

      const { error } = await supabaseAdmin
        .from('work_order_field_settings')
        .upsert({
          org_id: orgId,
          field_id: item.field_id,
          is_visible: Boolean(item.is_visible),
          updated_at: now,
        }, { onConflict: 'org_id,field_id' })

      if (error) return res.status(500).json({ error: error.message })
    }

    const settingsMap = await loadFieldSettings(orgId)
    res.json({ sections: buildSettingsList(fields, settingsMap) })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

router.post('/manual', async (req, res) => {
  const orgId = req.userProfile.org_id
  const userId = req.userProfile.id
  try {
    const status = req.body?.status === 'created' ? 'created' : 'draft'
    const values = req.body?.values && typeof req.body.values === 'object' ? req.body.values : {}

    const [fields, settingsMap] = await Promise.all([
      loadOrgAssetFields(orgId),
      loadFieldSettings(orgId),
    ])
    const schema = buildFormSchema(fields, settingsMap)
    const allowedFields = buildAllowedFieldsMap(schema)
    const assignedEmployeeIds = await validateAssignedEmployees(
      orgId,
      req.body?.assigned_employee_ids ?? req.body?.assigned_to ?? [],
    )

    const { data: workOrder, error: woError } = await supabaseAdmin
      .from('manual_work_orders')
      .insert({
        org_id: orgId,
        status,
        created_by: userId,
      })
      .select('*')
      .single()

    if (woError) return res.status(500).json({ error: woError.message })

    await syncWorkOrderAssignees(orgId, workOrder.id, assignedEmployeeIds)

    const valueCount = await upsertWorkOrderValues(orgId, workOrder.id, values, allowedFields)

    const assignees = (await loadAssigneesForWorkOrders(orgId, [workOrder.id])).get(workOrder.id) || []

    res.status(201).json({ ...workOrder, value_count: valueCount, assignees })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

router.patch('/manual/:id/values', assertOrgOwnership('manual_work_orders'), async (req, res) => {
  const orgId = req.userProfile.org_id
  try {
    const values = req.body?.values && typeof req.body.values === 'object' ? req.body.values : {}
    const [fields, settingsMap] = await Promise.all([
      loadOrgAssetFields(orgId),
      loadFieldSettings(orgId),
    ])
    const schema = buildFormSchema(fields, settingsMap)
    const allowedFields = buildAllowedFieldsMap(schema)
    const valueCount = await upsertWorkOrderValues(orgId, req.params.id, values, allowedFields)
    res.json({ id: req.params.id, value_count: valueCount })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

router.get('/counts', async (req, res) => {
  const orgId = req.userProfile.org_id
  const profileId = req.userProfile.id

  try {
    const employee = await getEmployeeByProfile(orgId, profileId)

    let received = 0
    if (employee) {
      const { data: assignments, error: assignmentError } = await supabaseAdmin
        .from('manual_work_order_assignees')
        .select('work_order_id')
        .eq('org_id', orgId)
        .eq('employee_id', employee.id)

      if (assignmentError) throw assignmentError

      const workOrderIds = [...new Set((assignments || []).map((row) => row.work_order_id))]
      if (workOrderIds.length) {
        const { count, error } = await supabaseAdmin
          .from('manual_work_orders')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', orgId)
          .in('id', workOrderIds)
          .eq('status', 'created')

        if (error) throw error
        received = count || 0
      }
    }

    const assignedRows = await listAssignedByMeWorkOrders(orgId, profileId)
    const assigned = assignedRows.length

    const { count: manualCount, error: manualError } = await supabaseAdmin
      .from('manual_work_orders')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'created')

    if (manualError) throw manualError

    res.json({
      received,
      assigned,
      scheduled: 0,
      manual: manualCount || 0,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/manual/orders', async (req, res) => {
  const orgId = req.userProfile.org_id
  try {
    const { data, error } = await supabaseAdmin
      .from('manual_work_orders')
      .select('id, status, created_at, updated_at, created_by')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })

    if (error) return res.status(500).json({ error: error.message })
    res.json(await buildWorkOrderListResponse(orgId, data || []))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/manual/orders/:id', async (req, res) => {
  const orgId = req.userProfile.org_id
  try {
    const detail = await loadWorkOrderDetail(orgId, req.params.id)
    if (!detail) return res.status(404).json({ error: 'Not found' })
    res.json(detail)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/assigned', async (req, res) => {
  const orgId = req.userProfile.org_id
  const profileId = req.userProfile.id
  try {
    const rows = await listAssignedByMeWorkOrders(orgId, profileId)
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/assigned/:id', async (req, res) => {
  const orgId = req.userProfile.org_id
  const profileId = req.userProfile.id
  try {
    const detail = await loadAssignedByMeDetail(orgId, req.params.id, profileId)
    if (!detail) return res.status(404).json({ error: 'Not found' })
    res.json(detail)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/scheduled', async (_req, res) => {
  res.json([])
})

router.get('/received', async (req, res) => {
  const orgId = req.userProfile.org_id
  const profileId = req.userProfile.id
  try {
    const rows = await listReceivedWorkOrders(orgId, profileId)
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/received/:id', async (req, res) => {
  const orgId = req.userProfile.org_id
  const profileId = req.userProfile.id
  try {
    const employee = await getEmployeeByProfile(orgId, profileId)
    if (!employee) return res.status(404).json({ error: 'Not found' })

    const detail = await loadWorkOrderDetail(orgId, req.params.id, {
      employeeId: employee.id,
    })
    if (!detail) return res.status(404).json({ error: 'Not found' })
    res.json(detail)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
