# 07 — Quando qualcosa va storto

---

## "Il build fallisce con errore TypeScript"

**Sintomo:** `npm run build` termina con `Type error: ...` o `npx tsc --noEmit` mostra errori.

**Cosa fare:**
1. Leggi l'errore: indica file e riga. Di solito è un campo aggiunto a una tabella Supabase senza aggiornare i tipi TypeScript nel codice.
2. Cerca il tipo incriminato nel codice (es. `grep -r "RecurringExpense" app/`).
3. Aggiorna il type con il nuovo campo.
4. Se il progetto usa tipi generati automaticamente da Supabase (`types/supabase.ts`), rigenera con `npx supabase gen types typescript --project-id <id> > types/supabase.ts` e aggiusta i componenti che usano i tipi modificati.

---

## "Il build fallisce con errore di font o import"

**Sintomo:** errore tipo `Module not found: Can't resolve 'next/font/google'` o simile.

**Cosa fare:**
1. Controlla `app/layout.tsx`: la fonte Geist (o altra) deve essere importata con `import { Geist } from 'next/font/google'` — sintassi esatta.
2. Se stai deployando su Vercel e il build locale passa ma Vercel fallisce, controlla che non ci siano pacchetti in `devDependencies` che usi in produzione.
3. Cancella `.next/` e `node_modules/.cache/` e riprova: `rm -rf .next && npm run build`.

---

## "Un utente dice di aver pagato ma non vede il premium"

**Checklist:**

1. **Il webhook è arrivato?** Vai su Lemon Squeezy > Settings > Webhooks > [il tuo webhook] > Recent deliveries. Cerca la richiesta corrispondente alla data del pagamento.
2. **La firma era valida?** Se il webhook risulta "failed" con status 401, il `LEMON_SQUEEZY_WEBHOOK_SECRET` su Vercel non corrisponde a quello su Lemon Squeezy. Aggiornali in modo che corrispondano e chiedi a Lemon Squeezy di re-inviare il webhook.
3. **C'era `user_id` nei custom_data?** Il webhook richiede che il checkout sia stato creato con `custom_data.user_id` = UUID dell'utente. Se manca, il webhook arriva ma non sa chi promuovere (logga un warning ma non fa nulla).
4. **La tabella profiles è aggiornata?** Vai su Supabase > Table editor > profiles, cerca l'utente e guarda il campo `plan`. Se è ancora `'free'`, il webhook non ha aggiornato il record.
5. **Soluzione rapida:** se hai verificato che il pagamento è legittimo, aggiorna manualmente il piano tramite il pannello admin (`/dashboard/admin`) oppure con il SQL editor usando il pattern di [04-modifiche-comuni.md](04-modifiche-comuni.md) sezione 7.

---

## "L'import da screenshot restituisce errore di JSON parse"

**Sintomo:** l'utente carica uno screenshot e vede "Impossibile estrarre le transazioni: ..."

**Cosa fare:**
1. Controlla i log di Vercel per la chiamata alla server action. Cerca il raw della risposta di Claude.
2. Il modello usato è `claude-haiku-4-5-20251001` ([app/dashboard/transazioni/screenshot-action.ts](../app/dashboard/transazioni/screenshot-action.ts) riga 37). Se questo model ID non esiste più, la chiamata API fallisce. Controlla sul sito Anthropic quale è il modello Haiku attuale e aggiorna la stringa nel codice.
3. Se il raw di risposta è un JSON con errore Anthropic (es. `{"error": "overloaded_error"}`), è un problema temporaneo dei server Anthropic. Riprova tra qualche minuto.
4. Se Claude restituisce il JSON corretto ma con markdown attorno (es. ` ```json [...] ``` `), il codice già gestisce questa pulizia (righe 69-70 di screenshot-action.ts). Se il formato è diverso, aggiorna la pulizia regex.

---

## "Build OK, ma in produzione ottengo errore 500"

**Sintomo:** il build passa, ma l'app in produzione mostra errori 500 o pagine bianche.

**Checklist:**
1. **Variabili d'ambiente:** vai su Vercel > Project > Settings > Environment Variables. Verifica che tutte le variabili siano presenti e corrette. Un `SUPABASE_SERVICE_ROLE_KEY` sbagliato causa 500 sul webhook e sulle route admin.
2. **Dominio redirect OAuth:** se usi Google Login, il dominio di produzione deve essere nella lista "Redirect URLs" su Supabase > Authentication > URL Configuration.
3. **Migration non applicate:** se hai aggiunto colonne nel codice ma non le hai applicate in Supabase di produzione, le query falliscono. Applica la migration mancante.

---

## "Vedo solo i miei dati" / "Vedo i dati di altri utenti"

**Solo i tuoi dati (comportamento corretto):** se un utente si lamenta di non vedere certi dati, probabilmente la query ha un filtro troppo stretto o la RLS sta bloccando qualcosa di legittimo.

**Dati di altri utenti (grave):** significa che una RLS è troppo permissiva o mancante.

**Cosa fare:**
1. Vai su Supabase > Authentication > Policies. Controlla che ogni tabella abbia RLS abilitata e le policy corrette.
2. Testa in Supabase Studio: esegui una query come farebbe un utente autenticato usando `set local role authenticated; set local "request.jwt.claims" to '{"sub": "<UUID_UTENTE>"}';` e verifica cosa restituisce `select * from transactions`.
3. Se una tabella non ha policy, chiunque può leggere tutto. Aggiungi la policy mancante con una migration.

---

## "Ho ricevuto un alert di sicurezza da Supabase"

Supabase invia alert per: accessi anomali, tentativi di login falliti ripetuti, query insolite.

**Cosa controllare:**
1. Supabase > Authentication > Users: cerca utenti creati di recente con email sospette.
2. Supabase > Logs > API logs: cerca chiamate a endpoint insoliti con errori 401/403 ripetuti.
3. Se hai subito un accesso non autorizzato al service role key: ruota immediatamente la chiave su Supabase > Settings > API, aggiorna la variabile su Vercel, e fai un nuovo deploy.

---

## "La sezione Smart non si carica per un utente premium"

**Sintomo:** utente con piano premium vede il blocco "Funzione Solo Premium" oppure la pagina non si carica.

**Checklist:**
1. Verifica che `profiles.plan` sia effettivamente `'premium'` o `'founder'` per quell'utente in Supabase.
2. Controlla se c'è un cookie `preview_plan` impostato dall'admin (solo admin possono averlo). Se sì, cancella il cookie.
3. Se l'utente è in una sessione vecchia: chiedi di fare logout e login di nuovo. Il JWT scade e si rinnova, ma in casi rari il piano nel JWT può essere stale.

---

*Vedi anche: [05-deploy-env.md](05-deploy-env.md) per le variabili d'ambiente, [06-sicurezza.md](06-sicurezza.md) per i problemi di sicurezza.*
