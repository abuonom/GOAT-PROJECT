import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

const publicTabs = [
  { label: 'HOME', href: '/' },
  { label: 'REGOLAMENTO', href: '/regolamento' },
  { label: 'ROSTER ATTUALI', href: '/roster-attuali' },
  { label: 'ALBO D\'ORO', href: '/albo-doro' },
]

// Per chi non è loggato: la barra completa, con LOGIN.
// Per chi è loggato: solo le pagine pubbliche, senza HOME/LOGIN ridondanti.
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const isLoggedIn = !!user

  const tabs = isLoggedIn
    ? publicTabs.filter(t => t.href !== '/')
    : [...publicTabs, { label: 'LOGIN', href: '/login' }]

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <header className="border-b" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        <div className="max-w-5xl mx-auto px-4 pt-6 pb-0">
          <Link href={isLoggedIn ? '/dashboard' : '/'} className="block text-center">
            <h1 className="font-display text-3xl font-black tracking-widest" style={{ color: 'var(--gold)' }}>GOAT LEAGUE</h1>
            <p className="font-display text-lg font-bold tracking-wide" style={{ color: 'var(--text)' }}>COMPANION</p>
          </Link>
          <nav className="flex gap-1 mt-6 overflow-x-auto">
            {isLoggedIn && (
              <Link
                href="/dashboard"
                className="font-display font-bold tracking-wider text-sm px-4 py-3 whitespace-nowrap border-b-2 transition-colors"
                style={{ color: 'var(--gold)', borderColor: 'transparent' }}
              >
                ← DASHBOARD
              </Link>
            )}
            {tabs.map(tab => (
              <Link
                key={tab.href}
                href={tab.href}
                className="font-display font-bold tracking-wider text-sm px-4 py-3 whitespace-nowrap border-b-2 transition-colors"
                style={{ color: 'var(--text-sec)', borderColor: 'transparent' }}
              >
                {tab.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-10">{children}</main>
    </div>
  )
}
