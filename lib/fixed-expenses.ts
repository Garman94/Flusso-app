// Spese fisse: affitto, bollette, telefono, abbonamenti. Stanno in recurring_expenses come le
// Rate (debt_type) e gli Accantonamenti (next_due_date), ma senza nessuno dei due.
// Qui: in quale periodo cadono, se sono già state pagate (riconosciute nei movimenti), quanto
// pesano sulla stima di fine periodo, e la ricerca delle spese che si ripetono ogni mese.
//
// Perché non nel Budget: una bolletta ogni due mesi da 120 € nel Budget diventa 60 € al mese,
// quindi un mese sembri sotto e l'altro sopra; e il Budget non sa dire se è già stata pagata.

import { monthsPerCycle } from "./calculations";
import { normalizeText, ruleKeyword } from "./categorize";

export type PlanItem = {
  id: string;
  name: string;
  tipologia: string;
  frequency: string;
  custom_days: number | null;
  amount: number;
  amount_max: number | null;
  due_day: number | null;
  due_month: number | null;
  match_keywords: string[] | null;
  secondary_name: string | null;
  end_date: string | null;
  last_paid_date: string | null;
  debt_type: string | null;
  next_due_date: string | null;
  category_id?: string | null;
};

export type PlanTx = {
  date: string;
  amount: number;
  description?: string | null;
  merchant?: string | null;
  category_id?: string | null;
};

/** Né Rata né Accantonamento, e non un'entrata (il reddito si imposta in Account). */
export function isFixedExpense(it: Pick<PlanItem, "debt_type" | "next_due_date" | "tipologia">): boolean {
  return !it.debt_type && !it.next_due_date && it.tipologia !== "entrata";
}

/** Importo previsto per una volta: il punto medio se l'importo cambia (es. bollette). */
export function expectedAmount(it: Pick<PlanItem, "tipologia" | "amount" | "amount_max">): number {
  return it.tipologia === "variabile" && it.amount_max != null
    ? (Number(it.amount) + Number(it.amount_max)) / 2
    : Number(it.amount);
}

