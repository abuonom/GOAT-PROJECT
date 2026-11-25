'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Header delle pagine pubbliche (home, regolamento, roster attuali, albo d'oro).
// - Il pulsante d'azione è sempre uno solo e sempre a destra: ENTRA (ospite) o DASHBOARD (loggato).
// - La tab della pagina corrente è evidenziata.

const TABS = [
  { label: 'HOME', href: '/', guestOnly: true },
  { label: 'REGOLAMENTO', href: '/regolamento' },
  { label: 'ROSTER ATTUALI', href: '/roster-attuali' },
  { label: "ALBO D'ORO", href: '/albo-doro' },
]

export default function PublicHeader({ isLoggedIn }: { isLoggedIn: boolean }) {
  const pathname = usePathname()
  const tabs = TABS.filter(t => !t.guestOnly || !isLoggedIn)

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/')

  return (
    <header className="border-b" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
      <div className="max-w-5xl mx-auto px-4 pt-4 pb-0">
        <div className="flex items-center justify-between gap-3">
          <Link href={isLoggedIn ? '/dashboard' : '/'} className="block leading-tight">
            <span className="block font-display text-2xl sm:text-3xl font-black tracking-widest" style={{ color: 'var(--gold)' }}>GOAT LEAGUE</span>
            <span className="block font-display text-sm sm:text-base font-bold tracking-wide" style={{ color: 'var(--text)' }}>COMPANION</span>
          </Link>

          <Link
            href={isLoggedIn ? '/dashboard' : '/login'}
            className="font-display font-black tracking-wider text-xs sm:text-sm px-4 sm:px-5 py-2.5 rounded-lg whitespace-nowrap"
            style={{ background: 'var(--gold)', color: '#000' }}
          >
            {isLoggedIn ? 'LA MIA AREA →' : 'ENTRA'}
          </Link>
        </div>

        <nav className="flex gap-1 mt-4 overflow-x-auto" aria-label="Sezioni pubbliche">
          {tabs.map(tab => {
            const active = isActive(tab.href)
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className="font-display font-bold tracking-wider text-sm px-4 py-3 whitespace-nowrap border-b-2 transition-colors"
                style={{
                  color: active ? 'var(--gold)' : 'var(--text-sec)',
                  borderColor: active ? 'var(--gold)' : 'transparent',
                }}
              >
                {tab.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
