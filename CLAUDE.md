# CLAUDE.md — Flusso App

Documentazione tecnica completa per Claude Code. Aggiornata al: 2026-09-10. Ultima modifica: 2026-09-15 (Accantonamenti collegabili a un salvadanaio specifico; categoria "Accantonamenti" torna a contare come spesa reale — la parentesi di trasferimento interno introdotta più presto in giornata è stata annullata su richiesta esplicita).

---

## Round 3 — usabilità (2026-09-23)

Analisi su codice, dati reali e prova da telefono. Cambiamenti:

- **Card saldo (`balance-hero-card.tsx`) riscritta**: Saldo di oggi → "A fine periodo avrai circa" → barre Spese (speso di previste) ed Entrate (ricevute di attese). Il vecchio "Saldo fine mese stimato" era entrate previste − spese previste (il risparmio del mese, non un saldo) e "Differenza saldo" lo confrontava col saldo reale: numero senza senso. Ora `projectPeriodEnd` (lib/calculations.ts): saldo di oggi + entrate ancora attese − spese ancora previste.
- **Saldo riportato da solo**: se `period_starting_balance_date` ≠ inizio periodo, `rollBalance` somma/sottrae i movimenti nel mezzo (query paginata). Non si scrive nulla: l'ancora resta l'ultimo saldo inserito a mano, così import arretrati vengono inclusi. Prima la card tornava al form "inserisci il saldo" a ogni nuovo periodo (e nella demo sempre).
- **Periodi**: `lib/period.ts` è l'unica fonte (`currentPeriod`, `previousPeriods`); dashboard, Budget e Pianifica non hanno più copie proprie. Corretto un bug dell'ora legale (`adjustBizDay` e la fine periodo usavano ±24h: per alcuni giorni di paga un giorno finiva in nessun periodo). Il Budget usa il periodo di paga, non più il mese solare.
- **Smart → Pianifica** (URL invariato `/dashboard/smart`): copertina a un livello (Budget, Rate e mutui, Accantonamenti, Obiettivi, Salvadanai) con una riga "a cosa serve"; il sottomenu "impegni" non esiste più (`?v=impegni` → copertina). La vista è nell'URL (`?v=budget`): `setView` fa `history.pushState` (Next sincronizza `useSearchParams`), `goBack(parent)` fa `history.back()` se la vista l'abbiamo aperta noi (`history.state.flussoSmartFrom`), altrimenti `replaceState`. Così il tasto Indietro del telefono torna al livello precedente e dalla dashboard si apre direttamente una sezione. NON passare `...history.state` a pushState: contiene `__NA` e Next salterebbe la sincronizzazione.
- **Piano gratuito**: entra in Pianifica; Budget/Rate/Accantonamenti mostrano il blocco (`PREMIUM_VIEWS`), Obiettivi (1) funziona. Prima tutta la sezione era bloccata e l'obiettivo "incluso" non era raggiungibile.
- **Vecchie spese ricorrenti generiche** (né Rata né Accantonamento, create col wizard rimosso il 14/09): non contano nelle previsioni ed erano invisibili. Ora compaiono in Pianifica → "Spese fisse da sistemare" (vista `list-recurring`, filtrata a queste voci, con istruzioni). Non generano più avvisi "scaduta": il banner considera solo le Rate (e usa anche la transazione collegata a mano come parola chiave).
- **Regole di categoria**: `matchUserRule` (lib/categorize.ts) le applica negli import Excel e screenshot, prima delle parole chiave predefinite. Prima valevano solo nel momento in cui venivano create. Quando si cambia categoria a un movimento compare "Vuoi che Flusso se lo ricordi?" con la parola proposta da `ruleKeyword` (modificabile); `createCategoryRule(..., { onlyUncategorized: true })` non sovrascrive categorie scelte a mano.
- **Obiettivi in dashboard**: stima con `monthly_contribution` come nel dettaglio (prima: entrate − spese del periodo finora, diversa ogni giorno e uguale per tutti gli obiettivi).
- **Accantonamenti**: confronto con i soli salvadanai non collegati a un obiettivo (`potsForSinkingFunds`); prima gli stessi euro contavano per obiettivi e accantonamenti.
- **Navigazione**: "Account" ovunque (prima "Impostazioni" su computer e "Account" su telefono); pallini sulla barra solo per guide aggiornate dopo averne vista una (`hasTourUpdate`), non più rossi; periodo in dashboard toccabile ("cambia"); "Mesi passati" con etichetta; avviso rate scadute sotto la card del saldo.
- **Budget**: categorie ordinate per spesa degli ultimi tre periodi, quelle mai usate nascoste dietro "Mostra altre".
- **Demo (migration 037)**: `reseed_demo` crea budget per categoria, due accantonamenti e le entrate di entrambi i componenti; niente più voci generiche.
- Test: `tests/ux-calcoli.test.ts` (saldo riportato, fine periodo, periodi e ora legale, salvadanai, regole).

**Come tornare indietro** (codice e dati sono indipendenti: il round 3 non modifica dati degli utenti, solo la demo):
- Sito (e app Android, che carica www.flussoapp.it): Vercel → Deployments → deploy precedente → "Instant Rollback". In alternativa `git revert -m 1 <merge della PR #5>` e push. Il tag `prima-round-3` segna main prima del merge.
- Demo: `npx --no-install supabase db query --linked -f supabase/rollback/037_demo_pianifica_down.sql` (rimette la `reseed_demo` precedente e ricarica i dati; provato in transazione annullata: torna identica).

Da decidere (non fatto): unificare Obiettivi e Salvadanai (un salvadanaio ha già `target_amount`); dare una casa alle spese fisse non-debito (affitto, bollette, abbonamenti) invece di metterle nel Budget; unificare `profiles.pay_day` e `income_payday`; le rate pagate finiscono anche nella spesa della loro categoria (conteggio doppio nel Budget per categoria).

---

## Round 1 sul feedback (2026-09-20)

Dati reali (Supabase, 20/09): 12 tester oltre al titolare, 8 non hanno mai inserito una transazione → il muro è tra iscrizione e primo import. Da qui le modifiche:

