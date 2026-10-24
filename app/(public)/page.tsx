import Image from 'next/image'

export default function Home() {
  return (
    <section className="flex flex-col items-center text-center py-8 sm:py-14">
      <div className="relative">
        <div
          aria-hidden
          className="absolute inset-0 rounded-full blur-3xl opacity-40"
          style={{ background: 'radial-gradient(circle, var(--gold) 0%, transparent 70%)' }}
        />
        <Image
          src="/logo-goat-league.webp"
          alt="GOAT League logo"
          width={512}
          height={510}
          priority
          className="relative w-56 h-auto sm:w-72 drop-shadow-[0_0_24px_rgba(212,160,23,0.35)]"
        />
      </div>

      <div className="mt-10 flex items-center gap-4 w-full max-w-2xl">
        <span className="h-px flex-1" style={{ background: 'linear-gradient(to right, transparent, var(--gold-dim))' }} />
        <span className="font-display text-xs tracking-[0.35em]" style={{ color: 'var(--gold)' }}>BENVENUTO</span>
        <span className="h-px flex-1" style={{ background: 'linear-gradient(to left, transparent, var(--gold-dim))' }} />
      </div>

      <p className="font-display text-2xl sm:text-3xl font-black tracking-wide mt-6 max-w-2xl leading-snug" style={{ color: 'var(--text)' }}>
        GOAT LEAGUE, UNA DELLE PRIME LEGHE ITALIANE DI NBA2K.
      </p>

      <p className="mt-4 text-sm max-w-md" style={{ color: 'var(--text-sec)' }}>
        Consulta il regolamento e i roster attuali. Per gestire la tua squadra, accedi.
      </p>
    </section>
  )
}
