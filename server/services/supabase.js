import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const isPlaceholder = (value) => !value || /^your_/i.test(value)

const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export const isSupabaseAdminConfigured =
  Boolean(supabaseUrl && serviceRoleKey) &&
  !isPlaceholder(supabaseUrl) &&
  !isPlaceholder(serviceRoleKey)

if (!isSupabaseAdminConfigured) {
  console.warn(
    'WARNING: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing in server/.env — API routes will fail.'
  )
}

export const supabaseAdmin = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  serviceRoleKey || 'placeholder-key',
  { auth: { autoRefreshToken: false, persistSession: false } }
)
