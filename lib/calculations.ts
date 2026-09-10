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

/** Equivalente mensile di una voce ricorrente fissa/variabile/entrata (usa il punto medio se range). */
export function recurringMonthlyEquivalent(item: {
  frequency: string; custom_days: number | null; amount: number; amount_max: number | null;
}): number {
  const mid = item.amount_max != null ? (item.amount + item.amount_max) / 2 : item.amount;
  return mid / monthsPerCycle(item.frequency, item.custom_days);
}

/** Riconoscimento transazione ↔ voce ricorrente via parole chiave (nome/merchant). */
export function txMatchesKeywords(
  tx: { description?: string | null; merchant?: string | null },
  keywords: string[],
): boolean {
  if (!keywords.length) return false;
  const d = (tx.description ?? "").toLowerCase();
  const m = (tx.merchant ?? "").toLowerCase();
  return keywords.some(k => {
    const kk = k.toLowerCase().trim();
    return kk.length > 0 && (d.includes(kk) || m.includes(kk));
  });
}

// ============================================================
// FEATURE 1 — Saldo progressivo giornaliero
// ============================================================

export type RecurringScheduleItem = {
  id: string;
  name: string;
  tipologia: "fissa" | "variabile" | "entrata";
  frequency: string;
  due_day: number | null;
  due_month: number | null;
  amount: number;
  amount_max: number | null;
  next_due_date: string | null; // presente = gestita da Accantonamenti, esclusa qui
};

export type BalanceProjectionEvent = { name: string; amount: number }; // signed
export type BalanceProjectionDay = { day: number; date: string; balance: number; events: BalanceProjectionEvent[] };

function scheduleItemSignedAmount(it: RecurringScheduleItem): number {
  const mid = it.amount_max != null ? (it.amount + it.amount_max) / 2 : it.amount;
  return it.tipologia === "entrata" ? Math.abs(mid) : -Math.abs(mid);
}

/**
 * Proiezione giorno-per-giorno del saldo atteso sul periodo [periodFrom, periodTo],
 * a partire da un saldo iniziale, applicando le voci ricorrenti fisse/entrata con
 * cadenza mensile (ogni mese, al giorno due_day) o annuale (due_month + due_day).
 * Voci bimestrale/trimestrale/semestrale/personalizzata e quelle gestite da
 * Accantonamenti (next_due_date valorizzato) non hanno una data deducibile dallo
 * schema e sono escluse dalla timeline (restano nella stima min/max, Feature 3).
 */
export function calculateDailyBalanceProjection(
  startingBalance: number,
  items: RecurringScheduleItem[],
  periodFrom: string,
  periodTo: string,
): BalanceProjectionDay[] {
  const start = new Date(periodFrom + "T00:00:00");
  const end = new Date(periodTo + "T00:00:00");
  const out: BalanceProjectionDay[] = [];
  let running = startingBalance;

  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 86_400_000)) {
    const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const dayEvents: BalanceProjectionEvent[] = [];

    for (const it of items) {
      if (it.next_due_date || it.due_day == null) continue;
      const effectiveDueDay = Math.min(it.due_day, daysInMonth);
      if (d.getDate() !== effectiveDueDay) continue;
      const isMonthly = it.frequency === "mensile";
      const isYearlyMatch = it.frequency === "annuale" && it.due_month === d.getMonth() + 1;
      if (!isMonthly && !isYearlyMatch) continue;
      dayEvents.push({ name: it.name, amount: scheduleItemSignedAmount(it) });
    }

    running += dayEvents.reduce((s, e) => s + e.amount, 0);
    out.push({ day: d.getDate(), date: d.toISOString().split("T")[0], balance: running, events: dayEvents });
  }

  return out;
}

export type BalanceHealthStatus = "ahead" | "green" | "yellow" | "red";

/** Confronta saldo reale vs atteso. ahead/green = in linea, yellow/red = sotto le attese. */
export function evaluateBalanceHealth(actual: number, expected: number): {
  status: BalanceHealthStatus; diff: number; diffPct: number;
} {
  const diff = actual - expected;
  const diffPct = expected !== 0 ? diff / Math.abs(expected) : (diff === 0 ? 0 : -1);
  let status: BalanceHealthStatus;
  if (diff >= 0) status = "ahead";
  else if (diffPct >= -0.10) status = "green";
  else if (diffPct >= -0.25) status = "yellow";
  else status = "red";
  return { status, diff, diffPct };
}

// ============================================================
// FEATURE 2 — Avviso scadenze non pagate
// ============================================================

export type OverdueCheckItem = {
  id: string;
  name: string;
  tipologia: "fissa" | "variabile" | "entrata";
  frequency: string;
  due_day: number | null;
  due_month: number | null;
  amount: number;
  amount_max: number | null;
  last_paid_date: string | null;
  next_due_date: string | null; // presente = gestita da Accantonamenti, esclusa qui
  match_keywords: string[];
  category_id: string | null;
};