- **Date**: `lib/dates.ts` (`toISODate`, `todayISO`). MAI `toISOString().split("T")[0]` su date locali: a est di Greenwich sposta di un giorno (Dashboard e Transazioni mostravano periodi diversi). Test: `tests/dates-period.test.ts`.
- **Test**: `npm test` (node:test + tsx), `npm run typecheck`. I calcoli in `lib/` vanno coperti da test.
- **Eventi**: tabella `events` (migration 035), `lib/track.ts`, `components/activity-ping.tsx`. Mai importi o descrizioni nei props. Query di analisi in `docs/09-metriche.md`.
- **Prova Premium**: `TRIAL_DAYS` in `lib/config.ts`; `profiles.trial_ends_at` (migration 036) scritta solo dal server (`lib/trial.ts`, avviata nel layout della dashboard); `resolvePlan()` e `trialDaysLeft()` in `lib/plans.ts`; `getEffectivePlan(plan, trial_ends_at)`. Le query profilo usano `select("*")`, così le pagine reggono anche senza la colonna.
- **Abbonamenti**: `subscription_cancelled` NON declassa (l'utente ha già pagato il periodo): salva `premium_ends_at`; si torna free su `subscription_expired` o `order_refunded`; il Founder non viene mai toccato dal webhook. I pulsanti dei piani su landing e prezzi portano a `/auth/sign-up`: il checkout parte solo da Account, che aggiunge lo `user_id` (senza, il pagamento non si collega a nessun utente).
- **Import**: `lib/import-parse.ts` (intestazioni note, Entrate/Uscite separate, date `dd.mm.yyyy`, importi `1.234,56` e `1,234.56`, mappatura manuale con anteprima e memoria per tipo di file) e `lib/categorize.ts` (vince la parola chiave più lunga, le corte valgono solo come parola intera). La colonna descrizione `operazione` resta prima di `dettaglio` per non rompere il dedup dei file già importati.
- **Onboarding**: 3 passi, salva `profiles.usage_type`, porta a `/dashboard/transazioni?import=1&notour=1`. `GettingStartedCard` in dashboard finché non ci sono transazioni. Tour dashboard ridotto a 5 passi.
- **Export**: `GET /api/export` → CSV dei movimenti (separatore `;`, virgola decimale), reimportabile in Flusso.
- **Testi**: landing, prezzi, privacy (sub-processor Resend e Anthropic) e tour allineati al prodotto reale.
- **Screenshot (fix 2026-09-21)**: non funzionava mai — in produzione mancava `ANTHROPIC_API_KEY` (ora documentata in `.env.example`/README) e il salvataggio inseriva `source: "screenshot"`, rifiutato da `transactions_source_check` (ammessi: manual, excel, import). Ora: immagine ridotta e convertita in JPEG nel browser (`lib/image-prepare.ts`), prompt con la data di oggi, risposta letta e validata da `lib/screenshot-extract.ts`, tetto di 20 analisi/24h per utente (eventi `screenshot_extract`), duplicati segnalati come nell'import Excel, `serverActions.bodySizeLimit` a 4 MB.
- **Import (fix 2026-09-21)**: i movimenti "NON CONTABILIZZATO" (Intesa Sanpaolo) vengono saltati e contati (`isPendingStatus`); con titoli sconosciuti e due colonne "a incastro" la proposta è Entrate/Uscite separate. Layout verificati da parser open source in `tests/import-banks.test.ts`. Postepay: dall'app non si scarica il file, solo dal sito (Movimenti → Scarica elenco su file).
- **Migrazioni da applicare PRIMA del deploy**: `035_events.sql`, `036_trial_and_billing.sql` (additive, collaudate in transazione con rollback).

---

## Panoramica progetto

**Flusso** è una web app di gestione finanziaria personale. Permette di:
- Tracciare entrate e uscite (transazioni)
- Prevedere il budget mensile (Smart > Previsioni)
- Monitorare spese ricorrenti e confrontarle con la realtà (Smart > Ricorrenti)
- Gestire obiettivi di risparmio (Smart > Obiettivi)
- Gestire accantonamenti per spese future (Smart > Accantonamenti)
- Visualizzare dashboard con saldo, trend e grafici
- Report interattivo dei mesi precedenti
- Associare transazioni a componenti del nucleo familiare / gruppo
- Inviare feedback direttamente all'interno dell'app

---

## Stack tecnologico

| Layer | Tecnologia |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript + React 19 |
| Database / Auth | Supabase (Postgres + RLS + Auth) |
| Styling | Tailwind CSS |
| UI primitives | Radix UI |
| Toasts | Sonner |
| Deployment | Vercel (presumibile) |
| PWA | Service Worker, manifest.json, icone |

---

## Struttura cartelle

```
flussoapp/
├── app/
│   ├── dashboard/
│   │   ├── page.tsx                      # Dashboard principale (saldo, trend, breakdown)
│   │   ├── dashboard-client.tsx          # Client: hero, breakdown, month-report-btn
│   │   ├── month-report-modal.tsx        # Modal report mesi precedenti (← → navigazione)
│   │   ├── transazioni/
│   │   │   ├── page.tsx                  # Lista transazioni con filtri
│   │   │   ├── transazioni-client.tsx    # UI transazioni + summary bar + badge membro
│   │   │   ├── smart-client.tsx          # Tab "Previsioni" — budget items vs spesa reale
│   │   │   └── import-excel-modal.tsx    # Import Excel + selezione membro
│   │   ├── smart/
│   │   │   ├── page.tsx                  # Server component Smart; lock screen per piano free
│   │   │   ├── smart-page-client.tsx     # Tab controller: Obiettivi / Impegni (Rate, Accantonamenti, Budget) — Previsioni/Ricorrenti generiche orfane, vedi CLAUDE.md
│   │   │   ├── budget-panel.tsx          # Tab "Budget" — budget mensile per categoria + sottopagina storico/mesi speciali
│   │   │   └── recurring-client.tsx      # CODICE MORTO (non importato da nessuno, come obiettivi-client.tsx)
│   │   ├── obiettivi/
│   │   │   ├── page.tsx                  # redirect → /dashboard/smart (obiettivi vivono nel tab Smart)
│   │   │   └── obiettivi-client.tsx      # CODICE MORTO (non importato da nessuno)
│   │   ├── salvadanai/
│   │   │   ├── page.tsx                  # Salvadanai multipli (server)
│   │   │   ├── salvadanai-client.tsx     # Griglia + wizard + dettaglio + deposito/prelievo
│   │   │   └── savings-actions.ts        # createPot / updatePot / deletePot / addSavingsTransaction
│   │   ├── account/
│   │   │   ├── page.tsx                  # Impostazioni account (server component)
│   │   │   ├── family-members-section.tsx# CRUD componenti famiglia con color picker
│   │   │   ├── power-user-toggle.tsx     # Toggle modalità smanettone
│   │   │   ├── feedback-chat.tsx         # Chat feedback diretto con Marco
│   │   │   └── ...                       # update-name-form, delete-account, plan-section, ecc.
│   │   └── admin/
│   │       ├── page.tsx                  # Pannello admin (solo ADMIN_EMAILS)
│   │       ├── admin-user-row.tsx        # Riga utente espandibile (UUID + data registrazione)
│   │       ├── admin-feedback.tsx        # Vista feedback utenti + form reply
│   │       └── ...                       # admin-coupon-manager, admin-preview-mode
│   ├── onboarding/
│   │   └── page.tsx                      # 3 step: nome → tipo uso → pronto; ?preview=1 per test
│   ├── auth/                             # Login, signup, reset password
│   └── layout.tsx                        # Root layout (nav, theme, TourProvider, TourOverlay)
├── components/
│   ├── nav.tsx                           # Navigazione principale
│   ├── dashboard-nav-links.tsx           # Link nav con pallino rosso tour non visto
│   ├── theme-switcher.tsx                # Dark/light mode toggle
│   ├── tour/
│   │   ├── tour-context.tsx              # TourProvider + useTour hook
│   │   ├── tour-overlay.tsx              # Overlay spotlight + tooltip (createPortal)
│   │   └── page-tour.tsx                 # Per-pagina: avvio automatico + prompt aggiornamento
│   └── auth/                             # Form di autenticazione
├── lib/
│   ├── calculations.ts                   # Funzioni pure di calcolo finanziario
│   ├── tour-steps.ts                     # Definizione tour per pagina (PAGE_TOURS + utility)
│   ├── supabase/
│   │   ├── client.ts                     # Supabase browser client
│   │   └── server.ts                     # Supabase server client (SSR)
│   ├── admin.ts                          # Utility admin
│   ├── plans.ts                          # Logica piani (free/premium/founder)
│   ├── demo.ts                           # Costanti/helper modalità demo
│   ├── import-dedup.ts                   # Anti-duplicati import Excel (hash file + classifyRows)
│   ├── savings.ts                        # Tipi/helper salvadanai multipli
│   ├── notifications.ts                  # Tipi/icone notifiche sviluppatore
│   └── email.ts                          # Utility email
├── supabase/
│   └── migrations/                       # Migrazioni SQL ordinate (001 → 025)
└── public/                               # Icone PWA, manifest
```

---

## Schema database (tabelle principali)

### `profiles`
Profilo utente collegato a `auth.users`.
```
id uuid PK (= auth.users.id)
plan text          -- 'free' | 'premium' | 'founder'
full_name text
pay_day int        -- giorno di inizio periodo di paga (0 = mese solare)
piggy_balance numeric  -- saldo salvadanaio
power_user boolean     -- abilita funzioni avanzate (regole auto-categorizzazione)
lemon_squeezy_subscription_id text NULL  -- id subscription Lemon Squeezy (migration 021), null se piano free/founder
period_starting_balance numeric NULL      -- saldo all'inizio del periodo corrente (migration 022); l'utente inserisce il saldo di OGGI e la card lo riporta a inizio periodo sottraendo le transazioni gia' registrate
period_starting_balance_date date NULL    -- data a cui si riferisce period_starting_balance (= inizio periodo corrente)
-- Anagrafica reddito titolare (migration 023): stessi 6 campi di family_members (income_type, monthly_income, income_frequency, income_payday, income_variability, active_months)
```
> `balance` è stato rimosso con migration 015. Il saldo "attuale" si calcola sempre come `period_starting_balance + somma transazioni da quella data` — non è mai un campo mutabile scritto direttamente da un flusso di spesa/pagamento (vedi Saldo progressivo giornaliero).

### `categories`
Categorie spese (sistema + custom utente). Categorie di sistema (`user_id IS NULL`): migration 002/006 + `Hobby` 🎮 e `Accantonamenti` 🏦 (migration 023). Macro-mapping in `lib/calculations.ts` (`CATEGORY_TO_MACRO`): Hobby → Cibo & Svago, Accantonamenti → Risparmio.
```
id uuid PK
user_id uuid NULL  -- NULL = categoria di sistema globale
name text
color text   -- hex color
icon text    -- emoji
is_system boolean
```

### `transactions`
Transazioni finanziarie (entrate positive, uscite negative).
```
id uuid PK
user_id uuid
date date
amount numeric  -- positivo = entrata, negativo = uscita
description text
merchant text
category_id uuid FK categories
source text  -- 'manual' | 'excel' | 'import'
notes text
member_id uuid FK family_members NULL  -- componente famiglia associato (migration 018)
```

### `family_members`
Componenti del nucleo familiare / gruppo condiviso.
```
id uuid PK
user_id uuid
name text
color text     -- hex color (#6366f1 default)
is_owner boolean default false  -- migration 030: questo componente rappresenta il titolare; max 1 per user_id (unique index parziale)
created_at timestamptz
-- Anagrafica reddito (migration 023, tutti NULL di default; stessi campi anche su profiles):
income_type text        -- 'employee' | 'freelance' | 'seasonal' | 'none'
monthly_income numeric   -- equivalente mensile netto
income_frequency text    -- 'monthly' | 'biweekly' | 'weekly' (solo employee)
income_payday int        -- giorno del mese di accredito (solo employee)
income_variability text  -- 'low' | 'medium' | 'high' (solo freelance)
active_months int[]      -- mesi lavorati 1-12 (solo seasonal), default '{}'
```
> Se un componente ha `is_owner = true`, il reddito del titolare (`profiles.income_*`) viene **ignorato** in `aggregateExpectedIncome` (vedi `EstimateAndSavingsCard`/`BalanceHeroCard`) per non sommarlo due volte — quel componente diventa l'unica fonte. In Account, la sezione "Il tuo reddito" si nasconde e rimanda al componente.

### `import_logs`
Hash dei file Excel importati, per rilevare lo stesso file caricato due volte (migration 024). Distinta da `excel_uploads` (rate-limit piano free).
```
id uuid PK
user_id uuid FK auth.users
file_hash text            -- SHA-256 dei byte del file
filename text
transaction_count int
member_id uuid FK family_members NULL
imported_at timestamptz
```

### `variable_expense_categories`
Migration 031. **Legacy, non più referenziata da nessun codice**: guidava il vecchio range min-max automatico di "Spese variabili" in dashboard e nel pannello Smart, entrambi sostituiti dal budget manuale per categoria (`category_budgets`, tab Smart → Budget). La tabella resta nel DB (dati storici, nessuna migrazione di drop) ma non viene più letta né scritta.
```
id uuid PK · user_id uuid FK auth.users · category_id uuid FK categories · created_at timestamptz
unique(user_id, category_id)
```

### `category_budgets` / `category_budget_notes`
Tab Smart → Budget: budget mensile impostato a mano per categoria, con storico e annotazione dei mesi "speciali" (migration 032). Sostituisce sia il vecchio pannello Smart "Spese variabili" sia il suo range min-max automatico usato in dashboard: `BalanceHeroCard` ed `EstimateAndSavingsCard` sommano `monthly_budget` di tutte le righe dell'utente come "Budget spese variabili" nel calcolo di "Spese previste"/"Totale previsto".
```
category_budgets
  id · user_id FK auth.users · category_id FK categories · monthly_budget numeric default 0 · updated_at
  unique(user_id, category_id)
category_budget_notes
  id · user_id FK auth.users · category_id FK categories · year int · month int (1-12) · note text · created_at/updated_at
  unique(user_id, category_id, year, month)
```
La classificazione "mese speciale" (scostamento >50% dalla media dei mesi normali) è calcolata al volo lato client (`classifyCategoryMonths` in `lib/calculations.ts`) sugli ultimi 12 mesi di transazioni; solo il testo della nota è persistito.

### `goals`
Obiettivi di risparmio.
```
id uuid PK
user_id uuid
name text
target_amount numeric
current_amount numeric
deadline date NULL
icon text  -- emoji
savings_pot_id uuid FK savings_pots NULL   -- salvadanaio collegato (migration 027)
monthly_contribution numeric NULL          -- quota mensile pianificata (migration 027)
```

### `goal_contributions`
Storico versamenti verso un obiettivo (migration 027). Trigger `apply_goal_contribution` incrementa `goals.current_amount`.
```
id uuid PK · goal_id uuid FK goals · user_id uuid · amount numeric · note text NULL · date date · created_at timestamptz
```

### `savings_pots` / `savings_pot_members` / `savings_transactions`
Salvadanai multipli (migration 026). Sostituiscono il singolo `profiles.piggy_balance`, che ora è **derivato**: trigger `sync_piggy_balance` lo tiene = `SUM(savings_pots.current_balance)` dell'utente, così tutto il codice Accantonamenti esistente continua a funzionare.
```
savings_pots
  id · user_id · name · emoji · description NULL · target_amount NULL
  current_balance numeric · is_shared bool · color · created_at/updated_at
savings_pot_members          -- ripartizione per componente (family_members, NON utenti)
  id · pot_id FK · member_id uuid FK family_members NULL (NULL = titolare) · contributed_amount · joined_at
  unique(pot_id, member_id)
savings_transactions
  id · pot_id FK · user_id · member_id FK family_members NULL
  amount numeric>0 · type 'deposit'|'withdraw' · note NULL · date · created_at
```
Trigger `apply_savings_transaction`: applica il movimento a `current_balance` e a `savings_pot_members.contributed_amount`.

### `admin_notifications` / `notification_dismissals`
Campanella notifiche sviluppatore (migration 028). Le righe si inseriscono a mano da Supabase Studio.
```
admin_notifications
  id · title · message · type 'info'|'tip'|'warning'|'feedback_request'
  target_plan 'all'|'free'|'premium'|'founder' · is_active bool
  created_at · expires_at NULL · cta_text NULL · cta_url NULL
  RLS: select using(true)
notification_dismissals
  id · notification_id FK · user_id · dismissed_at · unique(notification_id, user_id)
```

### `budget_items`
Voci di budget per il tab "Previsioni" (Smart).
```
id uuid PK
user_id uuid
name text
amount numeric
frequency text  -- 'mensile' | 'settimanale' | 'annuale' | 'una_tantum'
category_id uuid FK categories NULL
```

### `recurring_expenses`
Spese ricorrenti per il tab "Ricorrenti" (Smart). Aggiunta con migration 009, estesa fino alla 017.
```
id uuid PK
user_id uuid
name text
secondary_name text NULL    -- nome dalla transazione collegata (mostrato tra parentesi)
tipologia text              -- 'fissa' | 'variabile' | 'entrata'
frequency text              -- 'mensile' | 'bimestrale' | 'trimestrale' | 'semestrale' | 'annuale' | 'personalizzata'
custom_days int NULL        -- solo se frequency = 'personalizzata'
due_day int NULL            -- giorno del mese scadenza
due_month int NULL          -- mese (1-12) per voci annuali
amount numeric
amount_max numeric NULL     -- max range (solo variabile)
category_id uuid FK categories NULL
notes text NULL
match_keywords text[]       -- parole chiave riconoscimento automatico (default '{}')
matching_strategy text      -- 'keyword' | 'historical_avg'
next_due_date date NULL     -- prossima scadenza (accantonamenti)
saving_start_date date NULL -- data inizio accantonamento
last_paid_date date NULL       -- ultima data di conferma pagamento (migration 022)
payment_status text            -- 'pending' | 'paid' | 'overdue' (migration 022, aggiornato solo da "Segna come pagata")
debt_type text NULL            -- 'mutuo' | 'rata_acquisto' | 'debito_persona' | 'altro' (migration 033); non NULL = la voce è una Rata
debt_total_amount numeric NULL -- importo totale finanziato/dovuto (solo se debt_type valorizzato)
debt_start_date date NULL      -- data di inizio del piano di rientro (solo se debt_type valorizzato)
savings_pot_id uuid FK savings_pots NULL ON DELETE SET NULL  -- salvadanaio collegato (migration 034, solo accantonamenti)
```

### `payment_confirmations`
Storico conferme di pagamento manuali per `recurring_expenses`. Aggiunta con migration 022.
```
id                    uuid PK
recurring_expense_id  uuid FK recurring_expenses
user_id               uuid FK auth.users
paid_date             date
amount_paid           numeric
notes                 text NULL
created_at            timestamptz
```
RLS: `user_id = auth.uid()`.

### `excel_uploads`
Log degli import Excel (rate limiting piano free: max 3/mese).
```
id uuid PK
user_id uuid FK profiles
uploaded_at timestamptz
```

### `feedback_messages`
Messaggi utente → Marco e risposte di Marco.
```
id uuid PK
user_id uuid FK auth.users  -- conversazione identificata da user_id
body text
is_admin boolean  -- false = messaggio utente, true = risposta di Marco
created_at timestamptz
```
RLS: utenti vedono solo i propri (`user_id = auth.uid()`); founder ha accesso totale e può inserire risposte (`is_admin=true` con qualsiasi `user_id`).

### `category_rules`
Regole di categorizzazione automatica (visibili solo se `power_user = true`).
```
category_id uuid
field text   -- 'description' | 'merchant' | 'amount'
operator text  -- 'contains' | 'starts_with' | 'ends_with' | 'equals'
value text
priority int
```

### `display_rules`
Regole di riscrittura descrizioni transazioni per UI.

### `coupon_codes`
Coupon monouso per upgrade piano.
```
id uuid PK
code text UNIQUE
plan text       -- 'premium' | 'founder'
used boolean
used_by uuid NULL
used_at timestamptz NULL
notes text NULL
```

---

## Pagine e funzionalità

### Onboarding (`/onboarding`)
Componente: `app/onboarding/page.tsx`
- **Step 1**: inserimento nome (salvato in `profiles.full_name`)
- **Step 2**: tipo uso (solo / coppia / famiglia / coinquilini) — raccolta UX, non persistito
- **Step 3**: schermata "Sei pronto!" con redirect a `/dashboard?tour=1`
- **`?preview=1`**: modalità test (nessuna scrittura DB, banner giallo, redirect a `/dashboard?tour=1`); attivabile dal pannello admin con "Test primo utilizzo"

### Dashboard (`/dashboard`)
- **Breakdown macro-categorie** con accordion per categoria
- **Card saldo unificata** (`BalanceHeroCard`, `data-tour="hero"`) — al primo utilizzo (e da "Modifica") chiede il saldo che l'utente ha OGGI sul conto e lo riporta a inizio periodo sottraendo le transazioni già registrate (`period_starting_balance`/`_date`). Schema a 3 righe, ogni voce è un dropdown che mostra le transazioni (o il calcolo) sottostanti — utile per individuare errori/duplicati:
  - **Riga 1 (effettivi, in grande)**: Saldo attuale stimato (`starting + somma transazioni reali fino a oggi`, nero, dropdown = **contributo netto per componente** — entrate reali meno spese reali intestate a ciascun componente nel periodo corrente, bucket "Non assegnato" per le transazioni senza `member_id` — seguito dalla lista movimenti) · Spese affrontate (rosso, dropdown = lista spese) · Entrate effettive (verde, dropdown = lista entrate) — le ultime due sul periodo corrente, esclusi i trasferimenti (`isTransferCategory`: `spostamenti`/`salvadanaio`, vedi nota 2026-09-15 sotto — "Accantonamenti" NON è escluso, conta come spesa)
  - **Riga 2 (previsti, più piccola)**: Saldo fine mese stimato (entrate da stipendio previste − spese previste, dropdown = scomposizione formula) · Spese previste (**Rate in corso + accantonamento mensile + budget spese variabili**, i tre pilastri di Smart → Rate/Accantonamenti/Budget — le spese fisse generiche non-rata non contano più qui, vedi nota 2026-09-14 nella sezione Smart, dropdown = elenco completo con link a Smart) · Entrate da stipendio previste (verde, singolo numero, da anagrafica reddito titolare+componenti, mese corrente, dropdown = importo per persona)
  - **Riga 3 (differenze)**: Differenza saldo/spese/entrate = previsto − effettivo per ciascuna coppia di voci di riga 1/2, colore verde/rosso in base al segno, dropdown = i due valori a confronto
  - Sotto: **Salvadanai** separato in fondo (totale = `piggy_balance`, tenuto in sync col trigger, link a `/dashboard/salvadanai`)
  - Rimossi rispetto a versioni precedenti: timeline SVG giornaliera, badge "sei in linea" e voce "Spese variabili" a sé stante; **2026-09-14**: rimossa anche la stima automatica min-max di categorie/bollette stagionali — "Spese previste" ora usa il totale budget impostato a mano in Smart → Budget (`category_budgets`), quindi è un valore singolo, non più un range
- **Banner spese scadute** (`OverdueExpensesBanner`) — spese `fissa` con `due_day` passato senza pagamento confermato né transazione auto-riconosciuta; bottone "Segna come pagata" scrive su `payment_confirmations` e aggiorna `last_paid_date`/`payment_status`
- **Bottone "Mesi precedenti"** → apre `MonthReportModal`
- **Campanella 🔔** (`NotificationsBell`) nella top-nav — vedi sezione "Modalità demo"/schema `admin_notifications`

> Lo score finanziario (🟢 Ottimo → 🔴 Critico) mostrato in precedenza nella hero è stato rimosso: ridondante con le righe effettivi/previsti di `BalanceHeroCard`.

> **2026-09-15 — trasferimenti centralizzati**: `TRANSFER_CATEGORY_NAMES`/`isTransferCategory` (`lib/calculations.ts`) sostituiscono i `TRANSFER_CATS` locali duplicati in `balance-hero-card.tsx`, `month-report-modal.tsx` e `dashboard-client.tsx`. L'insieme è `spostamenti`/`salvadanaio`. Per i bonifici occasionali senza categoria naturale (es. un prestito restituito da terzi) non è stato aggiunto un flag dedicato: si usa la categoria "Spostamenti" già esistente e già esclusa. `app/dashboard/estimate-and-savings-card.tsx` (codice morto, vedi nota 2026-09-14 sopra) non è stato aggiornato: mantiene il vecchio `TRANSFER_CATS` locale, irrilevante finché resta non importato.
>
> **Nota 2026-09-15, stessa giornata**: "Accantonamenti" era stato aggiunto per un breve periodo a `TRANSFER_CATEGORY_NAMES` (le transazioni con quella categoria coprono anche i prelievi reali dal salvadanaio, auto-categorizzati per parola chiave dall'import Excel in `import-excel-modal.tsx`) ma è stato tolto su richiesta esplicita: le cifre caricate con categoria "Accantonamenti" devono continuare a contare come spesa reale in dashboard/report, non come trasferimento. Tenerne conto se si ritorna su questa logica.

> **2026-09-14**: rimosse dalla dashboard anche le card "Spese previste + suggerimento risparmio" (`EstimateAndSavingsCard`) e "Spese ricorrenti" (`RecurringDashboardCard`) — la prima duplicava "Spese previste" già in `BalanceHeroCard` riga 2. I due componenti restano nel codice (`app/dashboard/estimate-and-savings-card.tsx`, `app/dashboard/recurring-dashboard-card.tsx`) ma non sono più importati da `dashboard-client.tsx` — stesso pattern del codice morto già segnalato in Smart.

### Salvadanai (`/dashboard/salvadanai`)
Griglia di salvadanai (`savings_pots`). Card: emoji+nome, saldo, barra verso `target_amount`, badge "condiviso" + breakdown per componente. Wizard 4 step (nome/emoji → obiettivo → condiviso+componenti → riepilogo). Dettaglio pot: storico `savings_transactions` + Deposita/Preleva (modale importo+nota, se condiviso selettore componente — mostra "Io" solo se non esistono componenti, altrimenti richiede di scegliere un componente). Il totale è mirrorato su `profiles.piggy_balance` dal trigger `sync_piggy_balance`, quindi il tab Accantonamenti resta invariato.

> Le voci ricorrenti con cadenza bimestrale/trimestrale/semestrale/personalizzata (senza `next_due_date`) non hanno una data deducibile dallo schema: sono escluse dalla timeline giornaliera e dal rilevamento scadute, ma restano nella stima min/max mensile. Le voci con `next_due_date` valorizzato sono gestite dagli Accantonamenti e restano escluse da queste 3 feature per non interferire con quella logica.

#### MonthReportModal
`app/dashboard/month-report-modal.tsx`
- Navigazione ← → per mese (default mese precedente, blocca mesi futuri)
- Fetch transazioni client-side per il mese selezionato
- KPI: entrate / uscite / risparmio, score finanziario, breakdown per categoria

### Transazioni (`/dashboard/transazioni`)
- Lista transazioni con filtri mese, categoria, tipo
- **Summary bar** sopra la lista: count + totale entrate + totale uscite, aggiornati in tempo reale
- **Badge membro** colorato su ogni transazione con `member_id` (mobile: sotto data; desktop: inline)
- **Import Excel** (`import-excel-modal.tsx`), 3 step:
  1. **Persona** — mostrato solo se esistono `family_members`; una card per membro (niente più card "Io" di default: chi ha componenti deve aver aggiunto anche se stesso come componente), "Continua" attivo solo dopo tap esplicito. Utente solo (nessun componente) → step saltato, transazioni con `member_id NULL`.
  2. **Upload** — drag&drop; alla lettura si calcola l'hash SHA-256 e si interroga `import_logs`: se il file è già stato caricato → warning "Importa comunque".
  3. **Anteprima** — ogni riga classificata (`lib/import-dedup.ts` → `classifyRows`): 🟢 nuova / 🟡 possibile duplicato (stessa data+importo, descrizione diversa) / 🔴 duplicato esatto (saltato). Riepilogo conteggi + "Revisiona manualmente" (checkbox per riga gialla). Bottoni: "Importa solo nuove" / "Importa tutto". A fine import → riga in `import_logs`.
- ✏️ fuori dall'hamburger per "modifica categorie" (mobile, sempre visibile)
- Hamburger con "Regole" visibile **solo se `power_user = true`**
- CRUD completo (add, edit, delete)

### Smart (`/dashboard/smart`)
- **Piano free**: schermata di blocco 🔒 + tour `freePreview` che spiega le feature e invita all'upgrade
- **Piano premium/founder**: accesso completo a Obiettivi e al sottomenu "Rate, Accantonamenti, Budget"

> **2026-09-14 — riorganizzazione**: la copertina di Smart aveva prima anche "➕ Aggiungi spesa ricorrente" (wizard generico a 6 step, `view === "add-recurring"`), "📋 Le mie spese ricorrenti" (`view === "list-recurring"`, lista fisse/variabili/entrate) e "🔮 Previsioni" (`view === "previsioni"`, ricorrenti previste vs speso). Rimosse dalla copertina — ogni spesa fissa ora si traccia come Rata, Accantonamento o Budget, non più genericamente — ma il **codice resta nel file, ora irraggiungibile dalla UI** (stesso pattern già usato per `obiettivi-client.tsx`, marcato codice morto). Il form generico di modifica (`view === "edit-recurring"`, raggiunto da `goEditRecurring`) **resta invece attivo**: è ancora usato per modificare Rate/Accantonamenti/qualsiasi voce da dentro le rispettive sezioni. Anche `recurring-client.tsx` (file a sé per un vecchio tab "Ricorrenti") non è mai stato importato da nessuna parte — codice morto pre-esistente, non toccato in questa sessione. Al primo accesso dopo l'aggiornamento, il tour (`lib/tour-steps.ts`, v2.0) spiega il cambiamento.

#### Tab: Obiettivi
Wizard 6 step (`smart-page-client.tsx`, `view === "add-goal"`): nome/icona → importo → scadenza (con quota mensile suggerita) → **salvadanaio collegato** (`goals.savings_pot_id`) → **contributo mensile** (`goals.monthly_contribution`) → riepilogo. `view === "goal-detail"`: progress, quota necessaria vs impostata, stima raggiungimento (`estimateGoalCompletion`), proiezione SVG, storico `goal_contributions` + "Aggiungi contributo" (`goal-actions.ts` → trigger aggiorna `current_amount`). Limite free: 1 obiettivo.

### Cover "Rate, Accantonamenti, Budget" (sottomenu `view === "impegni"`)
I tre tab seguenti sono raggruppati in Smart sotto un'unica voce di copertina (`data-tour="smart-impegni"`, non più tre voci separate): il tap apre un sottomenu con le tre card, ciascuna con il proprio `onBack` che torna a `"impegni"` invece che a `"cover"`.

#### Tab: Rate
Inline in `smart-page-client.tsx` (`view === "rate"` / `"rate-form"`), stessa tabella `recurring_expenses` delle altre voci Ricorrenti — una Rata è una riga con `tipologia = 'fissa'`, `frequency = 'mensile'` e `debt_type` valorizzato ('mutuo' | 'rata_acquisto' | 'debito_persona' | 'altro'), quindi conta automaticamente nelle "Spese fisse" della dashboard senza bisogno di codice dedicato. Form dedicato (non il wizard generico di Ricorrenti, i cui step non calzano): tipo, nome, rata mensile, importo totale finanziato, data di inizio, giorno del mese opzionale, **Collega a transazione** (stesso meccanismo di Ricorrenti: cerca tra le transazioni, il testo scelto diventa `secondary_name` e fa da parola chiave — `effectiveKws`/`txMatchesKeywords`). `end_date` viene calcolato e salvato in automatico (`computeDebtProgress` in `lib/calculations.ts`, stessa forma di `projectSinkingFund` ma "al contrario": scala un importo totale noto invece di accumulare verso una scadenza), così la voce sparisce da sola dalla data di fine riusando la logica `end_date` già esistente. Ogni card mostra: rata mensile, barra di progresso, pagato/totale (dalla proiezione temporale, non dalle transazioni), mesi mancanti, mese di fine, un badge di stato (`computeDebtProgress(...).status`, calcolato da `debt_start_date` vs oggi: **future** = "🕓 Inizia il gg/mm/aaaa" se `debt_start_date` è nel futuro, **active** = "🟢 In corso", **finished** = "⚪ Terminata" quando `monthsRemaining` arriva a 0), e — se collegata a una transazione e in corso — un badge "✅ Pagata questo mese" / "⏳ Non ancora pagata questo mese" calcolato sulle transazioni reali del periodo corrente. Lista ordinata: in corso (le più vicine alla fine in cima) → non ancora iniziate (le più imminenti in cima) → terminate in fondo (le più recenti in cima), queste ultime mostrate un po' sbiadite. **"Totale rate al mese" e "Debito residuo" in cima contano solo le rate in corso** — quelle future non ancora iniziate non pesano finché non partono. Può anche essere modificata dal form generico di Ricorrenti (stessa riga, campi condivisi) — quel form non tocca i campi `debt_*`, quindi non li corrompe, ma nemmeno li aggiorna.

#### Tab: Accantonamenti
Pianifica spese future grandi (vacanze, assicurazione…). Campi `next_due_date` e `saving_start_date` su `recurring_expenses`. **"+ Aggiungi" apre un form dedicato** (`view === "accantonamento-form"`, solo aggiunta): tipo fisso/variabile, nome, frequenza, importo (+ massimo se variabile), prossima scadenza, **salvadanaio collegato** (opzionale, singolo — vedi sotto), Collega a transazione — sostituisce la dipendenza dal vecchio wizard generico di Ricorrenti, che era l'unico modo per crearne di nuovi prima di questa sessione. La **modifica** di una voce esistente resta invece sul form generico di Ricorrenti (bottone ✏️ su ogni card, stesso picker salvadanaio mostrato quando `frequency !== 'mensile'`). Banner "fase di recupero" quando la quota mensile è a regime. Per ogni voce, se esiste una transazione reale che corrisponde (`effectiveKws`/`txMatchesKeywords`, stesso meccanismo di Ricorrenti) datata dopo l'inizio del ciclo corrente (`saving_start_date`, per non ripescare pagamenti di cicli già confermati), compare un banner "💡 Trovato: importo/data" con un tasto "Conferma" che pre-compila il dialogo di conferma con l'importo reale trovato — resta comunque un passo manuale, non marca da sola per evitare che un match sbagliato sposti soldi dal salvadanaio.

> **2026-09-15 — salvadanaio collegato**: ogni accantonamento può referenziare un singolo `savings_pots.id` (`recurring_expenses.savings_pot_id`, migration 034, picker nel form di aggiunta e in quello di modifica). "Segna come pagata" con "scala dal salvadanaio" (`sinking-fund-actions.ts` → `markSinkingFundPaid`) preleva da quel pot specifico invece che dal primo pot creato dall'utente; il fallback al primo pot (poi update diretto di `piggy_balance` se l'utente non ha pot) resta invariato per le voci senza salvadanaio collegato. Il dialogo di conferma e i pulsanti "✓ Pagata"/banner "Trovato" mostrano e usano il saldo del pot collegato (non più sempre il totale aggregato `piggy_balance`) per decidere lo stato iniziale del checkbox e il calcolo "andrebbe in negativo".
>
> Le transazioni con categoria "Accantonamenti" 🏦 contano come spesa reale in dashboard/report (NON sono in `TRANSFER_CATEGORY_NAMES`/`isTransferCategory` — vedi nota 2026-09-15 sopra nella sezione Dashboard: erano state escluse per un breve periodo lo stesso giorno, poi il cambio è stato annullato su richiesta esplicita). Nella lista voci compare comunque una card "💰 Accantonato da transazioni questo mese" con la somma di quelle transazioni nel periodo corrente (solo notifica informativa — nessun collegamento automatico a una voce specifica).

#### Tab: Budget
File a sé (`budget-panel.tsx`, non inline in `smart-page-client.tsx` come le altre tab). Sostituisce il vecchio pannello "Spese variabili" (selezione categorie + range automatico min-max). Il totale dei budget (`category_budgets.monthly_budget`) è anche la fonte di "Spese previste"/"Totale previsto" in dashboard (`BalanceHeroCard`, `EstimateAndSavingsCard`).
- **Schermata principale**: card "Budget del mese" col totale (somma dei budget impostati) e speso finora nel mese; sotto, l'elenco di tutte le categorie di spesa (escluse quelle di reddito/trasferimento: Stipendio, Spostamenti, Salvadanaio) con badge "Nel budget"/"Sopra budget"/"Da impostare".
- **Sottopagina per categoria** (tap su una riga): budget mensile con bottone "Modifica", spesa del mese corrente, storico degli ultimi 12 mesi con media dei mesi "normali".
- **Mesi speciali**: un mese che si scosta di oltre il 50% dalla media (`classifyCategoryMonths` in `lib/calculations.ts`, due passate per non far trascinare la soglia da un singolo mese estremo) è escluso dal calcolo della media ed etichettato "⭐ Speciale" nello storico; l'utente può aggiungere/modificare/rimuovere una nota libera per spiegare l'anomalia (`category_budget_notes`), persistita per quel mese specifico indipendentemente da riclassificazioni future.
- **Categoria "Accantonamenti" bloccata** (badge 🔒 "Automatico", niente bottone "Modifica"): il suo budget non è impostabile a mano, è sempre uguale alla quota mensile consigliata dal tab Accantonamenti (`aggregateSinkingFunds(...).this_month_total`, stesso calcolo di `BalanceHeroCard`) — evita due numeri diversi per la stessa cosa e il doppio conteggio in dashboard (dove quella quota è già sommata a parte). Nessuna riga viene mai scritta su `category_budgets` per questa categoria; un `useEffect` in `budget-panel.tsx` ripulisce eventuali righe residue create prima di questa regola.

### Account (`/dashboard/account`)
- Gestione profilo e cambio nome
- Piano di abbonamento + riscatto coupon
- **Il tuo reddito** (`IncomeSection` + `income-action.ts`): wizard reddito per il titolare, salva su `profiles` — **nascosto** (sostituito da una nota) se esiste un componente con `is_owner = true`
- **Componenti famiglia** (`FamilyMembersSection`): CRUD (nome + colore + **modifica**) e, per ogni membro, wizard reddito (`components/income-wizard.tsx`, 3 step: tipo → dettagli → riepilogo) salvato su `family_members`. Checkbox "Sei tu" marca il componente come `is_owner` (uno solo per utente, badge "tu" in lista). Il reddito aggregato (titolare + membri, o solo membri se uno è `is_owner`) alza `expectedIncome` in `EstimateAndSavingsCard`/`BalanceHeroCard` (via `aggregateExpectedIncome` in `lib/calculations.ts`)
- **Modalità smanettone** (`PowerUserToggle`): aggiorna `profiles.power_user`; sblocca "Regole" in Transazioni
- **Chat feedback** (`FeedbackChat`): chat diretta con Marco; Invio per inviare; salva in `feedback_messages`
- **Annulla abbonamento** (`CancelSubscriptionButton`): visibile solo per piano `premium` con `lemon_squeezy_subscription_id` valorizzato (il piano `founder` è pagamento unico, nulla da annullare). Conferma via modale → `POST /api/subscription/cancel` → chiama l'API Lemon Squeezy (`DELETE /v1/subscriptions/:id`) e riporta il piano a `free` immediatamente lato DB; il webhook `subscription_cancelled` è idempotente e conferma la stessa transizione
- Eliminazione account

### Admin (`/dashboard/admin`) — solo `ADMIN_EMAILS`
- **Lista utenti** (`AdminUserRow`): righe compatte espandibili (UUID + data)
- **Coupon manager**: crea coupon monouso
- **Preview mode**: simula piano diverso per testing
- **Test primo utilizzo**: apre `/onboarding?preview=1` in nuova tab
- **Feedback utenti** (`AdminFeedback`): sidebar con lista utenti che hanno scritto; chat per ogni utente; form di risposta (inserisce `is_admin=true` con `user_id` del destinatario)
- **Anteprima delle novità** (2026-09-24): vedi sotto.

#### Anteprima delle novità

L'admin vede le modifiche non ancora pubblicate con il proprio account, prima di dire "pubblica".

- **Dove**: Admin → card "Anteprima delle novità" (`app/dashboard/admin/admin-anteprima.tsx`): elenco delle PR aperte (API pubblica di GitHub, `pendingChanges` in `lib/anteprima.ts`, nessuna chiave) e tasto "Apri anteprima".
- **Cosa apre**: il deploy di Vercel del branch **`anteprima`**, indirizzo fisso `https://flusso-app-git-anteprima-garman94s-projects.vercel.app` (`PREVIEW_URL`, sovrascrivibile da env). Stesso database del sito: i dati sono quelli veri e quello che si fa lì resta salvato.
- **Accesso**: la sessione del sito non vale su un altro indirizzo, e l'accesso con Google riporterebbe al sito pubblicato. Il tasto chiama `previewLoginUrl` (`app/actions/anteprima.ts`, solo admin): `auth.admin.generateLink({ type: "magiclink" })` per l'email dell'admin, senza inviare email, e apre `<anteprima>/auth/confirm?token_hash=…`, che fa `verifyOtp`. La scheda si apre dentro il clic (`window.open` prima dell'attesa) per non essere bloccata.
- **Vercel**: le anteprime sono protette da Vercel Authentication. Senza altro, la prima volta Vercel chiede il login Vercel dell'admin. Se su Vercel si attiva "Protection Bypass for Automation", la variabile di sistema `VERCEL_AUTOMATION_BYPASS_SECRET` fa saltare anche quello (il link aggiunge `x-vercel-protection-bypass`).
- **Striscia viola** in cima alle pagine quando `VERCEL_ENV === "preview"` (`components/anteprima-banner.tsx`), con "Torna al sito".
- **Come si aggiorna (a ogni PR)**: il branch `anteprima` = `main` + tutti i branch delle PR aperte uniti; va rispinto dopo ogni modifica a una PR o dopo un merge in main. Una migration che aggiunge colonne va applicata prima di mandare il codice in anteprima, perché l'anteprima usa il database vero. Le migration che toccano solo la demo si applicano al "pubblica": nell'anteprima la demo resta quella vecchia.
- Prova in locale: due `next start` (`ADMIN_EMAILS=demo@flussoapp.it PREVIEW_URL=http://localhost:3001` sulla 3000, `VERCEL_ENV=preview` sulla 3001), entrare in /demo sulla 3000, admin → "Apri anteprima".

