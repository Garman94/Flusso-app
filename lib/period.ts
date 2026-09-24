// Pay-period computation shared by server pages and client components.
// È l'unica fonte per i periodi: dashboard, transazioni, Pianifica e budget la usano tutti,
// così "questo mese" è lo stesso intervallo in ogni schermata.

import { toISODate } from "./dates";

/** Somma giorni di calendario (non 24 ore: con l'ora legale un giorno può durarne 23 o 25). */
function addDays(date: Date, n: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
}

function adjustBizDay(date: Date): Date {
  const dow = date.getDay();
  if (dow === 6) return addDays(date, -1); // Sat → Fri
  if (dow === 0) return addDays(date, 1);  // Sun → Mon
  return date;
}

function fmt(d: Date): string { return toISODate(d); }

export type PeriodRange = { from: string; to: string };

/**
 * Compute the date range for the period whose "anchor" month is anchorYear/anchorMonth.
 *   payDay = 0  → standard calendar month
 *   payDay 1-28 → pay period starting on that day (weekend-adjusted)
 */
export function computePeriodRange(payDay: number, anchorYear: number, anchorMonth: number): PeriodRange {
  if (payDay === 0) {
    return {
      from: fmt(new Date(anchorYear, anchorMonth, 1)),
      to:   fmt(new Date(anchorYear, anchorMonth + 1, 0)),
    };
  }
  const start    = adjustBizDay(new Date(anchorYear, anchorMonth, payDay));
  const nextStart = adjustBizDay(new Date(anchorYear, anchorMonth + 1, payDay));
  return {
    from: fmt(start),
    to:   fmt(addDays(nextStart, -1)),
  };
}

/**
 * Returns the anchor year/month for the currently active pay period.
 *   payDay = 0  → current calendar month
 *   payDay 1-28 → month where the current pay period started
 */
export function getCurrentPeriodAnchor(payDay: number, now: Date = new Date()): { year: number; month: number } {
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-indexed
  if (payDay === 0) return { year: y, month: m };
  const today = new Date(y, m, now.getDate());
  let start = adjustBizDay(new Date(y, m, payDay));
  if (today < start) {
    start = adjustBizDay(new Date(y, m - 1, payDay));
  }
  return { year: start.getFullYear(), month: start.getMonth() };
}

/** Periodo corrente (from/to) più l'ancora, in un colpo solo. */
export function currentPeriod(payDay: number, now: Date = new Date()): PeriodRange & { year: number; month: number } {
  const anchor = getCurrentPeriodAnchor(payDay, now);
  return { ...computePeriodRange(payDay, anchor.year, anchor.month), ...anchor };
}

export type PeriodBucket = PeriodRange & { year: number; month: number };

/**
 * Gli ultimi `count` periodi PRIMA di quello indicato dall'ancora (il più recente per primo).
 * `month` è 1-12, per lo storico del budget.
 */
export function previousPeriods(payDay: number, anchorYear: number, anchorMonth: number, count: number): PeriodBucket[] {
  const out: PeriodBucket[] = [];
  for (let i = 1; i <= count; i++) {
    const d = new Date(anchorYear, anchorMonth - i, 1);
    out.push({ ...computePeriodRange(payDay, d.getFullYear(), d.getMonth()), year: d.getFullYear(), month: d.getMonth() + 1 });
  }
  return out;
}
