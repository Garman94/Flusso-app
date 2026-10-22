// Auto e carburante (Pianifica → "Auto e carburante", migration 047): consumi da pieno a pieno,
// costo al km, km fatti per mese e confronto con i tragitti abituali (lavoro, impegni fissi)
// per vedere quanti km sono "extra". Solo funzioni pure: test in tests/carburante.test.ts.

import { addDaysISO } from "@/lib/dates";
import { matchUserRule } from "@/lib/categorize";

export type FuelType = "benzina" | "diesel" | "gpl" | "metano" | "elettrico";

export const FUEL: Record<FuelType, { label: string; unit: string; icon: string }> = {
  benzina: { label: "Benzina", unit: "l", icon: "⛽" },
  diesel: { label: "Diesel", unit: "l", icon: "⛽" },
  gpl: { label: "GPL", unit: "l", icon: "⛽" },
  metano: { label: "Metano", unit: "kg", icon: "⛽" },
  elettrico: { label: "Elettrico", unit: "kWh", icon: "🔌" },
};

export type Refuel = {
  id: string;
  date: string;          // YYYY-MM-DD
  amount: number;        // euro
  quantity: number;      // litri (kg per il metano, kWh per l'elettrico)
  price: number;         // euro per unità
  odometer_km: number | null;
  trip_km: number | null; // km fatti dal rifornimento precedente
  full_tank: boolean;
  transaction_id?: string | null;
};

export type Routine = {
  id: string;
  name: string;
  km: number;              // solo andata se round_trip
  round_trip: boolean;
  kind: "days" | "weekly";
  weekdays: number[];      // 1 = lunedì … 7 = domenica (kind "days")
  times_per_week: number | null; // kind "weekly"
  start_date: string | null;
  end_date: string | null;
};

export type Pause = { from_date: string; to_date: string };

const round2 = (n: number) => Math.round(n * 100) / 100;

// ── Rifornimento: euro, quantità, prezzo ─────────────────────────────────────

/**
 * Al distributore si leggono di solito euro e prezzo al litro: dati due valori su tre, il terzo si
 * calcola. Con tutti e tre si tengono euro e quantità e il prezzo si ricalcola. Null se ne manca più di uno.
 */
export function completeRefuel(v: { amount?: number | null; quantity?: number | null; price?: number | null }):
  { amount: number; quantity: number; price: number } | null {
  const ok = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;
  const { amount, quantity, price } = v;
  if (ok(amount) && ok(quantity)) return { amount: round2(amount), quantity: Math.round(quantity * 1000) / 1000, price: Math.round((amount / quantity) * 1000) / 1000 };
  if (ok(amount) && ok(price)) return { amount: round2(amount), quantity: Math.round((amount / price) * 1000) / 1000, price };
  if (ok(quantity) && ok(price)) return { amount: round2(quantity * price), quantity, price };
  return null;
}

// ── Km e consumi ─────────────────────────────────────────────────────────────

export function sortRefuels<T extends Refuel>(refuels: T[]): T[] {
  return [...refuels].sort((a, b) => a.date.localeCompare(b.date) || (a.odometer_km ?? 0) - (b.odometer_km ?? 0));
}

/**
 * Km fatti prima di ogni rifornimento (stesso ordine di `sortRefuels`): quelli scritti come
 * "km percorsi", altrimenti la differenza col contachilometri del rifornimento precedente.
 */
export function refuelDistances(sorted: Refuel[]): (number | null)[] {
  return sorted.map((r, i) => {
    if (r.trip_km && r.trip_km > 0) return r.trip_km;
    const prev = sorted[i - 1];
    if (r.odometer_km != null && prev?.odometer_km != null && r.odometer_km > prev.odometer_km) return r.odometer_km - prev.odometer_km;
    return null;
  });
}

export type ConsumptionWindow = {
  from: string | null;   // data del pieno precedente (null se è il primo rifornimento registrato)
  to: string;            // data del pieno che chiude il tratto
  endId: string;
  km: number;
  quantity: number;
  amount: number;
  kmPerUnit: number;
  per100: number;
  costPerKm: number;
};

/**
 * Consumo da pieno a pieno: dopo un pieno, il carburante messo fino al pieno successivo (compreso)
 * è quello consumato nei km fatti in mezzo. I rifornimenti parziali entrano nel tratto. Un tratto
 * vale solo se si conoscono i km di tutti i suoi rifornimenti.
 */
export function fullToFull(refuels: Refuel[]): ConsumptionWindow[] {
  const sorted = sortRefuels(refuels);
  const dist = refuelDistances(sorted);
  const out: ConsumptionWindow[] = [];
  let start = 0;
  let from: string | null = null;
  for (let i = 0; i < sorted.length; i++) {
    if (!sorted[i].full_tank) continue;
    const part = sorted.slice(start, i + 1);
    const kms = dist.slice(start, i + 1);
    if (kms.every(k => k != null && k > 0)) {
      const km = kms.reduce((s: number, k) => s + (k ?? 0), 0);
      const quantity = part.reduce((s, r) => s + r.quantity, 0);
      const amount = part.reduce((s, r) => s + r.amount, 0);
      out.push({
        from, to: sorted[i].date, endId: sorted[i].id, km, quantity: round2(quantity), amount: round2(amount),
        kmPerUnit: km / quantity, per100: (quantity / km) * 100, costPerKm: amount / km,
      });
    }
    start = i + 1;
    from = sorted[i].date;
  }
  return out;
}

export type FuelSummary = {
  km: number;
  quantity: number;
  amount: number;
  kmPerUnit: number | null;
  per100: number | null;
  costPerKm: number | null;
  /** quanti tratti da pieno a pieno ci sono dietro la media */
  windows: number;
};

