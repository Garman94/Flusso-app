# garman-boilerplate

> Read this in another language: [🇮🇹 Italiano](docs/README.it.md) · [🇪🇸 Español](docs/README.es.md)

A production-ready Next.js + Supabase SaaS boilerplate with authentication, user profiles, plan management, Lemon Squeezy billing, transactional email, MDX blog, and admin panel.

---

## 👉 [SETUP GUIDE — Start here](SETUP.md)

Step-by-step instructions to go from zero to running in ~30 minutes. Includes troubleshooting for the most common errors.

---

---

## What's included

| Feature | Details |
|---|---|
| Auth | Email/password, Google OAuth, forgot password, email confirmation |
| Profiles | Auto-created on sign-up with `full_name` and `plan` fields |
| Plans | `free`, `premium`, `founder` with RLS-enforced access |
| Middleware | Protects `/dashboard/*`, redirects authenticated users from `/login` |
| Billing | Lemon Squeezy webhook — upgrades/downgrades plan automatically |
| Email | Resend transactional email — welcome email, password reset |
| Blog | MDX blog with SEO metadata, OG tags, sitemap |
| Admin panel | `/dashboard/admin` — manage all users and plans |
| SEO | Sitemap, robots.txt, OG metadata on all pages |
| UI | shadcn/ui, Tailwind CSS, dark mode, Sonner toasts |
| Legal | `/terms` and `/privacy` placeholder pages |

---

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Environment variables

Fill in `.env.local`:

```env
# Supabase — https://supabase.com/dashboard/project/_/settings/api
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Service role — server-side only, NEVER expose to client
SUPABASE_SERVICE_ROLE_KEY=

# Site URL
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# Lemon Squeezy — https://app.lemonsqueezy.com
LEMON_SQUEEZY_WEBHOOK_SECRET=
NEXT_PUBLIC_LEMON_SQUEEZY_PRODUCT_URL=

# Resend — https://resend.com
RESEND_API_KEY=
RESEND_FROM_EMAIL=noreply@yourdomain.com

# Internal webhook secret (random secure string)
SUPABASE_WEBHOOK_SECRET=

# Admin — comma-separated emails with admin access
ADMIN_EMAILS=you@example.com
```

---

## Setting up Supabase

1. Create a project at [database.new](https://database.new)
2. Copy **Project URL** and **Publishable (anon) key** into `.env.local`
3. Copy **Service Role key** into `.env.local` — keep it secret
4. Run the SQL migration (see below)

## Running the SQL migration

**Option A — Supabase SQL Editor (recommended)**

1. Dashboard → **SQL Editor** → **New query**
2. Paste [`supabase/migrations/001_profiles.sql`](supabase/migrations/001_profiles.sql)
3. Click **Run**

**Option B — Supabase CLI**

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

The migration creates:
- `profiles` table (`id`, `full_name`, `plan`, `created_at`, `updated_at`)
- Check constraint: `plan` must be `free`, `premium`, or `founder`
- RLS: users can only read/update their own row
- Trigger: auto-creates a profile row on sign-up

---

## Configuring Google OAuth

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → **APIs & Services** → **Credentials**
2. Create an **OAuth 2.0 Client ID** (Web application)
3. Authorized JavaScript origins: `http://localhost:3000`
4. Authorized redirect URIs: `https://<your-project-ref>.supabase.co/auth/v1/callback`
5. Copy **Client ID** and **Client Secret**
6. Supabase dashboard → **Authentication** → **Providers** → **Google** → paste and save

> When deploying to production: add your production domain to the authorized origins on Google Cloud Console.

---

## Configuring Lemon Squeezy

1. Create a product/subscription in [Lemon Squeezy](https://app.lemonsqueezy.com)
2. Copy the checkout URL to `NEXT_PUBLIC_LEMON_SQUEEZY_PRODUCT_URL`
3. **Settings → Webhooks** → add webhook:
   - URL: `https://your-domain.com/api/webhook/lemon-squeezy`
   - Events: `order_created`, `subscription_created`, `subscription_cancelled`
   - Copy the signing secret to `LEMON_SQUEEZY_WEBHOOK_SECRET`
4. Pass the user's Supabase UUID as `custom_data.user_id` in the checkout URL:

```ts
const url = new URL(process.env.NEXT_PUBLIC_LEMON_SQUEEZY_PRODUCT_URL!);
url.searchParams.set("checkout[custom][user_id]", user.id);
window.location.href = url.toString();
```

---

## Configuring Resend (transactional email)

1. Create an account at [resend.com](https://resend.com)
2. Add and verify your domain
3. Create an API key → copy to `RESEND_API_KEY`
4. Set `RESEND_FROM_EMAIL` to a verified sender address
5. The welcome email is sent via `POST /api/auth/welcome` — call it after sign-up or trigger it via Supabase webhook

---

## Admin panel

Access `/dashboard/admin` — visible only to users listed in `ADMIN_EMAILS`.

From the admin panel you can:
- View all registered users
- Change any user's plan directly from the table

**Via code:**

```ts
import { updateUserPlan } from "@/lib/admin";
await updateUserPlan("user-uuid-here", "founder");
```

---

## Blog

Add MDX files to `content/blog/`:

```mdx
---
title: Your post title
description: A short description
date: 2026-04-11
author: Your name
tags: [tag1, tag2]
---

Your content in **Markdown**.
```

Posts appear automatically at `/blog`.

---

## Branding

All branding is in one file: [`lib/config.ts`](lib/config.ts)

Change `name`, `tagline`, `description`, plan features, prices, nav links — everything updates across the entire app.

---

## Project structure

```
app/
  page.tsx                        # Landing page
  pricing/                        # Pricing page
  blog/                           # Blog list + [slug] post pages
  terms/ privacy/                 # Legal pages
  dashboard/
    page.tsx                      # User dashboard
    account/                      # Account settings
    admin/                        # Admin panel (ADMIN_EMAILS only)
  auth/                           # Login, sign-up, forgot-password, confirm
  api/
    webhook/lemon-squeezy/        # Billing webhook
    admin/update-plan/            # Admin plan update API
    auth/welcome/                 # Welcome email trigger
components/
  navbar.tsx                      # Public navbar
  oauth-buttons.tsx               # Google OAuth button
  pricing-card.tsx                # Reusable pricing card
  login-form.tsx / sign-up-form.tsx / ...
content/
  blog/                           # MDX blog posts
hooks/
  useAuth.ts                      # Client-side auth + profile hook
lib/
  config.ts                       # Site-wide branding & plan config
  plans.ts                        # isPremium, isFounder, getPlanLabel
  admin.ts                        # updateUserPlan (service role)
  email.ts                        # Resend email templates
  blog.ts                         # MDX blog utilities
  supabase/
    client.ts / server.ts / proxy.ts
supabase/
  migrations/
    001_profiles.sql
```
