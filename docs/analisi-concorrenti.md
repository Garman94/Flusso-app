# Analisi dei concorrenti di Flusso

Data: 28/10/2026. Metodo "black box": solo pagine pubbliche (prezzi, funzioni, guide, schede degli store, recensioni). Niente account, niente decompilazione, niente scraping. Le cose che si vedono solo dentro le app sono segnate come **sconosciute**, e in fondo c'è l'elenco delle prove da fare con un account.

**Legenda**
- ✅ osservato (pagina ufficiale o codice di Flusso)
- 🟡 dedotto o riportato da fonti terze (recensioni, articoli)
- ❌ assente (osservato o dedotto, come indicato)
- ❓ sconosciuto
- — non pertinente

Le fonti sono elencate in fondo, numerate [1]…[16].

## 1. Matrice funzionalità × app

| Funzione | Flusso | YNAB | Monarch | Wallet (BudgetBakers) | Spendee | Money Manager | Intesa / isybank | Revolut | Splitwise |
|---|---|---|---|---|---|---|---|---|---|
| Collegamento automatico alle banche italiane | ❌ | ✅ Italia tra i paesi "Direct Import" [2] | ❌ 🟡 solo USA e Canada [5] | 🟡 "alcune banche italiane" (Salt Edge) [7] | 🟡 Premium, elenco banche non verificato [9] | ❌ 🟡 non citato [10] | — è la banca | — è la banca | ❌ ✅ import carte solo USA [12] |
| Import da file (CSV/Excel) | ✅ con formati italiani riconosciuti | ✅ file-based import [2] | ❓ | 🟡 CSV, XLS, OFX (fonti discordanti) [8] | ✅ import/export [9] | 🟡 Excel dalla versione PC [10] | — | — | ❓ |
| Lettura da foto o scontrino con AI | ✅ screenshot (Premium) | ❓ | 🟡 scontrini dal 2026 [6] | 🟡 OCR tra le guide [8] | ❓ | ❓ | ❓ | ❓ | ✅ scontrini (Pro) [12] |
| Categorie automatiche | ✅ regole → dizionario negozi italiani → banca → parole | ❓ | 🟡 "categorizza ogni movimento" [6] | ✅ regole automatiche [8] | ✅ [9] | ❌ 🟡 inserimento a mano | 🟡 "classifica automaticamente" [14] | 🟡 categorie personalizzabili [15] | — |
| Regole personali | ✅ "Ricorda" e pannello Regole | ❓ | 🟡 regole [6] | ✅ anche da un movimento esistente [8] | ❓ | ❓ | ❓ | 🟡 [15] | — |
| Budget per categoria | ✅ Premium | ✅ cuore del prodotto [1] | 🟡 [6] | ✅ [8] | ✅ 1 gratis, illimitati a pagamento [9] | ✅ budget mensile per categoria [10] | ❓ | 🟡 budget e limiti per categoria [15] | ❌ |
| **Avvisi e notifiche** (budget, scadenze) | ❌ solo annunci in app e mail di benvenuto | ❓ | 🟡 avvisi prima delle spese ricorrenti [6] | 🟡 avvisi vicino al limite di budget [8] | ❓ | ❓ | ❓ | 🟡 notifiche sui limiti di categoria [15] | ❓ |
| Spese fisse e ricorrenti trovate da sole | ✅ | ❓ | 🟡 trova le ricorrenti, con calendario [6] | 🟡 pagamenti pianificati [8] | ❓ | ❓ | ❓ | 🟡 gestione abbonamenti [15] | ❓ |
| Previsione del saldo a fine periodo | ✅ da stipendio a stipendio | 🟡 metodo diverso: assegnare ogni euro [1] | ✅ previsioni (piano Plus) [4] | 🟡 dai pagamenti pianificati [8] | ❓ | ❌ 🟡 | 🟡 "saldo previsto" [14] | ❓ | — |
| Obiettivi di risparmio | ✅ (1 nel gratuito) | ✅ [1] | 🟡 anche condivisi [6] | 🟡 [8] | ❓ | ❓ | ✅ isySalvadanaio [13] | 🟡 Pockets [15] | — |
| Salvadanai come soldi davvero separati | 🟡 virtuali, collegabili al conto vero | ❌ 🟡 | ❌ 🟡 | ❌ 🟡 | ❌ 🟡 | ❌ 🟡 | ✅ salvadanaio della banca [13] | 🟡 Pockets e arrotondamenti [15] | — |
| **Coppia o famiglia con accessi separati** | ❌ componenti dentro un solo account | ✅ fino a 6 persone incluse [1] | 🟡 viste condivise "mio/tuo/nostro" [6] | 🟡 condivisione di gruppo, fino a 10 [8] | ✅ portafogli condivisi (Plus) [3] | ❓ | ❌ 🟡 | ❓ | ✅ è il prodotto [12] |
| Chi deve quanto a chi | 🟡 movimenti per persona e giroconti, niente debiti | ❌ 🟡 | 🟡 | ❓ | ❓ | ❓ | ❌ 🟡 | ❓ | ✅ [12] |
| Saldo per conto e controllo con la banca | ✅ "Quadra" con gli indizi delle differenze | 🟡 | 🟡 sincronizzazione | 🟡 sincronizzazione | 🟡 sincronizzazione | 🟡 conti e patrimonio [10] | — | — | — |
| Bollette luce e gas (stima, lettura con AI) | ✅ unico | ❌ 🟡 non trovato | ❌ 🟡 | ❌ 🟡 | ❌ 🟡 | ❌ 🟡 | ❌ 🟡 | ❌ 🟡 | ❌ 🟡 |
| Auto: consumi, km abituali ed extra | ✅ unico | ❌ 🟡 | ❌ 🟡 | ❌ 🟡 | ❌ 🟡 | ❌ 🟡 | ❌ 🟡 | ❌ 🟡 | ❌ 🟡 |
| Riepilogo del mese | ✅ | ❓ | 🟡 | ❓ | 🟡 grafici apprezzati [9] | 🟡 statistiche [10] | 🟡 analisi spese [14] | 🟡 confronto con i periodi precedenti [15] | 🟡 grafici (Pro) [12] |
| Export dei dati | ✅ CSV | ❓ | ❓ | ❓ | ✅ [3] | 🟡 [10] | ❓ | ❓ | ❓ |
| App iPhone e Android | 🟡 web installabile + Android che apre il sito, **niente iOS** | ✅ [1] | 🟡 | ✅ | ✅ [3] | ✅ [10] | ✅ | ✅ | ✅ |
| In italiano | ✅ | ❓ | ❌ 🟡 inglese, prezzi in USD [5] | 🟡 | 🟡 | 🟡 | ✅ | ✅ | 🟡 |
| Prezzo | Gratis · 4,99 €/mese · Founder 49 € una volta | 14,99 $/mese o 109 $/anno, 34 giorni di prova senza carta [1] | 14,99 $/mese o 99,99 $/anno, nessun piano gratis [4] | 🟡 £5,49/mese, £19,99/anno, a vita £48,99 (Regno Unito) [7] | Gratis · Plus 1,99 $/mese · Premium 5,99 $/mese [3] | 🟡 gratis + 5,99 € una volta su Android [11] | gratis nel conto | Standard 0 €, piani a pagamento [16] | 🟡 gratis + Pro circa 4,99 $/mese [12] |

