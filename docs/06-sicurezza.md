# 06 — Sicurezza essenziale

---

## I tre livelli di fiducia in Supabase

Supabase distingue tre livelli di accesso, e usare quello sbagliato è il principale modo di introdurre vulnerabilità.

### Livello 1 — Anon key (Publishable key)
La chiave pubblica `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Può stare nel frontend senza problemi.

Cosa può fare: accedere solo ai dati che le policy RLS permettono per un utente non autenticato (di norma quasi niente, se le policy sono corrette).

In Flusso è usata in [lib/supabase/client.ts](../lib/supabase/client.ts) per il client browser e in [lib/supabase/server.ts](../lib/supabase/server.ts) per i server component. Le policy RLS fanno da filtro: un client con anon key non può leggere le transazioni di nessun utente.

### Livello 2 — JWT autenticato
Stesso client, ma l'utente ha eseguito il login. Il JWT nell'header delle richieste identifica l'utente. RLS applica le policy usando `auth.uid()` che corrisponde all'ID nel JWT.

Cosa può fare: leggere e scrivere i propri dati (le righe dove `user_id = auth.uid()`), leggere le categorie di sistema.

In Flusso è il livello usato da tutte le Server Action che operano per conto dell'utente loggato: `categorizeTransaction`, `createCategoryRule`, ecc.

### Livello 3 — Service role key
La chiave segreta `SUPABASE_SERVICE_ROLE_KEY`. **Bypassa completamente RLS**: può leggere e scrivere qualsiasi riga di qualsiasi tabella.

Cosa può fare: tutto.

⚠️ **Mai mettere `SUPABASE_SERVICE_ROLE_KEY` in una variabile `NEXT_PUBLIC_*`.** Se finisse nel bundle JavaScript, chiunque potrebbe leggerla negli strumenti sviluppatore del browser e avrebbe accesso illimitato all'intero database.

In Flusso è usata solo in: webhook Lemon Squeezy ([app/api/webhook/lemon-squeezy/route.ts](../app/api/webhook/lemon-squeezy/route.ts)), redeem coupon ([app/api/coupon/redeem/route.ts](../app/api/coupon/redeem/route.ts)), welcome email ([app/api/auth/welcome/route.ts](../app/api/auth/welcome/route.ts)), route admin ([app/api/admin/](../app/api/admin/)). Tutti file server-only, mai esposti al browser.

---

## Pattern di gating server-side per feature premium

⚠️ Il check nel client component è solo cosmetico: nasconde un bottone. Non impedisce a nessuno di chiamare la Server Action direttamente. Il check deve sempre essere duplicato sul server.

### Pattern corretto (Server Action)

```typescript
// app/dashboard/transazioni/screenshot-action.ts
export async function extractTransactionsFromScreenshot(...) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return { error: "Non autenticato." };

  const { data: profile } = await supabase
    .from("profiles").select("plan").eq("id", claims.claims.sub).single();
  const plan = await getEffectivePlan(profile?.plan ?? "free");

  if (!isPremium(plan)) return { error: "Funzione Premium." };
  // ... resto della logica
}
```
[Vedi app/dashboard/transazioni/screenshot-action.ts](../app/dashboard/transazioni/screenshot-action.ts) righe 14-24.

### Pattern corretto (Server Component / page.tsx)

```typescript
// app/dashboard/smart/page.tsx
const plan = await getEffectivePlan(profile?.plan ?? "free");
if (plan === "free") {
  return <div>Feature solo Premium.</div>;
}
// ... resto della pagina con i dati
```
[Vedi app/dashboard/smart/page.tsx](../app/dashboard/smart/page.tsx) righe 22-50.

### Funzioni helper

- `isPremium(plan)` → `true` se il piano è `'premium'` o `'founder'`
- `isFounder(plan)` → `true` solo se il piano è `'founder'`
- `getEffectivePlan(realPlan)` → restituisce il piano reale oppure quello di preview (solo per admin)

Tutte e tre in [lib/plans.ts](../lib/plans.ts).

---

## Il piano è blindato a livello database

⚠️ Oltre al gating applicativo, il campo `profiles.plan` è protetto da un trigger SQL (migration 016).

Il trigger `lock_plan_column` (in [supabase/migrations/016_lock_plan_column.sql](../supabase/migrations/016_lock_plan_column.sql)) intercetta ogni `UPDATE` su `profiles`: se chi fa l'update non è il `service_role`, ripristina il valore originale di `plan`. In pratica, un utente non può mai cambiarsi il piano da solo, neanche usando direttamente l'SDK Supabase nel browser.

Il piano viene cambiato solo da:
1. Il webhook Lemon Squeezy (usa service role)
2. La route `/api/coupon/redeem` (usa service role)
3. La route `/api/admin/update-plan` (usa service role, solo admin)

---

## Webhook signature — perché è critica

Il webhook Lemon Squeezy è una richiesta HTTP che arriva dall'esterno. Senza verifica della firma, chiunque potrebbe fare:
```
curl -X POST https://flussoapp.com/api/webhook/lemon-squeezy \
  -d '{"meta":{"event_name":"order_created","custom_data":{"user_id":"<qualsiasi UUID>"}}}'
```
e promuovere qualsiasi utente a Premium gratis.

La verifica funziona così: Lemon Squeezy firma il body della richiesta con HMAC-SHA256 usando il `LEMON_SQUEEZY_WEBHOOK_SECRET`. Il webhook ricalcola l'HMAC e lo confronta con l'header `x-signature` usando `crypto.timingSafeEqual` (che evita timing attack). Se non corrisponde, risponde 401 e non fa nulla.

[Vedi app/api/webhook/lemon-squeezy/route.ts](../app/api/webhook/lemon-squeezy/route.ts) righe 29-45 per l'implementazione.

⚠️ Non rimuovere mai la chiamata a `verifySignature()` dal webhook, neanche "temporaneamente" per debugging. Usa i log di Vercel per debuggare.

---

## Backup e disaster recovery

Supabase esegue backup automatici del database ogni giorno (su piani a pagamento). Il piano Free ha backup point-in-time disabilitati.

**Backup manuale:**
1. Vai su Supabase > Database > Backups — trovi i backup automatici recenti.
2. Per un dump completo manuale: Supabase Dashboard > Settings > Database > Connection string. Usa `pg_dump` con la connection string per esportare un `.sql`.

**Frequenza consigliata:** prima di ogni migration SQL importante e almeno una volta al mese.

**Disaster recovery:**
- Se una migration SQL rompe qualcosa: Supabase permette di fare point-in-time recovery (su piani a pagamento). Su piano Free, devi avere un dump recente da cui ripristinare.
- Se Vercel ha un outage: il database Supabase è indipendente, i dati sono al sicuro. Basta fare un nuovo deploy.

---

## Coupon code — sicurezza

I coupon code nella tabella `coupon_codes` non hanno una policy RLS di SELECT pubblica (vedi migration 012). L'accesso avviene solo tramite la route `/api/coupon/redeem` con service role. Questo impedisce a utenti di enumerare i codici validi interrogando direttamente la tabella.

---

*Vedi anche: [02-architecture.md](02-architecture.md) sezione RLS, [05-deploy-env.md](05-deploy-env.md) per la gestione delle variabili d'ambiente segrete.*
