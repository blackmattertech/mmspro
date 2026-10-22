import { supabaseAdmin } from '../services/supabase.js'
import { sendNotificationEmail } from '../services/email.js'
import { createTask } from './taskService.js'

function dateOnly(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

function addDays(iso, days) {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function leadDaysFor(item, warranty, orgDefault) {
  const own = Number(item?.expiry_notification_days ?? warranty?.expiry_notification_days)
  if (Number.isFinite(own) && own >= 0) return own
  const fallback = Number(orgDefault)
  return Number.isFinite(fallback) && fallback > 0 ? fallback : 7
}

async function alertAdmins(org, warranty, endDate) {
  const { data: admins } = await supabaseAdmin
    .from('profiles')
    .select('id, email, full_name')
    .eq('org_id', org.id)
    .eq('role', 'admin')

  const recipients = new Map()
  for (const admin of admins || []) {
    if (admin.email) recipients.set(admin.email, admin.full_name || admin.email)
  }
  if (warranty.contact_email) recipients.set(warranty.contact_email, warranty.contact_name || warranty.contact_email)

  const title = `Warranty expiring ${endDate}`
  const body = `${warranty.serial_number || 'A warranty'} ends on ${endDate}.`
  await Promise.all([...recipients.entries()].map(([to, toName]) => (
    sendNotificationEmail({ to, toName, title, body }).catch((err) => {
      console.error('[warrantyExpiry] email failed', err.message)
    })
  )))

  const employeeIds = []
  const profileIds = (admins || []).map((row) => row.id).filter(Boolean)
  if (profileIds.length) {
    const { data: employees } = await supabaseAdmin
      .from('org_employees')
      .select('id')
      .eq('org_id', org.id)
      .in('profile_id', profileIds)
      .eq('is_active', true)
    for (const employee of employees || []) employeeIds.push(employee.id)
  }

  const actorId = profileIds[0]
  if (!actorId) return
  const { data: category } = await supabaseAdmin
    .from('task_categories')
    .select('id')
    .eq('org_id', org.id)
    .limit(1)
    .maybeSingle()
  if (!category?.id) return

  const payload = {
    title,
    short_description: body,
    detailed_description: body,
    category_id: category.id,
    due_date: endDate,
    start_date: dateOnly(new Date()),
    task_type: 'one_time',
  }
  try {
    await createTask(org.id, actorId, {
      ...payload,
      visibility_type: employeeIds.length ? 'team' : 'self',
      assignee_employee_ids: employeeIds,
    })
  } catch (err) {
    try {
      await createTask(org.id, actorId, { ...payload, visibility_type: 'self' })
    } catch (retryErr) {
      console.error('[warrantyExpiry] task failed', retryErr.message || err.message)
    }
  }
}

export async function runWarrantyExpiryJob(now = new Date()) {
  const today = dateOnly(now)
  let { data: orgs, error } = await supabaseAdmin
    .from('organizations')
    .select('id, name, warranty_expiry_lead_days')
    .eq('is_active', true)
  if (error && /warranty_expiry_lead_days/i.test(error.message || '')) {
    const retry = await supabaseAdmin.from('organizations').select('id, name').eq('is_active', true)
    if (retry.error) throw retry.error
    orgs = (retry.data || []).map((org) => ({ ...org, warranty_expiry_lead_days: 7 }))
    error = null
  }
  if (error) throw error

  let sent = 0
  for (const org of orgs || []) {
    const { data: warranties, error: warrantyError } = await supabaseAdmin
      .from('warranties')
      .select('id, serial_number, contact_name, contact_email, warranty_end, expiry_notification_days, warranty_items(id, product_name, warranty_end, expiry_notification_days)')
      .eq('org_id', org.id)
    if (warrantyError) {
      console.error('[warrantyExpiry] list failed', warrantyError.message)
      continue
    }

    for (const warranty of warranties || []) {
      const items = warranty.warranty_items?.length
        ? warranty.warranty_items
        : [{ id: warranty.id, warranty_end: warranty.warranty_end, expiry_notification_days: warranty.expiry_notification_days }]
      for (const item of items) {
        const end = item.warranty_end ? String(item.warranty_end).slice(0, 10) : null
        if (!end || end < today) continue
        const lead = leadDaysFor(item, warranty, org.warranty_expiry_lead_days)
        if (end > addDays(today, lead)) continue
        const alertKey = `${warranty.id}:${item.id || 'header'}:${end}`
        const { error: insertError } = await supabaseAdmin
          .from('warranty_expiry_alerts')
          .insert({ org_id: org.id, warranty_id: warranty.id, alert_key: alertKey })
        if (insertError) continue
        await alertAdmins(org, warranty, end)
        sent += 1
      }
    }
  }
  return { sent }
}