/** Parole con cui riconoscere la voce nei movimenti, normalizzate. */
export function planKeywords(it: Pick<PlanItem, "match_keywords" | "secondary_name">): string[] {
  const out: string[] = [];
  for (const k of [...(it.match_keywords ?? []), it.secondary_name ?? ""]) {
    const v = normalizeText(k);
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

/** Parole corte (< 6 lettere) valgono solo intere: "tim" sì in "TIM SPA", no in "TIMBRIFICIO". */
export function matchesKeywords(tx: PlanTx, keywords: string[]): boolean {
  const text = ` ${normalizeText(`${tx.description ?? ""} ${tx.merchant ?? ""}`)} `;
  return keywords.some(v => v.length > 0 && (text.includes(` ${v} `) || (v.length >= 6 && text.includes(v))));
}

// ── Date ────────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");

/** Giorno `day` del mese, spostato all'ultimo se il mese è più corto (31 → 30 aprile). */
function dateIn(y: number, m0: number, day: number): string {
  const last = new Date(y, m0 + 1, 0).getDate();
  return `${y}-${pad(m0 + 1)}-${pad(Math.min(day, last))}`;
}

function addDaysISO(iso: string, n: number): string {
  const d = new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function daysBetween(a: string, b: string): number {
  const ms = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10))
    - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  return Math.round(ms / 86_400_000);
}

/** Mesi (anno, mese 0-11) toccati dall'intervallo [from, to]. */
function monthsTouched(from: string, to: string): [number, number][] {
  let y = +from.slice(0, 4), m = +from.slice(5, 7) - 1;
  const ey = +to.slice(0, 4), em = +to.slice(5, 7) - 1;
  const out: [number, number][] = [];
  while (y < ey || (y === ey && m <= em)) {
    out.push([y, m]);
    if (++m === 12) { m = 0; y++; }
  }
  return out;
}

/** Senza un mese di riferimento una spesa ogni N mesi non ha date: si conta in media. */
function isSpread(it: Pick<PlanItem, "frequency" | "custom_days" | "due_month">): boolean {
  return it.frequency === "personalizzata"
    || (monthsPerCycle(it.frequency, it.custom_days) > 1 && !it.due_month);
}

function fallsInMonth(it: Pick<PlanItem, "due_month">, m0: number, n: number): boolean {
  if (n === 1) return true;
  return (((m0 + 1 - (it.due_month ?? 1)) % n) + n) % n === 0;
}

export type PeriodDue = {
  /** quante volte cade nel periodo: 1 per le mensili, 0 o 1 per le altre, frazione se senza data */
  count: number;
  /** date in cui cade, se note */
  dates: string[];
  /** ogni N mesi senza mese di riferimento: contata in media (importo / N) */
  spread: boolean;
};

/**
 * Quante volte la spesa cade nel periodo [from, to]. Le mensili contano una volta per
 * periodo anche quando il giorno di paga sposta i confini di un giorno o due (altrimenti
 * una spesa del 27 con paga il 27 potrebbe cadere in nessun periodo o in due). Le altre
 * cadono nei mesi indicati da `due_month` (il mese di una qualsiasi scadenza) ogni N mesi.
 */
export function dueInPeriod(
  it: Pick<PlanItem, "frequency" | "custom_days" | "due_day" | "due_month" | "end_date">,
  from: string,
  to: string,
): PeriodDue {
  if (it.end_date && it.end_date < from) return { count: 0, dates: [], spread: false };
  const n = monthsPerCycle(it.frequency, it.custom_days);
  if (isSpread(it)) return { count: 1 / n, dates: [], spread: true };
  const day = it.due_day ?? (n > 1 ? 1 : null);
  const dates = day == null ? [] : monthsTouched(from, to)
    .filter(([, m0]) => fallsInMonth(it, m0, n))
    .map(([y, m0]) => dateIn(y, m0, day))
    .filter(d => d >= from && d <= to && (!it.end_date || d <= it.end_date));
  if (n === 1) return { count: 1, dates: dates.slice(0, 1), spread: false };
  return { count: dates.length, dates, spread: false };
}

/** Prossima data (da `today` compreso) in cui cade, o null se non ha una data. */
export function nextDueDate(
  it: Pick<PlanItem, "frequency" | "custom_days" | "due_day" | "due_month" | "end_date">,
  today: string,
): string | null {
  if (isSpread(it)) return null;
  const n = monthsPerCycle(it.frequency, it.custom_days);
  const day = it.due_day ?? (n > 1 ? 1 : null);
  if (day == null) return null;
  let y = +today.slice(0, 4), m = +today.slice(5, 7) - 1;
  for (let i = 0; i < 25; i++) {
    if (fallsInMonth(it, m, n)) {
      const d = dateIn(y, m, day);
      if (d >= today) return it.end_date && d > it.end_date ? null : d;
    }
    if (++m === 12) { m = 0; y++; }
  }
  return null;
}

// ── Pagamenti ───────────────────────────────────────────────────────────────

/**
 * Movimenti che pagano la voce: parola chiave e importo plausibile (da metà a una volta e
 * mezza il previsto), i più vicini all'importo previsto. Il limite sull'importo evita che
 * un acquisto da 300 € su Amazon passi per l'abbonamento Prime.
 */
export function findPayments<T extends PlanTx>(
  it: Pick<PlanItem, "tipologia" | "amount" | "amount_max" | "match_keywords" | "secondary_name">,
  txs: T[],
  max: number,
): T[] {
  const kws = planKeywords(it);
  if (!kws.length || max <= 0) return [];
  const lo = Number(it.amount) * 0.5;
  const hi = Number(it.amount_max ?? it.amount) * 1.5;
  const target = expectedAmount(it);
  const abs = (t: T) => Math.abs(Number(t.amount));
  return txs
    .filter(t => Number(t.amount) < 0 && abs(t) >= lo && abs(t) <= hi && matchesKeywords(t, kws))
    .sort((a, b) => Math.abs(abs(a) - target) - Math.abs(abs(b) - target))
    .slice(0, max);
}

export type PlanState =
  | "paid"          // pagata: trovata nei movimenti o segnata a mano
  | "upcoming"      // deve ancora arrivare
  | "missing"       // la data è passata ma nei movimenti non c'è
  | "unverifiable"  // senza parola chiave: Flusso non può sapere se è pagata
  | "not-due";      // non cade in questo periodo

export type PlanStatus<T extends PlanTx = PlanTx> = {
  item: PlanItem;
  /** importo previsto nel periodo */
  expected: number;
  due: PeriodDue;
  payments: T[];
  paidAmount: number;
  manuallyPaid: boolean;
  state: PlanState;
};

/** Giorni di tolleranza dopo la scadenza: gli addebiti arrivano con qualche giorno di ritardo. */
const GRACE_DAYS = 3;

export function planStatus<T extends PlanTx>(
  it: PlanItem, txs: T[], from: string, to: string, today: string,
): PlanStatus<T> {
  const due = dueInPeriod(it, from, to);
  const expected = expectedAmount(it) * due.count;
  const inPeriod = txs.filter(t => t.date >= from && t.date <= to);
  const payments = due.count > 0 ? findPayments(it, inPeriod, Math.max(1, Math.round(due.count))) : [];
  const paidAmount = payments.reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const manuallyPaid = !!it.last_paid_date && it.last_paid_date >= from && it.last_paid_date <= to;
  const lastDue = due.dates[due.dates.length - 1];
  const state: PlanState =
    due.count === 0 ? "not-due"
    : payments.length > 0 || manuallyPaid ? "paid"
    : planKeywords(it).length === 0 ? "unverifiable"
    : lastDue && addDaysISO(lastDue, GRACE_DAYS) < today ? "missing"
    : "upcoming";
  return { item: it, expected, due, payments, paidAmount, manuallyPaid, state };
}

export type PlanSplit = {
  /** previste nel periodo */
  expected: number;
  /** da pagare e riconoscibili: la stima di fine periodo le toglie a parte */
  remaining: number;
  /** già pagate e trovate nei movimenti: non pesano su "puoi ancora spendere" */
  paidSpent: number;
  /**
   * non verificabili (senza parola chiave, segnate pagate a mano, o contate in media): si
   * sommano alle altre spese previste come prima, così il loro pagamento non viene tolto due volte
   */
  flexible: number;
};

/**
 * `isSpending` dice quali pagamenti sono tra le spese contate dal chiamante: la dashboard
 * esclude i giroconti, quindi un affitto categorizzato come giroconto non va tolto di nuovo.
 */
export function splitPlan<T extends PlanTx>(
  statuses: PlanStatus<T>[],
  isSpending: (t: T) => boolean = () => true,
): PlanSplit {
  const out: PlanSplit = { expected: 0, remaining: 0, paidSpent: 0, flexible: 0 };
  for (const s of statuses) {
    if (s.state === "not-due") continue;
    out.expected += s.expected;
    if (s.due.spread) out.flexible += s.expected;
    else if (s.payments.length > 0) {
      out.paidSpent += s.payments.filter(isSpending).reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);
    }
    else if (s.state === "upcoming" || s.state === "missing") out.remaining += s.expected;
    else out.flexible += s.expected;
  }
  return out;
}

