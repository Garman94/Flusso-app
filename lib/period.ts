// Pay-period computation shared by server pages and client components.

function adjustBizDay(date: Date): Date {
  const dow = date.getDay();
  if (dow === 6) return new Date(date.getTime() - 86_400_000); // Sat → Fri
  if (dow === 0) return new Date(date.getTime() + 86_400_000); // Sun → Mon
  return date;
}

function fmt(d: Date): string { return d.toISOString().split("T")[0]; }

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
    to:   fmt(new Date(nextStart.getTime() - 86_400_000)),
  };
}

/**
 * Returns the anchor year/month for the currently active pay period.
 *   payDay = 0  → current calendar month
 *   payDay 1-28 → month where the current pay period started
 */
export function getCurrentPeriodAnchor(payDay: number): { year: number; month: number } {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth(); // 0-indexed
  if (payDay === 0) return { year: y, month: m };
  let start = adjustBizDay(new Date(y, m, payDay));
  if (today < start) {
    start = adjustBizDay(new Date(y, m - 1, payDay));
  }
  return { year: start.getFullYear(), month: start.getMonth() };
}
