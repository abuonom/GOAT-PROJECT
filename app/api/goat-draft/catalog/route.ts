import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getDunkestRoles, getDunkestTeams } from '@/lib/dunkest/catalog'

// GET /api/goat-draft/catalog — distinct roles and teams for filter dropdowns
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  const [roles, teams] = await Promise.all([getDunkestRoles(), getDunkestTeams()])
  return NextResponse.json({ roles, teams })
}
