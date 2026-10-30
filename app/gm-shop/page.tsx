import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import GmShopClient from './GmShopClient'

export default async function GmShopPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const { isSuperAdmin } = await import('@/lib/league/shop-state')
  return <GmShopClient isSuperAdmin={await isSuperAdmin()} />
}