---

## Modalità demo

Account condiviso `demo@flussoapp.it` (env `NEXT_PUBLIC_DEMO_EMAIL` / `NEXT_PUBLIC_DEMO_PASSWORD`), piano `premium`.

- Ingresso: bottone "Prova la demo →" sulla landing (`app/page.tsx`) e link "Esplora senza registrarti" nel `LoginForm`.
- `app/demo/page.tsx` (client): `POST /api/demo/reset` (best-effort) → `signInWithPassword` con le credenziali demo → redirect `/dashboard`.
- `app/api/demo/reset/route.ts`: service-role → `supabase.rpc("reseed_demo")`; senza `SUPABASE_SERVICE_ROLE_KEY` risponde 204.
- `reseed_demo()` (migration 025, SECURITY DEFINER): cancella e ricarica i dati demo (transazioni ~3 mesi ancorate a `current_date`, membro "Samira Demo", 3 obiettivi, ricorrenti, `piggy_balance`, `period_starting_balance`).
- Trigger `block_demo_writes` su tutte le tabelle dati: una sessione loggata come demo (`auth.jwt()->>'email'`) non può scrivere (eccezione `DEMO_READONLY`). `reseed_demo` e il service-role bypassano (`auth.jwt()` NULL).
- UI: `DemoBanner` arancione in `app/dashboard/layout.tsx`; `DemoProvider` + `useIsDemo()`/`useDemoGuard()` (`components/demo-context.tsx`) — i punti "salva/importa" (transazioni, obiettivi, componenti, feedback, import) mostrano il toast "Registrati per salvare i tuoi dati".
- `supabase/seed_demo.sql` = wrapper che chiama `select public.reseed_demo();`.

