# TODO — Rework del sito

Lista di task da affrontare uno alla volta.

## 1. Nuova HOME pubblica con tab

- [ ] HOME accessibile a tutti (senza login) con tab:
  - [ ] **REGOLAMENTO**
  - [ ] **ROSTER ATTUALI**
  - [ ] **LOGIN**
- [ ] Accesso a **LOGIN** → porta all'attuale sito (dashboard/area riservata)

**Note:** `proxy.ts` oggi reindirizza ogni path non pubblico a `/login`. Va aggiornato in modo che `/` e le pagine pubbliche siano accessibili senza autenticazione.

## 2. Tab REGOLAMENTO

- [ ] Pagina con il regolamento completo
- [ ] Contenuto: PDF da inviare più avanti (da trasformare in pagina web)

## 3. Tab ROSTER ATTUALI

- [ ] Visualizzazione dei roster attuali nel gioco (accessibile a tutti)

## 4. GM Shop — revisione

- [ ] Revisione del GM Shop (dettagli da fornire quando si affronta il task)
- Documentazione esistente: `docs/gm-shop.md`

## 5. Performance

- [ ] Ridurre la lentezza generale del sito
- [ ] Analisi delle cause (query Supabase, numero di richieste, caricamento dati lato client, bundle, ecc.)
- Ipotesi da verificare: la lentezza dipende dalla tecnologia scelta oppure da come vengono caricati i dati.
