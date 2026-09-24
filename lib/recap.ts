// Riepilogo di un periodo chiuso (Dashboard → Mesi passati, /dashboard/riepilogo): quanto è
// entrato e uscito, quanto è rimasto, dove sono andati i soldi rispetto al solito e al budget,
// spese fisse pagate, qualche curiosità. Usa lo stesso periodo di paga della dashboard.

import { isTransferCategory } from "./calculations";
import { computePeriodRange, getCurrentPeriodAnchor } from "./period";
import { isFixedExpense, planPayments, planStatus, type PlanItem } from "./fixed-expenses";

export type RecapTx = {
  id?: string;
  date: string;
  amount: number;
  description?: string | null;
  merchant?: string | null;
  category_id?: string | null;
  categories?: { name: string; icon?: string | null; color?: string | null } | null;
};

export type Period = { from: string; to: string };

export type CategoryLine = {
  id: string;
  name: string;
  icon: string;
  color: string;
  total: number;
  /** quota delle uscite del periodo, 0-100 */
  pct: number;
  /** media dei periodi precedenti con movimenti, null se non ce ne sono */
  usual: number | null;
  /** budget di oggi della categoria, se impostato */
  budget: number | null;
  /** spesa che conta per il budget: senza i pagamenti di spese fisse e rate */
  budgetSpent: number;
};

export type Totals = { income: number; expenses: number; saved: number };

export type Recap = Totals & {
  period: Period;
  /** parte delle entrate rimasta: saved / income, null senza entrate */
  savedRate: number | null;
  /** periodo prima, se ha movimenti */
  prev: Totals | null;
  categories: CategoryLine[];
  txCount: number;
  /** la spesa singola più grande, escluse spese fisse e rate */
  biggest: RecapTx | null;
  /** il giorno con più spese, escluse spese fisse e rate */
  topDay: { date: string; total: number } | null;
  /** spese fisse del periodo */
  fixed: { expected: number; paid: number; count: number; paidCount: number } | null;
  /** categorie con un budget: quante rispettate e quali superate */
  budget: { count: number; within: number; over: { name: string; by: number }[] } | null;
  firstTxDate: string | null;
  lastTxDate: string | null;
  /** l'ultimo movimento è di parecchi giorni prima della fine: forse l'estratto conto non è completo */
  maybeIncomplete: boolean;
  /** è il primo periodo caricato e i movimenti cominciano a metà: mancano i primi giorni */
  startsLate: boolean;
};

/** Periodi passati usati per "il solito"; ne serve uno in più per sapere se l'ultimo è completo. */
export const RECAP_HISTORY = 3;

const INCOMPLETE_DAYS = 5;

function daysBetween(a: string, b: string): number {
  const ms = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10))
    - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  return Math.round(ms / 86_400_000);
}

const inPeriod = (t: { date: string }, p: Period) => t.date >= p.from && t.date <= p.to;
const abs = (t: RecapTx) => Math.abs(Number(t.amount));

export function totals(txs: Pick<RecapTx, "amount" | "categories">[]): Totals {
  let income = 0, expenses = 0;
  for (const t of txs) {
    if (isTransferCategory(t.categories?.name)) continue;
    const a = Number(t.amount);
    if (a > 0) income += a; else expenses += -a;
  }
  return { income, expenses, saved: income - expenses };
}

/**
 * @param txs      movimenti del periodo e dei precedenti (per il confronto), in qualsiasi ordine
 * @param period   il periodo del riepilogo
 * @param previous i periodi prima, il più recente per primo: RECAP_HISTORY + 1 (l'ultimo serve
 *                 solo a sapere se il penultimo è completo)
 * @param budgets  budget per categoria di oggi
 * @param planItems spese fisse e rate: i loro pagamenti non contano nel budget né nelle curiosità
 */