/** Media pesata su tutti i tratti da pieno a pieno; se non ce n'è nessuno, costo al km sui rifornimenti con i km. */
export function fuelSummary(refuels: Refuel[]): FuelSummary {
  const windows = fullToFull(refuels);
  if (windows.length) {
    const km = windows.reduce((s, w) => s + w.km, 0);
    const quantity = windows.reduce((s, w) => s + w.quantity, 0);
    const amount = windows.reduce((s, w) => s + w.amount, 0);
    return { km, quantity, amount, kmPerUnit: km / quantity, per100: (quantity / km) * 100, costPerKm: amount / km, windows: windows.length };
  }
  const sorted = sortRefuels(refuels);
  const dist = refuelDistances(sorted);
  let km = 0, amount = 0, quantity = 0;
  sorted.forEach((r, i) => { if (dist[i]) { km += dist[i]!; amount += r.amount; quantity += r.quantity; } });
  return { km, quantity, amount, kmPerUnit: null, per100: null, costPerKm: km > 0 ? amount / km : null, windows: 0 };
}

// ── Tragitti abituali ────────────────────────────────────────────────────────

/** 1 = lunedì … 7 = domenica, senza fusi orari. */
export function weekdayISO(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return js === 0 ? 7 : js;
}

export function isPaused(iso: string, pauses: Pause[]): boolean {
  return pauses.some(p => iso >= p.from_date && iso <= p.to_date);
}

/** Km di un tragitto abituale in un giorno. Quelli "N volte a settimana" si spalmano su tutti i giorni. */
export function routineKmOnDay(r: Routine, iso: string): number {
  if (r.start_date && iso < r.start_date) return 0;
  if (r.end_date && iso > r.end_date) return 0;
  const trip = r.km * (r.round_trip ? 2 : 1);
  if (r.kind === "days") return r.weekdays.includes(weekdayISO(iso)) ? trip : 0;
  return ((r.times_per_week ?? 0) * trip) / 7;
}

/** Km abituali tra due date (estremi compresi), saltando le pause. */
export function routineKm(routines: Routine[], pauses: Pause[], from: string, to: string): { total: number; byRoutine: Record<string, number> } {
  const byRoutine: Record<string, number> = {};
  let total = 0;
  for (let d = from; d <= to; d = addDaysISO(d, 1)) {
    if (isPaused(d, pauses)) continue;
    for (const r of routines) {
      const km = routineKmOnDay(r, d);
      if (!km) continue;
      byRoutine[r.id] = (byRoutine[r.id] ?? 0) + km;
      total += km;
    }
  }
  return { total, byRoutine };
}

/** Km fatti per giorno: i km di ogni rifornimento spalmati sui giorni dal rifornimento precedente. */
export function dailyKm(refuels: Refuel[]): Map<string, number> {
  const sorted = sortRefuels(refuels);
  const dist = refuelDistances(sorted);
  const out = new Map<string, number>();
  for (let i = 1; i < sorted.length; i++) {
    const km = dist[i];
    if (!km) continue;
    const from = addDaysISO(sorted[i - 1].date, 1);
    const to = sorted[i].date;
    if (from > to) continue; // due rifornimenti nello stesso giorno: i km vanno col primo
    let days = 0;
    for (let d = from; d <= to; d = addDaysISO(d, 1)) days++;
    for (let d = from; d <= to; d = addDaysISO(d, 1)) out.set(d, (out.get(d) ?? 0) + km / days);
  }
  return out;
}

export type MonthComparison = {
  month: string;        // YYYY-MM
  coveredDays: number;  // giorni del mese di cui si conoscono i km fatti
  km: number;           // km fatti nei giorni coperti
  routineKm: number;    // km abituali negli stessi giorni
  extraKm: number;      // km - routineKm (può essere negativo se un'abitudine non c'è stata)
};

/**
 * Per ogni mese, km fatti contro km abituali negli stessi giorni: si confrontano solo i giorni
 * tra due rifornimenti, perché dopo l'ultimo i km non si conoscono ancora.
 */
export function monthlyComparison(refuels: Refuel[], routines: Routine[], pauses: Pause[]): MonthComparison[] {
  const days = dailyKm(refuels);
  const byMonth = new Map<string, MonthComparison>();
  for (const [d, km] of days) {
    const month = d.slice(0, 7);
    const row = byMonth.get(month) ?? { month, coveredDays: 0, km: 0, routineKm: 0, extraKm: 0 };
    row.coveredDays += 1;
    row.km += km;
    if (!isPaused(d, pauses)) row.routineKm += routines.reduce((s, r) => s + routineKmOnDay(r, d), 0);
    byMonth.set(month, row);
  }
  return [...byMonth.values()]
    .map(r => ({ ...r, km: round2(r.km), routineKm: round2(r.routineKm), extraKm: round2(r.km - r.routineKm) }))
    .sort((a, b) => b.month.localeCompare(a.month));
}

// ── Rifornimenti nei movimenti della banca ───────────────────────────────────

/** Distributori e parole del carburante: le parole corte valgono solo intere (come in lib/categorize).
 *  Niente "api": i distributori api oggi sono IP, e "api" sono anche gli insetti. */
const FUEL_WORDS = [
  "eni", "enilive", "agip", "q8", "ip", "esso", "shell", "tamoil", "repsol", "erg", "totalerg", "beyfin",
  "keropetrol", "costantin", "carburante", "carburanti", "benzina", "gasolio", "rifornimento", "stazione di servizio",
];
const FUEL_RULES = FUEL_WORDS.map(value => ({ value, category_id: "fuel" }));

export function isFuelPurchase(description: string): boolean {
  return matchUserRule(description, FUEL_RULES) !== null;
}
