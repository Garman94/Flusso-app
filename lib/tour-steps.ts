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
    version: "2.1",
    whatIsNew: "la card del saldo è più semplice: saldo di oggi, stima di fine periodo e due barre (spese ed entrate); il saldo si aggiorna da solo a ogni nuovo periodo",
    steps: [
      {
        title: "Benvenuto in Flusso! 👋",
        message: "Quattro tocchi e sai dove trovare tutto.",
      },
      {
        target: "[data-tour='hero']",
        title: "Quanto hai e quanto avrai",
        message: "In alto il saldo di oggi, sotto la stima di fine periodo e due barre: quanto hai speso rispetto alle previsioni e quanto hai incassato. Tocca un numero per vedere da dove viene.",
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
        title: "Pianifica",
        message: "Decidi quanto spendere per categoria, segui rate e spese annuali, crea obiettivi di risparmio.",
      },
    ],
  },

  "/dashboard/transazioni": {
    version: "1.4",
    whatIsNew: "quando scegli una categoria, Flusso ti propone di ricordarla per i movimenti simili (anche nei prossimi import)",
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
        title: "Categorie che si ricordano",
        message: "Quando cambi la categoria di un movimento, Flusso ti chiede se ricordarla: da lì in poi i movimenti simili, anche quelli dei prossimi import, vanno da soli nella categoria giusta.",
      },
    ],
  },

  "/dashboard/smart": {
    version: "3.0",
    whatIsNew: "Smart ora si chiama Pianifica: tutte le sezioni sono in un'unica schermata e il tasto Indietro del telefono torna al passo precedente",
    freePreview: [
      {
        title: "Pianifica 🗓️",
        message: "Qui decidi in anticipo dove vanno i tuoi soldi. Gli obiettivi di risparmio sono inclusi nel piano gratuito (uno).",
      },
      {
        target: "[data-tour='smart-budget']",
        title: "Budget, rate e accantonamenti",
        message: "Con Premium imposti quanto spendere per categoria, segui rate e spese annuali, e la dashboard ti dice quanto avrai a fine mese.",
      },
      {
        target: "[data-tour='smart-obiettivi']",
        title: "Obiettivi 🎯",
        message: "Una cifra da raggiungere entro una data: Flusso ti dice quanto mettere da parte ogni mese.",
      },
    ],
    steps: [
      {
        title: "Pianifica 🗓️",
        message: "Qui decidi in anticipo dove vanno i tuoi soldi. Quello che imposti qui diventa la previsione di fine mese in dashboard.",
      },
      {
        target: "[data-tour='smart-budget']",
        title: "Le spese del mese",
        message: "Budget per le spese variabili (spesa, ristoranti…), Rate e mutui per i debiti, Accantonamenti per le spese annuali. Insieme fanno le \"spese previste\".",
      },
      {
        target: "[data-tour='smart-obiettivi']",
        title: "I tuoi risparmi",
        message: "Obiettivi con cifra e scadenza, e i salvadanai dove tieni i soldi già messi da parte.",
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
        title: "Il tuo account ⚙️",
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
        message: "Per chi vuole di più: mostra l'elenco completo delle regole di categoria e le regole per rinominare le descrizioni.",
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

/**
 * true = la guida di questa pagina è cambiata DOPO che l'utente ne aveva vista una.
 * Per chi non l'ha mai vista non serve un segnale: parte da sola al primo accesso.
 */
export function hasTourUpdate(path: string): boolean {
  const def = PAGE_TOURS[path];
  if (!def) return false;
  try {
    const seen = localStorage.getItem(getTourStorageKey(path));
    return seen !== null && seen !== def.version;
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
