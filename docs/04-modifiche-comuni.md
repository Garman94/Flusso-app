# 04 — Come fare cose tipiche

Ogni sezione ha i passaggi numerati e i file da toccare. Niente teoria: solo cosa fare e come verificare.

---

## 1. Aggiungere una pagina nuova al dashboard

1. Crea la cartella: `app/dashboard/nomepagina/`
2. Crea `app/dashboard/nomepagina/page.tsx` come Server Component. Modello da seguire: [app/dashboard/smart/page.tsx](../app/dashboard/smart/page.tsx) — fa il fetch dei dati e li passa a un Client Component.
3. Se la pagina ha interattività, crea `app/dashboard/nomepagina/nomepagina-client.tsx` con `"use client"` in cima.
4. Aggiungi il link di navigazione in [components/nav.tsx](../components/nav.tsx).
5. Verifica: `npm run build` non deve dare errori. Apri la pagina nel browser.

💡 Guarda sempre come è costruita una pagina simile già esistente prima di partire da zero. Per una pagina con gating premium, copia il pattern di `app/dashboard/smart/page.tsx` righe 22-50.

---

## 2. Aggiungere un campo a una tabella esistente

1. Crea un nuovo file di migration in `supabase/migrations/` con il numero successivo (es. `018_nome_descrittivo.sql`).
2. Scrivi la migration SQL:
   ```sql
   alter table public.nome_tabella
     add column if not exists nuovo_campo tipo default valore;
   ```
3. **Applica la migration in Supabase**: vai su Supabase Studio > SQL Editor, incolla il contenuto del file ed esegui. Oppure usa `supabase db push` da CLI se hai il progetto configurato localmente.
4. Aggiorna i tipi TypeScript: se nel codice hai definito manualmente un type per quella tabella (es. in `lib/calculations.ts` o in un file client), aggiungici il campo. Se usi i tipi generati da Supabase, rigenera con `npx supabase gen types typescript --project-id <id> > types/supabase.ts`.
5. Aggiorna il form/UI che gestisce quella tabella per mostrare o raccogliere il nuovo campo.
6. Verifica: `npx tsc --noEmit` senza errori, poi `npm run build`.

⚠️ Non modificare mai una migration già applicata in produzione: crea sempre una nuova migration. Altrimenti il tuo schema locale e quello di produzione divergono silenziosamente.

---

## 3. Aggiungere una categoria di transazione "di sistema"

Le categorie di sistema sono quelle visibili a tutti gli utenti (hanno `user_id = NULL`). Sono inserite in [supabase/migrations/002_finance.sql](../supabase/migrations/002_finance.sql) righe 133-149.

1. Crea una nuova migration (es. `018_add_system_category.sql`):
   ```sql
   insert into public.categories (id, user_id, name, color, icon, is_system) values
     (gen_random_uuid(), null, 'NuovaCategoria', '#hex123', '🎯', true)
   on conflict do nothing;
   ```
2. Applica in Supabase Studio > SQL Editor.
3. La categoria apparirà automaticamente nei dropdown di tutti gli utenti, perché la RLS su `categories` include `OR user_id IS NULL`.

---

## 4. Modificare il prezzo di un piano

