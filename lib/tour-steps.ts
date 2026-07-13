import type { TourStep } from "@/components/tour/tour-context";

export type PageTourDef = {
  version: string;
  whatIsNew: string;
  steps: TourStep[];
  /** Passi mostrati agli utenti free al posto dei normali — spiega la feature e invita all'upgrade */
  freePreview?: TourStep[];
};

export const PAGE_TOURS: Record<string, PageTourDef> = {

  "/dashboard": {
    version: "1.2",
    whatIsNew: "bottone mesi precedenti e badge componenti famiglia",
    steps: [
      {
        title: "Benvenuto in Flusso! 👋",
        message: "Ti guidiamo in pochi secondi attraverso le funzioni principali. Clicca Avanti — o tocca lo sfondo — per continuare.",
      },
      {
        target: "[data-tour='hero']",
        title: "Le tue spese del mese",
        message: "Qui vedi il totale delle uscite del periodo corrente e il tuo score finanziario — un indicatore rapido della salute delle finanze.",
      },
      {
        target: "[data-tour='breakdown']",
        title: "Dove vanno i soldi",
        message: "Clicca su una categoria per espanderla e vedere le singole transazioni del mese.",
      },
      {
        target: "[data-tour='month-report-btn']",
        title: "Report mesi precedenti",
        message: "Da qui puoi navigare i mesi passati e vedere entrate, uscite e breakdown per categoria di ogni mese.",
      },
      {
        target: "[data-tour='nav-transazioni']",
        title: "Aggiungi le transazioni",
        message: "Da Transazioni aggiungi movimenti manualmente o importi l'estratto conto Excel della tua banca. È il punto di partenza.",
      },
      {
        target: "[data-tour='nav-smart']",
        title: "Analisi Smart",
        message: "Smart contiene previsioni di budget, monitoraggio delle spese ricorrenti (bollette, abbonamenti…) e obiettivi di risparmio.",
      },
      {
        title: "Sei pronto! 🚀",
        message: "Inizia aggiungendo le tue prime transazioni. Più dati hai, più accurate saranno le analisi.",
      },
    ],
  },

  "/dashboard/transazioni": {
    version: "1.1",
    whatIsNew: "totali filtrati e badge componenti famiglia sulle transazioni",
    steps: [
      {
        title: "Le tue transazioni 💸",
        message: "Qui trovi tutti i movimenti. Puoi navigare per mese, filtrare per tipo e cercare per descrizione o categoria.",
      },
      {
        target: "[data-tour='tx-nav']",
        title: "Naviga per periodo",
        message: "Usa le frecce per spostarti tra mesi o anni. Puoi vedere tutta la storia dei tuoi movimenti.",
      },
      {
        target: "[data-tour='tx-summary']",
        title: "Totali in tempo reale",
        message: "Questa riga mostra entrate, uscite e saldo netto delle sole voci visibili — si aggiorna subito al cambio di filtro o ricerca.",
      },
      {
        target: "[data-tour='tx-filters']",
        title: "Filtri",
        message: "Filtra per tipo (Entrate / Uscite / Senza categoria) o cerca una transazione per nome o categoria.",
      },
      {
        target: "[data-tour='tx-add']",
        title: "Aggiungi movimenti",
        message: "Aggiungi manualmente, importa un Excel della banca o analizza uno screenshot con l'AI.",
      },
      {
        title: "Categorie e regole",
        message: "Assegna le categorie alle transazioni. Se hai attivato la modalità smanettone in Account puoi creare regole automatiche.",
      },
    ],
  },

  "/dashboard/smart": {
    version: "1.0",
    whatIsNew: "spese ricorrenti, obiettivi, previsioni e accantonamenti",
    freePreview: [
      {
        title: "Benvenuto in Smart ⚡",
        message: "Smart è il centro di analisi avanzata di Flusso. Qui puoi tenere sotto controllo le spese ricorrenti, pianificare il budget e tracciare i tuoi obiettivi di risparmio.",
      },
      {
        title: "Spese ricorrenti 🔁",
        message: "Inserisci bollette, abbonamenti e spese regolari. Flusso le confronta ogni mese con le transazioni reali e ti mostra se sei in linea o hai sforato.",
      },
      {
        title: "Previsioni di budget 📊",
        message: "Pianifica quanto vuoi spendere per categoria e confrontalo con la tua spesa reale media. Scopri dove si nascondono i tuoi soldi.",
      },
      {
        title: "Obiettivi di risparmio 🎯",
        message: "Crea obiettivi con importo e scadenza. Flusso stima quando li raggiungerai in base al tuo ritmo di risparmio.",
      },
      {
        title: "Sblocca Smart con Premium 🚀",
        message: "Tutte queste funzioni sono disponibili con il piano Premium. Vai su Account → Piano per scoprire le opzioni — o riscatta un coupon se ne hai uno.",
      },
    ],
    steps: [
      {
        title: "Benvenuto in Smart ⚡",
        message: "Smart è il centro di analisi avanzata: tieni sotto controllo le spese fisse, gli obiettivi e il budget previsto.",
      },
      {
        target: "[data-tour='smart-ricorrenti']",
        title: "Spese ricorrenti",
        message: "Inserisci bollette, abbonamenti e spese regolari. Flusso le confronta con le transazioni reali ogni mese.",
      },
      {
        target: "[data-tour='smart-obiettivi']",
        title: "Obiettivi di risparmio",
        message: "Crea obiettivi con un importo target e una scadenza. Flusso stima quando li raggiungerai.",
      },
      {
        target: "[data-tour='smart-previsioni']",
        title: "Previsioni",
        message: "Confronta il budget che hai pianificato con la spesa reale media degli ultimi mesi.",
      },
      {
        target: "[data-tour='smart-accantonamenti']",
        title: "Accantonamenti",
        message: "Pianifica le spese grandi e irregolari (vacanze, assicurazione auto…) accantonando ogni mese la quota necessaria.",
      },
    ],
  },

  "/dashboard/account": {
    version: "1.2",
    whatIsNew: "chat feedback diretta con Marco",
    steps: [
      {
        title: "Impostazioni account ⚙️",
        message: "Qui gestisci il profilo, il piano e le preferenze avanzate.",
      },
      {
        target: "[data-tour='account-family']",
        title: "Componenti",
        message: "Aggiungi i membri della famiglia o del gruppo. Ogni estratto conto importato può essere associato a uno di loro — le transazioni mostreranno un badge colorato.",
      },
      {
        target: "[data-tour='account-power-user']",
        title: "Modalità smanettone",
        message: "Attivala per sbloccare le regole avanzate di rinomina e categorizzazione automatica delle transazioni.",
      },
      {
        target: "[data-tour='account-feedback']",
        title: "Scrivi a Marco 💬",
        message: "Hai un'idea, un problema o una domanda? Scrivimi direttamente qui — rispondo personalmente in app. È il modo più diretto per migliorare Flusso insieme.",
      },
    ],
  },

};

export function getTourStorageKey(path: string) {
  return `flusso_tour_v:${path}`;
}

export function hasUnseenTour(path: string): boolean {
  const def = PAGE_TOURS[path];
  if (!def) return false;
  try {
    return localStorage.getItem(getTourStorageKey(path)) !== def.version;
  } catch {
    return false;
  }
}

/** true = la chiave non esiste mai (primo accesso assoluto a questa pagina) */
export function isFirstVisit(path: string): boolean {
  const def = PAGE_TOURS[path];
  if (!def) return false;
  try {
    return localStorage.getItem(getTourStorageKey(path)) === null;
  } catch {
    return false;
  }
}

export function markTourSeen(path: string) {
  const def = PAGE_TOURS[path];
  if (!def) return;
  try {
    localStorage.setItem(getTourStorageKey(path), def.version);
  } catch {}
}
