# CLAUDE.md — Flusso App

Documentazione tecnica completa per Claude Code. Aggiornata al: 2026-07-13. Ultima modifica: 2026-07-13.

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
│   │   │   ├── smart-page-client.tsx     # Tab controller: Previsioni / Ricorrenti / Obiettivi / Accantonamenti
│   │   │   └── recurring-client.tsx      # Tab "Ricorrenti" — spese ricorrenti + report
│   │   ├── obiettivi/
│   │   │   ├── page.tsx                  # Standalone page obiettivi
│   │   │   └── obiettivi-client.tsx      # Gestione goals
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
│   └── email.ts                          # Utility email
├── supabase/
│   └── migrations/                       # Migrazioni SQL ordinate (001 → 020)
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
```
> `balance` è stato rimosso con migration 015. Il saldo si calcola dalla somma delle transazioni.

### `categories`
Categorie spese (sistema + custom utente).
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
created_at timestamptz
```

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
```

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
- **Saldo attuale** calcolato dalla somma delle transazioni
- **Proiezione fine mese** basata su tasso di spesa giornaliero del mese corrente
- **Grafico trend** (linea) giornaliero del mese corrente (`calculateTrendData`)
- **Breakdown macro-categorie** con accordion per categoria
- **Score finanziario** (🟢 Ottimo → 🔴 Critico)
- **Card Spese Ricorrenti** (`RecurringDashboardCard`) — accordion per categoria, previsto vs speso, delta colorato
- **Bottone "Mesi precedenti"** → apre `MonthReportModal`

#### MonthReportModal
`app/dashboard/month-report-modal.tsx`
- Navigazione ← → per mese (default mese precedente, blocca mesi futuri)
- Fetch transazioni client-side per il mese selezionato
- KPI: entrate / uscite / risparmio, score finanziario, breakdown per categoria

### Transazioni (`/dashboard/transazioni`)
- Lista transazioni con filtri mese, categoria, tipo
- **Summary bar** sopra la lista: count + totale entrate + totale uscite, aggiornati in tempo reale
- **Badge membro** colorato su ogni transazione con `member_id` (mobile: sotto data; desktop: inline)
- **Import Excel** con selezione membro (chi ha fatto le spese)
- ✏️ fuori dall'hamburger per "modifica categorie" (mobile, sempre visibile)
- Hamburger con "Regole" visibile **solo se `power_user = true`**
- CRUD completo (add, edit, delete)

### Smart (`/dashboard/smart`)
- **Piano free**: schermata di blocco 🔒 + tour `freePreview` che spiega le feature e invita all'upgrade
- **Piano premium/founder**: accesso completo alle 4 tab (Previsioni, Ricorrenti, Obiettivi, Accantonamenti)

#### Tab: Ricorrenti
Sistema di riconoscimento automatico transazioni con `match_keywords`, supporto `historical_avg` per variabilità stagionale (luce/gas), accordion per categoria nel report, template rapidi.

#### Tab: Accantonamenti
Pianifica spese future grandi (vacanze, assicurazione…). Campi `next_due_date` e `saving_start_date` su `recurring_expenses`. Banner "fase di recupero" quando la quota mensile è a regime.

### Account (`/dashboard/account`)
- Gestione profilo e cambio nome
- Piano di abbonamento + riscatto coupon
- **Componenti famiglia** (`FamilyMembersSection`): CRUD con nome + colore (8 preset + custom); badge preview live
- **Modalità smanettone** (`PowerUserToggle`): aggiorna `profiles.power_user`; sblocca "Regole" in Transazioni
- **Chat feedback** (`FeedbackChat`): chat diretta con Marco; Invio per inviare; salva in `feedback_messages`
- Eliminazione account

### Admin (`/dashboard/admin`) — solo `ADMIN_EMAILS`
- **Lista utenti** (`AdminUserRow`): righe compatte espandibili (UUID + data)
- **Coupon manager**: crea coupon monouso
- **Preview mode**: simula piano diverso per testing
- **Test primo utilizzo**: apre `/onboarding?preview=1` in nuova tab
- **Feedback utenti** (`AdminFeedback`): sidebar con lista utenti che hanno scritto; chat per ogni utente; form di risposta (inserisce `is_admin=true` con `user_id` del destinatario)

---

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
smart-ricorrenti, smart-obiettivi,         smart (cover)
smart-previsioni, smart-accantonamenti
account-family, account-power-user         account
```

### LocalStorage
Chiave per pagina: `flusso_tour_v:/dashboard` ecc. Assente = primo accesso. Valore diverso dalla versione in `PAGE_TOURS` = aggiornamento.

---

## Componenti famiglia

1. Crea i "Componenti" in Account (nome + colore)
2. All'import Excel, seleziona il membro che ha fatto le spese
3. Transazioni mostrano badge colorato con il nome
4. `transactions.member_id FK family_members(id) ON DELETE SET NULL`

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
| `calculateProjectedBalance(...)` | Proiezione saldo fine mese |
| `calculateTrendData(txs, balance, year, month, startDay)` | Array `{day, balance}` per grafico |
| `calculateMacroBreakdown(transactions)` | Breakdown per macro-categorie (8 slot) |
| `calculateCategoryBreakdown(transactions)` | Breakdown per categoria esatta |
| `estimateGoalCompletion(goal, monthlySavings)` | Data stimata raggiungimento obiettivo |
| `calculateAllTimeTrend(txs, balance)` | Trend mensile storico |
| `getCategoryMacroKey(categoryName)` | Mappa nome categoria → MacroKey |

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
| `013_smart_wizard_fields.sql` | Campo `due_day`, tipologia estesa con `'entrata'` |
| `014_recurring_extras.sql` | Campi `due_month`, `secondary_name` su `recurring_expenses` |
| `015_drop_balance.sql` | Rimozione campo `balance` da `profiles` |
| `016_lock_plan_column.sql` | Trigger anti-autopromozion piano |
| `017_recurring_sinking_fund.sql` | Campi `next_due_date`, `saving_start_date` (accantonamenti) |
| `018_family_members.sql` | Tabella `family_members`; `member_id` su `transactions` |
| `019_power_user.sql` | Campo `power_user boolean` su `profiles` |
| `020_feedback.sql` | Tabella `feedback_messages` con RLS utente↔founder |

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
