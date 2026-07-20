import { Router } from 'express'
import { supabaseAdmin } from '../../services/supabase.js'
import {
  loadOrgFields,
  getFieldById,
  createEquipmentField,
  updateEquipmentFieldActive,
  updateEquipmentFieldDropdownValues,
  updateEquipmentFieldSchema,
  deleteEquipmentField,
  reorderEquipmentSections,
  reorderEquipmentParents,
  isActiveOnlyUpdate,
  isDropdownValuesOnlyUpdate,
} from '../../lib/equipmentFieldService.js'
import {
  uploadSectionIconFile,
  deleteSectionIconFile,
} from '../../lib/sectionIconStorage.js'

const router = Router({ mergeParams: true })

async function requireOrg(req, res, next) {
  const { orgId } = req.params
  const { data, error } = await supabaseAdmin
    .from('organizations')
    .select('id, name, slug')
    .eq('id', orgId)
    .maybeSingle()

  if (error) return res.status(500).json({ error: error.message })
  if (!data) return res.status(404).json({ error: 'Organization not found' })

  req.adminOrg = data
  next()
}

router.use(requireOrg)

router.get('/', async (req, res) => {
  try {
    const fields = await loadOrgFields(req.params.orgId)
    res.json(fields)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/reorder', async (req, res) => {
  const { kind, ids, section_id: sectionId } = req.body
  try {
    if (kind === 'section') {
      const fields = await reorderEquipmentSections(req.params.orgId, ids)
      return res.json(fields)
    }
    if (kind === 'parent') {
      const fields = await reorderEquipmentParents(req.params.orgId, sectionId, ids)
      return res.json(fields)
    }
    return res.status(400).json({ error: 'kind must be "section" or "parent"' })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const field = await getFieldById(req.params.orgId, req.params.id)
    if (!field) return res.status(404).json({ error: 'Field not found' })
    res.json(field)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/', async (req, res) => {
  try {
    const field = await createEquipmentField(req.params.orgId, req.body)
    res.status(201).json(field)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

router.patch('/:id', async (req, res) => {
  const orgId = req.params.orgId
  try {
    const existing = await getFieldById(orgId, req.params.id)
    if (!existing) return res.status(404).json({ error: 'Field not found' })

    if (isActiveOnlyUpdate(req.body)) {
      const field = await updateEquipmentFieldActive(orgId, req.params.id, req.body.is_active)
      return res.json(field)
    }

    if (existing.kind === 'child') {
      return res.status(400).json({ error: 'Edit child values from their option parent field' })
    }

    if (isDropdownValuesOnlyUpdate(req.body)) {
      const field = await updateEquipmentFieldDropdownValues(
        orgId,
        req.params.id,
        req.body.dropdown_options,
      )
      return res.json(field)
    }

    const field = await updateEquipmentFieldSchema(orgId, req.params.id, req.body)
    res.json(field)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.post('/:id/icon', async (req, res) => {
  const orgId = req.params.orgId
  try {
    const existing = await getFieldById(orgId, req.params.id)
    if (!existing) return res.status(404).json({ error: 'Field not found' })
    if (existing.kind !== 'section') {
      return res.status(400).json({ error: 'Icons can only be uploaded for sections' })
    }

    if (existing.icon_path) {
      await deleteSectionIconFile(existing.icon_path).catch(() => {})
    }

    const path = await uploadSectionIconFile(orgId, existing.id, req.body || {})
    const field = await updateEquipmentFieldSchema(orgId, existing.id, { icon_path: path })
    res.json(field)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.delete('/:id/icon', async (req, res) => {
  const orgId = req.params.orgId
  try {
    const existing = await getFieldById(orgId, req.params.id)
    if (!existing) return res.status(404).json({ error: 'Field not found' })
    if (existing.kind !== 'section') {
      return res.status(400).json({ error: 'Icons can only be removed from sections' })
    }

    if (existing.icon_path) {
      await deleteSectionIconFile(existing.icon_path).catch(() => {})
    }
    const field = await updateEquipmentFieldSchema(orgId, existing.id, { icon_path: null })
    res.json(field)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const existing = await getFieldById(req.params.orgId, req.params.id)
    if (!existing) return res.status(404).json({ error: 'Field not found' })
    if (existing.kind === 'child') {
      return res.status(400).json({ error: 'Child values are managed by the company from their org app' })
    }

    const result = await deleteEquipmentField(req.params.orgId, req.params.id)
    res.json(result)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

export default router
