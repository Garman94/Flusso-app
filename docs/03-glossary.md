# 03 — Glossario

---

## Termini business

### Accantonamento
Un accantonamento (chiamato anche "sinking fund" nel codice) è una spesa futura prevedibile per cui metti da parte una quota ogni mese. Esempio: se l'assicurazione auto costa 360 € all'anno, accantoni 30 €/mese. Nel codice vive nei campi `next_due_date` e `saving_start_date` della tabella `recurring_expenses` (migration 017). L'utente lo vede nella card "Accantonamenti" della dashboard e nella sezione Smart > Ricorrenti. Le funzioni di calcolo sono in [lib/calculations.ts](../lib/calculations.ts) (`projectSinkingFund`, `aggregateSinkingFunds`).

### Categoria
Una categoria è un'etichetta associata a una transazione (es. "Alimentari", "Casa", "Trasporti"). Ogni categoria ha un nome, un colore esadecimale e un'emoji. Le categorie di sistema (`user_id = NULL`) sono visibili a tutti; l'utente può aggiungerne di proprie. Vivono nella tabella `categories`. L'utente le vede nel form di inserimento transazione e nelle card di breakdown della dashboard.

### Founder
Il piano Founder è il livello più alto. Include tutto di Premium più accesso a vita (pagamento unico di €49), accesso anticipato alle funzionalità future e supporto prioritario. Il piano viene assegnato tramite coupon code o manualmente dal pannello admin. Nel codice è il valore `"founder"` in `profiles.plan`; la funzione `isFounder()` in [lib/plans.ts](../lib/plans.ts) lo riconosce.

### Free
Il piano gratuito. Non richiede carta di credito. Permette transazioni manuali illimitate, fino a 3 upload Excel al mese, e la dashboard base. Non include la sezione Smart né l'import da screenshot. Nel codice è il valore `"free"` in `profiles.plan`.

### Obiettivo
Un obiettivo di risparmio: hai una cifra target (es. 2.000 €), una cifra attuale, una scadenza opzionale e un'emoji. Flusso stima quando raggiungerai l'obiettivo in base al tasso di risparmio del mese corrente. Vive nella tabella `goals`. L'utente lo vede in Smart > Obiettivi e nelle card della dashboard. La stima è calcolata da `estimateGoalCompletion()` in [lib/calculations.ts](../lib/calculations.ts).

### Pay day (Giorno di paga)
La data del mese in cui l'utente riceve lo stipendio. Se impostato (es. "il 27 del mese"), la dashboard mostra il periodo che va dal 27 del mese scorso al 26 del mese corrente invece del mese di calendario. Se vale 0, usa il mese di calendario standard. Vive in `profiles.pay_day`. La logica di calcolo del periodo è in [lib/period.ts](../lib/period.ts).

### Piano (Plan)
Il livello di abbonamento di un utente: `free`, `premium` o `founder`. Vive in `profiles.plan`. È protetto da un trigger SQL che impedisce all'utente di auto-promuoversi: solo il `service_role` può cambiarlo.

### Piggy balance (Salvadanaio)
Il saldo del "salvadanaio" virtuale usato per gli accantonamenti. Non è il saldo del conto corrente reale: è la somma che l'utente dichiara di aver messo fisicamente da parte per le spese future. Vive in `profiles.piggy_balance`. L'utente può aggiornarlo manualmente dalla dashboard tramite [app/dashboard/piggy-action.ts](../app/dashboard/piggy-action.ts).

### Premium
Il piano a pagamento mensile (€4,99/mese o €39/anno). Sblocca l'import da screenshot AI, gli upload Excel illimitati e la sezione Smart completa. Nel codice è il valore `"premium"` in `profiles.plan`; la funzione `isPremium()` in [lib/plans.ts](../lib/plans.ts) restituisce `true` anche per i Founder.

### Ricorrente
Una spesa che si ripete nel tempo (affitto, bolletta, abbonamento Netflix). Può essere fissa (importo sempre uguale) o variabile (range min-max). Ha una frequenza (mensile, bimestrale, ecc.) e opzionalmente parole chiave per riconoscerla automaticamente tra le transazioni. Vive nella tabella `recurring_expenses`. L'utente la vede in Smart > Ricorrenti.

### Smart
La sezione "Budget" dell'app, accessibile da `/dashboard/smart`. È divisa in tre tab: Previsioni (budget_items con confronto spesa reale), Ricorrenti (recurring_expenses con report previsto/speso) e Obiettivi (goals con stima raggiungimento). È una feature solo Premium/Founder.

### Transazione
Una singola operazione finanziaria: importo (negativo = uscita, positivo = entrata), data, descrizione, eventuale merchant e categoria. Vive nella tabella `transactions`. L'utente la vede e la gestisce in `/dashboard/transazioni`.

