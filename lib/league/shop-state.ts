import { createClient, createAdminClient } from '@/lib/supabase/server'

// Stato dello shop: aperto o chiuso per tutti i GM. Il superadmin lo cambia.
// Lo shop è aperto se è "aperto" a mano E non è ancora passata la data di chiusura.
export const SUPERADMIN_EMAIL = 'buonomoa6@gmail.com'

export interface ShopState {
  open: boolean
  closesAt: string | null // ISO timestamp, null = nessuna chiusura programmata
}

export function computeShopOpen(isOpen: boolean, closesAt: string | null, now = Date.now()): boolean {
  if (!isOpen) return false
  if (closesAt && now >= Date.parse(closesAt)) return false
  return true
}

export async function getShopState(): Promise<ShopState> {
  const admin = createAdminClient()
  const { data } = await admin.from('shop_state').select('is_open, closes_at').eq('id', 1).single()
  const isOpen = data?.is_open ?? true
  const closesAt = data?.closes_at ?? null
  return { open: computeShopOpen(isOpen, closesAt), closesAt }
}

export async function isShopOpen(): Promise<boolean> {
  return (await getShopState()).open
}

export async function isSuperAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.email === SUPERADMIN_EMAIL
}
