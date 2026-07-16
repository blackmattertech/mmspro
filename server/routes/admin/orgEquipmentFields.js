import { Router } from 'express'
import { supabaseAdmin } from '../../services/supabase.js'
import {
  loadOrgFields,
  getFieldById,
  createEquipmentField,
  updateEquipmentFieldActive,
  updateEquipmentFieldSchema,
  deleteEquipmentField,
  reorderEquipmentSections,
  isActiveOnlyUpdate,
} from '../../lib/equipmentFieldService.js'

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
  const { kind, ids } = req.body
  if (kind !== 'section') {
    return res.status(400).json({ error: 'kind must be "section"' })
  }

  try {
    const fields = await reorderEquipmentSections(req.params.orgId, ids)
    res.json(fields)
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

    if (existing.kind === 'child') {
      return res.status(400).json({ error: 'Child values are managed by the company from their org app' })
    }

    if (isActiveOnlyUpdate(req.body)) {
      const field = await updateEquipmentFieldActive(orgId, req.params.id, req.body.is_active)
      return res.json(field)
    }

    if (req.body.dropdown_options !== undefined) {
      return res.status(400).json({
        error: 'Dropdown child values are managed by the company. Define the dropdown parent field only.',
      })
    }

    const field = await updateEquipmentFieldSchema(orgId, req.params.id, req.body)
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
