# garman-boilerplate

> Leer en otro idioma: [🇬🇧 English](../README.md) · [🇮🇹 Italiano](README.it.md)

Un boilerplate SaaS listo para producción con Next.js + Supabase: autenticación, perfiles de usuario, gestión de planes, pagos con Lemon Squeezy, emails transaccionales, blog MDX y panel de administración.

---

## 👉 [GUÍA DE CONFIGURACIÓN — Empieza aquí](../SETUP.md)

Instrucciones paso a paso para pasar de cero a funcionando en ~30 minutos. Incluye solución de los errores más comunes.

---

## Qué incluye

| Funcionalidad | Detalles |
|---|---|
| Auth | Email/contraseña, Google OAuth, recuperar contraseña, confirmación de email |
| Perfiles | Creados automáticamente al registrarse con `full_name` y `plan` |
| Planes | `free`, `premium`, `founder` con acceso protegido por RLS |
| Middleware | Protege `/dashboard/*`, redirige usuarios autenticados desde `/login` |
| Pagos | Webhook de Lemon Squeezy — actualiza el plan automáticamente |
| Email | Resend — email de bienvenida, restablecimiento de contraseña |
| Blog | Blog MDX con metadatos SEO, OG tags, sitemap |
| Panel admin | `/dashboard/admin` — gestiona usuarios y planes |
| SEO | Sitemap, robots.txt, OG metadata en todas las páginas |
| UI | shadcn/ui, Tailwind CSS, modo oscuro, toasts con Sonner |
| Legal | Páginas placeholder `/terms` y `/privacy` |

---

## Inicio rápido

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000)

---

## Variables de entorno

Rellena `.env.local`:

```env
# Supabase — https://supabase.com/dashboard/project/_/settings/api
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Service role — solo servidor, NUNCA exponer al cliente
SUPABASE_SERVICE_ROLE_KEY=

# URL del sitio
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# Lemon Squeezy — https://app.lemonsqueezy.com
LEMON_SQUEEZY_WEBHOOK_SECRET=
NEXT_PUBLIC_LEMON_SQUEEZY_PRODUCT_URL=

# Resend — https://resend.com
RESEND_API_KEY=
RESEND_FROM_EMAIL=noreply@tudominio.com

# Secret interno para webhooks (cadena aleatoria segura)
SUPABASE_WEBHOOK_SECRET=

# Admin — emails separados por coma con acceso de administrador
ADMIN_EMAILS=tu@ejemplo.com
```

---

## Configurar Supabase

