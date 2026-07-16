import { Router } from 'express'
import { verifyAuth } from '../../middleware/auth.js'
import { requireOrgAccess, assertOrgOwnership } from '../../middleware/orgAccess.js'
import {
  requireModulePermission,
  loadOrgPermissions,
} from '../../middleware/modulePermission.js'
import { isCompanyAdmin } from '../../lib/accountRoles.js'
import { hasModulePermission } from '../../lib/orgPermissions.js'
import {
  loadOrgFields,
  getFieldById,
  createAssetField,
  updateAssetFieldActive,
  updateAssetFieldDropdownValues,
  updateAssetFieldSchema,
  deleteAssetField,
  reorderAssetSections,
  isActiveOnlyUpdate,
  isDropdownValuesOnlyUpdate,
} from '../../lib/assetFieldService.js'

const router = Router()

const canReadAssets = requireModulePermission('assets', 'read')
const canCreateAssets = requireModulePermission('assets', 'create')
const canUpdateAssets = requireModulePermission('assets', 'update')
const canDeleteAssets = requireModulePermission('assets', 'delete')

router.use(verifyAuth, requireOrgAccess, loadOrgPermissions)

/** Schema is managed from the Super Admin panel per organization. */
function canManageAssetSchema() {
  return false
}

/** Company admin or users with assets update manage dropdown child values. */
function canManageAssetChildren(req) {
  const { userProfile } = req
  if (isCompanyAdmin(userProfile?.role)) return true
  return hasModulePermission(req.orgPermissions, 'assets', 'update')
}

router.get('/fields', canReadAssets, async (req, res) => {
  try {
    const fields = await loadOrgFields(req.userProfile.org_id)
    res.json(fields)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/fields/reorder', canUpdateAssets, async (req, res) => {
  if (!canManageAssetSchema()) {
    return res.status(403).json({ error: 'Section layout is managed from the Super Admin panel' })
  }

  const { kind, ids } = req.body
  if (kind !== 'section') {
    return res.status(400).json({ error: 'kind must be "section"' })
  }

  try {
    const fields = await reorderAssetSections(req.userProfile.org_id, ids)
    res.json(fields)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.get('/fields/:id', canReadAssets, assertOrgOwnership('asset_fields'), async (req, res) => {
  try {
    const field = await getFieldById(req.userProfile.org_id, req.params.id)
    if (!field) return res.status(404).json({ error: 'Field not found' })
    res.json(field)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/fields', canCreateAssets, async (req, res) => {
  if (!canManageAssetSchema()) {
    return res.status(403).json({
      error: 'Sections and parent fields are created from the Super Admin panel for each organization',
    })
  }

  try {
    const field = await createAssetField(req.userProfile.org_id, req.body)
    res.status(201).json(field)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

router.patch('/fields/:id', canUpdateAssets, assertOrgOwnership('asset_fields'), async (req, res) => {
  const orgId = req.userProfile.org_id
  try {
    const existing = await getFieldById(orgId, req.params.id)
    if (!existing) return res.status(404).json({ error: 'Field not found' })

    if (isActiveOnlyUpdate(req.body)) {
      const allowed = existing.kind === 'child'
        ? canManageAssetChildren(req)
        : canManageAssetSchema()
      if (!allowed) {
        return res.status(403).json({
          error: existing.kind === 'child'
            ? 'You do not have permission to change child values'
            : 'Section and parent fields are managed from the Super Admin panel',
        })
      }
      const field = await updateAssetFieldActive(orgId, req.params.id, req.body.is_active)
      return res.json(field)
    }

    if (isDropdownValuesOnlyUpdate(req.body)) {
      if (!canManageAssetChildren(req)) {
        return res.status(403).json({ error: 'Only company users can manage dropdown child values' })
      }
      const field = await updateAssetFieldDropdownValues(orgId, req.params.id, req.body.dropdown_options)
      return res.json(field)
    }

    if (!canManageAssetSchema()) {
      return res.status(403).json({ error: 'Section and parent fields are managed from the Super Admin panel' })
    }

    const field = await updateAssetFieldSchema(orgId, req.params.id, req.body)
    res.json(field)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.delete('/fields/:id', canDeleteAssets, assertOrgOwnership('asset_fields'), async (req, res) => {
  const orgId = req.userProfile.org_id
  try {
    const existing = await getFieldById(orgId, req.params.id)
    if (!existing) return res.status(404).json({ error: 'Field not found' })

    if (existing.kind === 'child') {
      if (!canManageAssetChildren(req)) {
        return res.status(403).json({ error: 'You do not have permission to delete child values' })
      }
    } else if (!canManageAssetSchema()) {
      return res.status(403).json({ error: 'Section and parent fields are managed from the Super Admin panel' })
    }

    const result = await deleteAssetField(orgId, req.params.id)
    res.json(result)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

export default router
