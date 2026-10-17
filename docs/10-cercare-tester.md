# 10 — Cercare persone che provino Flusso

Piano del 17/10, dopo i numeri: 15 account, 2 persone che la usano davvero, 0 abbonamenti pagati.
Chi si è iscritto a fine settembre si è fermato all'import. Obiettivo: **30 persone vere** che provino Flusso
e dicano dove si bloccano.

## L'offerta

- **Premium gratis per 3 mesi**, con il codice **PROVA90** (30 posti). Non "founder per sempre": il Founder
  è il piano da 49 € e regalarlo a vita vuol dire rinunciare proprio ai primi che potrebbero pagare.
- Dopo i 3 mesi si resta sul piano Gratuito con tutti i dati, oppure Premium a 4,99 €/mese.
- Come crearlo (dopo la migration 046): Admin → Coupon di upgrade → Piano **Premium**, Codice **PROVA90**,
  Giorni **90**, Persone **30**, Note "tester ottobre 2026".
- Chi lo usa: si iscrive, poi **Account → Codice coupon → PROVA90 → Riscatta**.

## Prima di invitare (in ordine)

1. Online: PR #19 (feedback visibili solo all'admin, benvenuto ai nuovi, eventi di import) e la PR dei tester
   (coupon a tempo, guida per scaricare il file dalla banca). Le migration 045 e 046 vanno applicate prima.
2. Prova tu il giro completo con un secondo account: iscrizione → benvenuto → import → codice PROVA90.
3. Privacy: in `/privacy` c'è l'indirizzo di casa in evidenza e la verifica legale non è ancora fatta.
   Con estratti conto di sconosciuti la fiducia conta: chiedi a un professionista cosa è obbligatorio
   (spesso si usa un domicilio diverso da casa, per esempio presso il commercialista).

## Dove, in quest'ordine

1. **10 persone che conosci** (amici, colleghi, parenti): ti dicono in faccia dove si bloccano. Prima loro.
2. **r/ItaliaPersonalFinance**: molto seguito, ma severo con l'autopromozione. Leggi le regole e, se serve,
   scrivi prima ai moderatori o usa il thread settimanale che consentono.
3. **Gruppi Facebook** di risparmio, economia domestica, coppie e famiglie: chiedi all'amministratore prima di postare.

Punta su **coppie e famiglie che dividono le spese**: è lì che Flusso è diverso (movimenti per persona,
giroconti tra familiari che non contano come entrate, salvadanai, spese fisse e bollette).

## Testi pronti

### Messaggio per chi conosci (WhatsApp)

> Ciao! Sto facendo un'app per tenere i conti di casa, si chiama Flusso: carichi il file dei movimenti
> della banca e ti fa vedere dove vanno i soldi, le spese fisse, le bollette e quanto mettere da parte.
> Mi aiuteresti a provarla? Ti bastano 10 minuti. Con il codice PROVA90 hai Premium gratis per 3 mesi
> (Account → Codice coupon). Mi interessa soprattutto sapere dove ti blocchi o cosa non capisci,
> anche le cose piccole. www.flussoapp.it

### Post per Reddit

**Titolo:** Ho fatto un'app italiana per i conti di casa (anche in coppia): cerco 30 persone che la provino

> Ciao a tutti, sono Marco. Da qualche mese sviluppo Flusso, un'app per i conti di casa pensata per l'Italia.
>
> Come funziona: scarichi dalla tua banca il file Excel o CSV dei movimenti e lo carichi. Non chiede le
> credenziali della banca e non si collega al conto. Flusso mette le categorie da solo (riconosce i negozi
> più comuni e impara dalle tue scelte) e ti mostra entrate, uscite, spese fisse, bollette e quanto mettere
> da parte ogni mese per le spese future.
>
> Funziona anche in coppia o in famiglia: ogni movimento ha la sua persona, e i soldi che vi passate tra
> voi non vengono contati come entrate.
>
> Cerco 30 persone che la provino e mi dicano con sincerità dove si bloccano. Con il codice **PROVA90**
> avete Premium gratis per 3 mesi; dopo restate sul piano gratuito con tutti i vostri dati, nessuna carta richiesta.
>
> Link: www.flussoapp.it. Rispondo a tutte le critiche, qui o dalla chat dentro l'app.

### Post per i gruppi Facebook

> Ciao! Ho creato Flusso, un'app per tenere i conti di casa da soli, in coppia o in famiglia: carichi il
> file dei movimenti della banca (senza dare le credenziali) e vedi dove vanno i soldi, le spese fisse,
> le bollette e quanto mettere da parte. Cerco persone che la provino e mi dicano cosa migliorare:
> con il codice PROVA90 avete Premium gratis per 3 mesi. www.flussoapp.it
> Grazie a chi mi darà una mano!

### Risposta a chi scrive un problema

> Grazie, è proprio questo che mi serve! Mi dici che banca hai e a che punto ti sei fermato?
> Se vuoi, mandami uno screenshot (senza importi) e ti dico subito come fare.

## Come capire se funziona (dopo 2 settimane: "guarda i numeri")

- Quanti si iscrivono e quanti usano PROVA90 (`coupon_codes.uses`, `coupon_redemptions`).
- Quanti finiscono il benvenuto (`onboarding_completed`) e quanti fanno il primo import (`import_completed`).
- Su quali banche aprono la guida (`bank_guide_opened`, `props.bank`): se una banca torna spesso, si aggiungono i suoi passi.
- Quanti tornano dopo 7 giorni (`app_open`).
- Obiettivo indicativo: 30 iscritti → 15 primi import → 5 che tornano dopo una settimana.