/**
 * Movimenti che pagano una voce di Pianifica (spesa fissa o rata), periodo per periodo:
 * nel Budget non contano, altrimenti affitto o Netflix finirebbero sia nella loro sezione
 * sia nella spesa della loro categoria.
 */
export function planPayments<T extends PlanTx>(
  items: PlanItem[], txs: T[], periods: { from: string; to: string }[],
): Set<T> {
  const out = new Set<T>();
  const withKws = items.filter(it => planKeywords(it).length > 0);
  if (!withKws.length) return out;
  for (const p of periods) {
    const inPeriod = txs.filter(t => t.date >= p.from && t.date <= p.to);
    for (const it of withKws) {
      const due = dueInPeriod(it, p.from, p.to);
      if (due.count === 0) continue;
      for (const t of findPayments(it, inPeriod, Math.max(1, Math.round(due.count)))) out.add(t);
    }
  }
  return out;
}

// ── Ricerca automatica ──────────────────────────────────────────────────────

export type RecurringSuggestion = {
  /** parola che la riconosce nei movimenti */
  keyword: string;
  name: string;
  /** importo tipico, o il minimo se cambia */
  amount: number;
  /** il massimo, se l'importo cambia */
  amountMax: number | null;
  dueDay: number;
  categoryId: string | null;
  occurrences: number;
  lastDate: string;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Distanza tra due giorni del mese su un "orologio" di 31: il 30 e l'1 distano 2. */
function dayDistance(a: number, b: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, 31 - d);
}

