# Add-on: Waitlist

Form di iscrizione alla lista d'attesa pre-lancio. Salva le email su Supabase e invia una conferma automatica via Resend.

---

## File inclusi

```
addons/waitlist/files/
  components/waitlist-form.tsx         → components/waitlist-form.tsx
  app/api/waitlist/route.ts            → app/api/waitlist/route.ts
  supabase/migrations/004_waitlist.sql
```

---

## Passaggi

### 1. Esegui la migration SQL

Supabase → **SQL Editor → New query** → incolla `004_waitlist.sql` → **Run**.

Crea la tabella `waitlist` (`id`, `email`, `name`, `created_at`) con RLS abilitata.
L'accesso è gestito esclusivamente dall'API route con la service role key.

### 2. Copia i file

```
components/waitlist-form.tsx  →  components/waitlist-form.tsx
app/api/waitlist/route.ts     →  app/api/waitlist/route.ts
```

### 3. Usa il componente nella tua landing page

```tsx
import { WaitlistForm } from "@/components/waitlist-form";

// In app/page.tsx o in qualsiasi altra pagina:
<section className="flex flex-col items-center gap-4 py-20">
  <h2 className="text-3xl font-bold">Entra in lista d'attesa</h2>
  <p className="text-muted-foreground">Sii tra i primi ad accedere.</p>
  <WaitlistForm />
</section>
```

### 4. Variabili d'ambiente

Nessuna variabile aggiuntiva — usa quelle già presenti:
- `NEXT_PUBLIC_SUPABASE_URL` ✅
- `SUPABASE_SERVICE_ROLE_KEY` ✅
- `RESEND_API_KEY` ✅
- `RESEND_FROM_EMAIL` ✅

---

## Come funziona

1. Utente inserisce email (e nome opzionale) → submit
2. API salva su Supabase (se email duplicata, risponde success silenzioso)
3. Resend invia email di conferma all'utente
4. Form mostra stato "Sei in lista!" 🎉

---

## Vedere le iscrizioni

Supabase dashboard → **Table Editor → waitlist** → vedi tutte le email iscritte.

Oppure via SQL:
```sql
select * from waitlist order by created_at desc;
```

---

## Personalizzazione

| Cosa | Dove |
|---|---|
| Testo del pulsante | `WaitlistForm` → testo nel `<button>` |
| Email di conferma | `app/api/waitlist/route.ts` → template HTML |
| Campi aggiuntivi | Aggiungi colonne alla migration + al form + all'API |
| Campo nome obbligatorio | Aggiungi `required` all'input `name` nel form |
