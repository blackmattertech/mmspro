import { Router } from 'express'
import { verifyAuth } from '../../middleware/auth.js'
import { requireOrgAccess, assertOrgOwnership } from '../../middleware/orgAccess.js'
import { requireModulePermission } from '../../middleware/modulePermission.js'
import {
  listVendors,
  getVendorDetail,
  createVendor,
  updateVendor,
  deleteVendor,
  previewNextVendorCode,
} from '../../lib/vendorService.js'
import { buildVendorsTemplate, bulkImportVendors } from '../../lib/vendorBulkService.js'
import { attachFailedFileToResult } from '../../lib/importErrorWorkbook.js'
import { parseListControls } from '../../lib/listQuery.js'

const router = Router()
const canCreate = requireModulePermission('vendors', 'create')
const canUpdate = requireModulePermission('vendors', 'update')
const canDelete = requireModulePermission('vendors', 'delete')

router.use(verifyAuth, requireOrgAccess, requireModulePermission('vendors', 'read'))

function parsePagination(query) {
  const rawLimit = Number(query.limit)
  const rawOffset = Number(query.offset)
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(200, rawLimit)) : 100
  const offset = Number.isFinite(rawOffset) ? Math.max(0, rawOffset) : 0
  return { limit, offset }
}

router.get('/next-code', async (req, res) => {
  try {
    const code = await previewNextVendorCode(req.userProfile.org_id)
    res.json({ vendor_code: code })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/', async (req, res) => {
  try {
    const { limit, offset } = parsePagination(req.query)
    const controls = parseListControls(req.query)
    const rows = await listVendors(req.userProfile.org_id, {
      search: req.query.search || null,
      filters: controls.filters,
      limit,
      offset,
    })
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/template', canCreate, async (req, res) => {
  try {
    const buffer = await buildVendorsTemplate()
    res.json({
      filename: 'vendor-master-template.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      data: buffer.toString('base64'),
    })
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.post('/bulk', canCreate, async (req, res) => {
  try {
    const raw = req.body?.data
    if (!raw || typeof raw !== 'string') {
      return res.status(400).json({ error: 'File data is required' })
    }
    const base64 = raw.includes(',') ? raw.split(',').pop() : raw
    const buffer = Buffer.from(base64, 'base64')
    if (!buffer.length) {
      return res.status(400).json({ error: 'File data is invalid' })
    }
    const result = await bulkImportVendors(req.userProfile.org_id, buffer)
    const payload = await attachFailedFileToResult(result, buffer, 'vendor-master-import-failed-rows.xlsx')
    res.json(payload)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.get('/:id', assertOrgOwnership('vendors'), async (req, res) => {
  try {
    const row = await getVendorDetail(req.userProfile.org_id, req.params.id)
    if (!row) return res.status(404).json({ error: 'Vendor not found' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/', canCreate, async (req, res) => {
  try {
    const row = await createVendor(req.userProfile.org_id, req.body)
    res.status(201).json(row)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.patch('/:id', canUpdate, assertOrgOwnership('vendors'), async (req, res) => {
  try {
    const row = await updateVendor(req.userProfile.org_id, req.params.id, req.body)
    res.json(row)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.delete('/:id', canDelete, assertOrgOwnership('vendors'), async (req, res) => {
  try {
    const result = await deleteVendor(req.userProfile.org_id, req.params.id)
    res.json(result)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

export default router
