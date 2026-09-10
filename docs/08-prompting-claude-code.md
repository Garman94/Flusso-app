# 08 — Lavorare con Claude Code in autonomia

Questo file spiega come usare Claude Code in modo produttivo su Flusso, senza diventarne dipendente. L'obiettivo è che tu possa fare la maggior parte del lavoro in autonomia, usando Claude come acceleratore — non come sostituto della tua comprensione del codice.

---

## Prompt buoni vs prompt scarsi

La differenza tra un prompt buono e uno scarso non è la lunghezza: è la specificità. Claude ha bisogno di sapere esattamente cosa toccare e quali vincoli rispettare.

### Esempio 1 — Aggiungere una pagina

❌ **Scarso:**
> "Aggiungi una pagina di statistiche avanzate."

✅ **Buono:**
> "Crea `app/dashboard/stats/page.tsx` come server component. La pagina deve mostrare il totale delle uscite diviso per macro-categoria per il mese corrente. Segui lo stesso pattern di `app/dashboard/page.tsx`: fetch dei dati nel server component, passa come props a un client component `stats-client.tsx` nella stessa cartella. Usa `calculateMacroBreakdown()` da `lib/calculations.ts`. La pagina è solo per utenti Premium: aggiungi il check con `getEffectivePlan` e `isPremium` come in `app/dashboard/smart/page.tsx` righe 22-50. Dopo aver scritto il codice, esegui `npx tsc --noEmit` e `npm run lint` e riportami i risultati."

### Esempio 2 — Aggiungere un campo

❌ **Scarso:**
> "Aggiungi un campo 'note' alle spese ricorrenti."

✅ **Buono:**
> "La tabella `recurring_expenses` ha già un campo `notes text NULL` (migration 009). Voglio aggiungere un campo `priority int NOT NULL DEFAULT 0` per ordinare le spese ricorrenti. Crea la migration `supabase/migrations/018_recurring_priority.sql` con l'ALTER TABLE. Poi aggiorna il form in `app/dashboard/smart/recurring-client.tsx` aggiungendo un input numerico opzionale per priority. Esegui `npx tsc --noEmit` alla fine e riportami eventuali errori."

### Esempio 3 — Correggere un bug

❌ **Scarso:**
> "Il contatore degli upload Excel non funziona."

✅ **Buono:**
> "In `app/dashboard/transazioni/import-excel-modal.tsx` il contatore degli upload mensili non si azzera al cambio di mese. La tabella che tiene il log è `excel_upload_log` (migration 013). La verifica del limite avviene [VERIFICARE: dove esattamente]. Controlla la query che conta gli upload del mese corrente: deve filtrare per `date_trunc('month', created_at) = date_trunc('month', now())`. Mostrami il codice attuale e dimmi se la query è corretta."

---

## Quando dare contesto e quando no

**Dai contesto se:**
- Il task tocca un pattern già esistente (es. "aggiungi una pagina come dashboard/smart/page.tsx").
- Il task richiede coerenza con lo stile UI esistente (es. "usa lo stesso stile di card di dashboard-client.tsx").
- Il task ha vincoli di sicurezza (es. "gating premium come screenshot-action.ts").

**Non serve contesto se:**
- Stai chiedendo di spiegare un file specifico che puoi citare.
- Il task è autocontenuto (es. "scrivi una funzione pura che converte una stringa in formato YYYY-MM-DD").

---

## Sempre chiedere verifiche

Termina ogni prompt con questa frase:

> "Dopo aver scritto il codice, esegui `npx tsc --noEmit`, `npm run lint` e `npm run build` e riportami i risultati."

Senza questa abitudine, Claude produce codice che sembra corretto ma ha errori di tipo o lint che emergono solo in fase di build. Questa singola abitudine evita il 90% delle regressioni introdotte da AI.

---

## Code review del codice generato

Prima di accettare qualsiasi codice generato da Claude, passa questa checklist mentale:

1. **Il gating premium c'è lato server?** Se il codice tocca una feature premium, controlla che ci sia `isPremium(plan)` in una Server Action o in un server component — non solo nel client.
2. **Le chiavi Supabase sono corrette?** Le operazioni che modificano i dati di altri utenti devono usare `createClient` con service role (non il client normale). Le operazioni per conto dell'utente loggato usano il client normale.
3. **Nessun segreto hardcodato?** Controlla che API key, token e URL sensibili vengano da `process.env.*` e mai da stringhe hardcodate.
4. **`useState` e hook solo in client component?** Se Claude aggiunge `useState` o `useEffect` in un file senza `"use client"`, il build fallirà. Verifica che il file inizi con `"use client"`.
5. **UI coerente?** Controlla che i componenti (button, badge, card) siano importati da `@/components/ui/` e non reinventati da zero.
6. **`revalidatePath` dopo le mutation?** Le Server Action che modificano dati devono chiamare `revalidatePath("/dashboard")` (e le pagine specifiche interessate) per aggiornare la cache di Next.js.

---

## Quando NON usare Claude Code

**Per task da 3 righe:** è più veloce farli a mano. Aggiungere un campo a un form, cambiare un testo, aggiustare un colore — aprire Claude Code, aspettare la risposta e verificarla richiede più tempo di quanto ne risparmia.

**Per task di sicurezza critici:** RLS, webhook, gating premium. Usa Claude per fare una prima bozza, ma leggi il diff riga per riga prima di committare. Non accettare mai "sembra corretto" per il codice che controlla i pagamenti o i permessi.

**Per refactor su molti file:** se devi rinominare un tipo usato in 15 file, fallo in più giri piccoli (5 file per volta). Un refactor da 30 file in un colpo solo è difficile da revisionare e facile da sbagliare.

---

## Gestire i prompt lunghi

Se stai lavorando su un task complesso che richiede più iterazioni, tieni i prompt in un file nella cartella `prompts/` (versionata nel repo). Esempio: `prompts/feature-stats-page.md`.

Il vantaggio: la prossima volta che devi riprendere lo stesso task (o uno simile), parti dal prompt precedente e modificalo invece di riscriverlo da zero.

---

## Quando la conversazione si è "sporcata"

Se hai una conversazione Claude Code con 30+ file letti e Claude inizia a fare errori (suggerisce file sbagliati, dimentica i vincoli, ripete errori già corretti), **chiudi la conversazione e riapri**. Il contesto accumulato può degradare la qualità delle risposte.

Per la nuova conversazione, scrivi un prompt sintetico che include:
- La feature su cui stai lavorando
- I file principali coinvolti (citali esplicitamente)
- I vincoli chiave (es. "gating premium", "migration da creare")
- Lo stato attuale ("ho già fatto X, manca Y")

Un contesto pulito e sintetico vale più di una conversazione lunga con tantissimo contesto accumulato.

---

## Template di prompt per task comuni

Copia e adatta questi template invece di partire da zero.

**Nuova pagina dashboard:**
> "Crea `app/dashboard/[nome]/page.tsx` come server component seguendo il pattern di `app/dashboard/smart/page.tsx`. Deve [cosa mostrare]. [Se premium:] Aggiungi il gating premium come in smart/page.tsx righe 22-50. Il client component va in `app/dashboard/[nome]/[nome]-client.tsx`. Dopo aver scritto il codice, esegui `npx tsc --noEmit` e `npm run lint`."

**Nuova migration:**
> "Crea la migration `supabase/migrations/0XX_[nome].sql` che aggiunge [cosa] alla tabella [quale]. Usa `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. Dopo la migration, aggiorna il type TypeScript in [file] aggiungendo il campo [nome: tipo]."

**Nuova server action:**
> "Crea una server action in `app/dashboard/[cartella]/actions.ts`. La funzione si chiama `[nomeAzione]`, riceve [parametri], verifica l'autenticazione con `supabase.auth.getClaims()`, [se premium: verifica il piano], poi [cosa fa]. Chiama `revalidatePath` per aggiornare [pagine]. Segui il pattern di `app/dashboard/transazioni/actions.ts`."

---

*Vedi anche: [04-modifiche-comuni.md](04-modifiche-comuni.md) per i task concreti, [02-architecture.md](02-architecture.md) per i pattern architetturali da rispettare.*
