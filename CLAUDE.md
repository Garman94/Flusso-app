# CLAUDE.md — Flusso App

Documentazione tecnica completa per Claude Code. Aggiornata al: 2026-04-17.

---

## Panoramica progetto

**Flusso** è una web app di gestione finanziaria personale. Permette di:
- Tracciare entrate e uscite (transazioni)
- Prevedere il budget mensile (Smart > Previsioni)
- Monitorare spese ricorrenti e confrontarle con la realtà (Smart > Ricorrenti)
- Gestire obiettivi di risparmio (Smart > Obiettivi)
- Visualizzare dashboard con saldo, trend e grafici

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
│   │   ├── transazioni/
│   │   │   ├── page.tsx                  # Lista transazioni con filtri
│   │   │   └── smart-client.tsx          # Tab "Previsioni" — budget items vs spesa reale
│   │   ├── smart/
│   │   │   ├── page.tsx                  # Server component Smart (fetch dati)
│   │   │   ├── smart-page-client.tsx     # Tab controller: Previsioni / Ricorrenti / Obiettivi
│   │   │   └── recurring-client.tsx      # Tab "Ricorrenti" — spese ricorrenti + report
│   │   ├── obiettivi/
│   │   │   ├── page.tsx                  # Standalone page obiettivi
│   │   │   └── obiettivi-client.tsx      # Gestione goals
│   │   ├── account/                      # Impostazioni account, piano, profilo
│   │   └── admin/                        # Pannello admin (solo founder)
│   ├── auth/                             # Login, signup, reset password
│   └── layout.tsx                        # Root layout (nav, theme)
├── components/
│   ├── nav.tsx                           # Navigazione principale
│   ├── theme-switcher.tsx                # Dark/light mode toggle
│   └── auth/                            # Form di autenticazione
├── lib/
│   ├── calculations.ts                   # Funzioni pure di calcolo finanziario
│   ├── supabase/
│   │   ├── client.ts                     # Supabase browser client
│   │   └── server.ts                     # Supabase server client (SSR)
│   ├── admin.ts                          # Utility admin
│   ├── plans.ts                          # Logica piani (free/premium/founder)
│   └── email.ts                          # Utility email
├── supabase/
│   └── migrations/                       # Migrazioni SQL ordinate
│       ├── 001_profiles.sql
│       ├── 002_finance.sql               # categories, transactions, goals
│       ├── 003_balance.sql
│       ├── 004_payperiod.sql
│       ├── 005_piggy.sql
│       ├── 006_new_categories.sql
│       ├── 007_display_rules.sql
│       ├── 008_smart_budget.sql          # budget_items
│       └── 009_recurring_expenses.sql    # recurring_expenses (nuovo)
└── public/                               # Icone PWA, manifest
```

---

## Schema database (tabelle principali)

### `profiles`
Profilo utente collegato a `auth.users`.
```
id uuid PK (= auth.users.id)
plan text  -- 'free' | 'premium' | 'founder'
balance numeric  -- saldo attuale
```

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

### `recurring_expenses` *(aggiunta con 009 + 010)*
Spese ricorrenti per il tab "Ricorrenti" (Smart).
```
id uuid PK
user_id uuid
name text
tipologia text           -- 'fissa' | 'variabile'
frequency text           -- 'mensile' | 'bimestrale' | 'trimestrale' | 'semestrale' | 'annuale' | 'personalizzata'
custom_days int NULL     -- solo se frequency = 'personalizzata' (intervallo in giorni)
amount numeric           -- importo fisso o minimo del range
amount_max numeric NULL  -- massimo del range (solo tipologia = 'variabile')
category_id uuid FK categories NULL
notes text NULL
match_keywords text[]    -- parole chiave per riconoscimento automatico transazioni (default '{}')
```

### `category_rules`
Regole di categorizzazione automatica delle transazioni.
```
category_id uuid
field text   -- 'description' | 'merchant' | 'amount'
operator text  -- 'contains' | 'starts_with' | 'ends_with' | 'equals'
value text
priority int
```

### `display_rules`
Regole di riscrittura descrizioni transazioni per UI.

---

## Pagine e funzionalità

### Dashboard (`/dashboard`)
- **Saldo attuale** da `profiles.balance`
- **Proiezione fine mese** basata su tasso di spesa giornaliero del mese corrente
- **Grafico trend** (linea) giornaliero del mese corrente (`calculateTrendData`)
- **Breakdown macro-categorie** (casa, trasporti, cibo, salute, shopping, lavoro, risparmio, altro)
- **Score finanziario** (🟢 Ottimo → 🔴 Critico) basato sul rapporto spese/entrate

### Transazioni (`/dashboard/transazioni`)
- Lista di tutte le transazioni con filtri per mese, categoria, tipo
- Import da Excel
- Categorizzazione manuale o automatica (via `category_rules`)
- CRUD completo (add, edit, delete)

### Smart (`/dashboard/smart`)
Tre tab con logica finanziaria avanzata.

#### Tab: Previsioni
Componente: `app/dashboard/transazioni/smart-client.tsx`
- Lista di **budget_items** (voci di budget) con CRUD
- Calcolo totale previsto mensile (normalizzazione frequenza → mensile con `toMonthly`)
- Confronto con **spesa reale media ultimi 3 mesi**
- Barra progresso e delta (sforamento / risparmio)
- Breakdown per categoria con barre proporzionali

#### Tab: Ricorrenti
Componente: `app/dashboard/smart/recurring-client.tsx`

**Funzionalità form:**
- **Nome** spesa
- **Tipologia**: `fissa` (importo fisso) | `variabile` (range min-max)
- **Frequenza**: mensile / bimestrale / trimestrale / semestrale / annuale / personalizzata
  - Se `personalizzata`: input `custom_days` (giorni tra un'occorrenza e l'altra)
    - Esempi: 14 = bisettimanale, 90 = trimestrale, 730 = ogni 2 anni
- **Importo**: singolo (fissa) o min + max (variabile)
- **Parole chiave**: tag-input con chips viola per il sistema di riconoscimento automatico
- **Categoria**: fallback se nessuna keyword è configurata
- **Note**: campo libero opzionale

**Sistema di riconoscimento automatico transazioni (`match_keywords`):**
- Campo `match_keywords text[]` su `recurring_expenses` (migration 010)
- Il fetch di `page.tsx` include `description` e `merchant` dalle transazioni
- Funzione `txMatchesKeywords(tx, keywords)`: ricerca case-insensitive contains su `description` e `merchant`
  - Es: keyword "enel bolletta gas" matcha "Enel Bolletta Gas Aprile 2026"
- Funzione `computeActual(expense, transactions, monthStart)`:
  - **Priorità keyword**: se `match_keywords.length > 0` → filtra per keyword
  - **Fallback categoria**: se nessuna keyword ma `category_id` → filtra per categoria
  - **Non tracciata**: se né keyword né categoria → restituisce `null`
- In UI: badge `🔍 keyword` o `📂 categoria` o `non tracciata` per ogni voce nel report
- Tasto ▼ per espandere le transazioni riconosciute con descrizione, data, importo

**Logica report in tempo reale:**
- Normalizzazione a mensile: `toMonthlyAmount(expense)`
  - Frequenza standard: `amount / FREQ_MONTHS[frequency]` (es. semestrale → /6)
  - Tipologia variabile: media (min+max)/2 come base del calcolo
  - Personalizzata: `amount * (30 / custom_days)`
- **Per ogni voce tracciata:**
  - `actual` = somma transazioni matched nel mese corrente
  - `delta` = actual − expectedMonthly (positivo = sforamento, negativo = risparmio)
- **Riepilogo:**
  - Totale previsto mensile (range min-max se variabile)
  - Totale speso mese corrente (tutte le uscite)
  - Sforamento / risparmio (su voci tracciate)
  - Risparmio potenziale (se resti nel budget)
  - Barra progresso globale con colori (verde/giallo/rosso)

#### Tab: Obiettivi
Componente: `app/dashboard/obiettivi/obiettivi-client.tsx`
- CRUD obiettivi risparmio con `target_amount`, `current_amount`, `deadline`, `icon`
- Barra progresso per ogni obiettivo
- Stima tempo al raggiungimento (`estimateGoalCompletion`)
- Limite di 1 obiettivo per piano free, illimitati per premium/founder

### Account (`/dashboard/account`)
- Gestione profilo, piano (free/premium/founder), cambio password
- Visualizzazione saldo con possibilità di modifica

---

## Funzioni di calcolo (`lib/calculations.ts`)

| Funzione | Descrizione |
|----------|-------------|
| `formatEuro(n)` | Formatta numero in stringa EUR italiana |
| `calculateFinancialScore(income, expenses)` | Score 🔴→🟢 basato su ratio spese/entrate |
| `calculateProjectedBalance(balance, expenses, daysPassed, daysRemaining)` | Proiezione saldo fine mese |
| `calculateTrendData(txs, balance, year, month, startDay)` | Array `{day, balance}` per grafico giornaliero |
| `calculateMacroBreakdown(transactions)` | Breakdown per macro-categorie (8 slot) |
| `calculateCategoryBreakdown(transactions)` | Breakdown per categoria esatta |
| `estimateGoalCompletion(goal, monthlySavings)` | Data stimata raggiungimento obiettivo |
| `calculateAllTimeTrend(txs, balance)` | Trend mensile storico da prima transazione |
| `calculateYearTrend(txs, balance, year)` | Trend mensile per anno specifico |
| `getCategoryMacroKey(categoryName)` | Mappa nome categoria → MacroKey |

---

## Logica piani utente

```
free      → max 1 obiettivo, funzionalità base
premium   → obiettivi illimitati, funzionalità avanzate
founder   → tutto premium + accesso admin
```

Piano letto da `profiles.plan`, verificato lato server su ogni pagina.

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
Categorie di sistema hanno `user_id IS NULL` e policy `user_id = auth.uid() OR user_id IS NULL`.

### Frequenze budget — normalizzazione a mensile
```
mensile      → ×1
settimanale  → ×(52/12) ≈ ×4.33
annuale      → ÷12
bimestrale   → ÷2
trimestrale  → ÷3
semestrale   → ÷6
personalizzata → ×(30/custom_days)
una_tantum   → 0 (non conta nel mensile ricorrente)
```

---

## PWA

- `public/manifest.json` — nome, icone, theme color
- `public/sw.js` — service worker (cache statica)
- `app/layout.tsx` — `<link rel="manifest">` e meta tag PWA
- Icone: `public/icons/icon-*.png` (192×192, 512×512)

---

## Migrazioni SQL

Applicate in ordine progressivo. Per applicare in Supabase:
```
supabase db push
```
oppure eseguire manualmente in Supabase Studio > SQL Editor.

L'ultima migrazione è `009_recurring_expenses.sql` che aggiunge la tabella
`recurring_expenses` con vincoli su `tipologia`, `frequency`, `custom_days` e `amount_max`.

---

## Convenzioni codice

- Nessun state management globale — solo `useState` / `useEffect` locali
- Componenti client: `"use client"` in cima, fetch con `createClient()` da `@/lib/supabase/client`
- Componenti server: `createClient()` da `@/lib/supabase/server`, dati passati come props
- Formattazione valute: sempre `formatEuro(n)` (locale `it-IT`, EUR)
- Date: formato ISO `YYYY-MM-DD` nel DB, `toLocaleDateString("it-IT")` in UI
- Errori: `toast.error(...)` via Sonner, mai alert() nativi
- Loading states: `animate-pulse` + testo "Caricamento…"
- Empty states: emoji grande + testo descrittivo centrato