function mostCommon<V>(values: V[]): V {
  const counts = new Map<V, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/** "NETFLIX" → "Netflix"; i nomi già scritti bene restano come sono. */
function tidy(s: string): string {
  return s === s.toUpperCase() ? s.toLowerCase().replace(/(^|\s)\p{L}/gu, c => c.toUpperCase()) : s;
}

/**
 * Nome proposto: la descrizione se è breve e comincia col nome del negozio ("Affitto",
 * "Spotify Premium"), altrimenti l'esercente, altrimenti la parola chiave. Le descrizioni
 * delle banche ("PAGAMENTO POS NETFLIX.COM 10/09") non sono un nome.
 */
function prettyName(t: PlanTx, keyword: string): string {
  const d = t.description?.trim();
  if (d && d.length <= 30 && normalizeText(d).startsWith(keyword)) return tidy(d);
  const m = t.merchant?.trim();
  if (m && m.length <= 25) return tidy(m);
  return keyword.replace(/(^|\s)\w/g, c => c.toUpperCase());
}

/**
 * Spese che si ripetono circa una volta al mese (stesso nome, importo e giorno simili) e
 * che nessuna voce di Pianifica copre già: servono a proporre le spese fisse invece di
 * farle scrivere a mano. La spesa al supermercato non passa (più volte al mese), la
 * benzina di solito nemmeno (giorni e importi sparsi).
 */
export function detectRecurring<T extends PlanTx>(
  txs: T[],
  planItems: Pick<PlanItem, "match_keywords" | "secondary_name">[],
  today: string,
  excludeCategoryIds: Set<string> = new Set(),
): RecurringSuggestion[] {
  const since = addDaysISO(today, -200);
  const coveredKws = planItems.flatMap(planKeywords);
  const groups = new Map<string, T[]>();
  for (const t of txs) {
    if (Number(t.amount) >= 0 || t.date < since || t.date > today) continue;
    if (t.category_id && excludeCategoryIds.has(t.category_id)) continue;
    if (coveredKws.length && matchesKeywords(t, coveredKws)) continue;
    const kw = ruleKeyword(t.description || t.merchant || "");
    if (!kw) continue;
    const list = groups.get(kw);
    if (list) list.push(t); else groups.set(kw, [t]);
  }

  const out: RecurringSuggestion[] = [];
  for (const [keyword, list] of groups) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    // una volta al mese: un solo movimento per mese e 20-40 giorni tra uno e l'altro
    if (new Set(sorted.map(t => t.date.slice(0, 7))).size !== sorted.length) continue;
    if (sorted.some((t, i) => i > 0 && !(daysBetween(sorted[i - 1].date, t.date) >= 20 && daysBetween(sorted[i - 1].date, t.date) <= 40))) continue;
    const last = sorted[sorted.length - 1];
    if (daysBetween(last.date, today) > 40) continue; // non la paga più

    const amounts = sorted.map(t => Math.abs(Number(t.amount)));
    const min = Math.min(...amounts), max = Math.max(...amounts);
    if (max > min * 1.6) continue;

    const days = sorted.map(t => +t.date.slice(8, 10));
    const dueDay = [...days].sort((a, b) => a - b)[Math.floor(days.length / 2)];
    if (days.some(d => dayDistance(d, dueDay) > 6)) continue;

    const varies = max > min * 1.05;
    out.push({
      keyword,
      name: prettyName(last, keyword),
      amount: round2(varies ? min : Math.abs(Number(last.amount))),
      amountMax: varies ? round2(max) : null,
      dueDay,
      categoryId: mostCommon(sorted.map(t => t.category_id ?? null)),
      occurrences: sorted.length,
      lastDate: last.date,
    });
  }
  return out.sort((a, b) => (b.amountMax ?? b.amount) - (a.amountMax ?? a.amount));
}