export type OverdueResult = { item: OverdueCheckItem; dueDate: string; amount: number };

/** Data di scadenza del ciclo corrente, solo per voci fisse mensili/annuali con due_day. */
export function currentCycleDueDate(it: OverdueCheckItem, today: Date): Date | null {
  if (it.next_due_date || it.due_day == null || it.tipologia !== "fissa") return null;
  if (it.frequency === "mensile") {
    const y = today.getFullYear(), m = today.getMonth();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    return new Date(y, m, Math.min(it.due_day, daysInMonth));
  }
  if (it.frequency === "annuale" && it.due_month != null) {
    const y = today.getFullYear();
    const daysInMonth = new Date(y, it.due_month, 0).getDate();
    return new Date(y, it.due_month - 1, Math.min(it.due_day, daysInMonth));
  }
  return null;
}

/**
 * Voci fisse scadute (data passata) non ancora segnate pagate né riconosciute
 * automaticamente in una transazione di questo ciclo.
 */
export function findOverdueRecurring(
  items: OverdueCheckItem[],
  transactions: { amount: number; date: string; description?: string | null; merchant?: string | null; category_id?: string | null }[],
  today: Date = new Date(),
): OverdueResult[] {
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const out: OverdueResult[] = [];

  for (const it of items) {
    const due = currentCycleDueDate(it, todayMid);
    if (!due || due > todayMid) continue;

    if (it.last_paid_date && new Date(it.last_paid_date + "T00:00:00") >= due) continue;

    const matched = transactions.some(t => {
      if (Number(t.amount) >= 0) return false;
      const d = new Date(t.date + "T00:00:00");
      if (d < due || d > todayMid) return false;
      if (it.match_keywords.length > 0) return txMatchesKeywords(t, it.match_keywords);
      if (it.category_id) return t.category_id === it.category_id;
      return false;
    });
    if (matched) continue;

    const mid = it.amount_max != null ? (it.amount + it.amount_max) / 2 : it.amount;
    out.push({ item: it, dueDate: due.toISOString().split("T")[0], amount: Math.abs(mid) });
  }

  return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

// ============================================================
// FEATURE 3 — Stima min/max spese mensili
// ============================================================

export type MonthlyExpenseEstimate = {
  fixedTotal: number;
  variableAvg: number;
  variableMin: number;
  variableMax: number;
  totalMin: number;
  totalMax: number;
  usedSeasonalWeight: boolean;
};

/**
 * variableMonthlyTotals: totale spese variabili per ciascuno degli ultimi mesi
 * (più recenti prima, tipicamente 3). sameMonthLastYearTotal: totale variabili
 * nello stesso mese calendariale dell'anno precedente, se disponibile (peso 40%).
 */
export function estimateMonthlyExpenses(
  fixedTotal: number,
  variableMonthlyTotals: number[],
  sameMonthLastYearTotal: number | null,
): MonthlyExpenseEstimate {
  const n = variableMonthlyTotals.length;
  const recentAvg = n > 0 ? variableMonthlyTotals.reduce((a, b) => a + b, 0) / n : 0;

  const usedSeasonalWeight = sameMonthLastYearTotal != null && n > 0;
  const variableAvg = usedSeasonalWeight
    ? 0.4 * sameMonthLastYearTotal! + 0.6 * recentAvg
    : recentAvg;

  const variance = n > 0
    ? variableMonthlyTotals.reduce((s, v) => s + (v - recentAvg) ** 2, 0) / n
    : 0;
  const stdDev = Math.sqrt(variance);

  const variableMin = Math.max(0, variableAvg - 0.5 * stdDev);
  const variableMax = variableAvg + 0.5 * stdDev;

  return {
    fixedTotal,
    variableAvg,
    variableMin,
    variableMax,
    totalMin: fixedTotal + variableMin,
    totalMax: fixedTotal + variableMax,
    usedSeasonalWeight,
  };
}

// ============================================================
// FEATURE 4 — Quanto dovresti risparmiare?
// ============================================================

export type SavingsSuggestion = { rawPotential: number; suggested: number; buffer: number; isTight: boolean };

/** Suggerisce l'80% del potenziale di risparmio, tenendo il 20% come cuscinetto per imprevisti. */
export function suggestMonthlySavings(
  expectedIncome: number, fixedTotal: number, variableMidpoint: number,
): SavingsSuggestion {
  const rawPotential = expectedIncome - fixedTotal - variableMidpoint;
  if (rawPotential <= 0) return { rawPotential, suggested: 0, buffer: 0, isTight: true };
  return { rawPotential, suggested: rawPotential * 0.8, buffer: rawPotential * 0.2, isTight: false };
}
