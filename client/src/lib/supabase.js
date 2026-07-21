import { createClient } from '@supabase/supabase-js'
import { createAuthStorageAdapter } from './authPreferences'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

const isPlaceholder = (value) => !value || /^your_/i.test(value)

export const isSupabaseConfigured =
  Boolean(supabaseUrl && supabaseAnonKey) &&
  !isPlaceholder(supabaseUrl) &&
  !isPlaceholder(supabaseAnonKey)

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: createAuthStorageAdapter(),
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })
  : null
