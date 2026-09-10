# Documentazione Flusso

Flusso è una web app di gestione finanziaria personale. Permette di tracciare entrate e uscite, prevedere il budget mensile, monitorare le spese ricorrenti e gestire obiettivi di risparmio. È costruita con Next.js 15, Supabase e Tailwind CSS; i pagamenti sono gestiti da Lemon Squeezy.

Questa documentazione è pensata per chi deve mantenere e far evolvere il progetto da solo, senza supporto esterno costante.

---

## Indice

| File | Descrizione |
|------|-------------|
| [01-overview.md](01-overview.md) | Cos'è Flusso: scopo, piani, stakeholder esterni |
| [02-architecture.md](02-architecture.md) | Stack, struttura cartelle, concetti chiave, flussi dati |
| [03-glossary.md](03-glossary.md) | Glossario termini business e tecnici |
| [04-modifiche-comuni.md](04-modifiche-comuni.md) | Ricette passo-passo per le modifiche più frequenti |
| [05-deploy-env.md](05-deploy-env.md) | Variabili d'ambiente, setup locale, deploy produzione |
| [06-sicurezza.md](06-sicurezza.md) | Livelli di fiducia, gating premium, webhook, backup |
| [07-troubleshooting.md](07-troubleshooting.md) | FAQ tecnica: cosa fare quando qualcosa va storto |
| [08-prompting-claude-code.md](08-prompting-claude-code.md) | Come usare Claude Code in modo produttivo |

---

## Da dove iniziare

Se non hai mai visto il codice, leggi in questo ordine:

1. **[01-overview.md](01-overview.md)** — capisci cosa fa l'app e per chi.
2. **[02-architecture.md](02-architecture.md)** — capisci come è costruita e i 4 concetti fondamentali (server component, server action, proxy, RLS). Senza questi 4 concetti il resto del codice è opaco.
3. **[03-glossary.md](03-glossary.md)** — tienilo aperto come riferimento mentre leggi il codice.
4. **[05-deploy-env.md](05-deploy-env.md)** — segui la procedura di setup locale per avere l'app che gira sul tuo PC.
5. **[04-modifiche-comuni.md](04-modifiche-comuni.md)** — la prima volta che devi fare una modifica reale, parti da qui.
6. **[06-sicurezza.md](06-sicurezza.md)** — leggilo prima di toccare qualsiasi cosa legata a piani, pagamenti o RLS.
7. **[07-troubleshooting.md](07-troubleshooting.md)** e **[08-prompting-claude-code.md](08-prompting-claude-code.md)** — consulta quando serve.
