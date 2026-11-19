// I numeri della card del saldo: saldo di oggi, stima a fine periodo e "puoi spendere ancora".
// Stavano dentro balance-hero-card.tsx; sono qui perché li usa anche l'email del lunedì,
// che deve dire esattamente quello che dice la dashboard. Funzione pura: niente query.
// Le regole sono spiegate in lib/calculations.ts (projectPeriodEnd), lib/fixed-expenses.ts
// (splitPlan), lib/money.ts e lib/spendable.ts.

import {
  aggregateExpectedIncome,
  aggregateSinkingFunds,
  sinkingFundInput,
  computeDebtProgress,
  isTransferCategory,
  projectPeriodEnd,
  type IncomeInfo,
} from "./calculations";
import { isFixedExpense, planStatus, splitPlan, type PlanItem } from "./fixed-expenses";
import { flowOf, isSpending, moneyTotals } from "./money";
import { spendable } from "./spendable";
import type { HeroTx, MemberIncome, RecurringRow } from "@/app/dashboard/hero-data";

export type HeroNumbersInput = {
  /** saldo a inizio periodo; null = mai inserito */
  startingBalance: number | null;
  items: RecurringRow[];
  periodTxs: HeroTx[];
  budgetTotal: number;
  ownerIncome: Partial<IncomeInfo> | null;
  membersIncome: MemberIncome[];
  piggyBalance: number;
  periodFrom: string;
  periodTo: string;
  /** oggi, YYYY-MM-DD (todayISO) */
  today: string;
};

const isTransfer = (t: HeroTx) => isTransferCategory(t.categories?.name);

/** Somma dei movimenti del periodo fino a oggi: serve anche quando il saldo non c'è ancora. */
export function txSumToToday(periodTxs: HeroTx[], today: string): number {
  return periodTxs.filter(t => t.date <= today).reduce((s, t) => s + Number(t.amount), 0);
}

/** null se il saldo a inizio periodo non è mai stato inserito (la card chiede il saldo di oggi). */
export function heroNumbers(p: HeroNumbersInput) {
  const { startingBalance, items, periodTxs, budgetTotal, ownerIncome, membersIncome, piggyBalance, periodFrom, periodTo, today: iso } = p;
  if (startingBalance == null) return null;

  // ── Effettivi (periodo corrente) ──
  // Giroconti fuori; i rimborsi (entrate in una categoria di spesa, es. gli amici che ridanno
  // la cena o il prelievo dagli accantonamenti) abbassano le spese: vedi lib/money.ts.
  const spendableTxs = periodTxs.filter(t => !isTransfer(t));
  const expenseTxs = spendableTxs.filter(t => isSpending(t));
  const incomeTxs = spendableTxs.filter(t => !isSpending(t));
  const { income, expenses: expensesAbs } = moneyTotals(periodTxs);
  const actualToday = startingBalance + txSumToToday(periodTxs, iso);

  // ── Contributo netto per componente (entrate reali - spese reali, periodo corrente) ──
  const memberMap = new Map<string, { name: string; color: string; income: number; expense: number }>();
  membersIncome.forEach(m => memberMap.set(m.id, { name: m.name, color: m.color, income: 0, expense: 0 }));
  for (const t of spendableTxs) {
    const key = t.member_id ?? "__none__";
    if (!memberMap.has(key)) memberMap.set(key, { name: "Non assegnato", color: "#94a3b8", income: 0, expense: 0 });
    const entry = memberMap.get(key)!;
    const f = flowOf(t);
    entry.income += f.income;
    entry.expense += f.expense;
  }
  const memberBreakdown = Array.from(memberMap.entries())
    .map(([id, v]) => ({ id, ...v }))
    .filter(m => Math.abs(m.income) > 0.005 || Math.abs(m.expense) > 0.005);

  // ── Previsti: reddito dall'anagrafica (mese in cui inizia il periodo) ──
  const periodMonth = new Date(periodFrom + "T00:00:00").getMonth() + 1;

  // Rate in corso (esclude quelle non ancora iniziate e quelle già terminate) con una
  // scadenza in questo periodo: una rata partita da poco può avere la prima nel periodo dopo.
  const rateItems = items
    .filter(it => it.debt_type && it.debt_total_amount && it.debt_start_date)
    .map(it => ({
      item: it,
      progress: computeDebtProgress({ totalAmount: it.debt_total_amount!, monthlyAmount: it.amount, startDate: it.debt_start_date! }),
      status: planStatus(it as PlanItem, periodTxs, periodFrom, periodTo, iso),
    }))
    .filter(r => r.progress.status === "active" && r.status.state !== "not-due");
  const rateMonthly = rateItems.reduce((s, r) => s + r.item.amount, 0);

  // Spese fisse (affitto, abbonamenti, bollette) e rate: per ognuna si sa se in questo
  // periodo è già stata pagata. Quelle ancora da pagare si tolgono a parte dalla stima, così
  // "puoi ancora spendere" non comprende l'affitto che deve ancora partire.
  const fixedStatuses = items.filter(isFixedExpense)
    .map(it => planStatus(it as PlanItem, periodTxs, periodFrom, periodTo, iso))
    .filter(st => st.state !== "not-due");
  const rateStatuses = rateItems.map(r => r.status);
  const plan = splitPlan([...fixedStatuses, ...rateStatuses], t => !isTransfer(t as HeroTx));
  const fixedMonthly = fixedStatuses.reduce((s, st) => s + st.expected, 0);

  // Spese previste = spese fisse + rate in corso + quota mensile accantonamenti + budget
  // per categoria (Pianifica).
  const sinkingInputs = items
    .filter(it => it.next_due_date && it.saving_start_date)
    .map(sinkingFundInput);
  const sinkingMonthly = aggregateSinkingFunds(sinkingInputs, piggyBalance).this_month_total;
  const spesePreviste = fixedMonthly + rateMonthly + sinkingMonthly + budgetTotal;
  // Il resto delle spese previste, quelle "da spendere": budget, accantonamenti e le voci
  // di cui Flusso non può verificare il pagamento.
  const flexiblePlanned = budgetTotal + sinkingMonthly + plan.flexible;

  // Se il titolare si e' identificato come Componente, il suo reddito e' li' (evita di sommarlo due volte).
  const hasOwnerMember = membersIncome.some(m => m.is_owner);
  const entratePreviste = aggregateExpectedIncome(hasOwnerMember ? null : ownerIncome, membersIncome, periodMonth);

  const projection = projectPeriodEnd({
    balanceToday: actualToday,
    incomeSoFar: income,
    expensesSoFar: expensesAbs - plan.paidSpent,
    expectedIncome: entratePreviste,
    expectedExpenses: flexiblePlanned,
    committedRemaining: plan.remaining,
  });

  const spend = spendable({
    flexiblePlanned,
    leftToSpend: projection.leftToSpend,
    endBalance: projection.endBalance,
    today: iso,
    periodTo,
  });

  return {
    income, expensesAbs, incomeTxs, expenseTxs, memberBreakdown, actualToday,
    rateMonthly, rateItems, sinkingMonthly, spesePreviste, entratePreviste,
    fixedMonthly, fixedStatuses, flexiblePlanned,
    projection, periodMonth, hasOwnerMember, spend,
  };
}

export type HeroNumbers = NonNullable<ReturnType<typeof heroNumbers>>;
