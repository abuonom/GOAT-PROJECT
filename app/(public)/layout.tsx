import { createClient } from '@/lib/supabase/server'
import PublicHeader from '@/components/PublicHeader'

// Per chi non è loggato: HOME + pagine pubbliche + pulsante ENTRA.
// Per chi è loggato: solo le pagine pubbliche + pulsante verso la propria area.
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <PublicHeader isLoggedIn={!!user} />
      <main className="max-w-5xl mx-auto px-4 py-10">{children}</main>
    </div>
  )
}
