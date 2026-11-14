import { Router } from 'express'
import { assertOrgOwnership } from '../../middleware/orgAccess.js'
import {
  requireAnyModulePermission,
  requireModulePermission,
} from '../../middleware/modulePermission.js'
import { supabaseAdmin } from '../../services/supabase.js'
import {
  applyIlikeSearch,
  applyMappedFilters,
  applyMappedSort,
  exportLimit,
  listEnvelope,
  parseListControls,
  sendCsv,
} from '../../lib/listQuery.js'
import {
  normalizeUomCode,
  normalizeUomName,
} from '../../lib/uomMaster.js'
import { buildUomsTemplate, importUoms } from '../../lib/uomBulkService.js'

const router = Router()

const canReadUoms = requireAnyModulePermission([
  ['uoms', 'read'],
  ['work_orders', 'read'],
  ['work_orders', 'create'],
  ['work_orders', 'update'],
  ['work_orders_received', 'read'],
  ['work_orders_received', 'update'],
  ['work_orders_assigned', 'read'],
  ['work_orders_assigned', 'update'],
  ['work_orders_manual', 'read'],
  ['work_orders_manual', 'create'],
  ['work_orders_manual', 'update'],
  ['work_orders_scheduled', 'read'],
  ['work_orders_scheduled', 'update'],
])
const canCreateUoms = requireModulePermission('uoms', 'create')
const canUpdateUoms = requireModulePermission('uoms', 'update')
const canDeleteUoms = requireModulePermission('uoms', 'delete')

const UOM_SELECT = 'id, org_id, code, name, is_active, created_at, updated_at'

function parsePagination(query, { defaultLimit = 50, maxLimit = 500 } = {}) {
  const rawLimit = Number(query.limit)
  const rawOffset = Number(query.offset)
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(maxLimit, rawLimit))
    : defaultLimit
  const offset = Number.isFinite(rawOffset) ? Math.max(0, rawOffset) : 0
  return { limit, offset }
}

function sendUomError(res, error) {
  if (error?.code === '23505') {
    return res.status(400).json({ error: 'This UOM code already exists' })
  }
  if (error?.code === '42P01') {
    return res.status(500).json({ error: 'UOM master is not set up yet. Apply the UOM master database patch.' })
  }
  return res.status(error?.status || 500).json({ error: error?.message || 'UOM request failed' })
}

function applyUomStatus(query, value) {
  if (value === 'active') return query.eq('is_active', true)
  if (value === 'inactive') return query.eq('is_active', false)
  return query
}

router.get('/', canReadUoms, async (req, res) => {
  const controls = parseListControls(req.query)
  const { limit, offset } = parsePagination(req.query)
  const page = exportLimit(controls, { limit, offset })
  const activeOnly = req.query.active === '1' || req.query.active === 'true'
  let query = supabaseAdmin
    .from('org_uoms')
    .select(UOM_SELECT, { count: 'exact' })
    .eq('org_id', req.userProfile.org_id)

  if (activeOnly) query = query.eq('is_active', true)
  query = applyIlikeSearch(query, req.query.search, ['code', 'name'])
  query = applyMappedFilters(query, controls.filters, {
    code: 'code',
    name: 'name',
    status: applyUomStatus,
  })
  query = applyMappedSort(query, controls.sort, controls.sortDir, {
    code: 'code',
    name: 'name',
    created_at: 'created_at',
  }, (sorted) => sorted.order('code'))
  query = query.range(page.offset, page.offset + page.limit - 1)

  const { data, error, count } = await query
  if (error) return sendUomError(res, error)
  if (controls.exportCsv) {
    sendCsv(res, 'uoms.csv', data || [], [
      { label: 'Code', value: (row) => row.code },
      { label: 'Name', value: (row) => row.name },
      { label: 'Active', value: (row) => (row.is_active === false ? 'No' : 'Yes') },
      { label: 'Created', value: (row) => row.created_at },
      { label: 'Updated', value: (row) => row.updated_at },
    ])
    return
  }
  res.json(listEnvelope(data || [], { total: count || 0, limit: page.limit, offset: page.offset }))
})

router.get('/template', canCreateUoms, async (req, res) => {
  try {
    const buffer = await buildUomsTemplate()
    res.json({
      filename: 'uoms-template.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      data: buffer.toString('base64'),
    })
  } catch (err) {
    sendUomError(res, err)
  }
})

router.post('/bulk', canCreateUoms, async (req, res) => {
  try {
    const raw = req.body?.data
    if (!raw || typeof raw !== 'string') {
      return res.status(400).json({ error: 'File data is required' })
    }
    const base64 = raw.includes(',') ? raw.split(',').pop() : raw
    const buffer = Buffer.from(base64, 'base64')
    if (!buffer.length) return res.status(400).json({ error: 'File data is invalid' })
    const result = await importUoms(req.userProfile.org_id, buffer)
    res.json(result)
  } catch (err) {
    sendUomError(res, err)
  }
})

router.post('/', canCreateUoms, async (req, res) => {
  try {
    const code = normalizeUomCode(req.body?.code)
    const name = normalizeUomName(req.body?.name)
    const { data, error } = await supabaseAdmin
      .from('org_uoms')
      .insert({
        org_id: req.userProfile.org_id,
        code,
        name,
        is_active: req.body?.is_active === undefined ? true : Boolean(req.body.is_active),
      })
      .select(UOM_SELECT)
      .single()
    if (error) return sendUomError(res, error)
    res.status(201).json(data)
  } catch (err) {
    sendUomError(res, err)
  }
})

router.patch('/:id', canUpdateUoms, assertOrgOwnership('org_uoms'), async (req, res) => {
  try {
    const updates = { updated_at: new Date().toISOString() }
    if (req.body?.code !== undefined) updates.code = normalizeUomCode(req.body.code)
    if (req.body?.name !== undefined) updates.name = normalizeUomName(req.body.name)
    if (req.body?.is_active !== undefined) updates.is_active = Boolean(req.body.is_active)

    const { data, error } = await supabaseAdmin
      .from('org_uoms')
      .update(updates)
      .eq('id', req.params.id)
      .eq('org_id', req.userProfile.org_id)
      .select(UOM_SELECT)
      .single()

    if (error) return sendUomError(res, error)
    if (!data) return res.status(404).json({ error: 'UOM not found' })
    res.json(data)
  } catch (err) {
    sendUomError(res, err)
  }
})

router.delete('/:id', canDeleteUoms, assertOrgOwnership('org_uoms'), async (req, res) => {
  const { error } = await supabaseAdmin
    .from('org_uoms')
    .delete()
    .eq('id', req.params.id)
    .eq('org_id', req.userProfile.org_id)

  if (error) return sendUomError(res, error)
  res.json({ id: req.params.id, deleted: true })
})

export default router
