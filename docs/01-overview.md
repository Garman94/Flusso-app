# 01 — Cos'è Flusso

## L'app in sintesi

Flusso è una web app di finanza personale. Un utente registra le proprie entrate e uscite — a mano, caricando un foglio Excel dalla banca, o fotografando l'estratto conto — e l'app gli mostra in un colpo solo quanto ha speso, dove, e quanto rimane al mese. Non è un conto corrente: non sposta soldi, legge solo i dati che l'utente inserisce.

Il valore principale è avere tutto in un posto con il minimo sforzo. Importare un estratto Excel richiede 30 secondi; importare da screenshot (con AI) ne richiede 10.

La sezione **Smart** va oltre il semplice registro: mostra previsioni di budget, monitora le spese ricorrenti (affitto, bollette, abbonamenti) confrontandole con la spesa reale, gestisce obiettivi di risparmio e il meccanismo degli **accantonamenti** (mettere da parte ogni mese una quota per spese future prevedibili).

L'app è progettata per utenti italiani: valuta EUR, date in formato italiano, interfaccia in italiano.

---

## I piani

I dettagli di ogni piano sono definiti in [lib/config.ts](../lib/config.ts) nell'oggetto `siteConfig.plans`.

### Gratuito (Free)
- Transazioni manuali illimitate
- Upload Excel: massimo 3 al mese (il contatore è nella tabella `excel_upload_log`)
- Dashboard con saldo e trend
- Categorie e regole di categorizzazione personalizzate
- **Non include**: import da screenshot AI, sezione Smart (Previsioni, Ricorrenti, Obiettivi)

### Premium — €4,99/mese o €39/anno
- Tutto del piano Gratuito
- Upload Excel illimitati
- Import da screenshot con AI (Claude Haiku analizza l'immagine ed estrae le transazioni)
- Sezione Smart completa: Previsioni, Ricorrenti, Obiettivi, Accantonamenti
- Garanzia soddisfatti o rimborsati 30 giorni

### Founder — €49 una tantum (accesso a vita)
- Tutto di Premium
- Pagamento una sola volta, accesso permanente
- Accesso anticipato alle nuove funzionalità
- Supporto prioritario diretto
- Voto sulle nuove funzionalità

💡 Il piano Founder viene assegnato manualmente dal founder tramite il pannello admin (`/dashboard/admin`) oppure via coupon code. Non è acquistabile direttamente sul sito come abbonamento separato da Lemon Squeezy.

---

## Numeri chiave

| Voce | Valore |
|------|--------|
| URL produzione | [VERIFICARE: URL Vercel o dominio custom] |
| Repository | [VERIFICARE: URL GitHub privato o pubblico] |
| Dashboard Supabase | [VERIFICARE: URL progetto su supabase.com] |
| Dashboard Lemon Squeezy | [VERIFICARE: URL store su app.lemonsqueezy.com] |
| Dashboard Vercel | [VERIFICARE: URL deployment su vercel.com] |
| Account demo | [VERIFICARE: esiste un account di test?] |

---

## Stakeholder esterni

Queste sono le piattaforme terze su cui dipende Flusso. Se una di queste smette di funzionare, una parte dell'app smette di funzionare.

**Supabase** — database Postgres, autenticazione utenti (email+password e Google OAuth), storage. È il cuore del backend: ogni dato dell'app vive qui.

**Lemon Squeezy** — Merchant of Record (MoR) per i pagamenti. Gestisce il checkout, le fatture fiscali, l'IVA europea e le sottoscrizioni. Quando un utente paga, Lemon Squeezy invia un webhook a Flusso che aggiorna il piano. Vedi [app/api/webhook/lemon-squeezy/route.ts](../app/api/webhook/lemon-squeezy/route.ts).

**Anthropic (Claude API)** — usato solo per la feature "import da screenshot". Il modello `claude-haiku-4-5-20251001` riceve l'immagine in base64 e restituisce un array JSON di transazioni. Solo utenti Premium o Founder possono usarla. Vedi [app/dashboard/transazioni/screenshot-action.ts](../app/dashboard/transazioni/screenshot-action.ts).

**Resend** — servizio email transazionale. Usato per inviare l'email di benvenuto ai nuovi utenti. Le credenziali sono nelle variabili `RESEND_API_KEY` e `RESEND_FROM_EMAIL`.

**Vercel** — [VERIFICARE: se è la piattaforma di deployment]. Esegue il build Next.js e serve l'app in produzione. I deploy avvengono automaticamente al push su `main` (se il progetto è collegato a Vercel).

---

*Vedi anche: [02-architecture.md](02-architecture.md) per capire come questi servizi si collegano nel codice.*
