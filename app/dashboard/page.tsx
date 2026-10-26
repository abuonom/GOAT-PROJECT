import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardClient from './DashboardClient'

const SUPERADMIN_EMAIL = 'buonomoa6@gmail.com'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // Superadmin: vede anche le sezioni riservate (Draft Class, Dunkest Draft, Player List)
  const isSuperAdmin = user.email === SUPERADMIN_EMAIL

  return <DashboardClient profile={profile} userEmail={user.email ?? ''} isSuperAdmin={isSuperAdmin} />
}
