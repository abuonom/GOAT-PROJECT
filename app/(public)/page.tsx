import Image from 'next/image'

export default function Home() {
  return (
    <section className="text-center py-10 flex flex-col items-center">
      <Image
        src="/logo-goat-league.webp"
        alt="GOAT League logo"
        width={512}
        height={512}
        priority
        className="w-64 h-64 sm:w-80 sm:h-80 object-contain"
      />
      <p className="font-display text-2xl sm:text-3xl font-black tracking-wide mt-8 max-w-2xl" style={{ color: 'var(--text)' }}>
        GOAT LEAGUE, UNA DELLE PRIME LEGHE ITALIANE DI NBA2K.
      </p>
      <p className="mt-4 text-sm" style={{ color: 'var(--text-sec)' }}>
        Consulta il regolamento e i roster attuali. Per gestire la tua squadra, accedi.
      </p>
    </section>
  )
}
