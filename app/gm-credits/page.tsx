import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import GmCreditsClient from './GmCreditsClient'

export default async function GmCreditsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, display_name')
    .eq('id', user.id)
    .single()

  return <GmCreditsClient />
}
