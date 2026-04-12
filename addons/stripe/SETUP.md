# Add-on: Stripe Billing

Integrazione Stripe come alternativa a Lemon Squeezy. Include checkout, portale clienti e webhook per aggiornamento automatico del piano.

---

## File inclusi

```
addons/stripe/files/
  app/api/stripe/checkout/route.ts     → app/api/stripe/checkout/route.ts
  app/api/stripe/portal/route.ts       → app/api/stripe/portal/route.ts
  app/api/webhook/stripe/route.ts      → app/api/webhook/stripe/route.ts
  supabase/migrations/005_stripe.sql
```

---

## Passaggi

### 1. Installa Stripe

```bash
npm install stripe
```

### 2. Esegui la migration SQL

Supabase → **SQL Editor → New query** → incolla `005_stripe.sql` → **Run**.

Aggiunge a `profiles`:
- `stripe_customer_id` (text, unique)
- `stripe_subscription_id` (text, unique)

### 3. Crea i prodotti su Stripe

1. Vai su [dashboard.stripe.com](https://dashboard.stripe.com)
2. **Products → Add product** → crea i tuoi piani (Premium, Founder)
3. Per ogni piano, copia il **Price ID** (formato `price_xxx`)

### 4. Aggiungi le variabili d'ambiente

In `.env.local`:

```env
# Stripe — https://dashboard.stripe.com/apikeys
STRIPE_SECRET_KEY=sk_live_xxx          # oppure sk_test_xxx in dev
STRIPE_WEBHOOK_SECRET=whsec_xxx        # generato al passo 6

# Price ID dei tuoi piani Stripe
STRIPE_PRICE_PREMIUM=price_xxx
STRIPE_PRICE_FOUNDER=price_xxx
```

### 5. Copia i file

```
app/api/stripe/checkout/route.ts  →  app/api/stripe/checkout/route.ts
app/api/stripe/portal/route.ts    →  app/api/stripe/portal/route.ts
app/api/webhook/stripe/route.ts   →  app/api/webhook/stripe/route.ts
```

### 6. Configura il webhook su Stripe

**In produzione:**
1. Stripe dashboard → **Developers → Webhooks → Add endpoint**
2. URL: `https://tuodominio.com/api/webhook/stripe`
3. Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
4. Copia il **Signing secret** in `STRIPE_WEBHOOK_SECRET`

**In locale (con Stripe CLI):**
```bash
npx stripe login
npx stripe listen --forward-to localhost:3000/api/webhook/stripe
```
Il CLI mostra il webhook secret da usare in locale.

### 7. Usa il checkout nel frontend

```tsx
// In qualsiasi componente client
async function handleUpgrade(priceId: string) {
  const res = await fetch("/api/stripe/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ priceId }),
  });
  const { url } = await res.json();
  window.location.href = url;
}

// Portale clienti (gestione abbonamento)
async function handlePortal() {
  const res = await fetch("/api/stripe/portal", { method: "POST" });
  const { url } = await res.json();
  window.location.href = url;
}
```

---

## Come funziona

1. Utente clicca "Upgrade" → `POST /api/stripe/checkout` con il Price ID
2. API crea/recupera il customer Stripe, genera la sessione di checkout
3. Utente paga → Stripe invia `checkout.session.completed`
4. Webhook aggiorna `plan` e `stripe_subscription_id` nel profilo
5. Cancellazione → `customer.subscription.deleted` → piano torna a `free`

---

## Abilitare il portale clienti Stripe

Nel dashboard Stripe → **Settings → Billing → Customer portal** → attiva e configura.
Senza questa configurazione, `POST /api/stripe/portal` darà errore.

---

## Personalizzazione

| Cosa | Dove |
|---|---|
| Mapping price → piano | `PRICE_TO_PLAN` in `app/api/webhook/stripe/route.ts` |
| URL di successo | `success_url` in `checkout/route.ts` |
| URL di ritorno portale | `return_url` in `portal/route.ts` |
| Modalità pagamento | `mode: "subscription"` → cambia in `"payment"` per one-time |
