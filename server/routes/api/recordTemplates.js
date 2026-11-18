import { Router } from 'express'
import { verifyAuth } from '../../middleware/auth.js'
import { requireOrgAccess } from '../../middleware/orgAccess.js'
import { loadOrgPermissions } from '../../middleware/modulePermission.js'
import { hasAnyModulePermission } from '../../lib/orgPermissions.js'
import { isRecordTemplateModuleKey, recordTemplateModule } from '../../../shared/recordTemplates.js'
import {
  applyRecordTemplate,
  createRecordTemplate,
  deleteRecordTemplate,
  getRecordTemplate,
  listRecordTemplates,
  renameRecordTemplate,
} from '../../lib/recordTemplateService.js'

const router = Router()

router.use(verifyAuth, requireOrgAccess, loadOrgPermissions)

function fail(res, error) {
  const status = error?.status || 500
  return res.status(status).json({ error: error?.message || 'Record template request failed' })
}

function requireModuleCreate(req, res, next) {
  const moduleKey = String(req.query.module_key || req.body?.module_key || req.template?.module_key || '')
  const meta = recordTemplateModule(moduleKey)
  if (!meta) {
    return res.status(400).json({ error: 'module_key is required and must be a supported module' })
  }
  const checks = meta.permissionKeys.map((key) => [key, 'create'])
  if (!hasAnyModulePermission(req.orgPermissions, checks)) {
    return res.status(403).json({
      error: `You do not have permission to create ${meta.label.toLowerCase()} templates`,
    })
  }
  req.templateModuleKey = moduleKey
  next()
}

async function loadTemplateParam(req, res, next) {
  try {
    const template = await getRecordTemplate(req.userProfile.org_id, req.params.id)
    req.template = template
    const meta = recordTemplateModule(template.module_key)
    const checks = (meta?.permissionKeys || []).map((key) => [key, 'create'])
    if (!hasAnyModulePermission(req.orgPermissions, checks)) {
      return res.status(403).json({ error: 'You do not have permission for this template' })
    }
    next()
  } catch (error) {
    fail(res, error)
  }
}

router.get('/', requireModuleCreate, async (req, res) => {
  try {
    res.json({
      templates: await listRecordTemplates(req.userProfile.org_id, req.templateModuleKey),
    })
  } catch (error) {
    fail(res, error)
  }
})

router.post('/', requireModuleCreate, async (req, res) => {
  try {
    if (!isRecordTemplateModuleKey(req.body?.module_key)) {
      return res.status(400).json({ error: 'Invalid module_key' })
    }
    const template = await createRecordTemplate(
      req.userProfile.org_id,
      req.userProfile.id,
      req.body || {},
    )
    res.status(201).json(template)
  } catch (error) {
    fail(res, error)
  }
})

router.get('/:id', loadTemplateParam, async (req, res) => {
  res.json(req.template)
})

router.get('/:id/apply', loadTemplateParam, async (req, res) => {
  try {
    res.json(await applyRecordTemplate(req.userProfile.org_id, req.params.id))
  } catch (error) {
    fail(res, error)
  }
})

router.patch('/:id', loadTemplateParam, async (req, res) => {
  try {
    res.json(await renameRecordTemplate(
      req.userProfile.org_id,
      req.userProfile.id,
      req.params.id,
      req.body?.name,
    ))
  } catch (error) {
    fail(res, error)
  }
})

router.delete('/:id', loadTemplateParam, async (req, res) => {
  try {
    res.json(await deleteRecordTemplate(req.userProfile.org_id, req.params.id))
  } catch (error) {
    fail(res, error)
  }
})

export default router
