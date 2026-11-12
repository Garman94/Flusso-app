// Copertina di Pianifica: una riga di stato per sezione al posto dei conteggi.
// "2 da pagare questa settimana", "320 € rimasti", "Assicurazione tra 2 mesi": quello che
// serve sapere senza aprire la sezione. Tutto calcolato dai dati che la pagina ha già.
//
// Ogni funzione restituisce null quando la sezione non è ancora impostata: allora la
// copertina mostra la descrizione di sempre ("a cosa serve").

import { categoryKind } from "./money";
import { addDaysISO, toISODate } from "./dates";
import { computeDebtProgress } from "./calculations";
import { planStatus, nextDueDate, type PlanItem, type PlanTx, type PlanStatus } from "./fixed-expenses";

export type CoverTone = "ok" | "warn" | "neutral";
export type CoverStatus = { text: string; tone: CoverTone } | null;

// ── Aiutanti ────────────────────────────────────────────────────────────────

const MONTHS = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

/** "2027-03-27" → "mar 2027" */
export function monthYear(iso: string): string {
  return `${MONTHS[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}`;
}

/** "2026-11-27" → "27 nov" */
export function dayMonth(iso: string): string {
  return `${+iso.slice(8, 10)} ${MONTHS[+iso.slice(5, 7) - 1]}`;
}

/** Mesi di calendario tra due date ISO: da novembre a gennaio sono 2. */
function calendarMonths(from: string, to: string): number {
  return (+to.slice(0, 4) - +from.slice(0, 4)) * 12 + (+to.slice(5, 7) - +from.slice(5, 7));
}

// useGrouping "always": Node scriverebbe "1150 €" e il browser "1.150 €" (errore di idratazione).
const EURO0 = new Intl.NumberFormat("it-IT", {
  style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: "always",
});
/** Euro senza centesimi: sulla copertina basta l'ordine di grandezza. */
export const euro0 = (n: number) => EURO0.format(Math.round(n) || 0);

// ── Budget ──────────────────────────────────────────────────────────────────

/** Le categorie di entrata e di giroconto (lib/money.ts) non hanno senso come voce di budget. */
export const isBudgetCategory = (name: string) => categoryKind(name) === "expense";

/** Spesa netta: le spese meno i rimborsi della stessa categoria, mai sotto zero. */
export const netSpent = (txs: { amount: number | string }[]) =>
  Math.max(0, txs.reduce((s, t) => s - Number(t.amount), 0));

type BudgetCat = { id: string; name: string };
type BudgetTx = { date: string; amount: number; category_id?: string | null };

/**
 * Spesa del periodo per ogni categoria di budget, senza i movimenti che pagano spese fisse
 * e rate (`excluded`, da `planPayments`): quelli hanno la loro sezione.
 */
export function budgetSpend<T extends BudgetTx>(
  categories: BudgetCat[], txs: T[], from: string, to: string, excluded: Set<T>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of categories) {
    if (!isBudgetCategory(c.name)) continue;
    out[c.id] = netSpent(txs.filter(t => t.category_id === c.id && t.date >= from && t.date <= to && !excluded.has(t)));
  }
  return out;
}

/**
 * Budget del periodo e speso, come nella card "Budget del periodo". Per la categoria
 * Accantonamenti il budget è la quota del mese (`sinkingQuota`), non quello salvato.
 */
export function budgetTotals(
  categories: BudgetCat[],
  budgets: Record<string, number>,
  spend: Record<string, number>,
  accantonamentiId: string | null,
  sinkingQuota: number,
): { budget: number; spent: number; remaining: number } {
  let budget = 0, spent = 0;
  for (const c of categories) {
    if (!isBudgetCategory(c.name)) continue;
    budget += c.id === accantonamentiId ? sinkingQuota : Number(budgets[c.id] ?? 0);
    spent += spend[c.id] ?? 0;
  }
  return { budget, spent, remaining: budget - spent };
}

export function budgetStatus(t: { budget: number; remaining: number }): CoverStatus {
  if (t.budget <= 0) return null;
  if (Math.round(t.remaining) >= 0) return { text: `${euro0(t.remaining)} rimasti`, tone: "ok" };
  return { text: `${euro0(-t.remaining)} oltre il budget`, tone: "warn" };
}