## Sistema tour (spotlight guidato)

### Architettura
```
TourProvider (app/layout.tsx)
  ↳ TourOverlay (createPortal su document.body)  — overlay spotlight + tooltip
  ↳ PageTour (in ogni pagina)                    — decide quale tour avviare
```

### Logica avvio
1. **Primo accesso** (chiave localStorage assente): tour parte automaticamente dopo 800ms, nessun prompt
2. **Aggiornamento versione** (chiave presente ma versione diversa): card "C'è un aggiornamento! Vuoi vedere il tutorial?"
3. **`?tour=1`** (da onboarding o link): rimuove param, avvia dopo 500ms
4. **Pallino rosso nav**: click → se già sulla pagina avvia il tour; altrimenti naviga a `href?tour=1`

### Free preview tour
Se `plan === 'free'` e la pagina ha `freePreview` definito in `PAGE_TOURS`, al primo accesso parte il tour freePreview. Gli step freePreview non usano `target` (pagina bloccata non ha `data-tour` attrs). Attualmente configurato per `/dashboard/smart`.

### Attributi `data-tour`
```
hero, breakdown, month-report-btn          dashboard
nav-transazioni, nav-smart                 nav
tx-nav, tx-summary, tx-filters, tx-add    transazioni
smart-obiettivi, smart-impegni              smart (cover)
account-income, account-family,            account
account-power-user, account-feedback
```

