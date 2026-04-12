# Add-on: Notifiche in-app

Dropdown con campanella nell'header della dashboard. Mostra notifiche per utente con badge contatore non letti, mark-as-read automatico all'apertura.

---

## File inclusi

```
addons/notifications/files/
  components/notifications-dropdown.tsx  → components/notifications-dropdown.tsx
  app/api/notifications/route.ts         → app/api/notifications/route.ts
  app/api/notifications/send/route.ts    → app/api/notifications/send/route.ts
  supabase/migrations/006_notifications.sql
```

---

## Passaggi

### 1. Esegui la migration SQL

Supabase → **SQL Editor → New query** → incolla `006_notifications.sql` → **Run**.

Crea la tabella `notifications` (`id`, `user_id`, `title`, `body`, `read`, `created_at`) con RLS per utente.

### 2. Copia i file

```
components/notifications-dropdown.tsx      →  components/notifications-dropdown.tsx
app/api/notifications/route.ts             →  app/api/notifications/route.ts
app/api/notifications/send/route.ts        →  app/api/notifications/send/route.ts
```

### 3. Aggiungi il dropdown al dashboard layout

In `app/dashboard/layout.tsx`, importa e aggiungi il componente nell'header:

```tsx
import { NotificationsDropdown } from "@/components/notifications-dropdown";

// Dentro il layout, nell'header della dashboard:
<header className="flex items-center justify-between ...">
  <nav>...</nav>
  <div className="flex items-center gap-2">
    <NotificationsDropdown />
    {/* altri elementi header */}
  </div>
</header>
```

### 4. Variabili d'ambiente

Usa quelle già presenti:
- `NEXT_PUBLIC_SUPABASE_URL` ✅
- `SUPABASE_SERVICE_ROLE_KEY` ✅ (per l'API `/send`)
- `SUPABASE_WEBHOOK_SECRET` ✅ (per autenticare le chiamate a `/send`)

---

## Come inviare notifiche

### Via API route (da altri webhook o API interne)

```bash
curl -X POST https://tuodominio.com/api/notifications/send \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: IL_TUO_SUPABASE_WEBHOOK_SECRET" \
  -d '{"user_id": "uuid-utente", "title": "Titolo", "body": "Testo opzionale"}'
```

### Via codice server-side (in qualsiasi Server Action o route)

```ts
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

await supabase.from("notifications").insert({
  user_id: "uuid-utente",
  title: "Pagamento ricevuto",
  body: "Il tuo piano è stato aggiornato a Premium.",
});
```

---

## Come funziona

1. Componente monta → `GET /api/notifications` → carica le ultime 20 notifiche
2. Badge rosso mostra il numero di non lette
3. Click sulla campanella → dropdown aperto + `PATCH /api/notifications` → segna tutte come lette
4. Le notifiche non lette hanno sfondo colorato + pallino blu

---

## Personalizzazione

| Cosa | Dove |
|---|---|
| Numero massimo notifiche | `.limit(20)` in `app/api/notifications/route.ts` |
| Polling automatico | Aggiungi `setInterval(fetchNotifications, 30000)` nell'`useEffect` |
| Real-time con Supabase | Usa `supabase.channel().on('postgres_changes', ...)` nel componente |
| Stile dropdown | Classi Tailwind in `notifications-dropdown.tsx` |
| Formato data | Funzione `timeAgo` in `notifications-dropdown.tsx` |
