# GM Shop — Regole e Implementazione

Fonte normativa: `GM_SHOP_Definitivo_2K27_Attributo_Unico.xlsx`

## Listino attributi (stagione 2K27)

| Attributo | Chiave DB | GC base | Categoria |
|---|---|---|---|
| Tiro libero | freeThrow | 2 | Tiro |
| Tiro dalla media | midRangeShot | 4 | Tiro |
| Tiro da 3 | threePointShot | 5 | Tiro |
| IQ offensivo | shotIQ | 3 | Tiro |
| Consistenza offensiva | offensiveConsistency | 3 | Tiro |
| Layup | drivingLayup | 4 | Finishing |
| Schiacciata in movimento | drivingDunk | 6 | Finishing |
| Schiacciata da fermo | standingDunk | 5 | Finishing |
| Mani | hands | 3 | Finishing |
| Controllo palla | ballHandle | 5 | Playmaking |
| Velocità con palla | speedWithBall | 5 | Playmaking |
| Precisione passaggi | passAccuracy | 4 | Playmaking |
| Percezione passaggi | passPerception | 5 | Playmaking |
| Difesa perimetrale | perimeterDefense | 5 | Difesa |
| Difesa interna | interiorDefense | 4 | Difesa |
| Rubata | steal | 6 | Difesa |
| Stoppata | block | 5 | Difesa |
| Rimbalzo difensivo | defensiveRebound | 4 | Difesa |
| IQ difensivo | helpDefenseIQ | 4 | Difesa |
| Consistenza difensiva | defensiveConsistency | 4 | Difesa |
| Rimbalzo offensivo | offensiveRebound | 4 | Atletismo |
| Velocità | speed | 5 | Atletismo |
| Forza | strength | 4 | Atletismo |
| Verticale | vertical | 4 | Atletismo |
| Resistenza | stamina | 3 | Atletismo |
| Agilità | agility | 5 | Atletismo |
| Badge Bronzo → Argento | badge_bronze_silver | **10** | Badge |

**PENDENTE**: `Accelerazione` (5 GC) — attributo presente in Excel ma assente
nel PlayerAttributes schema del DB. Da aggiungere quando lo scraping viene aggiornato.

## Maggiorazione progressiva

Basata sul valore dell'attributo **PRIMA** dell'upgrade:

| Fascia | Maggiorazione |
|---|---|
| 0–84 | +0 GC (prezzo base) |
| 85–87 | +2 GC |
| 88–90 | +4 GC |
| 91–93 | +6 GC |
| 94+ | +8 GC |

I badge upgrade (Bronzo → Argento) NON hanno maggiorazione progressiva: sempre 10 GC.

## Regole business

1. **Max 3 upgrade per giocatore per stagione** — enforced da trigger DB + UNIQUE constraint
2. **Ogni attributo: max 1 volta per stagione** per giocatore — enforced da `UNIQUE(season_id, user_id, player_slug, attribute_key)`
3. **Badge Bronzo → Argento** = 1 upgrade (conta nel conteggio 3/3)
4. **GC non possono essere negativi** — enforced da trigger `check_gc_balance`
5. **Carry-over massimo 5 GC** a fine stagione — enforced da `transition_season()` RPC

## GM Credits per partite

Tabella lookup (step function, non interpolazione):

| Partite | GC stagionali totali |
|---|---|
| < 5 | 0 |
| 5–9 | 1 |
| 10–19 | 2 |
| 20–29 | 4 |
| 30–39 | 6 |
| 40–49 | 9 |
| 50–59 | 12 |
| 60–69 | 16 |
| 70–81 | 20 |
| 82 | 25 |

Formula bilancio: `GC disponibili = GC_maturati + GC_carry_over - GC_spesi + GC_adjustment`

## Architettura regole

```
lib/gm-shop/rules.ts    → preview frontend (NON autoritative)
   ↕
app/api/gm-shop/        → server actions (validazione + transazione atomica)
   ↕
Supabase DB             → constraint, trigger, RPC (fonte di verità)
```

NON duplicare le regole fuori da questi tre livelli.

## Flusso transazione atomica (FASE 6)

```
1. Verifica auth
2. Verifica ruolo (gm)
3. Verifica stagione attiva
4. Verifica proprietà giocatore (roster_memberships)
5. Verifica upgrade count < 3 (gm_shop_upgrades)
6. Verifica attributo non già upgradato (UNIQUE constraint)
7. Leggi valore attuale (players.data->attributes)
8. calculate_upgrade_cost(attribute_key, current_value)
9. Verifica GC disponibili >= costo
10. BEGIN TRANSACTION
    a. INSERT gm_shop_transactions
    b. INSERT gm_shop_upgrades
    c. INSERT gm_credit_ledger (amount negativo)
    d. INSERT audit_log
COMMIT
```

Se uno step fallisce: ROLLBACK completo, nessun dato modificato.
