# garman-boilerplate

> Leggi in un'altra lingua: [🇬🇧 English](../README.md) · [🇪🇸 Español](README.es.md)

Un boilerplate SaaS production-ready con Next.js + Supabase: autenticazione, profili utente, gestione piani, pagamenti con Lemon Squeezy, email transazionali, blog MDX e pannello admin.

---

## 👉 [GUIDA AL SETUP — Inizia da qui](../SETUP.md)

Istruzioni passo-passo per passare da zero a funzionante in ~30 minuti. Include troubleshooting per gli errori più comuni.

---

## Cosa è incluso

| Funzionalità | Dettagli |
|---|---|
| Auth | Email/password, Google OAuth, recupero password, conferma email |
| Profili | Creati automaticamente al sign-up con `full_name` e `plan` |
| Piani | `free`, `premium`, `founder` con accesso protetto da RLS |
| Middleware | Protegge `/dashboard/*`, reindirizza gli utenti autenticati da `/login` |
| Pagamenti | Webhook Lemon Squeezy — aggiorna il piano automaticamente |
| Email | Resend — email di benvenuto, reset password |
| Blog | Blog MDX con metadati SEO, OG tag, sitemap |
| Pannello admin | `/dashboard/admin` — gestisci utenti e piani |
| SEO | Sitemap, robots.txt, OG metadata su tutte le pagine |
| UI | shadcn/ui, Tailwind CSS, dark mode, toast con Sonner |
| Legale | Pagine placeholder `/terms` e `/privacy` |

---

## Avvio rapido

```bash
npm install
npm run dev
```

