import { Router } from 'express'
import { verifyAuth } from '../../middleware/auth.js'
import { requireOrgAccess, assertOrgOwnership } from '../../middleware/orgAccess.js'
import {
  requireModulePermission,
  loadOrgPermissions,
} from '../../middleware/modulePermission.js'
import {
  listWarranties,
  getWarrantyDetail,
  createWarranty,
  updateWarranty,
  deleteWarranty,
  addWarrantyDocument,
  updateWarrantyDocumentLabel,
  deleteWarrantyDocument,
} from '../../lib/warrantyService.js'

const router = Router()

const canRead = requireModulePermission('warranty_manager', 'read')
const canCreate = requireModulePermission('warranty_manager', 'create')
const canUpdate = requireModulePermission('warranty_manager', 'update')
const canDelete = requireModulePermission('warranty_manager', 'delete')

router.use(verifyAuth, requireOrgAccess, loadOrgPermissions)

function parsePagination(query) {
  const rawLimit = Number(query.limit)
  const rawOffset = Number(query.offset)
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(200, rawLimit)) : 100
  const offset = Number.isFinite(rawOffset) ? Math.max(0, rawOffset) : 0
  return { limit, offset }
}

router.get('/', canRead, async (req, res) => {
  try {
    const { limit, offset } = parsePagination(req.query)
    const rows = await listWarranties(req.userProfile.org_id, {
      search: req.query.search || null,
      limit,
      offset,
    })
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/:id', canRead, assertOrgOwnership('warranties'), async (req, res) => {
  try {
    const row = await getWarrantyDetail(req.userProfile.org_id, req.params.id)
    if (!row) return res.status(404).json({ error: 'Warranty not found' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/', canCreate, async (req, res) => {
  try {
    const row = await createWarranty(req.userProfile.org_id, req.body)
    res.status(201).json(row)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.patch('/:id', canUpdate, assertOrgOwnership('warranties'), async (req, res) => {
  try {
    const row = await updateWarranty(req.userProfile.org_id, req.params.id, req.body)
    res.json(row)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.delete('/:id', canDelete, assertOrgOwnership('warranties'), async (req, res) => {
  try {
    const result = await deleteWarranty(req.userProfile.org_id, req.params.id)
    res.json(result)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.post('/:id/documents', canUpdate, assertOrgOwnership('warranties'), async (req, res) => {
  try {
    const row = await addWarrantyDocument(req.userProfile.org_id, req.params.id, req.body)
    res.status(201).json(row)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.patch('/:id/documents/:documentId', canUpdate, assertOrgOwnership('warranties'), async (req, res) => {
  try {
    const row = await updateWarrantyDocumentLabel(
      req.userProfile.org_id,
      req.params.id,
      req.params.documentId,
      req.body.label,
    )
    res.json(row)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.delete('/:id/documents/:documentId', canUpdate, assertOrgOwnership('warranties'), async (req, res) => {
  try {
    const result = await deleteWarrantyDocument(
      req.userProfile.org_id,
      req.params.id,
      req.params.documentId,
    )
    res.json(result)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

export default router