> Versioni tour: `/dashboard` v1.7 · `/dashboard/transazioni` v1.2 · `/dashboard/smart` v2.1 · `/dashboard/salvadanai` v1.0 · `/dashboard/account` v1.4. Aggiorna questa riga ad ogni bump versione in `lib/tour-steps.ts`.

### LocalStorage
Chiave per pagina: `flusso_tour_v:/dashboard` ecc. Assente = primo accesso. Valore diverso dalla versione in `PAGE_TOURS` = aggiornamento.

---

## Componenti famiglia

1. Crea i "Componenti" in Account (nome + colore) — **aggiungi anche te stesso** come primo componente e spunta "Sei tu": da quando esiste almeno un componente, i picker (import Excel, salvadanai condivisi) non offrono più una card/opzione "Io" di default
2. Il componente marcato "Sei tu" (`is_owner`) diventa l'unica fonte per il reddito del titolare: la sezione "Il tuo reddito" in Account si nasconde e rimanda a lui, evitando di contarlo due volte in `aggregateExpectedIncome`
3. All'import Excel, seleziona il membro che ha fatto le spese
4. Transazioni mostrano badge colorato con il nome
5. `transactions.member_id FK family_members(id) ON DELETE SET NULL` — `NULL` resta valido per le transazioni storiche/degli utenti senza componenti, ma non è più selezionabile esplicitamente una volta aggiunto almeno un componente

