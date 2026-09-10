import { Router } from 'express'
import { verifyAuth } from '../../middleware/auth.js'
import { supabaseAdmin } from '../../services/supabase.js'
import { validatePhoneE164, normalizePhoneE164 } from '../../lib/contactValidation.js'
import { getSignedUrl } from '../../lib/signedUrlCache.js'

const router = Router()
const ORG_ASSETS_BUCKET = 'org-assets'
const USER_ASSETS_BUCKET = 'user-assets'

const PROFILE_SELECT = 'id, email, full_name, avatar_url, phone, role, org_id, created_at'

const MY_EMPLOYEE_SELECT = `
  id,
  emp_id,
  name,
  mobile,
  email,
  photo_url,
  is_active,
  department_id,
  location_id,
  manager_id,
  departments!department_id ( id, name ),
  org_locations!location_id ( id, name, code ),
  manager:manager_id ( id, emp_id, name ),
  org_employee_emails ( id, email ),
  access_role:access_role_id ( id, name )
`

async function attachEmployeePhotoUrl(employee) {
  if (!employee?.photo_url) return employee

  const signedUrl = await getSignedUrl(ORG_ASSETS_BUCKET, employee.photo_url)
  if (signedUrl) {
    return { ...employee, photo_signed_url: signedUrl }
  }
  return employee
}

async function attachUserAvatarUrl(profile) {
  if (!profile?.avatar_url) return null

  return getSignedUrl(USER_ASSETS_BUCKET, profile.avatar_url)
}

async function loadUserProfile(userId) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('id', userId)
    .single()

  if (error) throw error
  return data
}

async function findLinkedEmployee(orgId, profile) {
  const { data: byProfile, error: profileError } = await supabaseAdmin
    .from('org_employees')
    .select(MY_EMPLOYEE_SELECT)
    .eq('org_id', orgId)
    .eq('profile_id', profile.id)
    .maybeSingle()

  if (profileError) throw profileError
  if (byProfile) return byProfile

  const email = profile.email?.trim()
  if (!email) return null

  const { data: byEmail, error: emailError } = await supabaseAdmin
    .from('org_employees')
    .select(MY_EMPLOYEE_SELECT)
    .eq('org_id', orgId)
    .ilike('email', email)
    .maybeSingle()

  if (emailError) throw emailError
  return byEmail
}

function isValidEmployeePhotoPath(path, orgId) {
  if (!path) return true
  return path.startsWith(`${orgId}/employees/`) && !path.includes('..')
}

function isValidUserAvatarPath(path, userId) {
  if (!path) return true
  return path.startsWith(`${userId}/`) && !path.includes('..')
}

export async function loadMyProfileBundle(userId) {
  const profile = await loadUserProfile(userId)

  let employee = null
  if (profile.org_id) {
    employee = await findLinkedEmployee(profile.org_id, profile)
    if (employee) employee = await attachEmployeePhotoUrl(employee)
  }

  const avatarUrl = await attachUserAvatarUrl(profile) || employee?.photo_signed_url || null
  return { profile, employee, avatar_url: avatarUrl }
}

router.get('/me', verifyAuth, async (req, res) => {
  try {
    const payload = await loadMyProfileBundle(req.user.id)
    res.json(payload)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.patch('/me', verifyAuth, async (req, res) => {
  const { full_name, phone, avatar_url } = req.body

  try {
    const existing = await loadUserProfile(req.user.id)
    const updates = {}

    if (full_name !== undefined) {
      updates.full_name = full_name?.trim() || null
    }

    if (phone !== undefined) {
      const phoneError = validatePhoneE164(phone)
      if (phoneError) return res.status(400).json({ error: phoneError })
      updates.phone = normalizePhoneE164(phone)
    }

    if (avatar_url !== undefined) {
      if (avatar_url && !isValidUserAvatarPath(avatar_url, req.user.id)) {
        return res.status(400).json({ error: 'Invalid avatar path' })
      }
      updates.avatar_url = avatar_url || null
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({ error: 'No valid fields to update' })
    }

    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .update(updates)
      .eq('id', req.user.id)
      .select(PROFILE_SELECT)
      .single()

    if (error) return res.status(500).json({ error: error.message })

    let employee = null
    if (profile.org_id) {
      employee = await findLinkedEmployee(profile.org_id, profile)
      if (employee) {
        const employeeUpdates = {}
        if (full_name !== undefined) {
          const trimmed = full_name?.trim()
          if (trimmed) employeeUpdates.name = trimmed
        }
        if (phone !== undefined) {
          employeeUpdates.mobile = normalizePhoneE164(phone)
        }
        if (Object.keys(employeeUpdates).length) {
          employeeUpdates.updated_at = new Date().toISOString()
          const { data: updatedEmployee, error: employeeError } = await supabaseAdmin
            .from('org_employees')
            .update(employeeUpdates)
            .eq('id', employee.id)
            .eq('org_id', profile.org_id)
            .select(MY_EMPLOYEE_SELECT)
            .single()

          if (employeeError) return res.status(500).json({ error: employeeError.message })
          employee = await attachEmployeePhotoUrl(updatedEmployee)
        } else {
          employee = await attachEmployeePhotoUrl(employee)
        }
      }
    }

    const avatarUrl = await attachUserAvatarUrl(profile) || employee?.photo_signed_url || null

    res.json({ profile, employee, avatar_url: avatarUrl })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/employee', verifyAuth, async (req, res) => {
  try {
    const profile = await loadUserProfile(req.user.id)
    if (!profile.org_id) return res.json(null)

    const employee = await findLinkedEmployee(profile.org_id, profile)
    if (!employee) return res.json(null)
    res.json(await attachEmployeePhotoUrl(employee))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.patch('/employee', verifyAuth, async (req, res) => {
  const { name, mobile, photo_url } = req.body

  try {
    const profile = await loadUserProfile(req.user.id)
    if (!profile.org_id) {
      return res.status(404).json({ error: 'No employee record linked to your account' })
    }

    const orgId = profile.org_id
    const employee = await findLinkedEmployee(orgId, profile)
    if (!employee) {
      return res.status(404).json({ error: 'No employee record linked to your account' })
    }

    const updates = {}

    if (name !== undefined) {
      const trimmed = name?.trim()
      if (!trimmed) return res.status(400).json({ error: 'Name is required' })
      updates.name = trimmed
    }

    if (mobile !== undefined) {
      const mobileError = validatePhoneE164(mobile)
      if (mobileError) return res.status(400).json({ error: mobileError })
      updates.mobile = normalizePhoneE164(mobile)
    }

    if (photo_url !== undefined) {
      if (photo_url && !isValidEmployeePhotoPath(photo_url, orgId)) {
        return res.status(400).json({ error: 'Invalid photo path' })
      }
      updates.photo_url = photo_url || null
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({ error: 'No valid fields to update' })
    }

    updates.updated_at = new Date().toISOString()

    const { data, error } = await supabaseAdmin
      .from('org_employees')
      .update(updates)
      .eq('id', employee.id)
      .eq('org_id', orgId)
      .select(MY_EMPLOYEE_SELECT)
      .single()

    if (error) return res.status(500).json({ error: error.message })

    res.json(await attachEmployeePhotoUrl(data))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