export function buildRecap(
  txs: RecapTx[],
  period: Period,
  previous: Period[],
  budgets: { category_id: string; monthly_budget: number }[] = [],
  planItems: PlanItem[] = [],
  today: string = period.to,
): Recap {
  const current = txs.filter(t => inPeriod(t, period));
  const spendable = current.filter(t => !isTransferCategory(t.categories?.name));
  const expensesTx = spendable.filter(t => Number(t.amount) < 0);
  const tot = totals(current);

  // Un periodo passato vale per i confronti solo se è completo: ha movimenti e ne ha anche
  // quello prima. Il primo mese caricato di solito comincia a metà (l'estratto conto parte da
  // un giorno qualsiasi, spesso dopo lo stipendio) e un periodo vuoto vuol dire estratto conto
  // non caricato, non zero spese: confrontarli darebbe differenze che non esistono.
  const hasData = (p?: Period) => !!p && txs.some(t => inPeriod(t, p));
  const complete = (i: number) => hasData(previous[i]) && (i + 1 >= previous.length || hasData(previous[i + 1]));

  const prev = complete(0) ? totals(txs.filter(t => inPeriod(t, previous[0]))) : null;

  // "Il solito": media dei periodi precedenti completi.
  const history = previous.slice(0, RECAP_HISTORY)
    .filter((_, i) => complete(i))
    .map(p => txs.filter(t => inPeriod(t, p) && !isTransferCategory(t.categories?.name)));
  const usualOf = (catKey: string): number | null => {
    if (!history.length) return null;
    const sum = history.reduce((s, list) => s + list
      .filter(t => Number(t.amount) < 0 && (t.category_id ?? "__none__") === catKey)
      .reduce((x, t) => x + abs(t), 0), 0);
    return sum / history.length;
  };

  const paidByPlan = planPayments(planItems, current, [period]);
  const budgetOf = new Map(budgets.map(b => [b.category_id, Number(b.monthly_budget)]));

  const byCat = new Map<string, { name: string; icon: string; color: string; total: number; budgetSpent: number }>();
  for (const t of expensesTx) {
    const key = t.category_id ?? "__none__";
    const entry = byCat.get(key) ?? {
      name: t.categories?.name ?? "Senza categoria",
      icon: t.categories?.icon ?? "📦",
      color: t.categories?.color ?? "#94a3b8",
      total: 0, budgetSpent: 0,
    };
    entry.total += abs(t);
    if (!paidByPlan.has(t)) entry.budgetSpent += abs(t);
    byCat.set(key, entry);
  }
  const categories: CategoryLine[] = [...byCat.entries()]
    .map(([id, v]) => ({
      id, ...v,
      pct: tot.expenses > 0 ? (v.total / tot.expenses) * 100 : 0,
      usual: usualOf(id),
      budget: budgetOf.get(id) ?? null,
    }))
    .sort((a, b) => b.total - a.total);

  const withBudget = categories.filter(c => c.budget && c.budget > 0);
  const over = withBudget
    .filter(c => c.budgetSpent > c.budget! + 0.005)
    .map(c => ({ name: c.name, by: c.budgetSpent - c.budget! }))
    .sort((a, b) => b.by - a.by);
  const budget = withBudget.length
    ? { count: withBudget.length, within: withBudget.length - over.length, over }
    : null;

  const variable = expensesTx.filter(t => !paidByPlan.has(t));
  const biggest = variable.reduce<RecapTx | null>((best, t) => (!best || abs(t) > abs(best) ? t : best), null);
  const byDay = new Map<string, number>();
  for (const t of variable) byDay.set(t.date, (byDay.get(t.date) ?? 0) + abs(t));
  const topDay = [...byDay.entries()].reduce<{ date: string; total: number } | null>(
    (best, [date, total]) => (!best || total > best.total ? { date, total } : best), null);

  const fixedStatuses = planItems.filter(isFixedExpense)
    .map(it => planStatus(it, current, period.from, period.to, today))
    .filter(s => s.state !== "not-due");
  const fixed = fixedStatuses.length
    ? {
        expected: fixedStatuses.reduce((s, x) => s + x.expected, 0),
        paid: fixedStatuses.reduce((s, x) => s + x.paidAmount, 0),
        count: fixedStatuses.length,
        paidCount: fixedStatuses.filter(s => s.state === "paid").length,
      }
    : null;

  const lastTxDate = current.reduce<string | null>((m, t) => (!m || t.date > m ? t.date : m), null);
  const firstTxDate = current.reduce<string | null>((m, t) => (!m || t.date < m ? t.date : m), null);

  return {
    ...tot,
    period,
    savedRate: tot.income > 0 ? tot.saved / tot.income : null,
    prev,
    categories,
    txCount: current.length,
    biggest,
    topDay,
    fixed,
    budget,
    firstTxDate,
    lastTxDate,
    maybeIncomplete: !!lastTxDate && daysBetween(lastTxDate, period.to) > INCOMPLETE_DAYS,
    startsLate: !!firstTxDate && !hasData(previous[0]) && daysBetween(period.from, firstTxDate) > INCOMPLETE_DAYS,
  };
}

// ── Periodi ─────────────────────────────────────────────────────────────────

const MONTHS = [
  "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
];

/** Il periodo che contiene la data (ISO), col giorno di paga dell'utente. */
export function periodContaining(payDay: number, iso: string): Period & { year: number; month: number } {
  const d = new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10), 12);
  const anchor = getCurrentPeriodAnchor(payDay, d);
  return { ...computePeriodRange(payDay, anchor.year, anchor.month), ...anchor };
}

/**
 * Nome del periodo come lo direbbe una persona: il mese in cui cade la maggior parte dei
 * giorni ("agosto" per 27 lug – 26 ago). `range` è l'intervallo, se non è un mese solare.
 */
export function periodName(payDay: number, p: Period): { month: string; year: number; range: string | null } {
  const ref = payDay >= 16 ? p.to : p.from;
  const fmt = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "short" });
  return {
    month: MONTHS[+ref.slice(5, 7) - 1],
    year: +ref.slice(0, 4),
    range: payDay > 0 ? `${fmt(p.from)} – ${fmt(p.to)}` : null,
  };
}
