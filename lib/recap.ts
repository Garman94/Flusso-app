// Riepilogo di un periodo chiuso (Dashboard → Mesi passati, /dashboard/riepilogo): quanto è
// entrato e uscito, quanto è rimasto, dove sono andati i soldi rispetto al solito e al budget,
// spese fisse pagate, qualche curiosità. Usa lo stesso periodo di paga della dashboard.

import { isTransferCategory } from "./calculations";
import { computePeriodRange, getCurrentPeriodAnchor } from "./period";
import { fixedGroupMeta, fixedGroupOf, isFixedExpense, planStatus, type FixedGroup, type PlanItem } from "./fixed-expenses";

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

/** Una spesa fissa nel periodo: quanto era previsto e quanto è stato trovato nei movimenti. */
export type FixedLine = { name: string; planned: number; spent: number; paid: boolean };
export type FixedSubgroup = { key: FixedGroup; label: string; icon: string; planned: number; spent: number; items: FixedLine[] };
export type SpendLine = { id: string; name: string; icon: string; spent: number };

/**
 * Le uscite divise nei grandi gruppi di Pianifica. Le cinque parti sommano alle uscite del
 * periodo: ogni movimento finisce in un gruppo solo (prima spese fisse e rate riconosciute,
 * poi accantonamenti, poi le categorie con un budget, il resto in "altre spese").
 */
export type SpendingGroups = {
  fisse: { planned: number; spent: number; subgroups: FixedSubgroup[] } | null;
  rate: { planned: number; spent: number } | null;
  budget: { planned: number; spent: number; categories: (SpendLine & { planned: number })[] } | null;
  altre: { spent: number; categories: SpendLine[] } | null;
  accantonamenti: { spent: number } | null;
};

/** Categoria che si è mossa molto rispetto al solito (almeno 10 € e il 15%), o nuova. */
export type UsualChange = { id: string; name: string; icon: string; total: number; diff: number; isNew: boolean };

