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
  updateEquipmentFieldDropdownValues,
  updateEquipmentFieldActive,
  isActiveOnlyUpdate,
  isDropdownValuesOnlyUpdate,
} from '../../lib/equipmentFieldService.js'

const router = Router()

const canRead = requireModulePermission('equipment', 'read')
const canUpdate = requireModulePermission('equipment', 'update')

router.use(verifyAuth, requireOrgAccess, loadOrgPermissions)

function canManageChildren(req) {
  if (isCompanyAdmin(req.userProfile?.role)) return true
  return hasModulePermission(req.orgPermissions, 'equipment', 'update')
}

router.get('/', canRead, async (req, res) => {
  try {
    const fields = await loadOrgFields(req.userProfile.org_id)
    res.json(fields)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.patch('/:id', canUpdate, assertOrgOwnership('equipment_fields'), async (req, res) => {
  const orgId = req.userProfile.org_id
  try {
    const existing = await getFieldById(orgId, req.params.id)
    if (!existing) return res.status(404).json({ error: 'Field not found' })

    if (isActiveOnlyUpdate(req.body)) {
      if (existing.kind !== 'child' || !canManageChildren(req)) {
        return res.status(403).json({
          error: 'Equipment field schema is managed from the Super Admin panel',
        })
      }
      const field = await updateEquipmentFieldActive(orgId, req.params.id, req.body.is_active)
      return res.json(field)
    }

    if (isDropdownValuesOnlyUpdate(req.body)) {
      if (!canManageChildren(req)) {
        return res.status(403).json({ error: 'Only company users can manage dropdown child values' })
      }
      const field = await updateEquipmentFieldDropdownValues(
        orgId,
        req.params.id,
        req.body.dropdown_options,
      )
      return res.json(field)
    }

    return res.status(403).json({
      error: 'Equipment field schema is managed from the Super Admin panel',
    })
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

export default router
