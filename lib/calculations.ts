// ============================================================
// Financial calculations — pure functions, no side effects
// ============================================================

export type Transaction = {
  id?: string;
  amount: number;
  date: string;
  description: string;
  category_id: string | null;
  categories?: { name: string; color: string; icon: string } | null;
};

export type Goal = {
  id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  deadline: string | null;
  icon: string;
};

// ─── Formatting ───────────────────────────────────────────────────────────────
export function formatEuro(n: number): string {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
}

// ─── Macro categories ─────────────────────────────────────────────────────────
export const MACRO_CATEGORIES = [
  { key: "casa",      label: "Casa",                    icon: "🏠", color: "#f59e0b" },
  { key: "trasporti", label: "Trasporti",                icon: "🚗", color: "#3b82f6" },
  { key: "cibo",      label: "Cibo & Svago",             icon: "🍕", color: "#f97316" },
  { key: "salute",    label: "Salute",                   icon: "💊", color: "#ef4444" },
  { key: "shopping",  label: "Shopping",                 icon: "🛍️", color: "#8b5cf6" },
  { key: "lavoro",    label: "Lavoro & Formazione",      icon: "💼", color: "#10b981" },
  { key: "risparmio", label: "Risparmio & Investimenti", icon: "💰", color: "#22c55e" },
  { key: "altro",     label: "Altro",                    icon: "📦", color: "#94a3b8" },
] as const;

export type MacroKey = (typeof MACRO_CATEGORIES)[number]["key"];

const CATEGORY_TO_MACRO: Record<string, MacroKey> = {
  Casa:            "casa",
  Bollette:        "casa",
  Assicurazioni:   "casa",
  Trasporti:       "trasporti",
  Viaggi:          "trasporti",
  Alimentari:      "cibo",
  Ristoranti:      "cibo",
  Intrattenimento: "cibo",
  Salute:          "salute",
  Palestra:        "salute",
  Abbigliamento:   "shopping",
  Tecnologia:      "shopping",
  Istruzione:      "lavoro",
  Stipendio:       "risparmio",
};

export function getCategoryMacroKey(categoryName?: string | null): MacroKey {
  if (!categoryName) return "altro";
  return CATEGORY_TO_MACRO[categoryName] ?? "altro";
}

// ─── Financial score ──────────────────────────────────────────────────────────
export type ScoreLevel = {
  dot: string;
  label: string;
  message: string;
  colorClass: string;
  bgClass: string;
};

export function calculateFinancialScore(income: number, expensesAbs: number): ScoreLevel {
  if (income <= 0 || expensesAbs > income) {
    return {
      dot: "🔴", label: "Critico",
      message: "Attenzione! Stai sforando il budget",
      colorClass: "text-red-500", bgClass: "bg-red-500/10",
    };
  }
  const ratio = expensesAbs / income;
  if (ratio > 0.85) return {
    dot: "🟠", label: "Rischio",
    message: "Occhio alle spese, sei in zona rischio",
    colorClass: "text-orange-500", bgClass: "bg-orange-500/10",
  };
  if (ratio > 0.70) return {
    dot: "⚪", label: "Nella media",
    message: "Nella media, puoi fare meglio",
    colorClass: "text-slate-400", bgClass: "bg-slate-500/10",
  };
  if (ratio > 0.50) return {
    dot: "🟡", label: "Bene",
    message: "Bene! Stai gestendo bene le spese",
    colorClass: "text-yellow-500", bgClass: "bg-yellow-500/10",
  };
  return {
    dot: "🟢", label: "Ottimo",
    message: "Ottimo! Continua così, vai alla grande!",
    colorClass: "text-green-500", bgClass: "bg-green-500/10",
  };
}

// ─── Projected end-of-month balance ───────────────────────────────────────────
// balance = profiles.balance (never modified)
// expensesThisMonth = absolute sum of expenses so far this month
// Returns projected balance at end of month
export function calculateProjectedBalance(
  balance: number,
  expensesThisMonth: number,
  daysPassedInMonth: number,
  daysRemainingInMonth: number,
): number {
  if (daysPassedInMonth <= 0) return balance;
  const dailyRate = expensesThisMonth / daysPassedInMonth;
  return balance - dailyRate * daysRemainingInMonth;
}

// ─── Daily trend data for SVG chart ───────────────────────────────────────────
export type DailyPoint = { day: number; balance: number };

// Builds array of {day, balance} for each day from 1 to today.
// Starts from: profiles.balance - sum(all current month txs)  = balance at start of month
export function calculateTrendData(
  currentMonthTxs: Transaction[],
  balance: number,
  year: number,
  month: number, // 0-indexed
  startDay = 1,  // first day of the period within this month (e.g. 10 for pay-period)
): DailyPoint[] {
  const today = new Date();
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();
  const lastDay = isCurrentMonth ? today.getDate() : new Date(year, month + 1, 0).getDate();

  // Only use transactions that fall within the start month of the period
  const monthTxs = currentMonthTxs.filter(t => {
    const d = new Date(t.date + "T00:00:00");
    return d.getFullYear() === year && d.getMonth() === month;
  });

  const totalNet = monthTxs.reduce((s, t) => s + Number(t.amount), 0);
  // balance is today's real balance; subtract all period txs to get period-start balance
  const allPeriodNet = currentMonthTxs.reduce((s, t) => s + Number(t.amount), 0);
  const startBalance = balance - allPeriodNet;

  const dailyDelta: Record<number, number> = {};
  for (const t of monthTxs) {
    const d = new Date(t.date + "T00:00:00").getDate();
    dailyDelta[d] = (dailyDelta[d] ?? 0) + Number(t.amount);
  }

  const points: DailyPoint[] = [];
  let running = startBalance;
  for (let d = startDay; d <= lastDay; d++) {
    running += dailyDelta[d] ?? 0;
    // normalise day to 1-based so the SVG chart always starts at x=1
    points.push({ day: d - startDay + 1, balance: running });
  }

  return points;
}

// ─── Macro category breakdown ─────────────────────────────────────────────────
export type MacroBreakdown = {
  key: string;
  label: string;
  icon: string;
  color: string;
  total: number;
  pct: number;
};

export function calculateMacroBreakdown(transactions: Transaction[]): MacroBreakdown[] {
  const expenses = transactions.filter(t => Number(t.amount) < 0);
  const totalExpenses = expenses.reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  if (totalExpenses === 0) return [];

  const map: Partial<Record<MacroKey, number>> = {};
  for (const t of expenses) {
    const key = getCategoryMacroKey(t.categories?.name);
    map[key] = (map[key] ?? 0) + Math.abs(Number(t.amount));
  }

  return MACRO_CATEGORIES.filter(mc => (map[mc.key] ?? 0) > 0)
    .map(mc => ({
      key: mc.key,
      label: mc.label,
      icon: mc.icon,
      color: mc.color,
      total: map[mc.key] ?? 0,
      pct: ((map[mc.key] ?? 0) / totalExpenses) * 100,
    }))
    .sort((a, b) => b.total - a.total);
}

// ─── Goal estimated completion ────────────────────────────────────────────────
// monthlySavings = income - expenses for current month (proxy for savings rate)
export function estimateGoalCompletion(goal: Goal, monthlySavings: number): string | null {
  const remaining = Number(goal.target_amount) - Number(goal.current_amount);
  if (remaining <= 0) return "Raggiunto! 🎉";
  if (monthlySavings <= 0) return null;
  const monthsNeeded = Math.ceil(remaining / monthlySavings);
  const date = new Date();
  date.setMonth(date.getMonth() + monthsNeeded);
  return date.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
}
