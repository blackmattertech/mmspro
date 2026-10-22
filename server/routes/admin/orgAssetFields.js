import { Router } from 'express'
import { supabaseAdmin } from '../../services/supabase.js'
import {
  loadOrgFields,
  getFieldById,
  createAssetField,
  updateAssetFieldActive,
  updateAssetFieldDropdownValues,
  updateAssetFieldSchema,
  deleteAssetField,
  reorderAssetSections,
  reorderAssetParents,
  isActiveOnlyUpdate,
  isDropdownValuesOnlyUpdate,
} from '../../lib/assetFieldService.js'
import {
  uploadSectionIconFile,
  deleteSectionIconFile,
} from '../../lib/sectionIconStorage.js'
import {
  buildSectionsTemplate,
  bulkImportSections,
  buildParentsTemplate,
  bulkImportParents,
  buildChildrenTemplate,
  bulkImportChildren,
} from '../../lib/assetFieldBulkService.js'
import { attachFailedFileToResult } from '../../lib/importErrorWorkbook.js'

const router = Router({ mergeParams: true })

function parseBulkFile(req) {
  const raw = req.body?.data
  if (!raw || typeof raw !== 'string') {
    const err = new Error('File data is required')
    err.status = 400
    throw err
  }
  const base64 = raw.includes(',') ? raw.split(',').pop() : raw
  const buffer = Buffer.from(base64, 'base64')
  if (!buffer.length) {
    const err = new Error('File data is invalid')
    err.status = 400
    throw err
  }
  return buffer
}

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

router.get('/template/sections', async (req, res) => {
  try {
    const buffer = await buildSectionsTemplate(req.params.orgId)
    res.json({
      filename: 'sections-template.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      data: buffer.toString('base64'),
    })
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.get('/template/parents', async (req, res) => {
  try {
    const buffer = await buildParentsTemplate(req.params.orgId)
    res.json({
      filename: 'parent-fields-template.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      data: buffer.toString('base64'),
    })
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.post('/bulk/sections', async (req, res) => {
  try {
    const buffer = parseBulkFile(req)
    const result = await bulkImportSections(req.params.orgId, buffer)
    res.json(await attachFailedFileToResult(result, buffer, 'sections-import-failed-rows.xlsx'))
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.post('/bulk/parents', async (req, res) => {
  try {
    const buffer = parseBulkFile(req)
    const result = await bulkImportParents(req.params.orgId, buffer)
    res.json(await attachFailedFileToResult(result, buffer, 'parent-fields-import-failed-rows.xlsx'))
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.get('/template/children', async (req, res) => {
  try {
    const buffer = await buildChildrenTemplate(req.params.orgId)
    res.json({
      filename: 'child-values-template.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      data: buffer.toString('base64'),
    })
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.post('/bulk/children', async (req, res) => {
  try {
    const buffer = parseBulkFile(req)
    const result = await bulkImportChildren(req.params.orgId, buffer)
    res.json(await attachFailedFileToResult(result, buffer, 'child-values-import-failed-rows.xlsx'))
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

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
      const fields = await reorderAssetSections(req.params.orgId, ids)
      return res.json(fields)
    }
    if (kind === 'parent') {
      const fields = await reorderAssetParents(req.params.orgId, sectionId, ids)
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
    const field = await createAssetField(req.params.orgId, req.body)
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
      const field = await updateAssetFieldActive(orgId, req.params.id, req.body.is_active)
      return res.json(field)
    }

    if (existing.kind === 'child') {
      return res.status(400).json({ error: 'Edit child values from their option parent field' })
    }

    if (isDropdownValuesOnlyUpdate(req.body)) {
      const field = await updateAssetFieldDropdownValues(
        orgId,
        req.params.id,
        req.body.dropdown_options,
      )
      return res.json(field)
    }

    const field = await updateAssetFieldSchema(orgId, req.params.id, req.body)
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
    const field = await updateAssetFieldSchema(orgId, existing.id, { icon_path: path })
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
    const field = await updateAssetFieldSchema(orgId, existing.id, { icon_path: null })
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

    const result = await deleteAssetField(req.params.orgId, req.params.id)
    res.json(result)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

export default router
