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
    version: "3.0",
    whatIsNew: "in alto c'è quanto puoi spendere fino al prossimo stipendio (e circa quanto al giorno), sotto le spese fisse in arrivo; il tasto Emergenza è nel riquadro dei salvadanai",
    steps: [
      {
        target: "[data-tour='hero']",
        title: "Quanto puoi spendere 💶",
        message: "Il numero grande è quanto puoi spendere ancora fino alla fine del periodo, con le spese fisse da pagare già tolte, e sotto circa quanto al giorno. Tocca «Saldo di oggi» o «A fine periodo» per vedere da dove vengono i numeri. (La prima volta Flusso ti chiede quanto hai oggi sul conto.)",
      },
      {
        target: "[data-tour='upcoming']",
        title: "In arrivo",
        message: "Le spese fisse e le rate di questo periodo: quali sono pagate, quali arrivano tra pochi giorni e quali Flusso non ha trovato nei movimenti. Se ne hai pagata una in un altro modo, tocca «L'ho pagata».",
      },
      {
        target: "[data-tour='salvadanai-emergenza']",
        title: "Salvadanai ed Emergenza 🐷",
        message: "Quanto hai messo da parte. Se ti servono soldi per un imprevisto, «Emergenza» ti dice da quale salvadanaio prenderli e ricalcola quanto mettere da parte per le spese dell'anno.",
      },
      {
        target: "[data-tour='month-report-btn']",
        title: "Mesi passati",
        message: "Il riepilogo di ogni mese: quanto hai risparmiato, dove sono andati i soldi e cosa è cambiato rispetto al solito.",
      },
      {
        target: "[data-tour='nav-transazioni']",
        title: "Da qui si parte",
        message: "In Transazioni carichi l'estratto conto della banca o aggiungi i movimenti a mano. Nelle altre pagine il tasto «?» in basso apre la loro guida.",
      },
    ],
  },

  "/dashboard/transazioni": {
    version: "1.5",
    whatIsNew: "tocca un movimento per modificarlo o eliminarlo; il riepilogo dice quanto ti resta (entrate − uscite)",
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
        title: "Quanto ti resta",
        message: "Questa riga conta le voci che vedi e dice «Ti restano X (entrate − uscite)». Si aggiorna subito quando cambi filtro o cerchi.",
      },
      {
        title: "Tocca un movimento ✏️",
        message: "Tocca un movimento per modificarlo: categoria, importo, data, descrizione, persona, conto e nota. In fondo al pannello puoi anche eliminarlo.",
      },
      {
        target: "[data-tour='tx-filters']",
        title: "Filtri",
        message: "Filtra per tipo (Entrate / Uscite / Senza categoria) o cerca una transazione per nome o categoria.",
      },
      {
        target: "[data-tour='tx-add']",
        title: "Aggiungi movimenti",
        message: "Aggiungi a mano, importa il file della banca o fai leggere una foto o un PDF dell'estratto conto. All'import Flusso salta i movimenti già caricati e ti segnala i possibili doppioni.",
      },
      {
        title: "Categorie che si ricordano",
        message: "Quando cambi la categoria di un movimento, Flusso ti chiede se ricordarla: da lì in poi i movimenti simili, anche quelli dei prossimi import, vanno da soli nella categoria giusta.",
      },
    ],
  },

  "/dashboard/smart": {
    version: "3.2",
    whatIsNew: "ogni voce dice a che punto sei, le rate si inseriscono con «quanto pago al mese e fino a quando» e gli Accantonamenti ora si chiamano Spese dell'anno",
    freePreview: [
      {
        title: "Pianifica 🗓️",
        message: "Qui decidi in anticipo dove vanno i tuoi soldi. Spese fisse e un obiettivo di risparmio sono inclusi nel piano gratuito.",
      },
      {
        target: "[data-tour='smart-spese-fisse']",
        title: "Spese fisse 📋",
        message: "Affitto, bollette, telefono, abbonamenti. Flusso trova da solo quelle che si ripetono nei tuoi movimenti e ti dice quando sono pagate.",
      },
      {
        target: "[data-tour='smart-budget']",
        title: "Budget, rate e spese dell'anno",
        message: "Con Premium imposti quanto spendere per categoria, segui rate e spese dell'anno (assicurazione, bollo…), e la dashboard ti dice quanto puoi spendere fino al prossimo stipendio.",
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
        message: "Qui decidi in anticipo dove vanno i tuoi soldi. Ogni voce dice a che punto sei, e quello che imposti diventa il «puoi spendere ancora» della dashboard.",
      },
      {
        target: "[data-tour='smart-spese-fisse']",
        title: "Spese fisse 📋",
        message: "Affitto, bollette, telefono, abbonamenti: quelle che arrivano da sole. Flusso trova da solo quelle che si ripetono nei tuoi movimenti e ti dice quando sono pagate.",
      },
      {
        target: "[data-tour='smart-budget']",
        title: "Il resto delle spese",
        message: "Budget per le spese che cambiano (spesa, ristoranti…), Rate e mutui per i debiti (basta dire quanto paghi al mese e fino a quando), Spese dell'anno per assicurazione, bollo e le altre che arrivano una volta l'anno. Insieme alle spese fisse fanno le \"spese previste\".",
      },
      {
        target: "[data-tour='smart-obiettivi']",
        title: "I tuoi risparmi",
        message: "Obiettivi con cifra e scadenza, e i salvadanai dove tieni i soldi già messi da parte.",
      },
    ],
  },

  "/dashboard/salvadanai": {
    version: "1.1",
    whatIsNew: "un obiettivo collegato vale quello che c'è nel suo salvadanaio, e dalla dashboard il tasto Emergenza ti aiuta con gli imprevisti",
    steps: [
      {
        title: "Salvadanai 🐷",
        message: "Tieni separati i soldi messi da parte: vacanza, emergenze, spese dell'anno… Un salvadanaio collegato a un obiettivo fa salire (o scendere) anche l'obiettivo.",
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
    version: "1.6",
    whatIsNew: "nomi più chiari: «Questa persona sono io» per indicare te tra i componenti, «Funzioni avanzate» al posto di Modalità smanettone",
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
        message: "Aggiungi i membri della famiglia o del gruppo, con nome, colore e — se vuoi — le info sul reddito. Aggiungi anche te stesso e spunta \"Questa persona sono io\": da quel momento import Excel e salvadanai condivisi ti chiederanno sempre di scegliere una persona precisa invece del generico \"Io\", e il tuo reddito si gestisce da qui.",
      },
      {
        target: "[data-tour='account-power-user']",
        title: "Funzioni avanzate",
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