**Onboarding e primo "momento wow"**
- **Flusso** (osservato nel codice): iscrizione → benvenuto → import del file. Il "wow" arriva solo dopo il primo import, che richiede di scaricare il file dalla banca. È lì che i tester di settembre si sono fermati.
- **Concorrenti con collegamento alla banca** (YNAB, Wallet, Spendee): 🟡 il wow arriva dopo il collegamento, senza file.
- Durate reali per tutti: **❓ sconosciute**, servono le prove con un account (vedi §6).

## 2. Lacune di Flusso

| # | Lacuna | Impatto per l'utente | Effort (sviluppatore solo) | Piano consigliato |
|---|---|---|---|---|
| L1 | Nessun collegamento automatico alla banca (PSD2) | **Alto**: scaricare e caricare il file è l'attrito numero uno, e i nuovi iscritti si fermano lì. YNAB lo offre in Italia | **L**: fornitore autorizzato, costi per connessione, contratto e DPA | Premium |
| L2 | Nessun avviso o promemoria (budget superato, spesa fissa in arrivo, "carica i movimenti", riepilogo via email o push) | **Alto**: senza avvisi l'app si dimentica, quindi meno ritorno | **M**: Resend c'è già; servono job pianificati, notifiche web push e preferenze | Base gratis, avanzati Premium |
| L3 | Coppia o famiglia con un solo login | **Alto** per il target "coppia/famiglia" (`usage_type`): il partner non entra con il suo account | **L**: concetto di "casa" condivisa e RLS da rifare su tutte le tabelle | Premium |
| L4 | Pochi formati di file riconosciuti in automatico, niente PDF | **Medio-alto**: con banche diverse da Intesa, Fineco e N26 tocca indicare le colonne a mano | **M**: formati di più banche italiane, estratto conto PDF letto dall'AI | File gratis, PDF Premium |
| L5 | Le categorie non imparano dai cambi a mano | **Medio**: si correggono sempre gli stessi negozi | **S**: dopo 2-3 cambi uguali proporre "Vuoi che lo faccia sempre?" | Gratis |
| L6 | Niente app iOS e niente notifiche push | **Medio** | **M**: notifiche web push (anche iPhone dalla schermata Home) ed eventuale app iOS | — |
| L7 | Niente "chi deve quanto a chi" tra persone | **Medio** per coppie e coinquilini | **M** | Premium |
| L8 | Niente patrimonio netto o investimenti | **Basso-medio** | **L** | Premium |
| L9 | Niente multi-valuta | **Basso** in Italia | **M** | Premium |
| L10 | Igiene tecnica: mancano gli header di sicurezza; le funzioni Vercel girano in USA (`iad1`) mentre il database è in Irlanda | **Medio**: velocità e possibilità di dire "dati solo in Europa" | **S** | — |