1. Crea un proyecto en [database.new](https://database.new)
2. Copia la **Project URL** y la **Publishable (anon) key** en `.env.local`
3. Copia la **Service Role key** en `.env.local` — mantenla secreta
4. Ejecuta la migración SQL (ver abajo)

## Ejecutar la migración SQL

**Opción A — SQL Editor de Supabase (recomendada)**

1. Dashboard → **SQL Editor** → **New query**
2. Pega el contenido de [`supabase/migrations/001_profiles.sql`](../supabase/migrations/001_profiles.sql)
3. Haz clic en **Run**

**Opción B — Supabase CLI**

```bash
supabase login
supabase link --project-ref <tu-project-ref>
supabase db push
```

La migración crea:
- Tabla `profiles` (`id`, `full_name`, `plan`, `created_at`, `updated_at`)
- Check constraint: `plan` debe ser `free`, `premium` o `founder`
- RLS: los usuarios solo pueden leer/actualizar su propia fila
- Trigger: crea automáticamente un perfil al registrarse

---

## Configurar Google OAuth

1. Ve a [console.cloud.google.com](https://console.cloud.google.com) → **APIs y servicios** → **Credenciales**
2. Crea un **ID de cliente OAuth 2.0** (Aplicación web)
3. Orígenes de JavaScript autorizados: `http://localhost:3000`
4. URIs de redireccionamiento autorizados: `https://<tu-project-ref>.supabase.co/auth/v1/callback`
5. Copia el **Client ID** y el **Client Secret**
6. Supabase dashboard → **Authentication** → **Providers** → **Google** → pega y guarda

> Al desplegar en producción: añade tu dominio de producción a los orígenes autorizados en Google Cloud Console.

---

## Configurar Lemon Squeezy

1. Crea un producto/suscripción en [Lemon Squeezy](https://app.lemonsqueezy.com)
2. Copia la URL de checkout en `NEXT_PUBLIC_LEMON_SQUEEZY_PRODUCT_URL`
3. **Settings → Webhooks** → añade webhook:
   - URL: `https://tudominio.com/api/webhook/lemon-squeezy`
   - Events: `order_created`, `subscription_created`, `subscription_cancelled`
   - Copia el signing secret en `LEMON_SQUEEZY_WEBHOOK_SECRET`
4. Pasa el UUID de Supabase del usuario como `custom_data.user_id` en la URL de checkout:

```ts
const url = new URL(process.env.NEXT_PUBLIC_LEMON_SQUEEZY_PRODUCT_URL!);
url.searchParams.set("checkout[custom][user_id]", user.id);
window.location.href = url.toString();
```

---

## Configurar Resend (emails transaccionales)

1. Crea una cuenta en [resend.com](https://resend.com)
2. Añade y verifica tu dominio
3. Crea una API key → cópiala en `RESEND_API_KEY`
4. Establece `RESEND_FROM_EMAIL` con una dirección de remitente verificada
5. El email de bienvenida se envía via `POST /api/auth/welcome` — llámalo tras el registro o actívalo mediante un webhook de Supabase

---

## Panel de administración

Accede a `/dashboard/admin` — visible solo para los usuarios en `ADMIN_EMAILS`.

Desde el panel de administración puedes:
- Ver todos los usuarios registrados
- Cambiar el plan de cualquier usuario directamente desde la tabla

**Mediante código:**

```ts
import { updateUserPlan } from "@/lib/admin";
await updateUserPlan("uuid-del-usuario", "founder");
```

---

## Blog

Añade archivos MDX en `content/blog/`:

```mdx
---
title: Título de tu artículo
description: Breve descripción
date: 2026-04-11
author: Tu nombre
tags: [tag1, tag2]
---

Tu contenido en **Markdown**.
```

Los artículos aparecen automáticamente en `/blog`.

---

## Branding

Todo el branding está en un único archivo: [`lib/config.ts`](../lib/config.ts)

Cambia `name`, `tagline`, `description`, las características de los planes, los precios, los enlaces de navegación — todo se actualiza en toda la app.

---

## Estructura del proyecto

```
app/
  page.tsx                        # Landing page
  pricing/                        # Página de precios
  blog/                           # Lista de artículos + página [slug]
  terms/ privacy/                 # Páginas legales
  dashboard/
    page.tsx                      # Dashboard del usuario
    account/                      # Configuración de cuenta
    admin/                        # Panel admin (solo ADMIN_EMAILS)
  auth/                           # Login, registro, recuperar contraseña, confirm
  api/
    webhook/lemon-squeezy/        # Webhook de pagos
    admin/update-plan/            # API cambio de plan admin
    auth/welcome/                 # Trigger email de bienvenida
components/
  navbar.tsx                      # Navbar pública
  oauth-buttons.tsx               # Botón Google OAuth
  pricing-card.tsx                # Card de plan reutilizable
  login-form.tsx / sign-up-form.tsx / ...
content/
  blog/                           # Artículos MDX
hooks/
  useAuth.ts                      # Hook client-side auth + perfil
lib/
  config.ts                       # Branding y config de planes
  plans.ts                        # isPremium, isFounder, getPlanLabel
  admin.ts                        # updateUserPlan (service role)
  email.ts                        # Templates de email con Resend
  blog.ts                         # Utilidades blog MDX
  supabase/
    client.ts / server.ts / proxy.ts
supabase/
  migrations/
    001_profiles.sql
```