// ── Spese fisse ─────────────────────────────────────────────────────────────

/** Ultima data in cui la voce cade nel periodo (come `planStatus` per "mancante"). */
const lastDate = (s: PlanStatus) => s.due.dates[s.due.dates.length - 1] ?? null;

/**
 * Spese fisse del periodo: prima quelle che dovevano già arrivare, poi quelle di questa
 * settimana, poi la prossima. `items` sono già le sole spese fisse (`isFixedExpense`).
 * `suggestions` = spese trovate nei movimenti e non ancora aggiunte.
 */
export function fixedStatus<T extends PlanTx>(
  items: PlanItem[], txs: T[], from: string, to: string, today: string, suggestions = 0,
): CoverStatus {
  if (!items.length) {
    if (suggestions <= 0) return null;
    return { text: `${suggestions} ${suggestions === 1 ? "trovata" : "trovate"} nei tuoi movimenti`, tone: "neutral" };
  }
  const due = items.map(it => planStatus(it, txs, from, to, today)).filter(s => s.state !== "not-due");

  if (!due.length) {
    // Niente in questo periodo: la prima che arriva nel prossimo.
    const after = addDaysISO(to, 1);
    const next = items
      .map(it => ({ it, d: nextDueDate(it, after) }))
      .filter((x): x is { it: PlanItem; d: string } => !!x.d)
      .sort((a, b) => a.d.localeCompare(b.d))[0];
    return next ? { text: `Prossima: ${next.it.name} il ${dayMonth(next.d)}`, tone: "neutral" } : null;
  }

  const weekEnd = addDaysISO(today, 7);
  const missing = due.filter(s => s.state === "missing");
  const upcoming = due.filter(s => s.state === "upcoming");
  const thisWeek = upcoming.filter(s => { const d = lastDate(s); return !!d && d <= weekEnd; });

  if (missing.length) {
    const n = missing.length;
    const head = `${n} ${n === 1 ? "doveva già arrivare" : "dovevano già arrivare"}`;
    return { text: thisWeek.length ? `${head} · ${thisWeek.length} in arrivo questa settimana` : head, tone: "warn" };
  }
  if (thisWeek.length) return { text: `${thisWeek.length} da pagare questa settimana`, tone: "neutral" };
  if (upcoming.length) {
    const dated = upcoming
      .map(s => ({ s, d: lastDate(s) }))
      .filter((x): x is { s: PlanStatus<T>; d: string } => !!x.d)
      .sort((a, b) => a.d.localeCompare(b.d))[0];
    return dated
      ? { text: `Prossima: ${dated.s.item.name} il ${dayMonth(dated.d)}`, tone: "neutral" }
      : { text: `${upcoming.length} da pagare in questo periodo`, tone: "neutral" };
  }

  // Restano pagate e non verificabili (senza movimento collegato Flusso non sa se sono pagate).
  const paid = due.filter(s => s.state === "paid").length;
  const unknown = due.length - paid;
  if (!unknown) return { text: "Tutto pagato", tone: "ok" };
  const check = `${unknown} da controllare tu`;
  return { text: paid ? `${paid} ${paid === 1 ? "pagata" : "pagate"} · ${check}` : check, tone: "neutral" };
}

// ── Rate ────────────────────────────────────────────────────────────────────

type DebtLike = {
  amount: number;
  debt_type: string | null;
  debt_total_amount: number | null;
  debt_start_date: string | null;
};

