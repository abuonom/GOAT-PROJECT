import { notFound } from 'next/navigation'
import { isFeatureEnabled } from '@/lib/league/features'

// Player List: attiva solo quando il superadmin la accende (draft NBA).
// Se spenta, la pagina non esiste per nessuno: risponde 404.
export default async function PlayerListLayout({ children }: { children: React.ReactNode }) {
  if (!(await isFeatureEnabled('player_list'))) notFound()
  return <>{children}</>
}