**Su Lemon Squeezy:**
1. Vai su [app.lemonsqueezy.com](https://app.lemonsqueezy.com) > Products.
2. Modifica il prezzo del prodotto. Se usi varianti (mensile/annuale), modificale entrambe.
3. Se hai cambiato il Product URL (non dovrebbe succedere), aggiorna `NEXT_PUBLIC_LEMON_SQUEEZY_PRODUCT_URL` nelle env vars su Vercel e nel `.env.local`.

**Su Flusso:**
1. Aggiorna `lib/config.ts` nell'oggetto `siteConfig.plans.premium.price` (e `annualPrice`) con i nuovi valori. Questo aggiorna la pagina `/pricing` e l'account page.
2. Se hai cambiato il variant ID del prodotto, controlla che il webhook gestisca correttamente il nuovo ID (in `app/api/webhook/lemon-squeezy/route.ts` il codice non filtra per variant ID, solo per event type, quindi di solito non serve modificarlo).
3. Fai un deploy.

---

## 5. Aggiungere una feature gated solo per Premium

Il pattern usato in tutta l'app: verifica il piano **lato server**, prima di fare qualsiasi cosa.

**In una page.tsx (Server Component):**
```typescript
const plan = await getEffectivePlan(profile?.plan ?? "free");
if (!isPremium(plan)) {
  return <div>Feature disponibile solo per Premium.</div>;
}
// resto della pagina
```
Vedi [app/dashboard/smart/page.tsx](../app/dashboard/smart/page.tsx) righe 22-50 per l'implementazione completa con UI di upsell.

**In una Server Action:**
```typescript
const plan = await getEffectivePlan(profile?.plan ?? "free");
if (!isPremium(plan)) return { error: "Funzione Premium." };
```
Vedi [app/dashboard/transazioni/screenshot-action.ts](../app/dashboard/transazioni/screenshot-action.ts) righe 19-24.

⚠️ Non fare il check solo nel client component: è solo cosmetico. Chiunque può chiamare una Server Action direttamente. Il check deve sempre esserci sul server.

---

## 6. Aggiungere un nuovo endpoint API

1. Crea `app/api/nomeroute/route.ts`.
2. Struttura base (copia da [app/api/coupon/redeem/route.ts](../app/api/coupon/redeem/route.ts)):
   - Importa `NextRequest`, `NextResponse`.
   - Verifica l'autenticazione con `createClient()` da `@/lib/supabase/server` e `supabase.auth.getClaims()`.
   - Se la route richiede permessi elevati (es. modificare dati di altri utenti), usa il service role key.
   - Restituisci `NextResponse.json({ ... })` con il codice HTTP appropriato.
3. Verifica: `npm run build`, poi testa la route con un client HTTP (o il browser se è una GET).

💡 Le route in `app/api/` sono public per default — chiunque può chiamarle. Aggiungi sempre la verifica dell'autenticazione (o della firma webhook) prima di fare qualsiasi operazione sul database.

---

## 7. Fare un test rapido in locale

**Creare un utente di test:**
1. Vai su [app.supabase.com](https://app.supabase.com) > Authentication > Users > Add user. Oppure registrati normalmente sull'app locale.

**Popolare l'utente con dati:**
1. Apri Supabase Studio > SQL Editor.
2. Copia l'UUID dell'utente da Authentication > Users.
3. Inserisci transazioni di test:
   ```sql
   insert into transactions (user_id, date, amount, description)
   values
     ('<UUID>', '2026-01-15', -45.00, 'Esselunga'),
     ('<UUID>', '2026-01-01', 2000.00, 'Stipendio');
   ```

**Switchare il piano in SQL Editor:**
```sql
-- Prima disabilita temporaneamente il trigger lock (solo in sviluppo!)
alter table profiles disable trigger lock_plan_column;
update profiles set plan = 'premium' where id = '<UUID>';
alter table profiles enable trigger lock_plan_column;
```
⚠️ Non farlo mai in produzione. In produzione usa il pannello admin o i coupon code.

---

## 8. Fare il deploy di una modifica

1. Fai il commit delle modifiche su un branch separato.
2. Apri una Pull Request su GitHub (se il repo è su GitHub).
3. Verifica che il build passi (CI automatico su Vercel se collegato, oppure esegui `npm run build` localmente).
4. Se hai creato una nuova migration SQL, **applicala manualmente** in Supabase Studio > SQL Editor **prima** di fare il merge. Vercel deploya il codice ma non applica le migration automaticamente.
5. Fai merge su `main`. Vercel esegue il deploy automaticamente (se collegato al repo).
6. Verifica in produzione: apri le pagine modificate e controlla che funzionino.

💡 Se la modifica è critica (pagamenti, RLS, webhook), testa prima in staging o su un progetto Supabase separato.

---

*Vedi anche: [05-deploy-env.md](05-deploy-env.md) per le variabili d'ambiente e la procedura di setup locale, [06-sicurezza.md](06-sicurezza.md) per i pattern di gating sicuro.*
