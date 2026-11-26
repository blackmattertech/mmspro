import { supabaseAdmin } from '../services/supabase.js'
import { notifyUsers } from '../services/notifications.js'
import {
  alertKeyForSend,
  dateOnly,
  firstReminderDate,
  isReminderDueOn,
  leadDaysForItem,
  nextCursorAfterSend,
  normalizeReminderMode,
} from './warrantyReminderSchedule.js'
import {
  emailWarrantyContact,
  listWarrantyNotifyProfileIds,
} from './warrantyNotifyRecipients.js'

const ITEM_PAGE = 500

async function loadActiveOrgs() {
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
  return orgs || []
}

async function loadDueItemsForOrg(orgId, today) {
  // Prefer indexed reminder_next_at cursor; also pick up legacy rows without cursor.
  const { data, error } = await supabaseAdmin
    .from('warranty_items')
    .select(`
      id, product_name, warranty_end, expiry_notification_days,
      equipment_id, reminder_mode, reminder_frequency,
      reminder_interval, reminder_unit, reminder_weekdays,
      reminder_next_at, reminder_last_sent_on,
      warranty:warranty_id (
        id, serial_number, contact_name, contact_email,
        warranty_end, expiry_notification_days, created_by_profile_id
      )
    `)
    .eq('org_id', orgId)
    .gte('warranty_end', today)
    .or(`reminder_next_at.lte.${today},reminder_next_at.is.null`)
    .order('warranty_end', { ascending: true })
    .limit(ITEM_PAGE)

  if (error && /reminder_next_at|reminder_mode|equipment_id|created_by_profile_id/i.test(error.message || '')) {
    // Pre-migration fallback: header-based scan (same as legacy job).
    return loadLegacyDueItems(orgId, today)
  }
  if (error) throw error
  return data || []
}

async function loadLegacyDueItems(orgId, today) {
  const { data: warranties, error } = await supabaseAdmin
    .from('warranties')
    .select(`
      id, serial_number, contact_name, contact_email,
      warranty_end, expiry_notification_days,
      warranty_items(id, product_name, warranty_end, expiry_notification_days)
    `)
    .eq('org_id', orgId)
  if (error) throw error

  const items = []
  for (const warranty of warranties || []) {
    const lines = warranty.warranty_items?.length
      ? warranty.warranty_items
      : [{
        id: warranty.id,
        warranty_end: warranty.warranty_end,
        expiry_notification_days: warranty.expiry_notification_days,
      }]
    for (const line of lines) {
      items.push({
        ...line,
        reminder_mode: 'one_time',
        reminder_frequency: null,
        reminder_next_at: null,
        reminder_last_sent_on: null,
        equipment_id: null,
        warranty: {
          id: warranty.id,
          serial_number: warranty.serial_number,
          contact_name: warranty.contact_name,
          contact_email: warranty.contact_email,
          warranty_end: warranty.warranty_end,
          expiry_notification_days: warranty.expiry_notification_days,
          created_by_profile_id: null,
        },
      })
    }
  }
  return items.filter((item) => isReminderDueOn(item, {
    today,
    warranty: item.warranty,
    orgDefaultLead: 7,
  }))
}

async function recordAlert(orgId, warrantyId, alertKey) {
  const { error } = await supabaseAdmin
    .from('warranty_expiry_alerts')
    .insert({ org_id: orgId, warranty_id: warrantyId, alert_key: alertKey })
  if (error) return false
  return true
}

async function updateItemCursor(itemId, cursor) {
  if (!itemId) return
  const { error } = await supabaseAdmin
    .from('warranty_items')
    .update({
      reminder_last_sent_on: cursor.reminder_last_sent_on,
      reminder_next_at: cursor.reminder_next_at,
    })
    .eq('id', itemId)
  if (error && !/reminder_last_sent_on|reminder_next_at/i.test(error.message || '')) {
    console.warn('[warrantyExpiry] cursor update failed', error.message)
  }
}

async function notifyWarrantyExpiry(org, item, today) {
  const warranty = item.warranty || {}
  const end = dateOnly(item.warranty_end || warranty.warranty_end)
  const serial = warranty.serial_number || 'A warranty'
  const product = item.product_name ? ` (${item.product_name})` : ''
  const title = `Warranty expiring ${end}`
  const body = `${serial}${product} ends on ${end}.`

  const profileIds = await listWarrantyNotifyProfileIds(org.id, {
    createdByProfileId: warranty.created_by_profile_id || null,
    equipmentId: item.equipment_id || null,
  })

  if (profileIds.length) {
    await notifyUsers(profileIds, {
      title,
      body,
      data: {
        type: 'warranty_expiry',
        warranty_id: warranty.id,
        warranty_item_id: item.id,
        serial_number: warranty.serial_number || '',
        warranty_end: end,
        product_name: item.product_name || '',
      },
    })
  }

  await emailWarrantyContact(warranty, { title, body })
}

export async function runWarrantyExpiryJob(now = new Date()) {
  const today = dateOnly(now)
  const orgs = await loadActiveOrgs()
  let sent = 0

  for (const org of orgs) {
    let items
    try {
      items = await loadDueItemsForOrg(org.id, today)
    } catch (err) {
      console.error('[warrantyExpiry] list failed', err.message)
      continue
    }

    for (const item of items) {
      const warranty = item.warranty
      if (!warranty?.id) continue
      if (!isReminderDueOn(item, {
        today,
        warranty,
        orgDefaultLead: org.warranty_expiry_lead_days,
      })) continue

      const end = dateOnly(item.warranty_end || warranty.warranty_end)
      const mode = normalizeReminderMode(item.reminder_mode)
      const alertKey = alertKeyForSend(warranty.id, item.id, {
        mode,
        warrantyEnd: end,
        today,
      })

      const inserted = await recordAlert(org.id, warranty.id, alertKey)
      if (!inserted) continue

      try {
        await notifyWarrantyExpiry(org, item, today)
        const cursor = nextCursorAfterSend(item, today)
        // Seed next_at for first recurring send when cursor was null
        if (mode === 'recurring' && !item.reminder_next_at) {
          const lead = leadDaysForItem(item, warranty, org.warranty_expiry_lead_days)
          const first = firstReminderDate(end, lead)
          if (first && today < first) {
            await updateItemCursor(item.id, { reminder_last_sent_on: null, reminder_next_at: first })
            continue
          }
        }
        await updateItemCursor(item.id, cursor)
        sent += 1
      } catch (err) {
        console.error('[warrantyExpiry] notify failed', warranty.id, err.message)
      }
    }
  }

  return { sent }
}