export type Recap = Totals & {
  period: Period;
  /** parte delle entrate rimasta: saved / income, null senza entrate */
  savedRate: number | null;
  /** periodo prima, se ha movimenti */
  prev: Totals | null;
  categories: CategoryLine[];
  txCount: number;
  /** la spesa singola più grande, escluse spese fisse, rate e accantonamenti */
  biggest: RecapTx | null;
  /** il giorno con più spese, escluse spese fisse, rate e accantonamenti */
  topDay: { date: string; total: number } | null;
  /** spese fisse del periodo */
  fixed: { expected: number; paid: number; count: number; paidCount: number } | null;
  /** categorie con un budget: quante rispettate e quali superate */
  budget: { count: number; within: number; over: { name: string; by: number }[] } | null;
  /** le uscite nei grandi gruppi, con previsto e speso */
  groups: SpendingGroups;
  /** le categorie cambiate di più rispetto al solito, le più grandi prima (al massimo 4) */
  changes: UsualChange[];
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
 * @param categories nomi e icone delle categorie: tipo delle spese fisse, categorie a budget senza spese
 */
export function buildRecap(
  txs: RecapTx[],
  period: Period,
  previous: Period[],
  budgets: { category_id: string; monthly_budget: number }[] = [],
  planItems: PlanItem[] = [],
  today: string = period.to,
  categories: { id: string; name: string; icon?: string | null }[] = [],
): Recap {
  const categoryById = new Map(categories.map(c => [c.id, c]));
  const categoryNames: Record<string, string> = Object.fromEntries(categories.map(c => [c.id, c.name]));
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

  const fixedStatuses = planItems.filter(isFixedExpense)
    .map(it => planStatus(it, spendable, period.from, period.to, today))
    .filter(s => s.state !== "not-due");
  const rateStatuses = planItems
    .filter(it => it.debt_type && (!it.debt_start_date || it.debt_start_date <= period.to) && (!it.end_date || it.end_date >= period.from))
    .map(it => planStatus(it, spendable, period.from, period.to, today));
  const fixedPaid = new Set(fixedStatuses.flatMap(st => st.payments));
  const ratePaid = new Set(rateStatuses.flatMap(st => st.payments));
  const paidByPlan = new Set([...fixedPaid, ...ratePaid]);
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
  const categoryLines: CategoryLine[] = [...byCat.entries()]
    .map(([id, v]) => ({
      id, ...v,
      pct: tot.expenses > 0 ? (v.total / tot.expenses) * 100 : 0,
      usual: usualOf(id),
      budget: budgetOf.get(id) ?? null,
    }))
    .sort((a, b) => b.total - a.total);

  const withBudget = categoryLines.filter(c => c.budget && c.budget > 0);
  const over = withBudget
    .filter(c => c.budgetSpent > c.budget! + 0.005)
    .map(c => ({ name: c.name, by: c.budgetSpent - c.budget! }))
    .sort((a, b) => b.by - a.by);
  const budget = withBudget.length
    ? { count: withBudget.length, within: withBudget.length - over.length, over }
    : null;

  // Curiosità sugli acquisti: senza spese fisse, rate e soldi spostati negli accantonamenti.
  const isSavingsTx = (t: RecapTx) => (t.categories?.name ?? "").toLowerCase() === "accantonamenti";
  const variable = expensesTx.filter(t => !paidByPlan.has(t) && !isSavingsTx(t));
  const biggest = variable.reduce<RecapTx | null>((best, t) => (!best || abs(t) > abs(best) ? t : best), null);
  const byDay = new Map<string, number>();
  for (const t of variable) byDay.set(t.date, (byDay.get(t.date) ?? 0) + abs(t));
  const topDay = [...byDay.entries()].reduce<{ date: string; total: number } | null>(
    (best, [date, total]) => (!best || total > best.total ? { date, total } : best), null);

  const fixed = fixedStatuses.length
    ? {
        expected: fixedStatuses.reduce((s, x) => s + x.expected, 0),
        paid: fixedStatuses.reduce((s, x) => s + x.paidAmount, 0),
        count: fixedStatuses.length,
        paidCount: fixedStatuses.filter(s => s.state === "paid").length,
      }
    : null;

  // ── Gruppi ──
  const subgroups = new Map<FixedGroup, FixedSubgroup>();
  for (const st of fixedStatuses) {
    const key = fixedGroupOf(st.item, st.item.category_id ? categoryNames[st.item.category_id] : null);
    const meta = fixedGroupMeta(key);
    const sub = subgroups.get(key) ?? { key, label: meta.label, icon: meta.icon, planned: 0, spent: 0, items: [] };
    sub.planned += st.expected;
    sub.spent += st.paidAmount;
    sub.items.push({ name: st.item.name, planned: st.expected, spent: st.paidAmount, paid: st.state === "paid" });
    subgroups.set(key, sub);
  }
  const fixedSubs = [...subgroups.values()].sort((a, b) => b.planned - a.planned);


  let savingsSpent = 0;
  const budgetSpentByCat = new Map<string, number>();
  const otherByCat = new Map<string, SpendLine>();
  for (const t of expensesTx) {
    if (paidByPlan.has(t)) continue;
    if (isSavingsTx(t)) { savingsSpent += abs(t); continue; }
    const key = t.category_id ?? "__none__";
    if ((budgetOf.get(key) ?? 0) > 0) {
      budgetSpentByCat.set(key, (budgetSpentByCat.get(key) ?? 0) + abs(t));
    } else {
      const line = otherByCat.get(key) ?? { id: key, name: t.categories?.name ?? "Senza categoria", icon: t.categories?.icon ?? "📦", spent: 0 };
      line.spent += abs(t);
      otherByCat.set(key, line);
    }
  }
  const budgetCats = budgets
    .filter(b => Number(b.monthly_budget) > 0 && (categoryNames[b.category_id] ?? "").toLowerCase() !== "accantonamenti")
    .map(b => {
      const seen = byCat.get(b.category_id);
      return {
        id: b.category_id,
        name: seen?.name ?? categoryNames[b.category_id] ?? "Categoria",
        icon: seen?.icon ?? categoryById.get(b.category_id)?.icon ?? "📦",
        planned: Number(b.monthly_budget),
        spent: budgetSpentByCat.get(b.category_id) ?? 0,
      };
    })
    .sort((a, b) => b.spent - a.spent || b.planned - a.planned);
  const sum = <T>(list: T[], f: (x: T) => number) => list.reduce((acc, x) => acc + f(x), 0);
  const otherCats = [...otherByCat.values()].sort((a, b) => b.spent - a.spent);

  const groups: SpendingGroups = {
    fisse: fixedSubs.length ? { planned: sum(fixedSubs, x => x.planned), spent: sum(fixedSubs, x => x.spent), subgroups: fixedSubs } : null,
    rate: rateStatuses.length ? { planned: sum(rateStatuses, x => x.expected), spent: sum(rateStatuses, x => x.paidAmount) } : null,
    budget: budgetCats.length ? { planned: sum(budgetCats, x => x.planned), spent: sum(budgetCats, x => x.spent), categories: budgetCats } : null,
    altre: otherCats.length ? { spent: sum(otherCats, x => x.spent), categories: otherCats } : null,
    accantonamenti: savingsSpent > 0 ? { spent: savingsSpent } : null,
  };

  const changes: UsualChange[] = categoryLines
    .filter(c => c.usual !== null)
    .map(c => ({ id: c.id, name: c.name, icon: c.icon, total: c.total, diff: c.total - c.usual!, isNew: c.usual! < 1 }))
    .filter(c => (c.isNew ? c.total >= 20 : Math.abs(c.diff) >= Math.max(10, (c.total - c.diff) * 0.15)))
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
    .slice(0, 4);

  const lastTxDate = current.reduce<string | null>((m, t) => (!m || t.date > m ? t.date : m), null);
  const firstTxDate = current.reduce<string | null>((m, t) => (!m || t.date < m ? t.date : m), null);

  return {
    ...tot,
    period,
    savedRate: tot.income > 0 ? tot.saved / tot.income : null,
    prev,
    categories: categoryLines,
    txCount: current.length,
    biggest,
    topDay,
    fixed,
    budget,
    groups,
    changes,
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
