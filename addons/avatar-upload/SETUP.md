# Add-on: Avatar Upload

Aggiunge l'upload dell'avatar utente al profilo, con anteprima, sostituzione e rimozione. Usa Supabase Storage.

---

## File inclusi

| File | Destinazione nel tuo progetto |
|---|---|
| `components/avatar-upload.tsx` | `components/avatar-upload.tsx` |
| `supabase/migrations/002_avatar.sql` | `supabase/migrations/002_avatar.sql` |

---

## Passaggi

### 1. Esegui la migration SQL

Nel dashboard Supabase → **SQL Editor → New query**, incolla il contenuto di `supabase/migrations/002_avatar.sql` e clicca **Run**.

Questo:
- Aggiunge la colonna `avatar_url` alla tabella `profiles`
- Crea il bucket `avatars` (pubblico)
- Aggiunge le policy RLS per Storage (ogni utente gestisce solo il proprio avatar)

### 2. Copia il componente

Copia `components/avatar-upload.tsx` nella cartella `components/` del tuo progetto.

### 3. Aggiungi alla pagina account

In `app/dashboard/account/page.tsx`, importa e usa il componente:

```tsx
import { AvatarUpload } from "@/components/avatar-upload";

// Dentro AccountContent, dopo aver letto il profilo:
<AvatarUpload
  userId={data.claims.sub}
  currentAvatarUrl={profile?.avatar_url ?? null}
  fullName={profile?.full_name ?? null}
/>
```

### 4. (Opzionale) Aggiorna il tipo Profile in useAuth.ts

```ts
type Profile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;  // ← aggiungi questa riga
  plan: string;
  created_at: string;
  updated_at: string;
};
```

---

## Funzionalità

- Clicca sull'avatar (o sulle iniziali) per aprire il file picker
- Formati supportati: JPG, PNG, WebP, GIF
- Limite: 2MB
- Upload con feedback (toast loading → success/error)
- Sostituzione automatica (upsert)
- Pulsante "Rimuovi" per eliminare l'avatar
- Fallback con iniziali del nome se non c'è foto

---

## Personalizzazione

| Cosa | Dove |
|---|---|
| Limite dimensione file | `MAX_SIZE_MB` in `avatar-upload.tsx` |
| Formati accettati | `ALLOWED_TYPES` in `avatar-upload.tsx` |
| Dimensione avatar UI | `w-20 h-20` nel componente |
| Nome del bucket Storage | `'avatars'` nell'upload e nel migration |
