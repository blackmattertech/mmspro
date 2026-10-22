import { Router } from 'express'
import { supabaseAdmin } from '../../services/supabase.js'
import {
  MODULE_FORM_GROUPS,
  publicFormMeta,
} from '../../lib/formRegistry.js'
import {
  buildFormLayoutPayload,
  listSavedFormLayouts,
  saveOrgFormLayout,
} from '../../lib/orgFormLayouts.js'
import {
  getPlatformFormDefaultMeta,
  listPlatformFormDefaultMeta,
  markFormAsDefault,
  publicDefaultMeta,
} from '../../lib/platformFormDefaults.js'

const router = Router({ mergeParams: true })

async function requireOrg(req, res, next) {
  const { orgId } = req.params
  const { data, error } = await supabaseAdmin
    .from('organizations')
    .select('id, name, slug, disabled_modules')
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
    const [saved, defaults] = await Promise.all([
      listSavedFormLayouts(req.params.orgId),
      listPlatformFormDefaultMeta(),
    ])
    const savedById = new Map(saved.map((row) => [row.form_id, row]))
    const defaultById = new Map(defaults.map((row) => [row.form_id, row]))
    res.json({
      modules: MODULE_FORM_GROUPS.map((group) => ({
        moduleId: group.moduleId,
        label: group.label,
        info: group.info || null,
        forms: group.forms.map((item) => ({
          ...publicFormMeta({ ...item, moduleId: group.moduleId, moduleLabel: group.label }),
          hasLayout: savedById.has(item.formId),
          updated_at: savedById.get(item.formId)?.updated_at || null,
          hasPlatformDefault: defaultById.has(item.formId),
          platformDefault: publicDefaultMeta(defaultById.get(item.formId), req.params.orgId),
        })),
      })),
    })
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.get('/:formId', async (req, res) => {
  try {
    const payload = await buildFormLayoutPayload(req.params.orgId, req.params.formId)
    const platformDefault = await getPlatformFormDefaultMeta(req.params.formId)
    res.json({
      ...payload,
      platformDefault: publicDefaultMeta(platformDefault, req.params.orgId),
    })
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.post('/:formId/default', async (req, res) => {
  try {
    await markFormAsDefault(req.params.orgId, req.params.formId)
    const payload = await buildFormLayoutPayload(req.params.orgId, req.params.formId)
    const platformDefault = await getPlatformFormDefaultMeta(req.params.formId)
    res.json({
      ...payload,
      platformDefault: publicDefaultMeta(platformDefault, req.params.orgId),
    })
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.put('/:formId', async (req, res) => {
  try {
    const payload = await saveOrgFormLayout(req.params.orgId, req.params.formId, req.body?.layout)
    res.json(payload)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

export default router