---

## Modalità smanettone (`power_user`)

- `profiles.power_user boolean` (migration 019, default false)
- Toggle in Account con `useTransition` (optimistic update)
- Quando `true`: hamburger con "Regole" in Transazioni + bottone "Regole" desktop
- Quando `false`: solo ✏️ per modifica categorie (sempre visibile)

---

## Funzioni di calcolo (`lib/calculations.ts`)

| Funzione | Descrizione |
|----------|-------------|
| `formatEuro(n)` | Formatta numero in stringa EUR italiana |
| `calculateFinancialScore(income, expenses)` | Score 🔴→🟢 basato su ratio |
| `calculateMacroBreakdown(transactions)` | Breakdown per macro-categorie (8 slot) |
| `calculateCategoryBreakdown(transactions)` | Breakdown per categoria esatta |
| `estimateGoalCompletion(goal, monthlySavings)` | Data stimata raggiungimento obiettivo |
| `getCategoryMacroKey(categoryName)` | Mappa nome categoria → MacroKey |
| `monthsPerCycle`, `recurringMonthlyEquivalent`, `txMatchesKeywords` | Helper condivisi per voci ricorrenti |
| `projectSinkingFund`, `aggregateSinkingFunds` | Calcolo Accantonamenti |
| `calculateDailyBalanceProjection`, `evaluateBalanceHealth` | Saldo progressivo giornaliero |
| `currentCycleDueDate`, `findOverdueRecurring` | Rilevamento spese scadute non pagate |
| `suggestMonthlySavings` | Suggerimento risparmio mensile |
| `normalizeMonthlyIncome`, `aggregateExpectedIncome`, `hasIncomeInfo` | Anagrafica reddito → reddito atteso mensile del nucleo |
| `classifyCategoryMonths` | Tab Budget: classifica i mesi di spesa di una categoria come "normali"/"speciali" (scostamento >50% dalla media) e calcola la media sui soli mesi normali |
| `computeDebtProgress` | Tab Rate: mesi totali/rimanenti, data di fine e importo pagato/residuo di una rata, dati importo totale + rata mensile + data di inizio |
| `isTransferCategory` (+ `TRANSFER_CATEGORY_NAMES`) | Trasferimenti interni (`spostamenti`/`salvadanaio`) da escludere da entrate/spese/breakdown — usata da dashboard, month-report e hero card. "Accantonamenti" volutamente escluso dall'insieme: conta come spesa reale |

