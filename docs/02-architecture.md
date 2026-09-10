# 02 — Come è fatta l'app

## Stack tecnologico

| Tecnologia | Ruolo |
|------------|-------|
| **Next.js 15** (App Router) | Framework full-stack: renderizza le pagine, gestisce le API route, esegue il codice server |
| **TypeScript** | Linguaggio: aggiunge i tipi statici a JavaScript, riduce i bug |
| **Supabase** | Backend as a Service: Postgres (database), Auth (login/signup), Row Level Security |
| **Tailwind CSS** | Framework CSS utility-first: scrivi le classi direttamente nell'HTML |
| **Radix UI** | Componenti UI accessibili (checkbox, dropdown, label) — base di shadcn/ui |
| **Sonner** | Toast notifications (i messaggi di successo/errore che compaiono in basso) |
| **Lemon Squeezy** | Pagamenti e abbonamenti (Merchant of Record, gestisce IVA) |
| **Anthropic SDK** | Chiamate al modello Claude per l'import da screenshot |
| **Resend** | Invio email transazionali (benvenuto) |
| **Capacitor** | Wrapper iOS/Android per pubblicare l'app come app nativa (vedi cartelle `android/` e `ios/`) |

---

## Mappa delle cartelle

```
flussoapp/
├── app/               # Tutte le pagine e le API (Next.js App Router)
│   ├── api/           # Route API: webhook, coupon, admin, Excel log, welcome email
│   ├── auth/          # Pagine login, signup, reset password, callback OAuth
│   ├── dashboard/     # L'app vera: tutte le pagine post-login
│   │   ├── page.tsx           # Dashboard principale
│   │   ├── transazioni/       # Lista transazioni + import Excel/screenshot
│   │   ├── smart/             # Sezione Smart: Previsioni/Ricorrenti/Obiettivi
│   │   ├── obiettivi/         # Pagina standalone obiettivi
│   │   ├── account/           # Impostazioni utente, piano, upgrade
│   │   └── admin/             # Pannello admin (solo founder)
│   ├── blog/          # Blog pubblico (MDX)
│   ├── pricing/       # Pagina prezzi pubblica
│   └── layout.tsx     # Root layout: nav, theme, Sonner toaster
├── components/        # Componenti React riutilizzabili (nav, ui/button, ui/badge…)
├── lib/               # Logica pura: calcoli, client Supabase, configurazione, utility
│   ├── calculations.ts        # Funzioni pure: score, breakdown, accantonamenti
│   ├── config.ts              # Configurazione globale: nome app, piani, prezzi, nav
│   ├── plans.ts               # Helper piani: isPremium(), isFounder(), getPlanLabel()
│   ├── period.ts              # Calcolo periodo di paga (pay day personalizzato)
│   ├── preview-plan.ts        # Logica admin per simulare un piano diverso
│   └── supabase/
│       ├── client.ts          # Supabase client per componenti browser ("use client")
│       ├── server.ts          # Supabase client per server components e server actions
│       └── proxy.ts           # Middleware Supabase: refresh sessione + redirect auth
├── hooks/             # [VERIFICARE: se presenti custom hooks]
├── supabase/
│   └── migrations/    # SQL ordinati 001→017: schema del database, aggiornamenti
├── proxy.ts           # Entry point del middleware Next.js (chiama lib/supabase/proxy.ts)
├── addons/            # Componenti opzionali non ancora integrati (Stripe, waitlist, notifiche)
├── android/           # Progetto Capacitor Android
├── ios/               # Progetto Capacitor iOS
└── public/            # File statici: icone PWA, manifest
```

---

## Quattro concetti fondamentali

Questi quattro concetti si ripetono in quasi ogni file. Capirli ti fa capire il 90% del codice.

### 1. Server Component vs Client Component

In Next.js 15 ogni file `.tsx` in `app/` è per default un **Server Component**: il codice gira sul server, non nel browser. Non può usare `useState`, `useEffect` o eventi (`onClick`).

Se hai bisogno di interattività, aggiungi `"use client"` in cima al file. Quel componente gira nel browser.

