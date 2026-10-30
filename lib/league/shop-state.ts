import { createClient, createAdminClient } from '@/lib/supabase/server'

// Stato dello shop: aperto o chiuso per tutti i GM. Il superadmin lo cambia.
export const SUPERADMIN_EMAIL = 'buonomoa6@gmail.com'

export async function isShopOpen(): Promise<boolean> {
  const admin = createAdminClient()
  const { data } = await admin.from('shop_state').select('is_open').eq('id', 1).single()
  return data?.is_open ?? true
}

export async function isSuperAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.email === SUPERADMIN_EMAIL
}
