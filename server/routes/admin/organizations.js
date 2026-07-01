import { Router } from 'express'
import { supabaseAdmin } from '../../services/supabase.js'
import { generateOrgSlug, ensureUniqueSlug } from '../../lib/slug.js'
import {
  findOrCreateOwnerByEmail,
  sendOwnerAccessEmail,
} from '../../lib/ensureOwnerUser.js'

const router = Router()

router.get('/', async (_req, res) => {
  const { data: orgs, error } = await supabaseAdmin
    .from('organizations')
    .select('id, name, slug, plan, is_active, created_at')
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })

  const { data: profiles, error: profilesError } = await supabaseAdmin
    .from('profiles')
    .select('org_id')

  if (profilesError) return res.status(500).json({ error: profilesError.message })

  const memberCounts = (profiles || []).reduce((acc, row) => {
    if (row.org_id) acc[row.org_id] = (acc[row.org_id] || 0) + 1
    return acc
  }, {})

  const result = (orgs || []).map((org) => ({
    ...org,
    member_count: memberCounts[org.id] || 0,
  }))

  res.json(result)
})

router.post('/', async (req, res) => {
  const { name, slug: slugInput, plan = 'free', ownerEmail } = req.body

  if (!name?.trim()) {
    return res.status(400).json({ error: 'Organization name is required' })
  }

  if (!ownerEmail?.trim()) {
    return res.status(400).json({ error: 'Owner email is required' })
  }

  if (!['free', 'pro', 'enterprise'].includes(plan)) {
    return res.status(400).json({ error: 'Invalid plan' })
  }

  try {
    const baseSlug = slugInput?.trim() || generateOrgSlug(name)
    const slug = await ensureUniqueSlug(baseSlug)
    const orgName = name.trim()
    const normalizedEmail = ownerEmail.trim().toLowerCase()

    const owner = await findOrCreateOwnerByEmail(normalizedEmail)

    if (owner.existingOrgId) {
      return res.status(400).json({ error: 'User already belongs to another organization' })
    }

    const { data: org, error: orgError } = await supabaseAdmin
      .from('organizations')
      .insert({
        name: orgName,
        slug,
        plan,
        is_active: true,
        email: normalizedEmail,
      })
      .select('id, name, slug, plan, is_active, created_at')
      .single()

    if (orgError) return res.status(500).json({ error: orgError.message })

    const { error: assignError } = await supabaseAdmin
      .from('profiles')
      .update({ org_id: org.id, role: 'owner' })
      .eq('id', owner.userId)

    if (assignError) {
      await supabaseAdmin.from('organizations').delete().eq('id', org.id)
      return res.status(500).json({ error: assignError.message })
    }

    const { error: inviteError } = await supabaseAdmin.from('org_invites').insert({
      org_id: org.id,
      email: normalizedEmail,
      role: 'owner',
      accepted_at: new Date().toISOString(),
    })

    if (inviteError) {
      console.warn('org_invites insert failed:', inviteError.message)
    }

    let emailSent = false
    if (owner.created) {
      emailSent = await sendOwnerAccessEmail(normalizedEmail, { orgName })
    }

    console.log(
      `Organization created: ${org.slug} | owner: ${normalizedEmail} | new_account: ${owner.created} | email_sent: ${emailSent}`
    )

    res.status(201).json({
      ...org,
      member_count: 1,
      owner_created: owner.created,
      owner_email: normalizedEmail,
      email_sent: emailSent,
    })
  } catch (err) {
    console.error('Create organization failed:', err.message)
    res.status(500).json({ error: err.message || 'Failed to create organization' })
  }
})

router.patch('/:id', async (req, res) => {
  const { id } = req.params
  const { is_active, name, plan } = req.body

  const updates = {}
  if (typeof is_active === 'boolean') updates.is_active = is_active
  if (name?.trim()) updates.name = name.trim()
  if (plan && ['free', 'pro', 'enterprise'].includes(plan)) updates.plan = plan

  if (!Object.keys(updates).length) {
    return res.status(400).json({ error: 'No valid fields to update' })
  }

  const { data, error } = await supabaseAdmin
    .from('organizations')
    .update(updates)
    .eq('id', id)
    .select('id, name, slug, plan, is_active, created_at')
    .single()

  if (error) {
    if (error.code === 'PGRST116') return res.status(404).json({ error: 'Organization not found' })
    return res.status(500).json({ error: error.message })
  }

  const { count } = await supabaseAdmin
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', id)

  res.json({ ...data, member_count: count || 0 })
})

export default router
