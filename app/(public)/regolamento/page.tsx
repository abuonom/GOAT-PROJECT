type Rule = { title: string; text: string }
type Section = { code: string; title: string; intro?: string; rules: Rule[] }

const sections: Section[] = [
  {
    code: '01',
    title: 'Il formato',
    intro: 'La struttura della stagione GOAT.',
    rules: [
      { title: '82 partite in calendario', text: 'Regular season completa, 30 GM e 30 franchigie in un’unica lega.' },
      { title: 'Competizioni', text: 'Play-In, Playoff, In-Season Ernesto Cup e All-Star Game.' },
      { title: 'Impostazioni', text: 'Slider personalizzati, conference custom e posizioni originali dei giocatori.' },
    ],
  },
  {
    code: '02',
    title: 'Gameplay — Attacco',
    intro: 'Varietà offensiva, ritmo e gestione del possesso.',
    rules: [
      { title: 'Variare le soluzioni', text: 'Diversificare schemi e soluzioni offensive: evitare di ripetere soltanto uno o due schemi per tutta la partita.' },
      { title: 'Lancio lungo dopo canestro subito', text: 'Vietato costruire dalla propria metà campo e attendere che la difesa si sistemi. Eccezioni: ultimo possesso di un quarto o svantaggio negli ultimi 2 minuti.' },
      { title: 'Pressione avversaria', text: 'Lancio lungo consentito contro pressione di squadra. R2 consentito contro pressione di un singolo difensore che non rientra nell’arco dei 3 punti.' },
      { title: 'Limite tiri', text: 'Massimo 45 tentativi per giocatore in una partita; 55 in caso di overtime.' },
    ],
  },
  {
    code: '03',
    title: 'Gameplay — Difesa',
    intro: 'Regole di marcatura e pressione.',
    rules: [
      { title: 'On-ball obbligatoria', text: 'Difendere con l’uomo più vicino al portatore. Se viene battuto, selezionare il successivo difensore più vicino.' },
      { title: 'Schemi e post', text: 'Consentito al massimo 1 secondo di off-ball per intercettare uno schema. In post, mantenere la difesa on-ball anche durante un raddoppio.' },
      { title: 'Raddoppio', text: 'Consentito esclusivamente tramite il tasto L1.' },
      { title: 'Pressing a tutto campo', text: 'Vietato anche con un solo uomo. Consentito soltanto quando si è in svantaggio, a partire dal terzo quarto.' },
    ],
  },
  {
    code: '04',
    title: 'Front office — Trade',
    intro: 'Dal primo accordo alla validazione ufficiale.',
    rules: [
      { title: 'No check, no trade', text: 'Per effettuare una trade bisogna essere in regola con il check delle partite.' },
      { title: '01 Accordo', text: 'I due GM concordano informalmente lo scambio: non è ancora ufficiale.' },
      { title: '02 Invio agli admin', text: 'Dopo l’accettazione in game da entrambe le parti, la trade va inviata all’admin. Durante la valutazione i giocatori coinvolti non possono entrare in altre trade.' },
      { title: '03 Approvazione', text: 'Con il consenso di tre admin, la trade viene implementata in game.' },
      { title: 'Penalità', text: 'Se una trade ufficiale già inviata agli admin non viene rispettata, è previsto il blocco del mercato per il giocatore responsabile.' },
    ],
  },
  {
    code: '05',
    title: 'Postseason',
    intro: 'Tre percorsi, un solo obiettivo: competere.',
    rules: [
      { title: 'Play-In', text: 'Eliminazione secca. Durata: 48 ore.' },
      { title: 'Playoff', text: 'Serie al meglio delle 5. Durata turno: 48 ore.' },
      { title: 'Ernesto Cup', text: 'Gironi da completare entro 15 giorni dall’inizio della regular season. Fase a eliminazione diretta: 48 ore.' },
    ],
  },
  {
    code: '06',
    title: 'Premi stagionali',
    intro: 'Ricompense e riconoscimenti.',
    rules: [
      { title: 'MVP', text: 'Miglior giocatore dei playoff: +2 su 3 attributi sotto 80. Non può coincidere con C.O.T.Y.' },
      { title: 'C.O.T.Y.', text: '+1 Overall a scelta su un qualsiasi giocatore. Non può coincidere con MVP.' },
      { title: 'Quintetto NBA', text: 'Composizione indicata: 2 guardie, 1 ala, 1 centro. Ogni giocatore riceve +2 su un attributo sotto 75 e +1 su un attributo sotto 80.' },
    ],
  },
  {
    code: '07',
    title: 'Matchday',
    intro: 'Impostazioni e obblighi di partita.',
    rules: [
      { title: 'Quit', text: 'Vietato abbandonare le partite.' },
      { title: 'Pause', text: 'Consentiti 2 turni di pausa.' },
      { title: 'Tiro', text: 'Obbligatorio il tempismo di tiro su sottomano e rilascio.' },
      { title: 'High risk', text: 'Obbligatorio High Risk su tiri e sottomano.' },
    ],
  },
  {
    code: '08',
    title: 'Comunità',
    intro: 'Competitività, rispetto e spirito di lega.',
    rules: [
      { title: 'Sportività', text: 'Trash talking consentito entro i limiti del rispetto. Non sono ammessi insulti o comportamenti inappropriati.' },
      { title: 'Segnalazioni', text: 'Eventuali scorrettezze di gameplay vanno segnalate in privato all’admin di riferimento.' },
      { title: 'Buon senso', text: 'Comprensione per errori occasionali dettati dall’euforia di gioco.' },
      { title: 'Comunicazioni', text: 'Nel gruppo “Solo partite” inviare la foto post-match e scrivere soltanto per organizzare le gare. Seguire il gruppo “Comunicati”.' },
    ],
  },
  {
    code: '09',
    title: 'GM Shop',
    intro: 'Più giochi. Più costruisci. Ogni partita conta. I GM Credits (GC) si ottengono con le partite disputate in Regular Season, non con le vittorie.',
    rules: [
      { title: 'Massimo 3 potenziamenti', text: 'Ogni giocatore può ricevere al massimo 3 potenziamenti per stagione.' },
      { title: 'Un attributo, una volta', text: 'Lo stesso attributo può essere migliorato una sola volta per stagione sul medesimo giocatore.' },
      { title: 'Nessun limite overall', text: 'Puoi investire su qualsiasi giocatore del tuo roster, senza limiti di overall.' },
      { title: 'Crediti non spesi', text: 'A fine stagione è possibile conservare e riportare alla stagione successiva fino a 5 GC.' },
      { title: 'Prezzi', text: 'Il costo di un potenziamento dipende dal valore attuale dell’attributo. Fanno fede i valori del listino GM Shop distribuito dalla lega.' },
    ],
  },
]

