// Posti dell'offerta Founder (49 € una volta sola): valgono solo per i primi FOUNDER_SEATS.
// Il numero dei posti presi viene dal server (lib/founder-seats-server.ts), mai scritto a mano.
// Il numero dei posti rimasti si mostra solo quando ne restano pochi: un "48 su 50"
// direbbe soltanto che quasi nessuno l'ha preso.

import { FOUNDER_SEATS } from "./config";

/** Sotto questa soglia di posti rimasti si mostra il numero. */
export const FOUNDER_SEATS_SHOW_BELOW = 10;

export type FounderSeats = {
  total: number;
  /** posti rimasti, null se il conteggio non è disponibile */
  left: number | null;
  soldOut: boolean;
  /** riga da mostrare sulla card del piano */
  note: string;
};

export function founderSeatsInfo(taken: number | null, total: number = FOUNDER_SEATS): FounderSeats {
  const generic = `Solo per i primi ${total}`;
  if (taken === null || !Number.isFinite(taken) || taken < 0) {
    return { total, left: null, soldOut: false, note: generic };
  }
  const left = Math.max(0, total - Math.floor(taken));
  if (left === 0) return { total, left, soldOut: true, note: "Posti esauriti" };
  if (left < FOUNDER_SEATS_SHOW_BELOW) {
    return { total, left, soldOut: false, note: left === 1 ? `Resta 1 posto su ${total}` : `Restano ${left} posti su ${total}` };
  }
  return { total, left, soldOut: false, note: generic };
}
