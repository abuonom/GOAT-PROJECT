import { createClient, createAdminClient } from '@/lib/supabase/server'
import { SUPERADMIN_EMAIL } from '@/lib/league/shop-state'

// Interruttori delle funzionalità. Disattivata = non mostrata a nessuno.
export async function isFeatureEnabled(key: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data } = await admin.from('feature_flags').select('enabled').eq('key', key).single()
  return data?.enabled ?? false
}

export async function isSuperAdminUser(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.email === SUPERADMIN_EMAIL
}
