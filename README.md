# Flusso

Web app di gestione finanziaria personale. Traccia entrate e uscite, pianifica budget, monitora spese ricorrenti e obiettivi di risparmio.

---

## Stack

| Layer | Tecnologia |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript + React 19 |
| Database / Auth | Supabase (Postgres + RLS + Auth) |
| Styling | Tailwind CSS + shadcn/ui |
| Billing | Lemon Squeezy |
| Email | Resend |
| Deployment | Vercel |
| PWA | Service Worker + manifest |

---

## Quick start

```bash
npm install
npm run dev
```

Apri [http://localhost:3000](http://localhost:3000).

---

## Variabili d'ambiente

Crea `.env.local` con:

```env
# Supabase — https://supabase.com/dashboard/project/_/settings/api
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Service role — solo server-side, mai esporre al client
SUPABASE_SERVICE_ROLE_KEY=

# URL dell'app
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# Lemon Squeezy — https://app.lemonsqueezy.com
LEMON_SQUEEZY_WEBHOOK_SECRET=
NEXT_PUBLIC_LEMON_SQUEEZY_PRODUCT_URL=

# Resend — https://resend.com
RESEND_API_KEY=
RESEND_FROM_EMAIL=noreply@tuodominio.com

# Secret interno per webhook Supabase (stringa casuale sicura)
SUPABASE_WEBHOOK_SECRET=

# Admin — email separate da virgola con accesso al pannello admin
ADMIN_EMAILS=tua@email.com
```

---

## Database — migrazioni

Applica tutte le migrazioni in ordine (Supabase Studio → SQL Editor):

| File | Contenuto |
|---|---|
| `001_profiles.sql` | Tabella `profiles`, RLS, trigger auto-creazione |
| `002_finance.sql` | `categories`, `transactions`, `goals`, `category_rules` |
| `003_balance.sql` | Campo `balance` su `profiles` |
| `004_payperiod.sql` | Periodo di paga |
| `005_piggy.sql` | Salvadanaio |
| `006_new_categories.sql` | Categorie aggiuntive |
| `007_display_rules.sql` | Regole di visualizzazione descrizioni |
| `008_smart_budget.sql` | Tabella `budget_items` (tab Previsioni) |
| `009_recurring_expenses.sql` | Tabella `recurring_expenses` |
| `010_recurring_keywords.sql` | Campo `match_keywords` su `recurring_expenses` |
| `011_recurring_strategy.sql` | Campo `matching_strategy` su `recurring_expenses` |
| `012_coupon_codes.sql` | Tabella `coupon_codes` per upgrade via coupon |

**Via CLI:**
```bash
supabase login
supabase link --project-ref <project-ref>
supabase db push
```

---

## Configurazione Google OAuth

1. [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials
2. Crea OAuth 2.0 Client ID (Web application)
3. Authorized JavaScript origins: `http://localhost:3000`
4. Authorized redirect URIs: `https://<project-ref>.supabase.co/auth/v1/callback`
5. Copia Client ID e Client Secret
6. Supabase → Authentication → Providers → Google → incolla e salva

In produzione: aggiungi il dominio di produzione agli origins autorizzati.

---

## Configurazione Lemon Squeezy

1. Crea un prodotto/subscription su [app.lemonsqueezy.com](https://app.lemonsqueezy.com)
2. Copia il checkout URL in `NEXT_PUBLIC_LEMON_SQUEEZY_PRODUCT_URL`
3. Settings → Webhooks → aggiungi webhook:
   - URL: `https://tuodominio.com/api/webhook/lemon-squeezy`
   - Events: `order_created`, `subscription_created`, `subscription_cancelled`
   - Copia il signing secret in `LEMON_SQUEEZY_WEBHOOK_SECRET`

Il pulsante "Passa a Premium" in `/dashboard/account` aggiunge automaticamente `user_id` nella query string del checkout (richiesto dal webhook per identificare l'utente).

---

## Configurazione Resend

1. Crea account su [resend.com](https://resend.com)
2. Aggiungi e verifica il dominio
3. Crea API key → `RESEND_API_KEY`
4. Imposta `RESEND_FROM_EMAIL` con indirizzo mittente verificato
5. La welcome email si invia via `POST /api/auth/welcome`

---

## Piani

| Piano | Prezzo | Funzionalità |
|---|---|---|
| **Free** | Gratis | 50 tx/mese, 1 obiettivo, funzionalità base |
| **Premium** | €4.99/mese o €39/anno | Tutto illimitato, previsioni smart |
| **Founder** | €49 una tantum | Tutto Premium + accesso a vita + supporto prioritario |

Tutti i prezzi e le feature sono configurabili in `lib/config.ts`.

---

## Sistema coupon

I coupon permettono di upgraddare un utente a Premium o Founder senza pagamento (es. beta tester, omaggi, accordi diretti).

**Come funziona:**
1. Crei un coupon dal pannello admin (`/dashboard/admin` → sezione Coupon)
2. Scegli il piano target (Premium o Founder) e aggiungi note interne opzionali
3. Invii il codice manualmente all'utente (via email, DM, ecc.)
4. L'utente inserisce il codice in Impostazioni account → Piano di abbonamento
5. Il coupon viene marcato come usato e il piano aggiornato immediatamente

I codici sono monouso, univoci, e non enumerabili dagli utenti (RLS: nessun accesso diretto alla tabella).

**Via codice:**
```ts
// Crea coupon programmaticamente (solo server-side con service role)
import { createClient } from "@supabase/supabase-js";
const service = createClient(url, serviceKey);
await service.from("coupon_codes").insert({ code: "FLUSSO-XXXX-XXXX", plan: "founder", notes: "..." });
```

---

## Pannello admin

Accedi a `/dashboard/admin` — visibile solo agli utenti in `ADMIN_EMAILS`.

Funzionalità:
- Lista tutti gli utenti registrati con piano attuale
- Cambia piano a qualsiasi utente direttamente dalla tabella
- Crea e gestisci coupon di upgrade

**Via codice:**
```ts
import { updateUserPlan } from "@/lib/admin";
await updateUserPlan("user-uuid-here", "founder");
```

---

## Blog

Aggiungi file MDX in `content/blog/`:

```mdx
---
title: Titolo del post
description: Breve descrizione
date: 2026-04-22
author: Marco
tags: [finanza, risparmio]
---

Contenuto in **Markdown**.
```

I post appaiono automaticamente su `/blog`.

---

## Branding

Tutto il branding è in un solo file: [`lib/config.ts`](lib/config.ts)

Nome, tagline, prezzi, feature dei piani, link nav — tutto aggiorna l'intera app.

---

## Struttura progetto

```
app/
  page.tsx                            # Landing page
  pricing/                            # Pagina prezzi
  blog/                               # Blog list + [slug]
  terms/ privacy/ cookie-policy/      # Pagine legali
  dashboard/
    page.tsx                          # Dashboard principale
    account/                          # Impostazioni account + piano + coupon
    admin/                            # Pannello admin (ADMIN_EMAILS only)
    transazioni/                      # Lista transazioni + tab Previsioni
    smart/                            # Tab Previsioni / Ricorrenti / Obiettivi
    obiettivi/                        # Gestione obiettivi di risparmio
  auth/                               # Login, sign-up, forgot-password, confirm
  api/
    webhook/lemon-squeezy/            # Webhook billing (upgrade/downgrade piano)
    admin/update-plan/                # API admin cambio piano
    admin/create-coupon/              # API admin creazione coupon
    coupon/redeem/                    # API riscatto coupon utente
    auth/welcome/                     # Email di benvenuto
components/
  navbar.tsx
  pricing-card.tsx
  oauth-buttons.tsx
  login-form.tsx / sign-up-form.tsx / ...
  ui/                                 # shadcn/ui components
content/
  blog/                               # File MDX blog
lib/
  config.ts                           # Branding + piani + nav
  plans.ts                            # isPremium, isFounder, getPlanLabel
  admin.ts                            # updateUserPlan (service role)
  calculations.ts                     # Funzioni di calcolo finanziario
  email.ts                            # Template email Resend
  supabase/
    client.ts / server.ts / proxy.ts
supabase/
  migrations/                         # 012 file SQL ordinati
public/
  icons/                              # Icone PWA
  manifest.json                       # PWA manifest
  sw.js                               # Service worker
```