export default function RegolamentoPage() {
  return (
    <article className="space-y-12">
      <header className="text-center">
        <p className="font-display text-sm tracking-widest" style={{ color: 'var(--text-sec)' }}>GOAT / OFFICIAL LEAGUE RULEBOOK</p>
        <h2 className="font-display text-4xl font-black tracking-wide mt-2" style={{ color: 'var(--gold)' }}>REGOLAMENTO</h2>
        <p className="font-display text-lg font-bold tracking-widest mt-1" style={{ color: 'var(--text)' }}>CHAMPIONSHIP EDITION</p>
        <p className="text-sm mt-4" style={{ color: 'var(--text-sec)' }}>30 GM · 30 franchigie · una lega</p>
      </header>

      {sections.map(section => (
        <section key={section.code} className="space-y-4">
          <div className="flex items-baseline gap-3 border-b pb-2" style={{ borderColor: 'var(--border)' }}>
            <span className="font-display text-sm font-bold" style={{ color: 'var(--gold)' }}>{section.code}</span>
            <h3 className="font-display text-2xl font-black tracking-wide" style={{ color: 'var(--text)' }}>{section.title}</h3>
          </div>
          {section.intro && (
            <p className="text-sm" style={{ color: 'var(--text-sec)' }}>{section.intro}</p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {section.rules.map(rule => (
              <div
                key={rule.title}
                className="rounded-xl p-4"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                <h4 className="font-display font-bold tracking-wide text-sm" style={{ color: 'var(--gold)' }}>{rule.title}</h4>
                <p className="text-sm mt-2 leading-relaxed" style={{ color: 'var(--text)' }}>{rule.text}</p>
              </div>
            ))}
          </div>
        </section>
      ))}

      <footer className="text-center pt-4">
        <p className="font-display text-xl font-black tracking-wide" style={{ color: 'var(--gold)' }}>LET’S PLAY BASKETBALL</p>
        <p className="text-sm mt-2" style={{ color: 'var(--text-sec)' }}>Divertirsi, competere e creare una community di amici da tutta Italia.</p>
      </footer>
    </article>
  )
}