---

## Termini tecnici

### API route
Una funzione che risponde a richieste HTTP. In Next.js si crea mettendo un file `route.ts` dentro `app/api/`. In Flusso le trovi in [app/api/](../app/api/): webhook Lemon Squeezy, redeem coupon, welcome email, log Excel, admin. Ogni route esporta funzioni `GET`, `POST`, ecc.

### Anon key (Publishable key)
La chiave pubblica di Supabase. In Flusso si chiama `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Può essere inclusa nel frontend (variabili `NEXT_PUBLIC_*`) perché da sola non bypassa RLS. Ti serve per inizializzare il client Supabase nel browser.

### Build
Il processo che trasforma il codice TypeScript/React in JavaScript ottimizzato per la produzione. Si avvia con `npm run build`. Se il build fallisce, non puoi fare il deploy. Gli errori di TypeScript bloccano il build.

### Claim / JWT
Un **JWT** (JSON Web Token) è un token di autenticazione firmato. I **claim** sono i dati dentro il token (es. `sub` = ID utente, `email`, `role`). In Flusso si leggono con `supabase.auth.getClaims()`. Il proxy li usa per sapere se l'utente è autenticato. Scadono dopo pochi minuti, ma il proxy li rinnova ad ogni richiesta.

### Edge runtime
Ambiente di esecuzione serverless distribuito geograficamente (tipo Cloudflare Workers). Next.js può eseguire certi file sull'edge. Flusso non usa esplicitamente l'edge runtime: il proxy usa il runtime Node.js standard.

### Idempotency (Idempotenza)
Un'operazione è idempotente se puoi eseguirla più volte e il risultato è sempre lo stesso. I webhook di Lemon Squeezy possono arrivare duplicati: se un `order_created` arriva due volte, `profiles.plan = 'premium'` viene scritto due volte senza danni. Flusso è idempotente su questo punto.

### Lint
Analisi statica del codice per trovare errori stilistici e potenziali bug senza eseguirlo. Si avvia con `npm run lint` (usa ESLint). Tieni il lint pulito: errori di lint bloccano il deploy su alcune configurazioni CI.

### Middleware
Codice che viene eseguito per ogni richiesta HTTP, prima che arrivi alla pagina. In Flusso il middleware si trova in [proxy.ts](../proxy.ts) (la funzione si chiama `proxy` invece di `middleware` per compatibilità con Capacitor, ma il comportamento è identico). Si occupa di rinnovare la sessione Supabase e redirigere gli utenti non autenticati.

### Migration
Un file SQL numerato che modifica lo schema del database. Le migration di Flusso sono in [supabase/migrations/](../supabase/migrations/). Vengono applicate in ordine: 001, 002… 017. Non modificare mai una migration già applicata in produzione: crea sempre una nuova migration con il numero successivo.

### RLS — Row Level Security
Vedi la sezione dedicata in [02-architecture.md](02-architecture.md). In breve: Postgres filtra automaticamente le righe in base all'utente autenticato, secondo le policy definite nelle migration SQL.

### Server action
Una funzione con `"use server"` in cima al file. Gira sul server, può accedere al database, ma si chiama come una funzione normale dal client. In Flusso: [app/dashboard/transazioni/actions.ts](../app/dashboard/transazioni/actions.ts), [app/dashboard/transazioni/screenshot-action.ts](../app/dashboard/transazioni/screenshot-action.ts), [app/dashboard/smart/sinking-fund-actions.ts](../app/dashboard/smart/sinking-fund-actions.ts).

### Service role key
La chiave segreta di Supabase che **bypassa RLS**. Va usata solo lato server (mai in variabili `NEXT_PUBLIC_*`). In Flusso è in `SUPABASE_SERVICE_ROLE_KEY` ed è usata esclusivamente nel webhook Lemon Squeezy, nel redeem coupon e nelle route admin, dove serve modificare i dati di utenti diversi da quello autenticato.

### Type check
Verifica che il codice TypeScript non abbia errori di tipo. Si avvia con `npx tsc --noEmit`. Non esegue il codice, controlla solo i tipi. Fai sempre un type check prima di fare un deploy.

### Webhook
Una chiamata HTTP in arrivo da un servizio esterno. In Flusso, Lemon Squeezy invia un webhook POST a `/api/webhook/lemon-squeezy` ogni volta che un ordine viene completato o una subscription viene cancellata. Il webhook trasporta i dati dell'evento nel body JSON. La firma HMAC nel header `x-signature` garantisce che provenga davvero da Lemon Squeezy.

---

*Vedi anche: [02-architecture.md](02-architecture.md) per i concetti architetturali, [06-sicurezza.md](06-sicurezza.md) per l'uso sicuro di service role e webhook.*
