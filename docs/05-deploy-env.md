# 05 — Deploy e variabili d'ambiente

---

## Variabili d'ambiente

Tutte le variabili sono cercate tramite `process.env.*` nel codice. Le variabili `NEXT_PUBLIC_*` vengono incluse nel bundle JavaScript inviato al browser — non metterci mai segreti.

### Variabili obbligatorie

| Variabile | Pubblica? | Descrizione | Dove trovarla |
|-----------|-----------|-------------|---------------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ Sì | URL del progetto Supabase (es. `https://xxx.supabase.co`) | Supabase > Settings > API > Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ✅ Sì | Chiave pubblica Supabase (ex "anon key") | Supabase > Settings > API > Project API keys > `anon` / `publishable` |
| `SUPABASE_SERVICE_ROLE_KEY` | ❌ No | Chiave segreta che bypassa RLS — solo server | Supabase > Settings > API > Project API keys > `service_role` |
| `NEXT_PUBLIC_SITE_URL` | ✅ Sì | URL pubblico dell'app (es. `https://flussoapp.com`) | Il tuo dominio di produzione |
| `NEXT_PUBLIC_LEMON_SQUEEZY_PRODUCT_URL` | ✅ Sì | URL checkout Lemon Squeezy (es. `https://flusso.lemonsqueezy.com/buy/...`) | Lemon Squeezy > Products > Share link |
| `LEMON_SQUEEZY_WEBHOOK_SECRET` | ❌ No | Segreto per verificare i webhook di Lemon Squeezy | Lemon Squeezy > Settings > Webhooks > Signing secret |
| `LEMON_SQUEEZY_API_KEY` | ❌ No | API key usata per annullare gli abbonamenti (bottone "Annulla abbonamento" in Account) | Lemon Squeezy > Settings > API |
| `ANTHROPIC_API_KEY` | ❌ No | API key per Claude (import screenshot) | [console.anthropic.com](https://console.anthropic.com) > API Keys |
| `ADMIN_EMAILS` | ❌ No | Email degli amministratori, separate da virgola | Imposta tu (es. `tua@email.com`) |

### Variabili opzionali

| Variabile | Descrizione | Dove trovarla |
|-----------|-------------|---------------|
| `RESEND_API_KEY` | API key per invio email (welcome email) | [resend.com](https://resend.com) > API Keys |
| `RESEND_FROM_EMAIL` | Indirizzo mittente email (es. `noreply@flussoapp.com`) | Imposta tu dopo aver verificato il dominio su Resend |
| `SUPABASE_WEBHOOK_SECRET` | Segreto per il webhook Supabase → welcome email | Imposta tu (una stringa random lunga) |

⚠️ Non mettere mai `SUPABASE_SERVICE_ROLE_KEY`, `LEMON_SQUEEZY_WEBHOOK_SECRET` o `ANTHROPIC_API_KEY` in una variabile `NEXT_PUBLIC_*`. Sarebbero esposte nel browser.

---

## Setup locale da zero

Segui questi passi in ordine.

### 1. Prerequisiti
- Node.js 18+ (`node --version`)
- Git
- Un progetto Supabase creato su [supabase.com](https://supabase.com)

### 2. Clone e installazione
```
git clone <URL_REPO>
cd flussoapp
npm install
```

### 3. File .env.local
Crea il file `.env.local` nella radice del progetto (è nel `.gitignore`, non verrà committato):
```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_LEMON_SQUEEZY_PRODUCT_URL=https://...
LEMON_SQUEEZY_WEBHOOK_SECRET=il_tuo_segreto
ANTHROPIC_API_KEY=sk-ant-...
ADMIN_EMAILS=tua@email.com
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=noreply@tuodominio.com
```

### 4. Applica le migration SQL
Vai su Supabase Studio > SQL Editor. Apri i file in `supabase/migrations/` in ordine numerico (001, 002... 017) e incollali uno alla volta nel SQL editor, eseguendo ognuno.

In alternativa, se hai la Supabase CLI installata e il progetto linkato:
```
supabase db push
```

### 5. Avvia l'app
```
npm run dev
```
Apri [http://localhost:3000](http://localhost:3000). Registra un account con email e password.

### 6. Promuoviti a premium (opzionale, per testare le feature)
Vedi [04-modifiche-comuni.md](04-modifiche-comuni.md) sezione 7 "Switchare il piano in SQL Editor".

---

## Deploy in produzione (Vercel)

### Prima volta
1. Vai su [vercel.com](https://vercel.com) e importa il repository GitHub.
2. Nella sezione "Environment Variables" di Vercel, aggiungi tutte le variabili dell'elenco sopra.
3. Imposta `NEXT_PUBLIC_SITE_URL` con l'URL di produzione reale (es. `https://flussoapp.com`).
4. Clicca "Deploy". Vercel eseguirà `npm run build` automaticamente.
5. Dopo il primo deploy, applica tutte le migration SQL su Supabase di produzione (come al punto 4 del setup locale).

### Deploy successivi
1. Fai il push su `main` (o merge di una PR su `main`).
2. Vercel esegue automaticamente un nuovo build e deploy.
3. Se hai nuove migration SQL, applicale **prima** del merge su main (o subito dopo, prima che il codice in produzione le usi).

### Redirect OAuth (Google Login)
Vai su Supabase > Authentication > URL Configuration e aggiungi:
- Site URL: `https://flussoapp.com`
- Redirect URLs: `https://flussoapp.com/auth/callback`

---

## ⚠️ Lemon Squeezy: test mode vs live mode

Questa è la fonte più comune di confusione con i pagamenti.

| | Test mode | Live mode |
|--|-----------|-----------|
| **API key** | Inizia con `test_` | Inizia con `live_` |
| **Webhook secret** | Segreto del test store | Segreto del live store |
| **URL checkout** | URL del test product | URL del live product |

**Tre cose che cambiano tra test e live:**

1. **`NEXT_PUBLIC_LEMON_SQUEEZY_PRODUCT_URL`**: l'URL del test product e quello del live product sono diversi. Se usi quello di test in produzione, i pagamenti reali non partono e gli utenti vedono la sandbox.
2. **`LEMON_SQUEEZY_WEBHOOK_SECRET`**: ogni store (test e live) ha il suo webhook secret. Se usi il segreto sbagliato, tutti i webhook arrivano con firma invalida e il piano non viene aggiornato dopo il pagamento.
3. **`NEXT_PUBLIC_LEMON_SQUEEZY_PRODUCT_URL`**: verifica che sia il product URL del live store, non un link di test.

Per verificare che tutto funzioni: fai un acquisto di test con una carta Lemon Squeezy (4242 4242 4242 4242), controlla i log di Vercel e verifica che `profiles.plan` sia diventato `'premium'`.

---

*Vedi anche: [06-sicurezza.md](06-sicurezza.md) per la gestione sicura delle chiavi, [07-troubleshooting.md](07-troubleshooting.md) per i problemi comuni di deploy.*
