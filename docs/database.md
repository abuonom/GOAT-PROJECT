# Database — Schema GOAT League 2.0

## Tabelle nuove (migration 001–009)

```
profiles              — utente + ruolo (gm / admin)
leagues               — configurazione lega (max_franchises = 30)
seasons               — stagioni multi-anno (2026/27, 2027/28, ...)
franchises            — 30 franchigie NBA (seed statico)
league_members        — utente ↔ franchigia per stagione + games_played
roster_memberships    — giocatore ↔ franchigia per stagione (con status)
games                 — partite (struttura base, per uso futuro)
gc_milestones         — lookup table GC per partite giocate
gm_credit_ledger      — ledger append-only di tutti gli eventi GC
gm_shop_attributes    — listino attributi + prezzi (data-driven)
gc_surcharge_tiers    — maggiorazioni progressive per fascia
gm_shop_transactions  — transazioni GM Shop (1 per acquisto)
gm_shop_upgrades      — upgrade effettuati (con UNIQUE per unicità attributo)
player_season_ratings — valore base del giocatore a inizio stagione
audit_log             — log immutabile di tutte le operazioni importanti
```

## Tabelle esistenti (non modificate)

```
players               — dati giocatori NBA 2K (jsonb)
player_potentials     — potential e età
contracts             — contratti NBA
draft_picks           — draft class 2021–2026
saved_players         — LEGACY, superseded da roster_memberships
```

## Funzioni DB chiave

| Funzione | Descrizione |
|---|---|
| `is_admin()` | Controlla se l'utente corrente è admin |
| `active_season_id()` | Restituisce l'UUID della stagione attiva |
| `calculate_gc_earned(games)` | GC totali dati N partite (lookup) |
| `get_gc_balance(user, season)` | Bilancio GC corrente (sum del ledger) |
| `calculate_upgrade_cost(attr, value)` | Costo upgrade (base + fascia) |
| `transition_season(name, version)` | Chiude stagione e apre la prossima |
| `write_audit_log(...)` | Helper per inserire nel log |

## Constraint chiave

| Vincolo | Dove | Cosa fa |
|---|---|---|
| UNIQUE(season_id, user_id) | league_members | 1 franchigia per GM per stagione |
| UNIQUE(season_id, franchise_id) | league_members | 1 GM per franchigia per stagione |
| UNIQUE INDEX WHERE status != 'released' | roster_memberships | 1 proprietario per giocatore per stagione |
| UNIQUE(season_id, user_id, player_slug, attribute_key) | gm_shop_upgrades | 1 upgrade per attributo per giocatore per stagione |
| TRIGGER enforce_upgrade_limit | gm_shop_upgrades | Max 3 upgrade per giocatore per stagione |
| TRIGGER check_gc_balance | gm_credit_ledger | GC non possono diventare negativi |
| CHECK carryover_max_five | gm_credit_ledger | Carry-over max 5 GC |

## Ordine di applicazione migrations

```
001 → profiles_roles
002 → leagues_seasons
003 → franchises + league_members
004 → roster_system
005 → gm_credits + games
006 → gm_shop
007 → audit_log
008 → rls_existing_tables
009 → season_transition
```

Ogni migration dipende dalla precedente. Applicarle in ordine.