> Nota storica: `calculateProjectedBalance` e `calculateTrendData`, citate in versioni precedenti di questa doc, non esistono più nel codice — probabilmente rimosse in un refactor senza aggiornare CLAUDE.md.

---

## Logica piani utente

```
free      → max 1 obiettivo, max 3 import Excel/mese, Smart bloccato
premium   → obiettivi illimitati, import illimitati, Smart completo
founder   → tutto premium + accesso admin + lettura/risposta feedback utenti
```

La colonna `plan` è blindata da trigger (migration 016): solo service role può modificarla.

---

## Migrazioni SQL

Applica con `supabase db push` (dopo `supabase login` e `supabase link`).

| File | Contenuto |
|------|-----------|
| `001_profiles.sql` | Tabella `profiles`, RLS, trigger auto-creazione |
| `002_finance.sql` | `categories`, `transactions`, `goals`, `category_rules` |
| `003_balance.sql` | Campo `balance` su `profiles` (rimosso con 015) |
| `004_payperiod.sql` | Campo `pay_day` su `profiles` |
| `005_piggy.sql` | Campo `piggy_balance` su `profiles` |
| `006_new_categories.sql` | Categorie di sistema aggiuntive |
| `007_display_rules.sql` | Tabella `display_rules` |
| `008_smart_budget.sql` | Tabella `budget_items` (tab Previsioni) |
| `009_recurring_expenses.sql` | Tabella `recurring_expenses` |
| `010_recurring_keywords.sql` | Campo `match_keywords` su `recurring_expenses` |
| `011_recurring_strategy.sql` | Campo `matching_strategy` su `recurring_expenses` |
| `012_coupon_codes.sql` | Tabella `coupon_codes` per upgrade via coupon |
| `013_excel_upload_log.sql` | Tabella `excel_uploads` (rate limit import free) |
| `0135_smart_wizard_fields.sql` | Campo `due_day`, tipologia estesa con `'entrata'` — rinominata da `013_...` (collideva col numero di `013_excel_upload_log.sql`, impediva a `supabase migration list`/`db push` di tracciarla) |
| `014_recurring_extras.sql` | Campi `due_month`, `secondary_name` su `recurring_expenses` |
| `015_drop_balance.sql` | Rimozione campo `balance` da `profiles` |
| `016_lock_plan_column.sql` | Trigger anti-autopromozion piano |
| `017_recurring_sinking_fund.sql` | Campi `next_due_date`, `saving_start_date` (accantonamenti) |
| `018_family_members.sql` | Tabella `family_members`; `member_id` su `transactions` |
| `019_power_user.sql` | Campo `power_user boolean` su `profiles` |
| `020_feedback.sql` | Tabella `feedback_messages` con RLS utente↔founder |
| `021_subscription_id.sql` | Campo `lemon_squeezy_subscription_id` su `profiles` (annullamento abbonamento) |
| `022_saldo_progressivo.sql` | `period_starting_balance`/`_date` su `profiles`; `last_paid_date`/`payment_status` su `recurring_expenses`; tabella `payment_confirmations` |
| `023_member_income_and_categories.sql` | Campi anagrafica reddito su `family_members` e `profiles`; categorie di sistema `Hobby` 🎮 e `Accantonamenti` 🏦 |
| `024_import_logs.sql` | Tabella `import_logs` (hash file Excel, anti-duplicati livello 1) |
| `025_demo_mode.sql` | Funzione `reseed_demo()` + `demo_user_id()`; trigger `block_demo_writes` sulle tabelle dati (sessione demo in sola lettura) |
| `026_savings_pots.sql` | `savings_pots` / `savings_pot_members` / `savings_transactions`; trigger `sync_piggy_balance` + `apply_savings_transaction`; migrazione del `piggy_balance` esistente in un pot "Salvadanaio" |
| `027_goals_wizard.sql` | `goals.savings_pot_id` / `monthly_contribution`; tabella `goal_contributions` + trigger `apply_goal_contribution` |
| `028_admin_notifications.sql` | `admin_notifications` + `notification_dismissals` + 3 notifiche di default |
| `029_demo_savings_seed.sql` | `reseed_demo()` aggiornata: 2 salvadanai demo + goal collegato |
| `030_family_member_owner.sql` | `family_members.is_owner` + unique index parziale (max 1 proprietario per utente) |
| `031_variable_expense_categories.sql` | Tabella `variable_expense_categories` — **legacy**, sostituita da `category_budgets` (migration 032), non più referenziata dal codice |
| `032_category_budgets.sql` | Tabelle `category_budgets` (budget mensile manuale per categoria) e `category_budget_notes` (annotazione mesi "speciali") — tab Smart → Budget |
| `033_recurring_debt_fields.sql` | Campi `debt_type`, `debt_total_amount`, `debt_start_date` su `recurring_expenses` — tab Smart → Rate |
| `034_recurring_savings_pot.sql` | Campo `savings_pot_id` (FK `savings_pots`, on delete set null) su `recurring_expenses` — salvadanaio collegato a un accantonamento, tab Smart → Accantonamenti |

