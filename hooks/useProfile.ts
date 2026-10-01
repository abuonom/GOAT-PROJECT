'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types/league'

interface UseProfileResult {
  profile: Profile | null
  loading: boolean
  isAdmin: boolean
  isGm: boolean
}

export function useProfile(): UseProfileResult {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()

    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      setProfile(data ?? null)
      setLoading(false)
    }

    load()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      load()
    })

    return () => subscription.unsubscribe()
  }, [])

  return {
    profile,
    loading,
    isAdmin: profile?.role === 'admin',
    isGm: profile?.role === 'gm',
  }
}
