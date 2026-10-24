# GOAT LEAGUE COMPANION

🇮🇹 [Italiano](#italiano) · 🇬🇧 [English](#english)

🔗 **[goat-league-project.vercel.app](https://goat-league-project.vercel.app)**

---

## Italiano

Strumento di draft e gestione roster per la nostra lega NBA 2K — costruito con [Claude Code](https://claude.ai/code).

### Accesso

Il sito richiede un account. Vai su `/login`, registrati con email e password, e sei dentro. L'accesso rimane attivo finché non premi **Esci**.

---

### Draft Builder

È la pagina principale. Mostra tutti i giocatori NBA 2K ordinati per uno **score composito** che puoi modellare con i quattro slider nella sidebar sinistra.

#### Slider di build

| Slider | Cosa favorisce |
|---|---|
| **REBUILD** | Giocatori giovani con alto potenziale (A+/A/A–). Per costruire sul lungo periodo. |
| **WIN NOW** | Overall alto. Più alto lo slider, più pesa l'OVR attuale. |
| **VALUE HUNT** | Giocatori con attributi specifici sopra la media rispetto al loro OVR — le gemme nascoste. |
| **TEAM FRIENDLY** | Contratti corti e poco costosi. Massimizza la flessibilità salariale. |

> Con tutti gli slider a **0** la lista è ordinata per OVR decrescente — si comporta come un semplice browser di giocatori.

Gli slider si combinano liberamente: puoi mixare più dimensioni con pesi diversi (0–10).

---

#### Filtri

Tutti accessibili dalla sidebar sinistra (su mobile: pulsante ☰ in alto a destra).

| Filtro | Come funziona |
|---|---|
| **Posizione** (PG/SG/SF/PF/C) | Mostra solo i giocatori che giocano in quel ruolo. |
| **Cerca** | Filtra per nome in tempo reale. |
| **OVR minimo** | Esclude i giocatori sotto la soglia selezionata. |
| **Draft Class** | Mostra solo i giocatori di una specifica classe di draft. Selezionabili più anni insieme. |
| **Attributi** | Fino a 4 filtri con valore minimo (es. 3 Punti ≥ 80). I valori appaiono come chip colorati su ogni riga. |

---

#### Cosa mostra ogni riga

- **Score ring** — punteggio composito 0–100 basato sugli slider attivi, con codice colore (giallo = ideale, verde = buona scelta, blu = discreta, grigio = non adatto)
- **OVR** — overall del giocatore con colore per fascia
- **Nome + meta** — squadra, età, potenziale, pick di draft, chip badge (LEG / HOF / GOLD / SLV / BRZ)
- **Contratto** — durata, valore annuo, eventuale opzione (PO/TO/QO) *(solo desktop)*
- **Score breakdown** — barre per ogni dimensione attiva *(solo desktop)*

---

### La mia Rosa

Pulsante in alto a destra. Apre il pannello con i giocatori che hai aggiunto alla tua rosa.

#### Cap Panel

All'interno della rosa trovi il **monitor del salary cap** in tempo reale:

| Soglia | Valore 2026–27 |
|---|---|
| Salary Cap | $141.0M |
| Luxury Tax | $177.0M |
| First Apron | $189.5M |
| Second Apron | $207.5M |

Il pannello mostra anche l'eccezione MLE disponibile (Non-Taxpayer, Taxpayer o Room) in base alla tua situazione salariale. Ogni modifica alla rosa aggiorna il cap in tempo reale e genera una **notifica toast** quando cambia la tua fascia salariale.

---

### Scheda giocatore

Clicca sull'OVR o sul nome di un giocatore per aprire la scheda completa:

- **Overall + Potenziale** — con storico rating per versione di gioco
- **Info fisiche** — altezza, peso, apertura alare, università, età
- **Contratto** — tabella anno per anno con opzioni evidenziate
- **Attributi** — barre per tutte le categorie (Tiro, Finishing, Playmaking, Difesa, Atletismo)
- **Badge** — contatori grandi per tier (Legend / Hall of Fame / Gold / Silver / Bronze) + lista completa

---

### Stack tecnico

| Tecnologia | Uso |
|---|---|
| Next.js 16 (App Router) | Frontend + API routes serverless |
| React 19 + TypeScript | UI components |
| Tailwind CSS v4 | Design system dark premium |
| Supabase (PostgreSQL) | Giocatori, contratti, potenziali, draft picks, auth |
| Vercel | Hosting + CDN con cache delle API routes |

#### Fonti dati

| Fonte | Dati |
|---|---|
| [nba2kapi.com](https://nba2kapi.com) | Rating, attributi, badge, archetipo |
| [2kratings.com](https://www.2kratings.com) | Potenziale, età, draft class |

---

### Setup per sviluppatori

```bash
git clone https://github.com/abuonom/my-nba-players-list
cd my-nba-players-list
npm install
```

Crea `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

```bash
npm run dev
```

Per popolare la tabella `draft_picks` su un nuovo ambiente Supabase:
1. Esegui `supabase/migrations/create_draft_picks.sql` nell'SQL Editor di Supabase
2. `node scripts/scrape-missing-drafts.mjs` — scarica le draft class mancanti
3. `node scripts/seed-draft.mjs` — inserisce i dati in Supabase

> Dati giocatori e contratti cachati 1 ora sul CDN Vercel. I dati della rosa (`localStorage`) sono per-browser e non si sincronizzano tra dispositivi.

*Costruito interamente con **vibe coding** — Claude Code (Anthropic).*

---

## English

Draft tool and roster manager for our NBA 2K league — built with [Claude Code](https://claude.ai/code).

### Login

The site requires an account. Go to `/login`, sign up with email and password, and you're in. Your session stays active until you press **Esci** (Sign out).

---

### Draft Builder

This is the main page. It shows all NBA 2K players ranked by a **composite score** you shape with the four sliders in the left sidebar.

#### Build Sliders

| Slider | What it favors |
|---|---|
| **REBUILD** | Young players with high potential (A+/A/A–). Best for long-term team building. |
| **WIN NOW** | High overall rating. The higher the slider, the more current OVR matters. |
| **VALUE HUNT** | Players whose specific attributes outperform their OVR — the hidden gems. |
| **TEAM FRIENDLY** | Short, cheap contracts. Maximizes salary flexibility. |

> With all sliders at **0**, the list is sorted by OVR descending — it behaves as a plain player browser.

Sliders can be freely combined: mix multiple dimensions with different weights (0–10).

---

#### Filters

All accessible from the left sidebar (on mobile: the ☰ button in the top right).

| Filter | How it works |
|---|---|
| **Position** (PG/SG/SF/PF/C) | Shows only players who play that position. |
| **Search** | Filters by name in real time. |
| **Min OVR** | Excludes players below the selected threshold. |
| **Draft Class** | Shows only players from a specific draft year. Multiple years can be selected together. |
| **Attributes** | Up to 4 filters with a minimum value (e.g. 3-Point Shot ≥ 80). Values appear as colored chips on each row. |

---

#### What Each Row Shows

- **Score ring** — composite score 0–100 based on active sliders, color-coded (yellow = ideal, green = good pick, blue = decent, grey = not a fit)
- **OVR** — player overall with color by range
- **Name + meta** — team, age, potential, draft pick, badge chips (LEG / HOF / GOLD / SLV / BRZ)
- **Contract** — duration, annual value, option type if applicable (PO/TO/QO) *(desktop only)*
- **Score breakdown** — bars for each active dimension *(desktop only)*

---

### My Roster (La mia Rosa)

Button in the top right. Opens the panel with the players you have added to your roster.

#### Cap Panel

Inside the roster panel you'll find a **live salary cap monitor**:

| Threshold | 2026–27 Value |
|---|---|
| Salary Cap | $141.0M |
| Luxury Tax | $177.0M |
| First Apron | $189.5M |
| Second Apron | $207.5M |

The panel also shows the available MLE exception (Non-Taxpayer, Taxpayer, or Room) based on your salary situation. Every roster change updates the cap in real time and fires a **toast notification** whenever your salary tier changes.

---

### Player Page

Click on a player's OVR or name to open their full profile:

- **Overall + Potential** — with rating history per game version
- **Physical info** — height, weight, wingspan, college, age
- **Contract** — year-by-year table with options highlighted
- **Attributes** — bars for all categories (Shooting, Finishing, Playmaking, Defense, Athleticism)
- **Badges** — large counters per tier (Legend / Hall of Fame / Gold / Silver / Bronze) + full list

---

### Tech Stack

| Technology | Use |
|---|---|
| Next.js 16 (App Router) | Frontend + serverless API routes |
| React 19 + TypeScript | UI components |
| Tailwind CSS v4 | Dark premium design system |
| Supabase (PostgreSQL) | Players, contracts, potentials, draft picks, auth |
| Vercel | Hosting + CDN with API route caching |

#### Data Sources

| Source | Data |
|---|---|
| [nba2kapi.com](https://nba2kapi.com) | Ratings, attributes, badges, archetypes |
| [2kratings.com](https://www.2kratings.com) | Potential, age, draft class data |

---

### Developer Setup

```bash
git clone https://github.com/abuonom/my-nba-players-list
cd my-nba-players-list
npm install
```

Create `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

```bash
npm run dev
```

To populate the `draft_picks` table on a fresh Supabase environment:
1. Run `supabase/migrations/create_draft_picks.sql` in the Supabase SQL Editor
2. `node scripts/scrape-missing-drafts.mjs` — scrapes missing draft classes locally
3. `node scripts/seed-draft.mjs` — inserts the data into Supabase

> Player and contract data is cached for 1 hour on the Vercel CDN. Roster data (`localStorage`) is per-browser and does not sync across devices.

*Built entirely through **vibe coding** — Claude Code (Anthropic).*