## 3. Dove Flusso è già migliore (da usare nel marketing)

- **Prezzo:** 4,99 €/mese contro 14,99 $/mese di YNAB e Monarch [1][4], più il Founder a vita da 49 €.
- **Fatta per l'Italia:**
  - in italiano;
  - formati delle banche italiane riconosciuti da soli (Intesa/isybank, Fineco, N26) e numero del conto letto dal file;
  - dizionario di negozi italiani (Esselunga, Iperal, Enel…);
  - mese "da stipendio a stipendio".
- **Niente password della banca:** si caricano file. I dati stanno in un database in UE (Supabase, Irlanda).
- **Cose che nessuno dei concorrenti fa** (dedotto: non trovate in nessuna fonte):
  - luce e gas con stima della bolletta e lettura di bollette e contratti con l'AI;
  - auto e carburante con km abituali ed extra;
  - accantonamenti per le spese annuali;
  - prelievo d'emergenza dai salvadanai;
  - saldo che quadra con la banca e indizi sulle differenze;
  - soldi tra familiari che non contano come entrate.
- **Spese fisse trovate in automatico** tra i movimenti.

## 4. Top 5 interventi (in ordine di priorità)

Criteri: impatto sui primi tester, effort per uno sviluppatore solo, mercato italiano (banche, formati, GDPR).

1. **Import italiano senza attrito** (L4, M).
   - Più banche riconosciute in automatico: UniCredit, Poste/BancoPosta, BPER, Banco BPM, Crédit Agricole, Revolut, Hype.
   - Estratto conto PDF letto dall'AI (Premium).
   - Guida delle banche estesa.

   *Perché prima:* i tester si fermano all'import. È la leva più rapida, mentre il collegamento automatico (punto 5) è un lavoro grande.
2. **Avvisi e promemoria** (L2, M).
   - Budget all'80% e al 100%, spesa fissa in arrivo, "sono 7 giorni che non carichi i movimenti", riepilogo del mese via email.
   - Notifiche push dove possibile.
   - *GDPR:* consenso e disattivazione per ogni tipo di avviso.
3. **Le categorie imparano dai cambi a mano** (L5, S).
   - Proposta di regola dopo 2-3 correzioni uguali.
   - Regola creata da un movimento.
   - Vantaggio rapido sulla precisione, gratis per tutti.
4. **Spazio di coppia con due accessi** (L3, L).
   - Invito del partner e vista "mio, tuo, nostro" sulle funzioni famiglia che ci sono già.
   - Premium. È ciò che fanno YNAB, Monarch, Wallet e Spendee.
5. **Collegamento automatico alle banche (PSD2)** (L1, L).
   - Prima uno **studio di fattibilità (S)**: fornitori autorizzati, copertura di Intesa, UniCredit e Poste, costi per utente, contratto e DPA.
   - Poi la decisione.
   - Premium, perché ha un costo per connessione.

