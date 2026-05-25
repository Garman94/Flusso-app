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

// ─── Real category breakdown ──────────────────────────────────────────────────
export type CategoryBreakdown = {
  key: string;        // category_id or "__none__"
  label: string;
  icon: string;
  color: string;
  total: number;
  pct: number;
};

export function calculateCategoryBreakdown(transactions: Transaction[]): CategoryBreakdown[] {
  const expenses = transactions.filter(t => Number(t.amount) < 0);
  const totalExpenses = expenses.reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  if (totalExpenses === 0) return [];

  const map = new Map<string, { label: string; icon: string; color: string; total: number }>();
  for (const t of expenses) {
    const key   = t.category_id ?? "__none__";
    const label = t.categories?.name  ?? "Senza categoria";
    const icon  = t.categories?.icon  ?? "📦";
    const color = t.categories?.color ?? "#94a3b8";
    const entry = map.get(key);
    if (entry) {
      entry.total += Math.abs(Number(t.amount));
    } else {
      map.set(key, { label, icon, color, total: Math.abs(Number(t.amount)) });
    }
  }

  return Array.from(map.entries())
    .map(([key, v]) => ({ key, ...v, pct: (v.total / totalExpenses) * 100 }))
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