**In Flusso**: `app/dashboard/page.tsx` è un Server Component — fetch i dati da Supabase e li passa al componente figlio. `app/dashboard/dashboard-client.tsx` inizia con `"use client"` e gestisce lo stato locale (tab attiva, filtri, modali).

**Perché questa separazione?** I Server Component possono accedere direttamente al database con le credenziali server (mai esposte al browser). I Client Component possono rispondere ai click dell'utente. La regola d'oro: fetch i dati nel Server Component e passa tutto come props.

### 2. Server Action

Una **Server Action** è una funzione con `"use server"` in cima al file. Puoi chiamarla da un Client Component come se fosse una funzione normale, ma viene eseguita sul server.

**In Flusso**: [app/dashboard/transazioni/actions.ts](../app/dashboard/transazioni/actions.ts) contiene `categorizeTransaction()` e `createCategoryRule()`. Un Client Component le chiama con un `await` e il codice gira sul server, con accesso a Supabase tramite la sessione utente corrente.

**Perché non una semplice chiamata API?** Le Server Action ti evitano di scrivere una route `GET`/`POST` separata per ogni operazione. Next.js gestisce automaticamente la serializzazione e la sicurezza della chiamata.

### 3. Il proxy (`proxy.ts`)

Il file [proxy.ts](../proxy.ts) nella radice del progetto è il **middleware Next.js** (Supabase lo chiama "proxy" per compatibilità con Capacitor, ma funziona come un normale middleware). Viene eseguito su ogni richiesta HTTP, prima che arrivi alla pagina.

Ha due compiti:
1. **Aggiornare la sessione**: Supabase usa cookie JWT con scadenza breve. Il proxy li aggiorna silenziosamente ad ogni richiesta, così l'utente non viene mai disconnesso a sorpresa.
2. **Redirect di protezione**: se un utente non autenticato tenta di accedere a `/dashboard/*`, viene reindirizzato a `/auth/login`. Se un utente già loggato va su `/auth/login`, viene reindirizzato a `/dashboard`.

⚠️ Non rimuovere mai `proxy.ts` o la chiamata a `getClaims()` al suo interno. Senza quel codice, gli utenti vengono disconnessi in modo imprevedibile.

### 4. RLS — Row Level Security

**RLS** (Row Level Security) è una funzionalità di Postgres che filtra automaticamente le righe che un utente può leggere o scrivere. È configurata nelle migration SQL con istruzioni `CREATE POLICY`.

**Esempio reale** da [supabase/migrations/002_finance.sql](../supabase/migrations/002_finance.sql):
```sql
create policy "Users can manage own transactions"
  on public.transactions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
```
Questa policy dice: "un utente può leggere/scrivere solo le righe in cui `user_id` è uguale al suo ID autenticato". Non importa se il codice TypeScript fa `supabase.from("transactions").select("*")` senza filtri: Postgres restituisce comunque solo le righe dell'utente loggato.

⚠️ **RLS è la linea di difesa principale.** Senza di essa, ogni utente potrebbe leggere e scrivere i dati di chiunque. Le policy sono nella tabella `pg_policies` e puoi vederle in Supabase > Authentication > Policies.

Un caso speciale: le categorie di sistema hanno `user_id = NULL`. La loro policy include `OR user_id IS NULL` per renderle visibili a tutti.

---

## I tre percorsi principali dell'utente

### Percorso 1: Signup → Login

1. L'utente va su `/auth/sign-up` ([app/auth/sign-up/page.tsx](../app/auth/sign-up/page.tsx)) e inserisce email + password.
2. Supabase crea una riga in `auth.users` (tabella interna, non accessibile direttamente).
3. Un trigger SQL (`handle_new_user` in [supabase/migrations/001_profiles.sql](../supabase/migrations/001_profiles.sql)) crea automaticamente una riga in `public.profiles` con `plan = 'free'`.
4. Supabase invia una email di conferma. L'utente clicca il link → callback su `/auth/confirm` → redirect su `/dashboard`.
5. Il proxy rileva la sessione attiva e da quel momento ogni richiesta a `/dashboard` è autorizzata.