**Fuori classifica, da fare subito** (L10, S): header di sicurezza (CSP, protezione dall'inserimento in altri siti, `nosniff`, `Referrer-Policy`, niente `X-Powered-By`) e funzioni Vercel spostate in UE (`dub1`, vicino al database). Più veloce, e si può dire "dati solo in Europa".

## 5. Sicurezza (Fase 1, 28/10)

- **RLS attiva su tutte e 35 le tabelle.** Ogni policy limita i dati al proprietario. Uniche letture aperte: il dizionario negozi (solo utenti con login) e gli annunci admin (anche senza login).
- **Nel codice pubblico del sito:**
  - solo l'URL di Supabase e la chiave pubblicabile;
  - nessun segreto: né il service role, né Anthropic, né Lemon Squeezy, né le email admin;
  - nessuna source map.
- **Rotte `/api`:** chiedono il login (le admin anche l'email), tranne `/api/demo/reset`, che è voluto ma andrebbe limitato.
- **Falla corretta** (PR #23, migration 049): l'id dell'abbonamento Lemon Squeezy era modificabile dall'utente, e con `/api/subscription/cancel` si poteva annullare l'abbonamento di un altro cliente.

## 6. Da verificare con un account (prove da fare)

- **Durata reale dell'onboarding e del primo "wow":**
  - YNAB: 34 giorni di prova senza carta [1];
  - Wallet, Spendee, Money Manager, Splitwise: versioni gratuite;
  - Monarch: ❓ forse serve la carta.
- **Copertura reale delle banche italiane** di YNAB, Wallet e Spendee. L'elenco si vede solo dentro le app.
- **Intesa / isybank:** se l'app ha budget per categoria e avvisi. *Si guarda dal tuo account.*
- **Revolut:** budget, avvisi e Pockets, *se hai un account*.

## Fonti

1. YNAB, prezzi: https://www.ynab.com/pricing
2. YNAB, Direct Import in Europe: https://support.ynab.com/en_us/direct-import-in-the-uk-and-eu-an-overview-Syae1z_A9
3. Spendee, prezzi: https://www.spendee.com/pricing
4. Monarch, prezzi: https://www.monarch.com/pricing
5. Monarch e banche fuori dal Nord America (fonti terze): https://freenance.io/comparisons/ynab-vs-monarch-money-2026-eu-investors-comparison-fees-features-multi-currency-bank-coverage/ · https://joingerald.com/learn/financial-wellness/monarch-money-bank-account-connections-guide
6. Monarch, recensioni 2026: https://envelopebudgeting.com/articles/monarch-money-review · https://www.nerdwallet.com/finance/learn/monarch-money-app-review
7. Wallet, prezzi e banche (fonti terze): https://www.finder.com/uk/wallet-budgetbakers-review · https://pocketclear.app/blog/expense-tracker-italy.html
8. Wallet, guide ufficiali e recensioni: https://support.budgetbakers.com/hc/en-us/sections/6961343873426-Features · https://beebom.com/wallet-app-by-budgetbakers-review/amp/
9. Spendee, recensioni: https://www.capterra.com/p/238829/Spendee/reviews/
10. Money Manager: https://realbyteapps.com/
11. Money Manager, prezzo (fonte terza): https://www.t-online.de/finanzen/ratgeber/verbraucher/id_100488254/money-manager-ueberschaubar-und-fair-allerdings-nur-bedingt.html
12. Splitwise Pro: https://www.splitwise.com/pro · prezzi (fonti terze): https://adapty.io/paywall-library/splitwise/
13. isybank, isySalvadanaio: https://group.intesasanpaolo.com/it/newsroom/comunicati-stampa/2024/10/isybank-e-l-app-piu-scaricata-su-app-store-e-promuove-il-valore-
14. Intesa Sanpaolo, analisi delle spese (Forrester): https://group.intesasanpaolo.com/it/newsroom/tutte-le-news/news/2022/app-intesa-sanpaolo-digital-leader-emea
15. Revolut, statistiche, budget e Pockets: https://www.punto-informatico.it/fintech/carte/revolut-conto-multivaluta-e-unapp-ricca-di-funzionalita-innovative/ · https://www.pagamentidigitali.it/carte/carta-revolut-recensione-piani-costi/
16. Revolut, piani: https://www.money.it/10-motivi-per-aprire-un-conto-Revolut-Standard
