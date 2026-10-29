import { Router } from 'express'
import {
  listUniqueDefaultForms,
  listUniqueDefaultHierarchies,
  setDefaultFormFromOrg,
  setDefaultHierarchyFromOrg,
} from '../../lib/platformDefaultLibrary.js'

const router = Router()

router.get('/forms', async (_req, res) => {
  try {
    const payload = await listUniqueDefaultForms()
    res.json(payload)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.post('/forms', async (req, res) => {
  try {
    const row = await setDefaultFormFromOrg(req.body?.form_id, req.body?.source_org_id)
    res.json(row)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.get('/hierarchies', async (_req, res) => {
  try {
    const payload = await listUniqueDefaultHierarchies()
    res.json(payload)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.post('/hierarchies', async (req, res) => {
  try {
    const row = await setDefaultHierarchyFromOrg(req.body?.source_org_id)
    res.json(row)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

export default router