Apri [http://localhost:3000](http://localhost:3000)

---

## Variabili d'ambiente

Compila `.env.local`:

```env
# Supabase — https://supabase.com/dashboard/project/_/settings/api
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Service role — solo server, NON esporre mai al client
SUPABASE_SERVICE_ROLE_KEY=

# URL del sito
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# Lemon Squeezy — https://app.lemonsqueezy.com
LEMON_SQUEEZY_WEBHOOK_SECRET=
NEXT_PUBLIC_LEMON_SQUEEZY_PRODUCT_URL=

# Resend — https://resend.com
RESEND_API_KEY=
RESEND_FROM_EMAIL=noreply@tuodominio.com

# Secret interno per webhook (stringa random sicura)
SUPABASE_WEBHOOK_SECRET=

# Admin — email separate da virgola con accesso admin
ADMIN_EMAILS=tu@esempio.com
```

---

## Configurare Supabase

1. Crea un progetto su [database.new](https://database.new)
2. Copia **Project URL** e **Publishable (anon) key** in `.env.local`
3. Copia la **Service Role key** in `.env.local` — tienila segreta
4. Esegui la migration SQL (vedi sotto)

## Eseguire la migration SQL

**Opzione A — SQL Editor di Supabase (consigliata)**

1. Dashboard → **SQL Editor** → **New query**
2. Incolla il contenuto di [`supabase/migrations/001_profiles.sql`](../supabase/migrations/001_profiles.sql)
3. Clicca **Run**

**Opzione B — Supabase CLI**

```bash
supabase login
supabase link --project-ref <tuo-project-ref>
supabase db push
```

La migration crea:
- Tabella `profiles` (`id`, `full_name`, `plan`, `created_at`, `updated_at`)
- Check constraint: `plan` deve essere `free`, `premium` o `founder`
- RLS: gli utenti possono leggere/aggiornare solo la propria riga
- Trigger: crea automaticamente un profilo al sign-up

---

## Configurare Google OAuth

1. Vai su [console.cloud.google.com](https://console.cloud.google.com) → **API e servizi** → **Credenziali**
2. Crea un **ID client OAuth 2.0** (Applicazione web)
3. Origini JavaScript autorizzate: `http://localhost:3000`
4. URI di reindirizzamento autorizzati: `https://<tuo-project-ref>.supabase.co/auth/v1/callback`
5. Copia **Client ID** e **Client Secret**
6. Supabase dashboard → **Authentication** → **Providers** → **Google** → incolla e salva

> Quando vai in produzione: aggiungi il tuo dominio di produzione nelle origini autorizzate su Google Cloud Console.

---

## Configurare Lemon Squeezy

1. Crea un prodotto/subscription su [Lemon Squeezy](https://app.lemonsqueezy.com)
2. Copia l'URL del checkout in `NEXT_PUBLIC_LEMON_SQUEEZY_PRODUCT_URL`
3. **Settings → Webhooks** → aggiungi webhook:
   - URL: `https://tuodominio.com/api/webhook/lemon-squeezy`
   - Events: `order_created`, `subscription_created`, `subscription_cancelled`
   - Copia il signing secret in `LEMON_SQUEEZY_WEBHOOK_SECRET`
4. Passa l'UUID Supabase dell'utente come `custom_data.user_id` nell'URL di checkout:

```ts
const url = new URL(process.env.NEXT_PUBLIC_LEMON_SQUEEZY_PRODUCT_URL!);
url.searchParams.set("checkout[custom][user_id]", user.id);
window.location.href = url.toString();
```

---

## Configurare Resend (email transazionali)

1. Crea un account su [resend.com](https://resend.com)
2. Aggiungi e verifica il tuo dominio
3. Crea un API key → copialo in `RESEND_API_KEY`
4. Imposta `RESEND_FROM_EMAIL` con un indirizzo mittente verificato
5. L'email di benvenuto viene inviata via `POST /api/auth/welcome` — chiamala dopo il sign-up o triggerala tramite webhook Supabase

---

## Pannello admin

Accedi a `/dashboard/admin` — visibile solo agli utenti in `ADMIN_EMAILS`.

Dal pannello admin puoi:
- Vedere tutti gli utenti registrati
- Cambiare il piano di qualsiasi utente direttamente dalla tabella

**Via codice:**

```ts
import { updateUserPlan } from "@/lib/admin";
await updateUserPlan("uuid-utente", "founder");
```

---

## Blog

Aggiungi file MDX in `content/blog/`:

```mdx
---
title: Titolo del tuo articolo
description: Breve descrizione
date: 2026-04-11
author: Il tuo nome
tags: [tag1, tag2]
---

Il tuo contenuto in **Markdown**.
```

Gli articoli appaiono automaticamente su `/blog`.

---

## Branding

Tutto il branding è in un unico file: [`lib/config.ts`](../lib/config.ts)

Modifica `name`, `tagline`, `description`, le feature dei piani, i prezzi, i link di navigazione — tutto si aggiorna nell'intera app.

---

## Struttura del progetto

```
app/
  page.tsx                        # Landing page
  pricing/                        # Pagina prezzi
  blog/                           # Lista articoli + pagina [slug]
  terms/ privacy/                 # Pagine legali
  dashboard/
    page.tsx                      # Dashboard utente
    account/                      # Impostazioni account
    admin/                        # Pannello admin (solo ADMIN_EMAILS)
  auth/                           # Login, sign-up, recupero password, confirm
  api/
    webhook/lemon-squeezy/        # Webhook pagamenti
    admin/update-plan/            # API cambio piano admin
    auth/welcome/                 # Trigger email di benvenuto
components/
  navbar.tsx                      # Navbar pubblica
  oauth-buttons.tsx               # Pulsante Google OAuth
  pricing-card.tsx                # Card piano riutilizzabile
  login-form.tsx / sign-up-form.tsx / ...
content/
  blog/                           # Articoli MDX
hooks/
  useAuth.ts                      # Hook client-side auth + profilo
lib/
  config.ts                       # Branding e config piani
  plans.ts                        # isPremium, isFounder, getPlanLabel
  admin.ts                        # updateUserPlan (service role)
  email.ts                        # Template email Resend
  blog.ts                         # Utility blog MDX
  supabase/
    client.ts / server.ts / proxy.ts
supabase/
  migrations/
    001_profiles.sql
```
