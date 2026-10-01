import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import RosterClient from './RosterClient'

export default async function RosterPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get profile and franchise info
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()

  const { data: season } = await supabase
    .from('seasons')
    .select('id, name')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  let franchiseName: string | null = null
  let hasFranchise = false

  if (season) {
    const { data: member } = await supabase
      .from('league_members')
      .select('franchise_id, franchises(name, abbreviation, espn_id)')
      .eq('user_id', user.id)
      .eq('season_id', season.id)
      .single()

    if (member) {
      hasFranchise = true
      const f = member.franchises as unknown as { name: string } | null
      franchiseName = f?.name ?? null
    }
  }

  return (
    <RosterClient
      isAdmin={profile?.role === 'admin'}
      franchiseName={franchiseName}
      seasonName={season?.name ?? null}
      hasFranchise={hasFranchise}
    />
  )
}
