# Setup Guide — garman-boilerplate

> Segui questi passi nell'ordine. Ci vogliono circa 30–45 minuti.

---

## Indice

1. [Clona e installa](#1-clona-e-installa)
2. [Crea il file .env.local](#2-crea-il-file-envlocal)
3. [Configura Supabase](#3-configura-supabase)
4. [Esegui la migration SQL](#4-esegui-la-migration-sql)
5. [Personalizza il branding](#5-personalizza-il-branding)
6. [Configura Google OAuth](#6-configura-google-oauth-opzionale)
7. [Configura Resend (email)](#7-configura-resend-email)
8. [Imposta l'email admin](#8-imposta-lemail-admin)
9. [Avvia e testa](#9-avvia-e-testa)
10. [Configura Lemon Squeezy (pagamenti)](#10-configura-lemon-squeezy-pagamenti)
11. [Vai in produzione](#11-vai-in-produzione)
12. [Problemi comuni](#problemi-comuni)

---

## 1. Clona e installa

```bash
git clone <url-del-repo>
cd garman-boilerplate
npm install
```

---

## 2. Crea il file .env.local

```bash
cp .env.example .env.local
```

Apri `.env.local` — lo compilerai nei prossimi passi.

---

## 3. Configura Supabase

1. Vai su [database.new](https://database.new) e crea un account (gratuito)
2. Crea un nuovo progetto — scegli nome, password DB e regione
3. Aspetta che il progetto parta (~2 minuti)
4. Vai su **Settings → API**
5. Copia in `.env.local`:

| Valore su Supabase | Variabile in .env.local |
|---|---|
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
| Publishable key (o anon key) | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| service_role key *(clicca Reveal)* | `SUPABASE_SERVICE_ROLE_KEY` |

> ⚠️ La `service_role` key bypassa tutta la sicurezza — non metterla mai in variabili `NEXT_PUBLIC_`.

---

## 4. Esegui la migration SQL

1. Nel dashboard Supabase → **SQL Editor → New query**
2. Apri `supabase/migrations/001_profiles.sql` dal tuo editor
3. Copia tutto il contenuto e incollalo nel SQL Editor
4. Clicca **Run**

Dovresti vedere "Success. No rows returned". Questo crea la tabella `profiles`, le policy RLS e il trigger per la creazione automatica del profilo al sign-up.

---

## 5. Personalizza il branding

Apri `lib/config.ts` e modifica:

```ts
name: "NomeDellaTuaApp",
tagline: "Il tuo slogan",
description: "Descrizione breve della tua app",
```

Modifica anche i piani, i prezzi e le feature se vuoi. Tutto il sito si aggiorna automaticamente.

---

## 6. Configura Google OAuth (opzionale)

**Su Google Cloud Console:**

1. Vai su [console.cloud.google.com](https://console.cloud.google.com)
2. Crea un progetto → **API e servizi → Credenziali**
3. Se richiesto, configura la **schermata di consenso OAuth** (tipo: Esterno, metti nome e email)
4. **+ Crea credenziali → ID client OAuth** (tipo: Applicazione web)
5. Aggiungi esattamente questi URL:
   - **Origini JavaScript autorizzate:**
     ```
     http://localhost:3000
     ```
   - **URI di reindirizzamento autorizzati:**
     ```
     http://localhost:3000/auth/callback
     https://TUOID.supabase.co/auth/v1/callback
     ```
     *(sostituisci `TUOID` con il tuo project ref — lo trovi nell'URL del progetto Supabase)*
6. Copia **Client ID** e **Client Secret**

**Su Supabase:**

7. Dashboard → **Authentication → Providers → Google**
8. Attiva il toggle, incolla Client ID e Client Secret → **Save**

---

## 7. Configura Resend (email)

1. Crea account su [resend.com](https://resend.com) (gratuito)
2. **API Keys → Create API Key**
   - Name: qualsiasi
   - Permission: `Full access`
   - Domain: `All domains`
3. Copia la chiave (la vedi **una sola volta**) in `.env.local`:
   ```
   RESEND_API_KEY=re_xxxxxxxxxxxx
   RESEND_FROM_EMAIL=onboarding@resend.dev
   ```

> `onboarding@resend.dev` funziona subito senza configurazioni. Quando hai un dominio reale, verificalo su Resend e usa `noreply@tuodominio.com`. Le email inviate con questo indirizzo potrebbero finire in spam — è normale in sviluppo.

**Per la produzione — verifica il tuo dominio:**
1. Resend dashboard → **Domains → Add Domain**
2. Resend ti fornisce dei record DNS (SPF, DKIM) da aggiungere al tuo provider
3. Dopo la verifica, cambia `RESEND_FROM_EMAIL` con il tuo indirizzo
4. Guida completa: [resend.com/docs/dashboard/domains/introduction](https://resend.com/docs/dashboard/domains/introduction)

---

## 8. Imposta l'email admin

In `.env.local`:

```
ADMIN_EMAILS=tua@email.com
```

Per più admin, separali con virgola:
```
ADMIN_EMAILS=primo@email.com,secondo@email.com
```

---

## 9. Avvia e testa

```bash
npm run dev
```

Apri [http://localhost:3000](http://localhost:3000)

**Checklist:**
- [ ] La landing page si carica
- [ ] Vai su `/auth/sign-up` → crea un account con email
- [ ] Ricevi l'email di benvenuto (controlla anche spam)
- [ ] Accedi e vai su `/dashboard`
- [ ] Vai su `/dashboard/account` → aggiorna il nome
- [ ] Vai su `/dashboard/admin` → vedi la lista utenti
- [ ] Prova il login con Google

---

## 10. Configura Lemon Squeezy (pagamenti)

Fai questo solo quando sei pronto a ricevere pagamenti reali.

1. Crea account su [app.lemonsqueezy.com](https://app.lemonsqueezy.com)
2. Crea un prodotto o una subscription
3. Copia l'URL del checkout in `.env.local`:
   ```
   NEXT_PUBLIC_LEMON_SQUEEZY_PRODUCT_URL=https://...
   ```
4. **Settings → Webhooks → Add webhook**
   - URL: `https://tuodominio.com/api/webhook/lemon-squeezy`
   - Events da spuntare: `order_created`, `subscription_created`, `subscription_cancelled`
   - Il signing secret deve essere tra 6 e 40 caratteri → copialo in `LEMON_SQUEEZY_WEBHOOK_SECRET`

5. Quando generi il link di checkout, passa l'UUID dell'utente:
   ```ts
   const url = new URL(process.env.NEXT_PUBLIC_LEMON_SQUEEZY_PRODUCT_URL!);
   url.searchParams.set("checkout[custom][user_id]", user.id);
   window.location.href = url.toString();
   ```

**Test in locale con ngrok:**
```bash
npx ngrok http 3000
```
Copia l'URL `https://xxxx.ngrok.io` e usalo come URL del webhook su Lemon Squeezy.
Puoi anche simulare eventi direttamente dalla dashboard: [docs.lemonsqueezy.com/help/webhooks/simulate-webhook-events](https://docs.lemonsqueezy.com/help/webhooks/simulate-webhook-events)

---

## 11. Vai in produzione

Prima di deployare su Vercel (o altro hosting):

**Vercel:**
1. Importa il repo su [vercel.com](https://vercel.com)
2. Aggiungi tutte le variabili da `.env.local` nelle **Environment Variables** di Vercel
3. Aggiorna `NEXT_PUBLIC_SITE_URL` con il tuo dominio di produzione

**Google OAuth — aggiungi il dominio di produzione:**
1. Google Cloud Console → Credenziali → il tuo Client OAuth
2. **Origini JavaScript autorizzate** → aggiungi `https://tuodominio.com`
3. **URI di reindirizzamento autorizzati** → aggiungi `https://tuodominio.com/auth/callback`

**Supabase — aggiungi l'URL di produzione:**
1. Dashboard → **Authentication → URL Configuration**
2. **Site URL** → metti `https://tuodominio.com`
3. **Redirect URLs** → aggiungi `https://tuodominio.com/auth/callback`

**Lemon Squeezy:**
- Aggiorna l'URL del webhook con quello di produzione

---

## Riepilogo variabili d'ambiente

| Variabile | Dove trovarla | Obbligatoria |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API | ✅ |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Settings → API | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API | ✅ |
| `NEXT_PUBLIC_SITE_URL` | Il tuo dominio (`http://localhost:3000` in dev) | ✅ |
| `ADMIN_EMAILS` | La tua email | ✅ |
| `RESEND_API_KEY` | [resend.com](https://resend.com) → API Keys | ⚡ |
| `RESEND_FROM_EMAIL` | Il tuo indirizzo mittente | ⚡ |
| `SUPABASE_WEBHOOK_SECRET` | Stringa random (genera con `openssl rand -hex 32`) | ⚡ |
| `LEMON_SQUEEZY_WEBHOOK_SECRET` | Lemon Squeezy → Webhooks | 💳 solo pagamenti |
| `NEXT_PUBLIC_LEMON_SQUEEZY_PRODUCT_URL` | Lemon Squeezy → Prodotto | 💳 solo pagamenti |

---

## Problemi comuni

### Auth / Supabase

**La dashboard carica all'infinito**
→ Le variabili Supabase in `.env.local` sono errate o mancanti. Controlla e riavvia il server.
→ Guida: [Supabase Troubleshooting Next.js](https://supabase.com/docs/guides/troubleshooting/how-do-you-troubleshoot-nextjs---supabase-auth-issues-riMCZV)

**Errore "localStorage is not defined"**
→ Stai usando il client browser (`lib/supabase/client.ts`) in un Server Component. Usa sempre `lib/supabase/server.ts` lato server.

**Gli utenti vengono disconnessi casualmente**
→ Il proxy non sta rinfrescando i token. Assicurati che `proxy.ts` nella root chiami `updateSession`.

**Errore "No token hash or type" dopo Google OAuth**
→ Il `redirectTo` punta a `/auth/confirm` invece di `/auth/callback`. Assicurati di usare `/auth/callback` come redirect URL nel bottone Google.

---

### Google OAuth

**Errore "redirect_uri_mismatch"**
→ L'URI di reindirizzamento nell'app non corrisponde esattamente a quello registrato su Google Cloud.
→ Controlla che `http://localhost:3000/auth/callback` sia nella lista degli URI autorizzati su Google Cloud Console.
→ Guida: [Fix redirect_uri_mismatch](https://medium.com/@md.abir1203/how-to-configure-google-oauth-and-fix-the-redirect-uri-mismatch-error-complete-guide-a6a1aaadf4dd)

**Il pulsante Google non fa nulla**
→ Google OAuth non è abilitato su Supabase. Vai su **Authentication → Providers → Google** e attivalo.

---

### Email / Resend

**Le email finiscono nello spam**
→ Normale in sviluppo con `onboarding@resend.dev`. In produzione verifica il tuo dominio su Resend.
→ Guida: [Resend Domain Verification](https://resend.com/docs/dashboard/domains/introduction)
→ Guida SPF/DKIM/DMARC: [Email Authentication Guide](https://resend.com/blog/email-authentication-a-developers-guide)

**Non arriva nessuna email**
→ Controlla che `RESEND_API_KEY` sia corretta in `.env.local` e riavvia il server.
→ Controlla i log su [resend.com](https://resend.com) → **Emails** per vedere se ci sono errori.

---

### Lemon Squeezy

**Il webhook non riceve eventi in locale**
→ Devi usare ngrok per esporre il server locale: `npx ngrok http 3000`
→ Puoi testare senza ngrok simulando eventi dalla dashboard: [Simulate Webhook Events](https://docs.lemonsqueezy.com/help/webhooks/simulate-webhook-events)

**Il webhook riceve 401 Unauthorized**
→ Il `LEMON_SQUEEZY_WEBHOOK_SECRET` in `.env.local` non corrisponde a quello impostato su Lemon Squeezy.

**Il piano non si aggiorna dopo il pagamento**
→ Assicurati di passare `custom_data.user_id` nell'URL di checkout, altrimenti il webhook non sa quale utente aggiornare.
→ Docs: [Lemon Squeezy Webhooks](https://docs.lemonsqueezy.com/help/webhooks)

---

## File da modificare per personalizzare

```
lib/config.ts          ← INIZIA DA QUI: nome app, piani, prezzi, nav
app/page.tsx           ← Landing page
app/pricing/page.tsx   ← Pagina prezzi
app/terms/page.tsx     ← Termini di servizio (sostituisci i placeholder)
app/privacy/page.tsx   ← Privacy policy (sostituisci i placeholder)
content/blog/          ← Aggiungi i tuoi articoli .mdx
app/dashboard/page.tsx ← Costruisci le tue feature qui
```
