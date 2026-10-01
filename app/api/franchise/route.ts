import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getAvailableFranchises, claimFranchise } from '@/lib/league/franchise'

// GET /api/franchise — available franchises for current season
export async function GET() {
  const result = await getAvailableFranchises()
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ franchises: result.franchises })
}

// POST /api/franchise — claim a franchise
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  const { franchiseId } = await req.json()
  if (!franchiseId) return NextResponse.json({ error: 'franchiseId obbligatorio' }, { status: 400 })

  const result = await claimFranchise(franchiseId)
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ ok: true })
}
