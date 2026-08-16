import { supabaseAdmin } from '../services/supabase.js'

export async function nextTaskNumber(orgId) {
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from('task_sequences')
    .select('last_value')
    .eq('org_id', orgId)
    .maybeSingle()

  if (fetchError) throw fetchError

  const nextValue = (existing?.last_value || 0) + 1

  const { error: upsertError } = await supabaseAdmin
    .from('task_sequences')
    .upsert({
      org_id: orgId,
      last_value: nextValue,
      updated_at: new Date().toISOString(),
    })

  if (upsertError) throw upsertError

  return `TSK-${String(nextValue).padStart(5, '0')}`
}
