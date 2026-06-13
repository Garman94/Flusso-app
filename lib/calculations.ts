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

// ─── Sinking funds (Accantonamenti) ──────────────────────────────────────────
// Test mentale: 120€/anno, start 2026-01-01, due 2026-12-31, oggi 2026-06-13
// → total_months=12, monthly_quota=10, months_elapsed=6, expected=60 ✓

export type SinkingFundInput = {
  id: string;
  name: string;
  amount_per_cycle: number;     // importo del ciclo (es. assicurazione annua = 120)
  saving_start_date: string;    // YYYY-MM-DD
  next_due_date: string;        // YYYY-MM-DD
};

export type SinkingFundProjection = {
  input: SinkingFundInput;
  total_months: number;          // mesi totali dal setup alla scadenza (inclusi entrambi)
  months_elapsed: number;        // mesi già passati, incluso il corrente (clampato 0..total_months)
  months_remaining: number;      // total_months - months_elapsed
  monthly_quota: number;         // amount_per_cycle / total_months
  expected_saved_so_far: number; // monthly_quota * months_elapsed
};

/**
 * Numero di "1 del mese" tra due date.
 * monthsBetween(2026-06-13, 2026-12-15) = 6
 * monthsBetween(2026-01-01, 2026-12-31) = 11
 */
export function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

export function projectSinkingFund(
  input: SinkingFundInput,
  today: Date = new Date(),
): SinkingFundProjection {
  const start = new Date(input.saving_start_date + "T00:00:00");
  const due   = new Date(input.next_due_date + "T00:00:00");

  // total_months include sia il mese di setup sia il mese di scadenza
  const total_months = Math.max(1, monthsBetween(start, due) + 1);

  // mese corrente incluso (mese 1 = mese di setup)
  const elapsed_raw    = monthsBetween(start, today) + 1;
  const months_elapsed = Math.max(0, Math.min(total_months, elapsed_raw));

  const monthly_quota         = input.amount_per_cycle / total_months;
  const expected_saved_so_far = monthly_quota * months_elapsed;

  return {
    input,
    total_months,
    months_elapsed,
    months_remaining: total_months - months_elapsed,
    monthly_quota,
    expected_saved_so_far,
  };
}

export type SinkingFundsSummary = {
  projections: SinkingFundProjection[];
  this_month_total: number;      // somma delle monthly_quota delle voci ancora attive
  expected_saved_total: number;  // somma degli expected_saved_so_far
  piggy_balance: number;         // valore attuale del piggy_balance del profilo
  delta: number;                 // piggy_balance - expected_saved_total
  status: "ahead" | "on_track" | "behind";
};

export function aggregateSinkingFunds(
  inputs: SinkingFundInput[],
  piggy_balance: number,
  today: Date = new Date(),
): SinkingFundsSummary {
  const projections = inputs.map((i) => projectSinkingFund(i, today));
  const active = projections.filter((p) => p.months_remaining > 0);

  const this_month_total     = active.reduce((s, p) => s + p.monthly_quota, 0);
  const expected_saved_total = projections.reduce((s, p) => s + p.expected_saved_so_far, 0);
  const delta = piggy_balance - expected_saved_total;
  const status: SinkingFundsSummary["status"] =
    delta > 0.01 ? "ahead" : delta < -0.01 ? "behind" : "on_track";

  return { projections, this_month_total, expected_saved_total, piggy_balance, delta, status };
}

/**
 * Aggiunge n mesi a una data, clampando al giorno valido del mese risultante.
 * addMonths(2026-01-31, 1) = 2026-02-28
 */
export function addMonths(date: Date, n: number): Date {
  const d = new Date(date.getTime());
  const targetMonth = d.getMonth() + n;
  d.setDate(1);
  d.setMonth(targetMonth);
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(date.getDate(), daysInMonth));
  return d;
}

/**
 * Mesi per ciclo di una voce ricorrente.
 * mensile=1, bimestrale=2, trimestrale=3, semestrale=6, annuale=12.
 * personalizzata: round(custom_days/30), min 1.
 */
export function monthsPerCycle(frequency: string, customDays?: number | null): number {
  const map: Record<string, number> = {
    mensile: 1, bimestrale: 2, trimestrale: 3, semestrale: 6, annuale: 12,
  };
  if (frequency === "personalizzata") {
    return Math.max(1, Math.round((customDays ?? 30) / 30));
  }
  return map[frequency] ?? 1;
}
