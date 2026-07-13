import type { TourStep } from "@/components/tour/tour-context";

export const DASHBOARD_TOUR_STEPS: TourStep[] = [
  {
    title: "Benvenuto in Flusso! 👋",
    message: "Ti guidiamo in pochi secondi attraverso le funzioni principali. Clicca Avanti — o tocca lo schermo — per continuare.",
  },
  {
    target: "[data-tour='hero']",
    title: "Le tue spese del mese",
    message: "Qui vedi il totale delle uscite del periodo corrente e il tuo score finanziario — un indicatore rapido della salute delle tue finanze.",
  },
  {
    target: "[data-tour='breakdown']",
    title: "Dove vanno i soldi",
    message: "Questo pannello mostra la ripartizione delle spese per categoria. Clicca su una voce per vedere le singole transazioni.",
  },
  {
    target: "[data-tour='nav-transazioni']",
    title: "Aggiungi le transazioni",
    message: "Da qui puoi aggiungere movimenti manualmente o importare l'estratto conto Excel della tua banca. È il punto di partenza.",
  },
  {
    target: "[data-tour='nav-smart']",
    title: "Analisi Smart",
    message: "Smart contiene previsioni di budget, monitoraggio delle spese ricorrenti (bollette, abbonamenti…) e obiettivi di risparmio.",
  },
  {
    title: "Sei pronto! 🚀",
    message: "Inizia aggiungendo le tue prime transazioni. Più dati hai, più accurate saranno le analisi. Buona gestione!",
  },
];
