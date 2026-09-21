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
    version: "2.0",
    whatIsNew: "giro di benvenuto più corto e checklist di partenza in dashboard",
    steps: [
      {
        title: "Benvenuto in Flusso! 👋",
        message: "Quattro tocchi e sai dove trovare tutto.",
      },
      {
        target: "[data-tour='hero']",
        title: "Saldo di oggi e di fine mese",
        message: "In alto quello che hai davvero, sotto quello che ti aspetti a fine mese. Tocca una voce per vedere da dove nasce il numero.",
      },
      {
        target: "[data-tour='breakdown']",
        title: "Dove vanno i soldi",
        message: "Tocca una categoria per vedere i singoli movimenti.",
      },
      {
        target: "[data-tour='nav-transazioni']",
        title: "Da qui si parte",
        message: "In Transazioni importi l'estratto conto della banca o aggiungi i movimenti a mano.",
      },
      {
        target: "[data-tour='nav-smart']",
        title: "Smart",
        message: "Budget, accantonamenti e rate: le spese che ti aspettano nei prossimi mesi.",
      },
    ],
  },

  "/dashboard/transazioni": {
    version: "1.3",
    whatIsNew: "se il file della banca non viene letto puoi indicare tu le colonne (e Flusso se le ricorda); supporta anche Entrate e Uscite separate",
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
        title: "Import Excel guidato 📂",
        message: "Se hai dei Componenti, il primo passo dell'import chiede a chi appartengono i movimenti. Poi Flusso controlla i duplicati: segna in verde le righe nuove, in giallo i possibili doppioni e salta quelli identici già presenti.",
      },
      {
        title: "Categorie e regole",
        message: "Assegna le categorie alle transazioni. Se hai attivato la modalità smanettone in Account puoi creare regole automatiche.",
      },
    ],
  },

  "/dashboard/smart": {
    version: "2.2",
    whatIsNew: "ogni accantonamento può collegarsi a un salvadanaio specifico; le transazioni categorizzate \"Accantonamenti\" contano come spesa reale",
    freePreview: [
      {
        title: "Benvenuto in Smart ⚡",
        message: "Smart è il centro di analisi avanzata di Flusso. Qui organizzi ogni impegno fisso — rate, accantonamenti, budget — e tracci i tuoi obiettivi di risparmio.",
      },
      {
        title: "Rate 📆",
        message: "Mutui, rate d'acquisto, debiti con persone: importo mensile, quanto manca, quanto hai già pagato.",
      },
      {
        title: "Accantonamenti e Budget 🏦",
        message: "Accantonamenti calcola la quota mensile per le spese grandi e irregolari; Budget ti fa impostare quanto spendere per categoria, per le spese variabili.",
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
        title: "Smart si è riorganizzato ⚡",
        message: "Le spese ricorrenti generiche di prima (\"Aggiungi spesa ricorrente\", \"Le mie spese ricorrenti\", \"Previsioni\") hanno lasciato il posto a tre sezioni dedicate — Rate, Accantonamenti, Budget — pensate per prevedere le spese del mese con più precisione.",
      },
      {
        target: "[data-tour='smart-impegni']",
        title: "Rate, Accantonamenti, Budget",
        message: "Tre modi di tenere sotto controllo i soldi già impegnati: le Rate (mutui, acquisti a rate, debiti — fisse e mensili) mostrano quanto manca e quanto hai già pagato; gli Accantonamenti calcolano la quota mensile per le spese grandi e irregolari; il Budget ti fa impostare quanto vuoi spendere per categoria. La somma dei tre è \"Spese previste\" in dashboard.",
      },
      {
        target: "[data-tour='smart-obiettivi']",
        title: "Obiettivi di risparmio",
        message: "Crea obiettivi con importo e scadenza: Flusso suggerisce la quota mensile, li collega a un salvadanaio e tiene lo storico dei contributi in una pagina di dettaglio.",
      },
    ],
  },

  "/dashboard/salvadanai": {
    version: "1.0",
    whatIsNew: "salvadanai multipli con obiettivi, condivisione e storico movimenti",
    steps: [
      {
        title: "Salvadanai 🐷",
        message: "Ora puoi avere più salvadanai separati — vacanza, emergenza, casa… La somma di tutti corrisponde all'unico salvadanaio della tua banca.",
      },
      {
        target: "[data-tour='pot-grid']",
        title: "I tuoi salvadanai",
        message: "Ogni card mostra il saldo, la barra verso l'obiettivo e — se condiviso — quanto ha messo ciascun componente. Tocca una card per vedere i movimenti.",
      },
      {
        target: "[data-tour='pot-add']",
        title: "Crea un salvadanaio",
        message: "Nome ed emoji, obiettivo facoltativo, e scelta se tenerlo personale o condiviso con il gruppo. Poi deposita o preleva quando vuoi.",
      },
    ],
  },

  "/dashboard/account": {
    version: "1.5",
    whatIsNew: "puoi esportare i tuoi movimenti in CSV",
    steps: [
      {
        title: "Impostazioni account ⚙️",
        message: "Qui gestisci il profilo, il piano e le preferenze avanzate.",
      },
      {
        target: "[data-tour='account-income']",
        title: "Il tuo reddito 💼",
        message: "Inserisci tipo di reddito, importo e giorno di paga. Flusso li usa per rendere più precise le previsioni di budget e i suggerimenti di risparmio in Dashboard. Se ti identifichi come componente qui sotto, questa sezione si nasconde per evitare doppioni.",
      },
      {
        target: "[data-tour='account-family']",
        title: "Componenti",
        message: "Aggiungi i membri della famiglia o del gruppo, con nome, colore e — se vuoi — le info sul reddito. Aggiungi anche te stesso e spunta \"Sei tu\": da quel momento import Excel e salvadanai condivisi ti chiederanno sempre di scegliere una persona precisa invece del generico \"Io\", e il tuo reddito si gestisce da qui.",
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