---

## Pattern architetturali

### Server → Client data flow
```
page.tsx (Server Component)
  → supabase.from("table").select(...)  // fetch server-side
  → <ClientComponent data={...} />      // passa come props
    → useEffect + createClient()         // fetch aggiuntivi client-side
```

### RLS (Row Level Security)
Ogni tabella ha policy `using (user_id = auth.uid())`.
Categorie di sistema: `user_id IS NULL`, policy `user_id = auth.uid() OR user_id IS NULL`.
`feedback_messages`: utenti vedono i propri; founder vede tutto e inserisce risposte.

### Frequenze budget — normalizzazione a mensile
```
mensile      → ×1
settimanale  → ×(52/12) ≈ ×4.33
annuale      → ÷12
bimestrale   → ÷2
trimestrale  → ÷3
semestrale   → ÷6
personalizzata → ×(30/custom_days)
una_tantum   → 0
```

---

## PWA

- `public/manifest.json` — nome, icone, theme color
- `public/sw.js` — service worker (cache statica)
- `app/layout.tsx` — `<link rel="manifest">` e meta tag PWA
- Icone: `public/icons/icon-*.png` (192×192, 512×512)

---

## Auth

- Login e Sign-up sono **Server Components**: se già loggato → redirect a `/dashboard`
- Account duplicato: rilevato via `data.user.identities?.length === 0`
- Google OAuth: bypassa verifica email

### Flusso nuovo utente
1. Sign-up → (welcome email via `/api/auth/welcome`) → `/onboarding`
2. Onboarding (3 step) → `/dashboard?tour=1`
3. Dashboard: tour parte automaticamente (primo accesso)

---

## Convenzioni codice

- Nessun state management globale — solo `useState` / `useEffect` locali
- Componenti client: `"use client"` in cima, fetch con `createClient()` da `@/lib/supabase/client`
- Componenti server: `createClient()` da `@/lib/supabase/server`, dati passati come props
- Formattazione valute: sempre `formatEuro(n)` (locale `it-IT`, EUR)
- Date: formato ISO `YYYY-MM-DD` nel DB, `toLocaleDateString("it-IT")` in UI
- Errori: `toast.error(...)` via Sonner, mai `alert()` nativi
- Loading states: `animate-pulse` + testo "Caricamento…"
- Empty states: emoji grande + testo descrittivo centrato
- `<PageTour path="..." />` va incluso in ogni pagina (server: wrap in `<Suspense>`)