Doppio account (stessa email già registrata): viene rilevato controllando `data.user.identities?.length === 0` dopo `supabase.auth.signUp()`.

### Percorso 2: Import di una transazione

**Manuale:**
1. L'utente compila il form in `/dashboard/transazioni`.
2. Il Client Component chiama una Server Action (o direttamente Supabase client-side) che inserisce una riga in `transactions`.
3. `revalidatePath("/dashboard")` invalida la cache di Next.js e la dashboard si aggiorna.

**Excel:**
1. L'utente carica un file `.xlsx` nel modal di import ([app/dashboard/transazioni/import-excel-modal.tsx](../app/dashboard/transazioni/import-excel-modal.tsx)).
2. La libreria `xlsx` legge il file nel browser e normalizza le righe.
3. Le transazioni vengono inserite in batch via Supabase client con `source = 'excel'`.
4. Un log viene scritto in `excel_upload_log` (migration 013). Il limite di 3 upload/mese per il piano Free viene verificato qui.

**Screenshot AI (solo Premium):**
1. L'utente apre il modal screenshot ([app/dashboard/transazioni/screenshot-modal.tsx](../app/dashboard/transazioni/screenshot-modal.tsx)) e scatta/carica l'immagine.
2. Il componente client chiama `extractTransactionsFromScreenshot()` in [app/dashboard/transazioni/screenshot-action.ts](../app/dashboard/transazioni/screenshot-action.ts), che è una Server Action.
3. La Server Action verifica che il piano sia Premium. Se non lo è, restituisce un errore.
4. Invia l'immagine in base64 al modello `claude-haiku-4-5-20251001` via Anthropic SDK.
5. Claude restituisce un array JSON di transazioni. La Server Action lo valida e lo restituisce al client.
6. Il client mostra un'anteprima modificabile. L'utente conferma e le transazioni vengono inserite.

### Percorso 3: Upgrade a Premium

1. L'utente va su `/dashboard/account` e clicca il bottone "Upgrade" ([app/dashboard/account/upgrade-button.tsx](../app/dashboard/account/upgrade-button.tsx)).
2. Viene reindirizzato al checkout di Lemon Squeezy. L'URL del checkout contiene `user_id` come `custom_data`.
3. L'utente paga su Lemon Squeezy.
4. Lemon Squeezy invia un webhook POST a `/api/webhook/lemon-squeezy` ([app/api/webhook/lemon-squeezy/route.ts](../app/api/webhook/lemon-squeezy/route.ts)).
5. Il webhook verifica la firma HMAC-SHA256 (header `x-signature` vs `LEMON_SQUEEZY_WEBHOOK_SECRET`). Se la firma è sbagliata, risponde 401 e non fa nulla. ⚠️ Questo controllo è fondamentale: senza di esso chiunque potrebbe inviare una richiesta fake e promuovere qualsiasi account a Premium.
6. Il webhook legge `user_id` da `custom_data` e aggiorna `profiles.plan = 'premium'` usando il service role key (che bypassa RLS).
7. ⚠️ La colonna `plan` è protetta da un trigger SQL (migration 016 [supabase/migrations/016_lock_plan_column.sql](../supabase/migrations/016_lock_plan_column.sql)): solo il `service_role` può modificarla. Un utente che tenta di modificarsi il piano direttamente via Supabase client non riesce.
8. Al prossimo accesso dell'utente, `getEffectivePlan()` legge `profiles.plan` e sblocca le feature Premium.

**Percorso alternativo: coupon code.**
L'utente inserisce un codice in `/dashboard/account`. La route `/api/coupon/redeem` ([app/api/coupon/redeem/route.ts](../app/api/coupon/redeem/route.ts)) verifica il coupon, lo marca come usato e aggiorna il piano tramite service role.

---

*Vedi anche: [06-sicurezza.md](06-sicurezza.md) per i dettagli su RLS, webhook e gating premium.*