export function rateStatus(items: DebtLike[], today: string): CoverStatus {
  const now = new Date(today + "T00:00:00");
  const debts = items
    .filter(it => it.debt_type && it.debt_total_amount && it.debt_start_date)
    .map(it => ({
      start: it.debt_start_date!,
      p: computeDebtProgress(
        { totalAmount: Number(it.debt_total_amount), monthlyAmount: Number(it.amount), startDate: it.debt_start_date! },
        now,
      ),
    }));
  if (!debts.length) return null;

  const active = debts.filter(d => d.p.status === "active");
  if (active.length) {
    const last = toISODate(new Date(Math.max(...active.map(d => d.p.endDate.getTime()))));
    return active.length === 1
      ? { text: `1 in corso · l'ultima rata a ${monthYear(last)}`, tone: "neutral" }
      : { text: `${active.length} in corso · l'ultima finisce a ${monthYear(last)}`, tone: "neutral" };
  }
  const future = debts.filter(d => d.p.status === "future").sort((a, b) => a.start.localeCompare(b.start));
  if (future.length) {
    return future.length === 1
      ? { text: `Inizia a ${monthYear(future[0].start)}`, tone: "neutral" }
      : { text: `${future.length} da iniziare · la prima a ${monthYear(future[0].start)}`, tone: "neutral" };
  }
  return { text: debts.length === 1 ? "Finita" : "Tutte finite", tone: "ok" };
}

// ── Spese dell'anno (accantonamenti) ────────────────────────────────────────

/** La prossima spesa dell'anno: "Assicurazione tra 2 mesi". */
export function sinkingStatus(items: { name: string; next_due_date: string | null }[], today: string): CoverStatus {
  const next = items
    .filter((it): it is { name: string; next_due_date: string } => !!it.next_due_date)
    .sort((a, b) => a.next_due_date.localeCompare(b.next_due_date))[0];
  if (!next) return null;
  if (next.next_due_date < today) return { text: `${next.name}: la scadenza è passata`, tone: "warn" };
  const m = calendarMonths(today, next.next_due_date);
  const when = m === 0 ? "questo mese" : m === 1 ? "il mese prossimo" : `tra ${m} mesi`;
  return { text: `${next.name} ${when}`, tone: "neutral" };
}

/**
 * Da quando la quota delle spese dell'anno torna quella normale: il mese dopo l'ultima
 * scadenza delle voci in recupero (dopo la scadenza ogni voce riparte con un ciclo intero).
 * "dal mese prossimo" se è il mese prossimo o prima, altrimenti "da apr 2027".
 */
export function steadyFrom(catchupDueDates: string[], today: string): string {
  const last = catchupDueDates.filter(Boolean).sort().pop();
  if (!last || calendarMonths(today, last) + 1 <= 1) return "dal mese prossimo";
  const m = +last.slice(5, 7);
  return `da ${MONTHS[m % 12]} ${+last.slice(0, 4) + (m === 12 ? 1 : 0)}`;
}

// ── Obiettivi ───────────────────────────────────────────────────────────────

type GoalLike = { name: string; target_amount: number; current_amount: number };

const goalPct = (g: GoalLike) =>
  Number(g.target_amount) > 0 ? Math.min(100, Math.floor((Number(g.current_amount) / Number(g.target_amount)) * 100)) : 0;

/**
 * L'obiettivo più vicino al traguardo tra quelli non ancora raggiunti. `goals` hanno già
 * `current_amount` preso dal salvadanaio collegato (`withPotBalances`).
 */
export function goalsStatus(goals: GoalLike[]): CoverStatus {
  if (!goals.length) return null;
  const open = goals.filter(g => Number(g.current_amount) < Number(g.target_amount));
  if (!open.length) {
    return { text: goals.length === 1 ? `${goals[0].name}: raggiunto` : "Tutti raggiunti", tone: "ok" };
  }
  const best = open.reduce((a, b) => (goalPct(b) > goalPct(a) ? b : a));
  const others = goals.length - 1;
  const tail = others === 0 ? "" : others === 1 ? " · e un altro" : ` · e altri ${others}`;
  return { text: `${best.name}: ${goalPct(best)}%${tail}`, tone: "neutral" };
}

// ── Salvadanai ──────────────────────────────────────────────────────────────

export function potsStatus(pots: { current_balance: number | string }[]): CoverStatus {
  if (!pots.length) return null;
  const total = pots.reduce((s, p) => s + Number(p.current_balance), 0);
  if (Math.round(total) <= 0) return { text: "Ancora vuoti", tone: "neutral" };
  return { text: `${euro0(total)} messi da parte`, tone: "neutral" };
}
