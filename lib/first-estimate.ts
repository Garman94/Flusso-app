// Prima stima del benvenuto: "Puoi spendere circa X fino al …", quando di un nuovo iscritto
// sappiamo solo il saldo di oggi e (forse) il giorno dello stipendio. Nessun movimento,
// nessuna spesa fissa: per questo è prudente (tiene da parte una quota) e la pagina dice
// sempre cosa non sa ancora. Appena ci sono i movimenti la dashboard fa i conti veri.

import { rollBalance } from "./calculations";
import { addDaysISO } from "./dates";
import { currentPeriod } from "./period";

/** Quota del saldo tenuta da parte per gli imprevisti. */
export const ESTIMATE_RESERVE_SHARE = 0.1;

export type FirstEstimate = {
  /** saldo di oggi scritto dall'utente */
  balance: number;
  /** quanto si può spendere fino a `until`, arrotondato per difetto alle decine; mai sotto zero */
  canSpend: number;
  /** quanto resta da parte: almeno il 10% del saldo (più l'arrotondamento) */
  reserve: number;
  /** canSpend diviso i giorni che restano, per difetto */
  perDay: number;
  /** primo giorno del periodo di paga in corso (YYYY-MM-DD): lì si salva il saldo, come fa la card */
  from: string;
  /** ultimo giorno del periodo di paga (YYYY-MM-DD): il giorno prima del prossimo stipendio */
  until: string;
  /** giorni da oggi a `until`, entrambi compresi */
  days: number;
};

function fromISO(iso: string): Date {
  return new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
}

/** Giorni di calendario tra due date ISO (b − a), senza sorprese con l'ora legale. */
function daysBetween(a: string, b: string): number {
  const utc = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  return Math.round((utc(b) - utc(a)) / 86_400_000);
}

/**
 * Stima di quanto si può spendere da oggi alla fine del periodo di paga.
 * `payDay` 0 = mese solare (anche quando l'utente non ha risposto), 1-28 = giorno dello stipendio.
 * Senza saldo non c'è stima (null).
 */
export function firstSpendEstimate(balanceToday: number | null, payDay: number, today: string): FirstEstimate | null {
  if (balanceToday === null || !Number.isFinite(balanceToday)) return null;
  const { from, to: until } = currentPeriod(payDay, fromISO(today));
  const days = Math.max(1, daysBetween(today, until) + 1);
  const spendable = balanceToday > 0 ? balanceToday * (1 - ESTIMATE_RESERVE_SHARE) : 0;
  const canSpend = Math.floor(spendable / 10) * 10;
  return {
    balance: balanceToday,
    canSpend,
    reserve: Math.max(0, Math.round((balanceToday - canSpend) * 100) / 100),
    perDay: Math.floor(canSpend / days),
    from,
    until,
    days,
  };
}

/**
 * Saldo a inizio periodo partendo da quello di oggi, come la card del saldo in dashboard:
 * i movimenti già registrati da inizio periodo a oggi (compreso) vengono tolti.
 */
export function balanceAtPeriodStart(
  balanceToday: number,
  today: string,
  periodFrom: string,
  txs: { date: string; amount: number }[],
): number {
  return rollBalance(balanceToday, addDaysISO(today, 1), periodFrom, txs);
}
