// "Puoi spendere ancora X € fino al 26 nov · circa Y € al giorno": il numero grande della dashboard.
//
// X viene da projectPeriodEnd (lib/calculations.ts):
//   leftToSpend = spese previste − spese fatte finora (quanto resta del budget del periodo)
//   endBalance + leftToSpend = saldo di oggi + entrate ancora attese − spese fisse e rate ancora da pagare
// cioè i soldi che restano davvero per le spese libere. X è il più piccolo dei due:
// non si dice mai "puoi spendere" più di quello che c'è (o arriverà) sul conto.
// Y = X diviso i giorni che restano, oggi compreso.
//
// Tutte le date sono YYYY-MM-DD (lib/dates.ts): i giorni si contano sul calendario,
// così il cambio dell'ora (giorni di 23 o 25 ore) non sposta il conto.

/** Giorni di calendario da `a` a `b` (b − a), date YYYY-MM-DD. */
export function daysBetweenISO(a: string, b: string): number {
  const ms =
    Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) -
    Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  return Math.round(ms / 86_400_000);
}

/** Giorni che restano fino a `lastDay` compreso, contando anche oggi. Mai meno di 1. */
export function daysLeftInclusive(today: string, lastDay: string): number {
  return Math.max(1, daysBetweenISO(today, lastDay) + 1);
}

/** Quanto si può spendere al giorno, arrotondato per difetto al centesimo. */
export function dailyAllowance(amount: number, today: string, lastDay: string): number {
  if (!(amount > 0)) return 0;
  const days = daysLeftInclusive(today, lastDay);
  return Math.floor((amount / days) * 100 + 1e-9) / 100;
}

export type Spendable =
  /** Nessun budget per le spese libere: non si sa quanto si può spendere. */
  | { kind: "no-budget" }
  /** Budget del periodo superato di `amount`. */
  | { kind: "over"; amount: number; days: number }
  /** C'è budget, ma sul conto non resta niente per le spese libere (spese fisse da pagare comprese). */
  | { kind: "short"; amount: number; days: number }
  /** Si possono spendere ancora `amount` €, circa `perDay` al giorno. `capped`: limitato dai soldi sul conto, non dal budget. */
  | { kind: "ok"; amount: number; perDay: number; days: number; capped: boolean };

export function spendable(p: {
  /** Budget delle spese libere del periodo (spese previste meno spese fisse e rate). */
  flexiblePlanned: number;
  leftToSpend: number;
  endBalance: number;
  today: string;
  periodTo: string;
}): Spendable {
  if (!(p.flexiblePlanned > 0)) return { kind: "no-budget" };
  const days = daysLeftInclusive(p.today, p.periodTo);
  if (p.leftToSpend <= 0) return { kind: "over", amount: round2(-p.leftToSpend), days };
  const available = p.endBalance + p.leftToSpend;
  if (available <= 0) return { kind: "short", amount: round2(-available), days };
  const capped = available < p.leftToSpend;
  const amount = round2(capped ? available : p.leftToSpend);
  return { kind: "ok", amount, perDay: dailyAllowance(amount, p.today, p.periodTo), days, capped };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const MONTHS = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

/** "26 nov" da una data YYYY-MM-DD, uguale su server e browser (niente Intl). */
export function shortDay(iso: string): string {
  return `${+iso.slice(8, 10)} ${MONTHS[+iso.slice(5, 7) - 1]}`;
}

/**
 * Etichetta del periodo in dashboard. `to` è l'ultimo giorno del periodo (il giorno prima
 * dello stipendio): "Fino al prossimo stipendio (26 nov)", o "Fino a fine mese (30 nov)"
 * con il mese solare (payDay 0).
 */
export function periodEndLabel(payDay: number, to: string): string {
  return payDay === 0 ? `Fino a fine mese (${shortDay(to)})` : `Fino al prossimo stipendio (${shortDay(to)})`;
}
