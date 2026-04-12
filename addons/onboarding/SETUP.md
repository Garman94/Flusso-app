# Add-on: Onboarding Flow

Wizard multi-step che appare automaticamente al primo accesso dopo il sign-up.
Raccoglie nome e caso d'uso, salva `onboarding_completed = true` nel profilo al completamento.

---

## File inclusi

```
addons/onboarding/files/
  app/onboarding/page.tsx              → app/onboarding/page.tsx
  supabase/migrations/003_onboarding.sql
```

---

## Passaggi

### 1. Esegui la migration SQL

Nel dashboard Supabase → **SQL Editor → New query**, incolla il contenuto di
`supabase/migrations/003_onboarding.sql` e clicca **Run**.

Aggiunge alla tabella `profiles`:
- `onboarding_completed` (boolean, default `false`)
- `use_case` (text, nullable)

### 2. Copia la pagina onboarding

Copia `files/app/onboarding/page.tsx` in `app/onboarding/page.tsx` del tuo progetto.

### 3. Aggiungi il redirect nel dashboard layout

In `app/dashboard/layout.tsx`, aggiungi questo controllo dentro `DashboardLayout`
(o dentro il componente `DashboardNav` se preferisci farlo lì):

```tsx
// In cima al file, aggiungi l'import:
import { redirect } from "next/navigation";

// Dentro DashboardLayout (o nel componente async che già legge il profilo):
const { data: profile } = await supabase
  .from("profiles")
  .select("onboarding_completed")
  .eq("id", userId)
  .single();

if (!profile?.onboarding_completed) {
  redirect("/onboarding");
}
```

> Se il tuo layout ha già una query al profilo, aggiungi solo `onboarding_completed`
> al select e il controllo redirect — senza duplicare la query.

### 4. (Opzionale) Proteggi /onboarding nel proxy

Se vuoi che `/onboarding` sia accessibile solo agli utenti loggati, aggiungi in
`lib/supabase/proxy.ts` dentro `updateSession`:

```ts
// Proteggi /onboarding esattamente come /dashboard
if (pathname.startsWith("/onboarding") && !user) {
  const url = request.nextUrl.clone();
  url.pathname = "/auth/login";
  return NextResponse.redirect(url);
}
```

---

## Come funziona

1. Utente si registra → profilo creato con `onboarding_completed = false`
2. Primo accesso a `/dashboard` → redirect a `/onboarding`
3. Wizard 3 step: nome → caso d'uso → conferma
4. Al completamento: salva dati + `onboarding_completed = true` → redirect `/dashboard`
5. Accessi successivi: `onboarding_completed = true` → nessun redirect

---

## Personalizzazione

| Cosa | Dove |
|---|---|
| Numero di step | Aggiungere/rimuovere blocchi JSX e aggiornare `TOTAL_STEPS` |
| Opzioni caso d'uso | Array `USE_CASES` in `page.tsx` |
| Campi salvati | Query `.update({...})` in `handleComplete` |
| Stile progress bar | Classe `bg-primary` nel div della barra |
| Redirect finale | `router.push("/dashboard")` in `handleComplete` |
