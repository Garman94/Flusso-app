"use client";

import { toISODate, todayISO } from "@/lib/dates";
import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { TrackOnMount } from "@/components/track-on-mount";
import { PageTour } from "@/components/tour/page-tour";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { aggregateSinkingFunds, addMonths, monthsPerCycle, monthsBetween, estimateGoalCompletion, computeDebtProgress, potsForSinkingFunds } from "@/lib/calculations";
import type { SinkingFundInput, SinkingFundProjection } from "@/lib/calculations";
import { resetSavingStartDate, markSinkingFundPaid } from "./sinking-fund-actions";
import { addGoalContribution } from "./goal-actions";
import { BudgetPanel } from "./budget-panel";
import { FixedExpensesPanel, fixedSuggestions, useDismissedSuggestions } from "./fixed-expenses-panel";
import { isFixedExpense } from "@/lib/fixed-expenses";

// ─── Types ────────────────────────────────────────────────────────────────────

type Category = { id: string; name: string; color: string; icon: string };
type Transaction = {
  id?: string; date: string; amount: number; category_id?: string | null;
  description?: string | null; merchant?: string | null;
};
type Goal = {
  id: string; name: string; target_amount: number; current_amount: number;
  deadline: string | null; icon: string; created_at: string;
  savings_pot_id: string | null; monthly_contribution: number | null;
};
type PotLite = { id: string; name: string; emoji: string; current_balance: number };
type GoalContribution = { id: string; goal_id: string; amount: number; note: string | null; date: string };
type Tipologia = "fissa" | "variabile" | "entrata";
type Frequency = "mensile" | "bimestrale" | "trimestrale" | "semestrale" | "annuale" | "personalizzata";
export type RecurringExpense = {
  id: string; name: string; tipologia: Tipologia; frequency: Frequency;
  custom_days: number | null; amount: number; amount_max: number | null;
  category_id: string | null; notes: string | null; match_keywords: string[];
  matching_strategy: string; due_day: number | null; due_month: number | null;
  secondary_name: string | null;
  end_date: string | null;
  last_paid_date: string | null;
  next_due_date: string | null;
  saving_start_date: string | null;
  debt_type: DebtType | null;
  debt_total_amount: number | null;
  debt_start_date: string | null;
  savings_pot_id: string | null;
};
type TipoCard = "uscita_fissa" | "uscita_variabile" | "entrata";
type DebtType = "mutuo" | "rata_acquisto" | "debito_persona" | "altro";
type View =
  | "cover" | "add-recurring" | "edit-recurring" | "list-recurring"
  | "add-goal" | "list-goals" | "goal-detail" | "previsioni"
  | "impegni" | "accantonamenti" | "accantonamento-form" | "budget" | "rate" | "rate-form"
  | "spese-fisse" | "spesa-fissa-form";

type CategoryBudget = { category_id: string; monthly_budget: number };
type CategoryBudgetNote = { category_id: string; year: number; month: number; note: string };

type Props = {
  userId: string; plan: string; initialGoals: Goal[];
  /** piano gratuito con prova Premium già usata: cambia il testo del blocco */
  trialExpired?: boolean;
  transactions: Transaction[]; categories: Category[];
  initialRecurring?: RecurringExpense[];
  initialPots?: PotLite[];
  initialContributions?: GoalContribution[];
  piggyBalance?: number;
  payDay?: number; periodFrom?: string; periodTo?: string;
  periodYear?: number; periodMonth?: number;
  initialCategoryBudgets?: CategoryBudget[];
  initialBudgetNotes?: CategoryBudgetNote[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
}

const FREQ_MONTHS: Record<string, number> = {
  mensile: 1, bimestrale: 2, trimestrale: 3, semestrale: 6, annuale: 12,
};

function toMonthlyAmount(exp: RecurringExpense): number {
  const mid = exp.tipologia === "variabile" && exp.amount_max != null
    ? (exp.amount + exp.amount_max) / 2
    : exp.amount;
  if (exp.frequency === "personalizzata" && exp.custom_days)
    return mid * (30 / exp.custom_days);
  return mid / (FREQ_MONTHS[exp.frequency] ?? 1);
}

function effectiveKws(item: RecurringExpense): string[] {
  const kws = [...item.match_keywords];
  if (item.secondary_name) {
    const sn = item.secondary_name.toLowerCase();
    if (!kws.some(k => k.toLowerCase() === sn)) kws.push(item.secondary_name);
  }
  return kws;
}

function txMatchesKws(tx: Transaction, kws: string[]): boolean {
  if (!kws.length) return false;
  const d = (tx.description ?? "").toLowerCase();
  const m = (tx.merchant ?? "").toLowerCase();
  return kws.some(k => { const kk = k.toLowerCase().trim(); return kk.length > 0 && (d.includes(kk) || m.includes(kk)); });
}

/** Per "Collega a transazione": senza query mostra le più recenti da sfogliare, altrimenti filtra per testo. */
function pickTxCandidates(transactions: Transaction[], query: string): Transaction[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return transactions.slice(0, 8);
  return transactions
    .filter(t => t.description?.toLowerCase().includes(q) || t.merchant?.toLowerCase().includes(q))
    .slice(0, 8);
}

function freqLabel(exp: RecurringExpense): string {
  if (exp.frequency === "personalizzata" && exp.custom_days) {
    if (exp.custom_days % 365 === 0) return `ogni ${exp.custom_days / 365} anno`;
    if (exp.custom_days % 30 === 0) return `ogni ${exp.custom_days / 30} mesi`;
    if (exp.custom_days % 7 === 0) return `ogni ${exp.custom_days / 7} settimane`;
    return `ogni ${exp.custom_days} giorni`;
  }
  const map: Record<string, string> = {
    mensile: "ogni mese", bimestrale: "ogni 2 mesi", trimestrale: "ogni 3 mesi",
    semestrale: "ogni 6 mesi", annuale: "ogni anno",
  };
  return map[exp.frequency] ?? "";
}

// ─── Shared small components ──────────────────────────────────────────────────

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
    >
      ← Indietro
    </button>
  );
}

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 rounded-full transition-all ${
            i < current
              ? "bg-primary w-6"
              : i === current - 1
              ? "bg-primary w-8"
              : "bg-muted w-4"
          }`}
        />
      ))}
      <span className="text-xs text-muted-foreground ml-1">
        Passo {current} di {total}
      </span>
    </div>
  );
}

function RecapRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

/** Retta di proiezione current → target al ritmo `monthly` al mese. */
function GoalProjection({ current, target, monthly }: { current: number; target: number; monthly: number }) {
  const months = Math.min(36, Math.max(1, Math.ceil((target - current) / monthly)));
  const W = 300, H = 90, PAD = 6;
  const pts = Array.from({ length: months + 1 }, (_, i) => {
    const v = Math.min(target, current + monthly * i);
    const x = PAD + (i / months) * (W - PAD * 2);
    const y = H - PAD - ((v - current) / Math.max(1, target - current)) * (H - PAD * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <div className="rounded-xl border p-4 flex flex-col gap-1">
      <p className="text-xs text-muted-foreground">Proiezione ({months} {months === 1 ? "mese" : "mesi"})</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-20">
        <polyline points={pts} fill="none" stroke="currentColor" className="text-primary" strokeWidth={2} strokeLinecap="round" />
      </svg>
    </div>
  );
}

// ─── Default form values ──────────────────────────────────────────────────────

const EMPTY_R = {
  tipo: "" as TipoCard | "",
  name: "",
  frequency: "mensile" as Frequency,
  custom_days: "",
  amount: "",
  amount_max: "",
  due_day: null as number | null,
  due_month: null as number | null,
  secondary_name: "",
  end_date: "",
  next_due_date: "",
  savings_pot_id: "",
};

const EMPTY_G = {
  name: "",
  icon: "🎯",
  target_amount: "",
  current_amount: "0",
  deadline: "",
  savings_pot_id: "",
  monthly_contribution: "",
};

const GOAL_ICONS = ["🎯", "🏖️", "🛡️", "🏠", "💻", "🎓", "🚗", "✈️", "💍", "🌱", "💪", "🎁"];
const FREE_GOAL_LIMIT = 1;

const EMPTY_D = {
  debt_type: "" as DebtType | "",
  name: "",
  amount: "",
  debt_total_amount: "",
  debt_start_date: "",
  due_day: null as number | null,
  secondary_name: "",
};

const DEBT_TYPE_META: Record<DebtType, { icon: string; label: string }> = {
  mutuo:          { icon: "🏠", label: "Mutuo" },
  rata_acquisto:  { icon: "🛍️", label: "Rata acquisto" },
  debito_persona: { icon: "🤝", label: "Debito con persona" },
  altro:          { icon: "📌", label: "Altro" },
};

const EMPTY_A = {
  tipo: "" as "uscita_fissa" | "uscita_variabile" | "",
  name: "",
  frequency: "annuale" as Frequency,
  custom_days: "",
  amount: "",
  amount_max: "",
  next_due_date: "",
  secondary_name: "",
  savings_pot_id: "",
};

const ACCANTONAMENTO_FREQ_OPTIONS: { value: Frequency; label: string }[] = [
  { value: "bimestrale",    label: "Ogni 2 mesi" },
  { value: "trimestrale",   label: "Ogni 3 mesi" },
  { value: "semestrale",    label: "Ogni 6 mesi" },
  { value: "annuale",       label: "Ogni anno" },
  { value: "personalizzata", label: "Personalizzato" },
];

// ─── Navigazione ─────────────────────────────────────────────────────────────
// La vista corrente sta nell'URL (?v=budget): così il tasto Indietro del telefono e del
// browser torna al livello precedente invece di uscire dalla sezione, e dalla dashboard
// si può aprire direttamente il Budget o gli Obiettivi.
const VIEWS: readonly View[] = [
  "cover", "add-recurring", "edit-recurring", "list-recurring", "add-goal", "list-goals", "goal-detail",
  "previsioni", "impegni", "accantonamenti", "accantonamento-form", "budget", "rate", "rate-form",
  "spese-fisse", "spesa-fissa-form",
];
function parseView(v: string | null): View {
  if (!v || !(VIEWS as readonly string[]).includes(v)) return "cover";
  if (v === "impegni") return "cover";             // il vecchio sottomenu non esiste più
  if (v === "list-recurring") return "spese-fisse"; // ex "Spese fisse da sistemare"
  return v as View;
}
const viewHref = (v: View) => (v === "cover" ? "/dashboard/smart" : `/dashboard/smart?v=${v}`);

/** Funzioni solo Premium: al piano gratuito restano Spese fisse e Obiettivi (1). */
const PREMIUM_VIEWS: ReadonlySet<View> = new Set<View>([
  "budget", "rate", "rate-form", "accantonamenti", "accantonamento-form",
  "edit-recurring", "add-recurring", "previsioni",
]);

// ─── Main component ───────────────────────────────────────────────────────────

export function SmartPageClient({
  userId, plan, trialExpired = false, initialGoals, transactions, categories,
  initialRecurring, initialPots = [], initialContributions = [], piggyBalance = 0,
  payDay = 0, periodFrom, periodTo,
  initialCategoryBudgets = [], initialBudgetNotes = [],
}: Props) {
  const searchParams = useSearchParams();
  const view = parseView(searchParams.get("v"));
  const viewRef = useRef(view);
  viewRef.current = view;

  /** Apre una vista aggiungendo un passo alla cronologia (Next sincronizza useSearchParams). */
  const setView = useCallback((v: View) => {
    const href = viewHref(v);
    if (href === window.location.pathname + window.location.search) return;
    window.history.pushState({ flussoSmartFrom: viewRef.current }, "", href);
  }, []);

  /**
   * Torna indietro: se la vista corrente l'abbiamo aperta noi, è un vero "indietro"
   * (come il tasto del telefono); se ci si è arrivati da un link esterno (es. dalla
   * dashboard), si sostituisce con la vista `parent` senza allungare la cronologia.
   */
  const goBack = useCallback((parent: View) => {
    const from = (window.history.state as { flussoSmartFrom?: View } | null)?.flussoSmartFrom;
    if (from !== undefined) { window.history.back(); return; }
    window.history.replaceState({}, "", viewHref(parent));
  }, []);
  const [recurringItems, setRecurringItems] = useState<RecurringExpense[]>(initialRecurring ?? []);
  const [recurringLoading, setRecurringLoading] = useState(!initialRecurring);
  const [goals, setGoals] = useState(initialGoals);

  // Recurring wizard (add)
  const [rStep, setRStep] = useState(1);
  const [rForm, setRForm] = useState(EMPTY_R);
  const [rSaving, setRSaving] = useState(false);
  const [rEditId, setREditId] = useState<string | null>(null);

  // Recurring edit form (flat, single-page)
  const [eForm, setEForm] = useState(EMPTY_R);
  const [eEditId, setEEditId] = useState<string | null>(null);
  const [eSaving, setESaving] = useState(false);
  const [eTxSearch, setETxSearch] = useState("");

  // Spesa fissa in modifica (null = nuova) e spese trovate nei movimenti scartate dall'utente
  const [fEditId, setFEditId] = useState<string | null>(null);
  const [dismissedSuggestions, dismissSuggestion] = useDismissedSuggestions();

  // Rata form (flat, single-page, add + modifica)
  const [dForm, setDForm] = useState(EMPTY_D);
  const [dEditId, setDEditId] = useState<string | null>(null);
  const [dSaving, setDSaving] = useState(false);
  const [dTxSearch, setDTxSearch] = useState("");

  // Accantonamento form (flat, solo aggiunta — la modifica resta sul form generico Ricorrenti)
  const [aForm, setAForm] = useState(EMPTY_A);
  const [aSaving, setASaving] = useState(false);
  const [aTxSearch, setATxSearch] = useState("");

  // Goal wizard
  const [gStep, setGStep] = useState(1);
  const [gForm, setGForm] = useState(EMPTY_G);
  const [gSaving, setGSaving] = useState(false);
  const [gEditId, setGEditId] = useState<string | null>(null);
  const [gDetailId, setGDetailId] = useState<string | null>(null);
  const [contributions, setContributions] = useState<GoalContribution[]>(initialContributions);
  const [contribAmount, setContribAmount] = useState("");
  const [contribNote, setContribNote] = useState("");
  const [contribSaving, setContribSaving] = useState(false);
  const pots = initialPots;

  // Mark-paid dialog
  const [paidDialog, setPaidDialog] = useState<{
    proj: SinkingFundProjection;
    item: RecurringExpense;
  } | null>(null);
  const [paidAmount, setPaidAmount] = useState("");
  const [paidDeduct, setPaidDeduct] = useState(true);
  const [paidSaving, setPaidSaving] = useState(false);

  useEffect(() => {
    if (initialRecurring) return;
    createClient()
      .from("recurring_expenses")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        setRecurringItems((data ?? []) as RecurringExpense[]);
        setRecurringLoading(false);
      });
  }, [userId, initialRecurring]);

  // ── Period helpers ─────────────────────────────────────────────────────────
  const now = new Date();
  const pStart = periodFrom ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const pEnd = periodTo;
  const monthTxs = transactions.filter(
    t => Number(t.amount) < 0 && t.date >= pStart && (pEnd ? t.date <= pEnd : true)
  );

  // Dopo un ricaricamento, una vista che dipende da cosa si stava guardando (dettaglio,
  // modifica) non ha più i dati: si torna alla lista corrispondente.
  useEffect(() => {
    if (view === "goal-detail" && !goals.some(g => g.id === gDetailId)) window.history.replaceState({}, "", viewHref("list-goals"));
    if (view === "edit-recurring" && !eEditId) window.history.replaceState({}, "", viewHref("accantonamenti"));
  }, [view, goals, gDetailId, eEditId]);

  // ── Navigation helpers ─────────────────────────────────────────────────────

  function goAddRecurring() {
    setRForm(EMPTY_R); setRStep(1); setREditId(null); setView("add-recurring");
  }

  function goEditRecurring(item: RecurringExpense) {
    setEForm({
      tipo: item.tipologia === "variabile" ? "uscita_variabile"
          : item.tipologia === "entrata" ? "entrata"
          : "uscita_fissa",
      name: item.name,
      frequency: item.frequency,
      custom_days: item.custom_days?.toString() ?? "",
      amount: item.amount.toString().replace(".", ","),
      amount_max: item.amount_max?.toString().replace(".", ",") ?? "",
      due_day: item.due_day ?? null,
      due_month: item.due_month ?? null,
      secondary_name: item.secondary_name ?? "",
      end_date: item.end_date ?? "",
      next_due_date: item.next_due_date ?? "",
      savings_pot_id: item.savings_pot_id ?? "",
    });
    setEEditId(item.id); setETxSearch(""); setView("edit-recurring");
  }

  function goAddRate() {
    setDForm(EMPTY_D); setDEditId(null); setDTxSearch(""); setView("rate-form");
  }

  function goEditRate(item: RecurringExpense) {
    setDForm({
      debt_type: (item.debt_type ?? "") as DebtType | "",
      name: item.name,
      amount: item.amount.toString().replace(".", ","),
      debt_total_amount: item.debt_total_amount != null ? String(item.debt_total_amount).replace(".", ",") : "",
      debt_start_date: item.debt_start_date ?? "",
      due_day: item.due_day ?? null,
      secondary_name: item.secondary_name ?? "",
    });
    setDEditId(item.id); setDTxSearch(""); setView("rate-form");
  }

  async function handleSaveRate() {
    const amt = parseFloat(dForm.amount.replace(",", "."));
    const total = parseFloat(dForm.debt_total_amount.replace(",", "."));
    if (!dForm.debt_type) { toast.error("Scegli il tipo di rata/debito."); return; }
    if (!dForm.name.trim()) { toast.error("Inserisci un nome."); return; }
    if (isNaN(amt) || amt <= 0) { toast.error("Inserisci una rata mensile valida."); return; }
    if (isNaN(total) || total < amt) { toast.error("L'importo totale deve essere almeno pari alla rata mensile."); return; }
    if (!dForm.debt_start_date) { toast.error("Inserisci la data di inizio."); return; }

    setDSaving(true);
    const progress = computeDebtProgress({ totalAmount: total, monthlyAmount: amt, startDate: dForm.debt_start_date });
    const payload = {
      name: dForm.name.trim(), tipologia: "fissa" as Tipologia, frequency: "mensile" as Frequency,
      custom_days: null, amount: amt, amount_max: null,
      match_keywords: [], matching_strategy: "keyword",
      due_day: dForm.due_day, category_id: null, notes: null,
      secondary_name: dForm.secondary_name.trim() || null,
      next_due_date: null, saving_start_date: null,
      end_date: toISODate(progress.endDate),
      debt_type: dForm.debt_type, debt_total_amount: total, debt_start_date: dForm.debt_start_date,
    };

    const supabase = createClient();
    if (dEditId) {
      const { data, error } = await supabase
        .from("recurring_expenses").update(payload).eq("id", dEditId).select("*").single();
      if (error) toast.error(`Errore: ${error.message}`);
      else {
        setRecurringItems(prev => prev.map(it => it.id === dEditId ? data as RecurringExpense : it));
        toast.success("Rata modificata!"); goBack("rate");
      }
    } else {
      const { data, error } = await supabase
        .from("recurring_expenses").insert({ user_id: userId, ...payload }).select("*").single();
      if (error) toast.error(`Errore: ${error.message}`);
      else {
        setRecurringItems(prev => [...prev, data as RecurringExpense]);
        toast.success("Rata aggiunta!"); goBack("rate");
      }
    }
    setDSaving(false);
  }

  /** Il salvadanaio in comune a tutti gli accantonamenti, "" se nessuno, "mixed" se diversi. */
  function sinkingPot(): string {
    const ids = new Set(recurringItems.filter(it => it.next_due_date).map(it => it.savings_pot_id ?? ""));
    if (ids.size === 0) return "";
    return ids.size === 1 ? [...ids][0] : "mixed";
  }

  function goAddAccantonamento() {
    const common = sinkingPot();
    setAForm({ ...EMPTY_A, savings_pot_id: common === "mixed" ? "" : common });
    setATxSearch(""); setView("accantonamento-form");
  }

  const [potSaving, setPotSaving] = useState(false);
  async function handleSetSinkingPot(potId: string) {
    setPotSaving(true);
    const { error } = await createClient().from("recurring_expenses")
      .update({ savings_pot_id: potId || null })
      .eq("user_id", userId).not("next_due_date", "is", null);
    setPotSaving(false);
    if (error) { toast.error(`Errore: ${error.message}`); return; }
    setRecurringItems(prev => prev.map(it => it.next_due_date ? { ...it, savings_pot_id: potId || null } : it));
    const pot = pots.find(p => p.id === potId);
    toast.success(pot ? `Gli accantonamenti ora usano il salvadanaio "${pot.name}"` : "Gli accantonamenti ora contano tutti i salvadanai");
  }

  async function handleSaveAccantonamento() {
    const amt = parseFloat(aForm.amount.replace(",", "."));
    if (!aForm.tipo) { toast.error("Scegli il tipo."); return; }
    if (!aForm.name.trim() || isNaN(amt) || amt <= 0) { toast.error("Inserisci nome e importo."); return; }
    if (!aForm.next_due_date) { toast.error("Inserisci la prossima scadenza."); return; }
    const tipologia: Tipologia = aForm.tipo === "uscita_variabile" ? "variabile" : "fissa";
    const amtMax = tipologia === "variabile" && aForm.amount_max
      ? parseFloat(aForm.amount_max.replace(",", ".")) : null;
    const custDays = aForm.frequency === "personalizzata"
      ? parseInt(aForm.custom_days) || null : null;
    if (aForm.frequency === "personalizzata" && (!custDays || custDays <= 0)) {
      toast.error("Inserisci un intervallo valido."); return;
    }

    setASaving(true);
    const payload = {
      name: aForm.name.trim(), tipologia, frequency: aForm.frequency,
      custom_days: custDays, amount: amt, amount_max: amtMax,
      match_keywords: [], matching_strategy: "keyword",
      due_day: null, category_id: null, notes: null,
      secondary_name: aForm.secondary_name.trim() || null,
      next_due_date: aForm.next_due_date,
      saving_start_date: todayISO(),
      savings_pot_id: aForm.savings_pot_id || null,
    };
    const { data, error } = await createClient()
      .from("recurring_expenses").insert({ user_id: userId, ...payload }).select("*").single();
    if (error) toast.error(`Errore: ${error.message}`);
    else {
      setRecurringItems(prev => [...prev, data as RecurringExpense]);
      toast.success("Accantonamento aggiunto!"); goBack("accantonamenti");
    }
    setASaving(false);
  }

  function goAddGoal() {
    setGForm(EMPTY_G); setGStep(1); setGEditId(null); setView("add-goal");
  }

  function goEditGoal(g: Goal) {
    setGForm({
      name: g.name, icon: g.icon,
      target_amount: g.target_amount.toString().replace(".", ","),
      current_amount: g.current_amount.toString().replace(".", ","),
      deadline: g.deadline ?? "",
      savings_pot_id: g.savings_pot_id ?? "",
      monthly_contribution: g.monthly_contribution != null ? String(g.monthly_contribution).replace(".", ",") : "",
    });
    setGStep(1); setGEditId(g.id); setView("add-goal");
  }

  function goGoalDetail(g: Goal) {
    setGDetailId(g.id); setContribAmount(""); setContribNote(""); setView("goal-detail");
  }

  async function handleAddContribution() {
    if (!gDetailId) return;
    const amt = parseFloat(contribAmount.replace(",", "."));
    if (isNaN(amt) || amt <= 0) { toast.error("Importo non valido."); return; }
    setContribSaving(true);
    const res = await addGoalContribution({ goalId: gDetailId, amount: amt, note: contribNote });
    setContribSaving(false);
    if (res?.error) { toast.error(res.error); return; }
    setContributions(prev => [
      { id: res.id ?? crypto.randomUUID(), goal_id: gDetailId, amount: amt, note: contribNote || null, date: todayISO() },
      ...prev,
    ]);
    setGoals(prev => prev.map(g => g.id === gDetailId ? { ...g, current_amount: Number(g.current_amount) + amt } : g));
    setContribAmount(""); setContribNote("");
    toast.success("Contributo aggiunto!");
  }

  // ── Recurring CRUD ─────────────────────────────────────────────────────────

  async function handleSaveRecurring() {
    const amt = parseFloat(rForm.amount.replace(",", "."));
    if (!rForm.name.trim() || isNaN(amt) || amt <= 0) {
      toast.error("Inserisci nome e importo."); return;
    }
    const tipologia: Tipologia =
      rForm.tipo === "uscita_variabile" ? "variabile"
      : rForm.tipo === "entrata" ? "entrata"
      : "fissa";
    const amtMax = tipologia === "variabile" && rForm.amount_max
      ? parseFloat(rForm.amount_max.replace(",", ".")) : null;
    const custDays = rForm.frequency === "personalizzata"
      ? parseInt(rForm.custom_days) || null : null;
    if (rForm.frequency === "personalizzata" && (!custDays || custDays <= 0)) {
      toast.error("Inserisci un intervallo valido."); return;
    }

    setRSaving(true);
    const supabase = createClient();
    const nextDueDate = rForm.next_due_date || null;
    const payload = {
      name: rForm.name.trim(), tipologia, frequency: rForm.frequency,
      custom_days: custDays, amount: amt, amount_max: amtMax,
      match_keywords: [], matching_strategy: "keyword",
      due_day: rForm.due_day, category_id: null, notes: null,
      secondary_name: rForm.secondary_name.trim() || null,
      next_due_date: nextDueDate,
      saving_start_date: nextDueDate ? todayISO() : null,
    };

    if (rEditId) {
      const { data, error } = await supabase
        .from("recurring_expenses").update(payload).eq("id", rEditId).select("*").single();
      if (error) toast.error(`Errore: ${error.message}`);
      else {
        setRecurringItems(prev => prev.map(it => it.id === rEditId ? data as RecurringExpense : it));
        toast.success("Modificata!"); goBack("spese-fisse");
      }
    } else {
      const { data, error } = await supabase
        .from("recurring_expenses").insert({ user_id: userId, ...payload }).select("*").single();
      if (error) toast.error(`Errore: ${error.message}`);
      else {
        setRecurringItems(prev => [...prev, data as RecurringExpense]);
        toast.success("Aggiunta!"); setView("spese-fisse");
      }
    }
    setRSaving(false);
  }

  async function handleDeleteRecurring(id: string) {
    const { error } = await createClient().from("recurring_expenses").delete().eq("id", id);
    if (error) toast.error("Errore.");
    else { setRecurringItems(prev => prev.filter(it => it.id !== id)); toast.success("Rimossa."); }
  }

  async function handleUpdateRecurring() {
    if (!eEditId) return;
    const amt = parseFloat(eForm.amount.replace(",", "."));
    if (!eForm.name.trim() || isNaN(amt) || amt <= 0) {
      toast.error("Inserisci nome e importo."); return;
    }
    const tipologia: Tipologia =
      eForm.tipo === "uscita_variabile" ? "variabile"
      : eForm.tipo === "entrata" ? "entrata"
      : "fissa";
    const amtMax = tipologia === "variabile" && eForm.amount_max
      ? parseFloat(eForm.amount_max.replace(",", ".")) : null;
    const custDays = eForm.frequency === "personalizzata"
      ? parseInt(eForm.custom_days) || null : null;
    if (eForm.frequency === "personalizzata" && (!custDays || custDays <= 0)) {
      toast.error("Inserisci un intervallo valido."); return;
    }
    setESaving(true);
    const nextDueDate = eForm.next_due_date || null;
    const originalItem = recurringItems.find(it => it.id === eEditId);
    const savingStartDate = nextDueDate
      ? (originalItem?.saving_start_date ?? todayISO())
      : null;
    const payload = {
      name: eForm.name.trim(), tipologia, frequency: eForm.frequency,
      custom_days: custDays, amount: amt, amount_max: amtMax,
      due_day: eForm.due_day,
      due_month: eForm.frequency === "annuale" ? eForm.due_month : null,
      secondary_name: eForm.secondary_name.trim() || null,
      end_date: eForm.end_date || null,
      next_due_date: nextDueDate,
      saving_start_date: savingStartDate,
      savings_pot_id: eForm.savings_pot_id || null,
    };
    const { data, error } = await createClient()
      .from("recurring_expenses").update(payload).eq("id", eEditId).select("*").single();
    if (error) toast.error(`Errore: ${error.message}`);
    else {
      setRecurringItems(prev => prev.map(it => it.id === eEditId ? data as RecurringExpense : it));
      toast.success("Modificata!"); goBack("accantonamenti");
    }
    setESaving(false);
  }

  // ── Goal CRUD ──────────────────────────────────────────────────────────────

  async function handleSaveGoal() {
    const ta = parseFloat(gForm.target_amount.replace(",", "."));
    const ca = parseFloat(gForm.current_amount.replace(",", ".") || "0");
    if (!gForm.name.trim() || isNaN(ta) || ta <= 0) {
      toast.error("Inserisci nome e importo."); return;
    }
    setGSaving(true);
    const supabase = createClient();
    const mc = parseFloat(gForm.monthly_contribution.replace(",", "."));
    const payload = {
      name: gForm.name.trim(), icon: gForm.icon,
      target_amount: ta, current_amount: isNaN(ca) ? 0 : ca,
      deadline: gForm.deadline || null,
      savings_pot_id: gForm.savings_pot_id || null,
      monthly_contribution: isNaN(mc) ? null : mc,
    };
    if (gEditId) {
      const { data, error } = await supabase
        .from("goals").update(payload).eq("id", gEditId).select().single();
      if (error) toast.error("Errore.");
      else {
        setGoals(prev => prev.map(g => g.id === gEditId ? data as Goal : g));
        toast.success("Obiettivo aggiornato!"); goBack("list-goals");
      }
    } else {
      const { data, error } = await supabase
        .from("goals").insert({ user_id: userId, ...payload }).select().single();
      if (error) toast.error("Errore.");
      else {
        setGoals(prev => [data as Goal, ...prev]);
        toast.success("Obiettivo creato!"); goBack("list-goals");
      }
    }
    setGSaving(false);
  }

  async function handleDeleteGoal(id: string) {
    const { error } = await createClient().from("goals").delete().eq("id", id);
    if (error) toast.error("Errore.");
    else { setGoals(prev => prev.filter(g => g.id !== id)); toast.success("Eliminato."); }
  }

  // ── Transaction name suggestions ──────────────────────────────────────────
  const txSuggestions = rForm.name.length >= 2
    ? transactions
        .filter(t => {
          const q = rForm.name.toLowerCase();
          return t.description?.toLowerCase().includes(q) || t.merchant?.toLowerCase().includes(q);
        })
        .slice(0, 4)
    : [];

  // ═══════════════════════════════════════════════════════════════════════════
  // COVER
  // ═══════════════════════════════════════════════════════════════════════════

  const isFree = plan === "free";

  if (isFree && PREMIUM_VIEWS.has(view)) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-16 text-center max-w-md mx-auto">
        <TrackOnMount name="smart_locked_viewed" props={{ trial_expired: trialExpired, view }} />
        <div className="self-start"><BackButton onClick={() => goBack("cover")} /></div>
        <span className="text-6xl">🔒</span>
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold">{trialExpired ? "La prova Premium è finita" : "Funzione Premium"}</h1>
          <p className="text-muted-foreground">
            Budget per categoria, rate e accantonamenti servono a Flusso per dirti quanto avrai a fine mese.
            {trialExpired ? " I tuoi dati restano tutti qui." : ""}
          </p>
        </div>
        <div className="flex flex-col gap-3 w-full">
          <Link
            href="/dashboard/account"
            className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-6 py-3 text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Passa a Premium
          </Link>
          <Link href="/dashboard/account" className="text-sm text-muted-foreground hover:text-foreground underline">
            Hai un codice coupon? Riscattalo qui
          </Link>
        </div>
      </div>
    );
  }

  if (view === "cover") {
    const rateActive = recurringItems.filter(it => it.debt_type && it.debt_start_date && it.debt_total_amount
      && computeDebtProgress({ totalAmount: it.debt_total_amount, monthlyAmount: it.amount, startDate: it.debt_start_date }).status === "active");
    const accantonamentiCount = recurringItems.filter(it => it.next_due_date).length;
    const potsTotal = pots.reduce((sum, p) => sum + Number(p.current_balance), 0);
    const fixedCount = recurringItems.filter(isFixedExpense).length;
    const foundCount = fixedSuggestions(recurringItems, transactions, categories, dismissedSuggestions).length;

    type Item = { icon: string; label: string; desc: string; badge?: string; premium: boolean; tour?: string; onClick?: () => void; href?: string };
    const SECTIONS: { title: string; items: Item[] }[] = [
      {
        title: "Le spese del mese",
        items: [
          { icon: "📋", label: "Spese fisse", desc: "Affitto, bollette, telefono, abbonamenti: quelle che arrivano da sole", premium: false, tour: "smart-spese-fisse",
            badge: fixedCount ? `${fixedCount}` : foundCount ? `${foundCount} ${foundCount === 1 ? "trovata" : "trovate"}` : undefined, onClick: () => setView("spese-fisse") },
          { icon: "🧮", label: "Budget", desc: "Quanto vuoi spendere per le spese che cambiano: spesa, ristoranti, svago…", premium: true, tour: "smart-budget", onClick: () => setView("budget") },
          { icon: "📆", label: "Rate e mutui", desc: "Mutuo, finanziamenti, prestiti: quanto hai pagato e quanto manca", premium: true,
            badge: rateActive.length ? `${rateActive.length} in corso` : undefined, onClick: () => setView("rate") },
          { icon: "🏦", label: "Accantonamenti", desc: "Spese annuali (assicurazione, bollo…): quanto mettere da parte ogni mese per non trovarti scoperto", premium: true,
            badge: accantonamentiCount ? `${accantonamentiCount}` : undefined, onClick: () => setView("accantonamenti") },
        ],
      },
      {
        title: "I tuoi risparmi",
        items: [
          { icon: "🎯", label: "Obiettivi", desc: "Una cifra da raggiungere entro una data: vacanza, fondo emergenza, un acquisto", premium: false, tour: "smart-obiettivi",
            badge: goals.length ? `${goals.length}` : undefined, onClick: () => setView("list-goals") },
          { icon: "🐷", label: "Salvadanai", desc: "I soldi che hai già messo da parte, anche in comune con la famiglia", premium: false,
            badge: potsTotal > 0 ? fmt(potsTotal) : undefined, href: "/dashboard/salvadanai" },
        ],
      },
    ];

    const cardClass = "flex items-center gap-4 rounded-2xl border-2 border-border hover:border-primary/50 hover:bg-primary/5 px-4 py-3.5 text-left transition-all active:scale-[0.98] w-full";
    const cardBody = (it: Item) => (
      <>
        <span className="text-2xl shrink-0">{it.icon}</span>
        <span className="flex flex-col min-w-0 flex-1">
          <span className="text-base font-medium flex items-center gap-2">
            {it.label}
            {it.premium && isFree && <span className="text-[10px] font-semibold uppercase tracking-wide rounded bg-muted px-1.5 py-0.5 text-muted-foreground">🔒 Premium</span>}
          </span>
          <span className="text-xs text-muted-foreground">{it.desc}</span>
        </span>
        {it.badge && <span className="text-xs text-muted-foreground tabular-nums shrink-0">{it.badge}</span>}
        <span className="text-muted-foreground shrink-0">›</span>
      </>
    );

    return (
      <div className="flex flex-col gap-5">
        <Suspense><PageTour path="/dashboard/smart" plan={plan} /></Suspense>
        <div>
          <h1 className="text-2xl font-bold">Pianifica</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Decidi in anticipo dove vanno i tuoi soldi: Flusso usa queste scelte per dirti in dashboard quanto avrai a fine mese.
          </p>
        </div>

        {SECTIONS.map(section => (
          <div key={section.title} className="flex flex-col gap-2">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{section.title}</h2>
            {section.items.map(it => it.href ? (
              <Link key={it.label} href={it.href} data-tour={it.tour} className={cardClass}>{cardBody(it)}</Link>
            ) : (
              <button key={it.label} onClick={it.onClick} data-tour={it.tour} className={cardClass}>{cardBody(it)}</button>
            ))}
          </div>
        ))}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // IMPEGNI (sottomenu: Rate / Accantonamenti / Budget)
  // ═══════════════════════════════════════════════════════════════════════════

  if (view === "impegni") {
    const IMPEGNI_ITEMS = [
      { icon: "📆", label: "Rate",           desc: "Mutui, rate d'acquisto e debiti — fisse, mensili",         action: () => setView("rate") },
      { icon: "🏦", label: "Accantonamenti", desc: "Spese future grandi — quota da mettere da parte",          action: () => setView("accantonamenti") },
      { icon: "🧮", label: "Budget",         desc: "Spese variabili — quanto puoi spendere per categoria",     action: () => setView("budget") },
    ] as const;

    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <BackButton onClick={() => goBack("cover")} />
          <h1 className="text-xl font-bold">Rate, Accantonamenti, Budget</h1>
        </div>
        <p className="text-sm text-muted-foreground -mt-2">
          I tuoi impegni finanziari fissi mensili (Rate), quelli da accantonare per una scadenza futura
          (Accantonamenti) e le spese variabili che pianifichi per categoria (Budget).
        </p>
        {IMPEGNI_ITEMS.map(({ icon, label, desc, action }) => (
          <button
            key={label}
            onClick={action}
            className="flex items-center gap-4 rounded-2xl border-2 border-border hover:border-primary/50 hover:bg-primary/5 px-5 py-4 text-left transition-all active:scale-[0.98]"
          >
            <span className="text-2xl">{icon}</span>
            <div className="flex flex-col">
              <span className="text-base font-medium">{label}</span>
              <span className="text-xs text-muted-foreground">{desc}</span>
            </div>
            <span className="ml-auto text-muted-foreground">›</span>
          </button>
        ))}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BUDGET
  // ═══════════════════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════════════════
  // SPESE FISSE (elenco e modulo: fixed-expenses-panel.tsx)
  // ═══════════════════════════════════════════════════════════════════════════

  if (view === "spese-fisse" || view === "spesa-fissa-form") {
    return (
      <FixedExpensesPanel
        mode={view === "spese-fisse" ? "list" : "form"}
        userId={userId}
        items={recurringItems}
        setItems={fn => setRecurringItems(prev => fn(prev) as unknown as RecurringExpense[])}
        transactions={transactions}
        categories={categories}
        categoryBudgets={initialCategoryBudgets}
        periodFrom={pStart}
        periodTo={pEnd ?? pStart}
        editId={fEditId}
        dismissed={dismissedSuggestions}
        onDismiss={dismissSuggestion}
        onOpenForm={id => { setFEditId(id); setView("spesa-fissa-form"); }}
        onBack={() => goBack(view === "spese-fisse" ? "cover" : "spese-fisse")}
        onOpenBudget={() => setView("budget")}
        onOpenRate={() => setView("rate")}
      />
    );
  }

  if (view === "budget") {
    return (
      <BudgetPanel
        userId={userId}
        categories={categories}
        transactions={transactions}
        recurringItems={recurringItems}
        planItems={recurringItems.filter(it => isFixedExpense(it) || it.debt_type)}
        piggyBalance={piggyBalance}
        payDay={payDay}
        initialBudgets={initialCategoryBudgets}
        initialNotes={initialBudgetNotes}
        onBack={() => goBack("cover")}
        onOpenAccantonamenti={() => setView("accantonamenti")}
        onOpenFixed={() => setView("spese-fisse")}
      />
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RATE
  // ═══════════════════════════════════════════════════════════════════════════

  if (view === "rate") {
    const rateWithProgress = recurringItems
      .filter(it => it.debt_type && it.debt_total_amount && it.debt_start_date)
      .map(item => ({
        item,
        progress: computeDebtProgress({
          totalAmount: item.debt_total_amount!, monthlyAmount: item.amount, startDate: item.debt_start_date!,
        }),
      }));

    // In corso prima (le più vicine alla fine in cima), poi quelle non ancora iniziate
    // (le più imminenti in cima), infine le terminate (le più recenti in cima).
    const STATUS_ORDER: Record<string, number> = { active: 0, future: 1, finished: 2 };
    const rateSorted = [...rateWithProgress].sort((a, b) => {
      const byStatus = STATUS_ORDER[a.progress.status] - STATUS_ORDER[b.progress.status];
      if (byStatus !== 0) return byStatus;
      if (a.progress.status === "active") return a.progress.monthsRemaining - b.progress.monthsRemaining;
      if (a.progress.status === "future") return a.item.debt_start_date!.localeCompare(b.item.debt_start_date!);
      return b.progress.endDate.getTime() - a.progress.endDate.getTime();
    });

    const activeOnly = rateWithProgress.filter(r => r.progress.status === "active");
    const totalMonthly = activeOnly.reduce((s, r) => s + r.item.amount, 0);
    const totalRemaining = activeOnly.reduce((s, r) => s + r.progress.remaining, 0);

    const STATUS_META: Record<string, { label: string; className: string }> = {
      active:   { label: "🟢 In corso", className: "bg-green-500/10 text-green-600 dark:text-green-400" },
      future:   { label: "", className: "bg-muted text-muted-foreground" }, // etichetta calcolata per voce (data di inizio)
      finished: { label: "⚪ Terminata", className: "bg-muted text-muted-foreground" },
    };

    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <BackButton onClick={() => goBack("cover")} />
          <h1 className="text-xl font-bold flex-1">Rate</h1>
          <button
            onClick={goAddRate}
            className="text-sm bg-primary text-primary-foreground rounded-lg px-3 py-1.5 hover:bg-primary/90 transition-colors"
          >
            + Aggiungi
          </button>
        </div>

        {rateWithProgress.length > 0 && (
          <div className="rounded-2xl border-2 p-5 flex flex-col gap-1">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Totale rate al mese (in corso)</span>
            <span className="text-2xl font-bold tabular-nums">{fmt(totalMonthly)}</span>
            <span className="text-xs text-muted-foreground">Debito residuo (rate in corso): {fmt(totalRemaining)}</span>
          </div>
        )}

        {rateWithProgress.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <span className="text-5xl">📆</span>
            <p className="text-muted-foreground">Nessuna rata o debito ancora tracciato.</p>
            <button
              onClick={goAddRate}
              className="bg-primary text-primary-foreground rounded-xl px-5 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Aggiungi la prima
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {rateSorted.map(({ item, progress }) => {
              const meta = DEBT_TYPE_META[item.debt_type as DebtType];
              const pct = Math.min(100, (progress.paidSoFar / item.debt_total_amount!) * 100);
              const kws = effectiveKws(item);
              const paidThisPeriod = kws.length > 0 && transactions.some(
                t => Number(t.amount) < 0 && t.date >= pStart && (pEnd ? t.date <= pEnd : true) && txMatchesKws(t, kws)
              );
              const statusLabel = progress.status === "future"
                ? `🕓 Inizia il ${new Date(item.debt_start_date! + "T00:00:00").toLocaleDateString("it-IT")}`
                : STATUS_META[progress.status].label;
              return (
                <div key={item.id} className={`rounded-xl border p-4 flex flex-col gap-3 ${progress.status === "finished" ? "opacity-60" : ""}`}>
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{meta.icon} {item.name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap ${STATUS_META[progress.status].className}`}>
                          {statusLabel}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {meta.label} · {fmt(item.amount)}/mese
                        {item.due_day ? ` · giorno ${item.due_day}` : ""}
                      </div>
                      {progress.status === "active" && (
                        kws.length > 0 ? (
                          <span className={`inline-block mt-1.5 text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap ${
                            paidThisPeriod
                              ? "bg-green-500/10 text-green-600 dark:text-green-400"
                              : "bg-muted text-muted-foreground"
                          }`}>
                            {paidThisPeriod ? "✅ Pagata questo mese" : "⏳ Non ancora pagata questo mese"}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => goEditRate(item)}
                            className="block mt-1.5 text-[10px] text-primary underline hover:no-underline"
                          >
                            🔗 Collega una transazione per verificare i pagamenti
                          </button>
                        )
                      )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => goEditRate(item)}
                        className="text-xs text-muted-foreground hover:text-foreground border rounded-lg px-2 py-1 transition-colors"
                        title="Modifica"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDeleteRecurring(item.id)}
                        className="text-xs text-muted-foreground hover:text-destructive border rounded-lg px-2 py-1 transition-colors"
                        title="Elimina"
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>Pagato: <span className="font-semibold text-foreground">{fmt(progress.paidSoFar)}</span> / {fmt(item.debt_total_amount!)}</span>
                    <span>
                      {progress.monthsRemaining > 0
                        ? <>Mancano <span className="font-semibold text-foreground">{progress.monthsRemaining}</span> {progress.monthsRemaining === 1 ? "mese" : "mesi"}</>
                        : <span className="font-semibold text-green-600 dark:text-green-400">Saldata</span>}
                    </span>
                    <span>Termina: <span className="font-semibold text-foreground">{progress.endDate.toLocaleDateString("it-IT", { month: "long", year: "numeric" })}</span></span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RATE — form (aggiungi/modifica)
  // ═══════════════════════════════════════════════════════════════════════════

  if (view === "rate-form") {
    return (
      <div className="flex flex-col gap-6 max-w-md mx-auto w-full">
        <div className="flex items-center gap-3">
          <BackButton onClick={() => goBack("rate")} />
          <h1 className="text-xl font-bold">{dEditId ? "Modifica rata" : "Nuova rata"}</h1>
        </div>

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Tipo</label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(DEBT_TYPE_META) as DebtType[]).map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setDForm(f => ({ ...f, debt_type: type }))}
                  className={`flex items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-sm text-left transition-all ${
                    dForm.debt_type === type ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                  }`}
                >
                  <span className="text-lg">{DEBT_TYPE_META[type].icon}</span>
                  {DEBT_TYPE_META[type].label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Nome</label>
            <input
              type="text" value={dForm.name}
              onChange={e => setDForm(f => ({ ...f, name: e.target.value }))}
              placeholder="es. Mutuo casa, Rata frigorifero, Prestito da Luca…"
              className="border-2 rounded-xl px-4 py-3 text-base bg-background focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Rata mensile (€)</label>
            <input
              type="text" value={dForm.amount}
              onChange={e => setDForm(f => ({ ...f, amount: e.target.value }))}
              placeholder="es. 350"
              className="border-2 rounded-xl px-4 py-3 text-base bg-background focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Importo totale finanziato (€)</label>
            <input
              type="text" value={dForm.debt_total_amount}
              onChange={e => setDForm(f => ({ ...f, debt_total_amount: e.target.value }))}
              placeholder="es. 12000"
              className="border-2 rounded-xl px-4 py-3 text-base bg-background focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Data di inizio</label>
            <input
              type="date" value={dForm.debt_start_date}
              onChange={e => setDForm(f => ({ ...f, debt_start_date: e.target.value }))}
              className="border-2 rounded-xl px-4 py-3 text-base bg-background focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">
              Giorno del mese{" "}
              <span className="text-muted-foreground font-normal">— opzionale</span>
            </label>
            <input
              type="number" min={1} max={31} value={dForm.due_day ?? ""}
              onChange={e => setDForm(f => ({ ...f, due_day: e.target.value ? parseInt(e.target.value) : null }))}
              placeholder="es. 27"
              className="border-2 rounded-xl px-4 py-3 text-base bg-background focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          {/* Collega a transazione */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Collega a transazione</label>
            <p className="text-xs text-muted-foreground -mt-1">
              Collega una transazione reale: Flusso riconoscerà da sola quando la rata è stata pagata questo mese.
            </p>
            {dForm.secondary_name ? (
              <div className="flex items-center gap-3 rounded-xl border-2 border-primary/40 bg-primary/5 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{dForm.secondary_name}</p>
                  <p className="text-xs text-muted-foreground">Collegata</p>
                </div>
                <button
                  type="button"
                  onClick={() => setDForm(f => ({ ...f, secondary_name: "" }))}
                  className="text-xs text-muted-foreground hover:text-destructive transition-colors shrink-0"
                >
                  ✕ Scollega
                </button>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  value={dTxSearch}
                  onChange={e => setDTxSearch(e.target.value)}
                  placeholder="Cerca, o sfoglia le più recenti qui sotto…"
                  className="border-2 rounded-xl px-4 py-3 text-base bg-background focus:outline-none focus:border-primary transition-colors"
                />
                <div className="flex flex-col gap-1">
                  <p className="text-xs text-muted-foreground px-1">
                    {dTxSearch.trim().length >= 2 ? "Risultati" : "Transazioni recenti"}
                  </p>
                  {pickTxCandidates(transactions, dTxSearch).map((t, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        setDForm(f => ({ ...f, secondary_name: t.description ?? t.merchant ?? "" }));
                        setDTxSearch("");
                      }}
                      className="text-left px-3 py-2.5 rounded-xl border hover:bg-muted/50 transition-colors flex items-center gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{t.description || t.merchant}</p>
                        <p className="text-xs text-muted-foreground">
                          {fmt(Math.abs(Number(t.amount)))} · {new Date(t.date + "T00:00:00").toLocaleDateString("it-IT")}
                        </p>
                      </div>
                      <span className="text-xs text-primary shrink-0">Collega →</span>
                    </button>
                  ))}
                  {pickTxCandidates(transactions, dTxSearch).length === 0 && (
                    <p className="text-xs text-muted-foreground px-1">Nessuna transazione trovata.</p>
                  )}
                </div>
              </>
            )}
          </div>

          {(() => {
            const amt = parseFloat(dForm.amount.replace(",", "."));
            const total = parseFloat(dForm.debt_total_amount.replace(",", "."));
            if (isNaN(amt) || amt <= 0 || isNaN(total) || total < amt || !dForm.debt_start_date) return null;
            const preview = computeDebtProgress({ totalAmount: total, monthlyAmount: amt, startDate: dForm.debt_start_date });
            return (
              <p className="text-xs text-muted-foreground rounded-lg border bg-muted/30 px-3 py-2">
                💡 {preview.totalMonths} rate in tutto, termina a{" "}
                {preview.endDate.toLocaleDateString("it-IT", { month: "long", year: "numeric" })}.
              </p>
            );
          })()}
        </div>

        <button
          onClick={handleSaveRate}
          disabled={dSaving}
          className="bg-primary text-primary-foreground rounded-xl px-6 py-3 font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {dSaving ? "Salvataggio…" : dEditId ? "Salva modifiche" : "Aggiungi rata"}
        </button>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ACCANTONAMENTO — form (solo aggiunta; la modifica usa il form generico Ricorrenti)
  // ═══════════════════════════════════════════════════════════════════════════

  if (view === "accantonamento-form") {
    const isVariabileA = aForm.tipo === "uscita_variabile";
    return (
      <div className="flex flex-col gap-6 max-w-md mx-auto w-full">
        <div className="flex items-center gap-3">
          <BackButton onClick={() => goBack("accantonamenti")} />
          <h1 className="text-xl font-bold">Nuovo accantonamento</h1>
        </div>

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Tipo</label>
            <div className="flex gap-2">
              {([
                { value: "uscita_fissa", icon: "💸", label: "Importo fisso" },
                { value: "uscita_variabile", icon: "📊", label: "Importo variabile" },
              ] as const).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setAForm(f => ({ ...f, tipo: opt.value }))}
                  className={`flex-1 flex flex-col items-center gap-1 rounded-xl border-2 py-3 text-xs font-medium transition-all ${
                    aForm.tipo === opt.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                  }`}
                >
                  <span className="text-xl">{opt.icon}</span>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Nome</label>
            <input
              type="text" value={aForm.name}
              onChange={e => setAForm(f => ({ ...f, name: e.target.value }))}
              placeholder="es. Assicurazione auto, Manutenzione caldaia…"
              className="border-2 rounded-xl px-4 py-3 text-base bg-background focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Ogni quanto ricorre</label>
            <select
              value={aForm.frequency}
              onChange={e => setAForm(f => ({ ...f, frequency: e.target.value as Frequency }))}
              className="border-2 rounded-xl px-4 py-3 text-base bg-background focus:outline-none focus:border-primary transition-colors"
            >
              {ACCANTONAMENTO_FREQ_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {aForm.frequency === "personalizzata" && (
              <input
                type="number" value={aForm.custom_days}
                onChange={e => setAForm(f => ({ ...f, custom_days: e.target.value }))}
                placeholder="Ogni quanti giorni?"
                min={1}
                className="border-2 rounded-xl px-4 py-3 text-base bg-background focus:outline-none focus:border-primary transition-colors"
              />
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">{isVariabileA ? "Importo minimo (€)" : "Importo (€)"}</label>
            <input
              type="text" value={aForm.amount}
              onChange={e => setAForm(f => ({ ...f, amount: e.target.value }))}
              placeholder="es. 350"
              className="border-2 rounded-xl px-4 py-3 text-base bg-background focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          {isVariabileA && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Importo massimo (€)</label>
              <input
                type="text" value={aForm.amount_max}
                onChange={e => setAForm(f => ({ ...f, amount_max: e.target.value }))}
                placeholder="es. 500"
                className="border-2 rounded-xl px-4 py-3 text-base bg-background focus:outline-none focus:border-primary transition-colors"
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Prossima scadenza</label>
            <input
              type="date" value={aForm.next_due_date}
              onChange={e => setAForm(f => ({ ...f, next_due_date: e.target.value }))}
              className="border-2 rounded-xl px-4 py-3 text-base bg-background focus:outline-none focus:border-primary transition-colors"
            />
            <p className="text-xs text-muted-foreground -mt-1">
              Calcoleremo quanto accantonare ogni mese fino a quella data.
            </p>
          </div>

          {/* Salvadanaio collegato */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">
              Salvadanaio{" "}
              <span className="text-muted-foreground font-normal">— facoltativo</span>
            </label>
            <p className="text-xs text-muted-foreground -mt-1">
              &ldquo;Segna come pagata&rdquo; scalerà da questo salvadanaio invece che dal primo disponibile.
            </p>
            <div className="flex flex-col gap-2">
              {pots.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setAForm(f => ({ ...f, savings_pot_id: p.id }))}
                  className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all ${
                    aForm.savings_pot_id === p.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                  }`}
                >
                  <span className="text-xl">{p.emoji}</span>
                  <span className="flex-1 text-sm font-medium">{p.name}</span>
                  <span className="text-xs text-muted-foreground">{fmt(Number(p.current_balance))}</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setAForm(f => ({ ...f, savings_pot_id: "" }))}
                className={`rounded-xl border-2 px-4 py-3 text-left text-sm transition-all ${
                  !aForm.savings_pot_id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                }`}
              >
                Nessuno
              </button>
              {pots.length === 0 && (
                <a href="/dashboard/salvadanai" className="text-xs text-primary hover:underline">
                  Crea un salvadanaio →
                </a>
              )}
            </div>
          </div>

          {/* Collega a transazione */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Collega a transazione</label>
            <p className="text-xs text-muted-foreground -mt-1">
              Facoltativo: collega l&apos;ultimo pagamento reale per riconoscere in automatico i prossimi.
            </p>
            {aForm.secondary_name ? (
              <div className="flex items-center gap-3 rounded-xl border-2 border-primary/40 bg-primary/5 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{aForm.secondary_name}</p>
                  <p className="text-xs text-muted-foreground">Collegata</p>
                </div>
                <button
                  type="button"
                  onClick={() => setAForm(f => ({ ...f, secondary_name: "" }))}
                  className="text-xs text-muted-foreground hover:text-destructive transition-colors shrink-0"
                >
                  ✕ Scollega
                </button>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  value={aTxSearch}
                  onChange={e => setATxSearch(e.target.value)}
                  placeholder="Cerca, o sfoglia le più recenti qui sotto…"
                  className="border-2 rounded-xl px-4 py-3 text-base bg-background focus:outline-none focus:border-primary transition-colors"
                />
                <div className="flex flex-col gap-1">
                  <p className="text-xs text-muted-foreground px-1">
                    {aTxSearch.trim().length >= 2 ? "Risultati" : "Transazioni recenti"}
                  </p>
                  {pickTxCandidates(transactions, aTxSearch).map((t, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        setAForm(f => ({ ...f, secondary_name: t.description ?? t.merchant ?? "" }));
                        setATxSearch("");
                      }}
                      className="text-left px-3 py-2.5 rounded-xl border hover:bg-muted/50 transition-colors flex items-center gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{t.description || t.merchant}</p>
                        <p className="text-xs text-muted-foreground">
                          {fmt(Math.abs(Number(t.amount)))} · {new Date(t.date + "T00:00:00").toLocaleDateString("it-IT")}
                        </p>
                      </div>
                      <span className="text-xs text-primary shrink-0">Collega →</span>
                    </button>
                  ))}
                  {pickTxCandidates(transactions, aTxSearch).length === 0 && (
                    <p className="text-xs text-muted-foreground px-1">Nessuna transazione trovata.</p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <button
          onClick={handleSaveAccantonamento}
          disabled={aSaving}
          className="bg-primary text-primary-foreground rounded-xl px-6 py-3 font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {aSaving ? "Salvataggio…" : "Aggiungi accantonamento"}
        </button>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RECURRING WIZARD — CODICE ORFANO: non più raggiungibile dalla copertina Smart
  // (sostituito da Rate/Accantonamenti/Budget), lasciato per non perdere la logica
  // di modifica generica (edit-recurring, ancora usata da Rate/Accantonamenti/Budget)
  // che vive più sotto nello stesso file. Vedi anche obiettivi-client.tsx per lo
  // stesso pattern di codice morto già presente in questo repo.
  // ═══════════════════════════════════════════════════════════════════════════

  if (view === "add-recurring") {
    const TOTAL_STEPS = 6;
    const rTipo = rForm.tipo;
    const isVariabile = rTipo === "uscita_variabile";
    const isEntrata = rTipo === "entrata";

    const FREQ_OPTIONS: { value: Frequency; icon: string; label: string }[] = [
      { value: "mensile",      icon: "📅", label: "Ogni mese"    },
      { value: "bimestrale",   icon: "📆", label: "Ogni 2 mesi"  },
      { value: "trimestrale",  icon: "🗓️", label: "Ogni 3 mesi"  },
      { value: "semestrale",   icon: "📋", label: "Ogni 6 mesi"  },
      { value: "annuale",      icon: "🎆", label: "Ogni anno"    },
      { value: "personalizzata", icon: "⚙️", label: "Personalizzato" },
    ];

    function rBack() {
      if (rStep === 1) { goBack("cover"); return; }
      setRStep(s => s - 1);
    }

    const FREQ_LABELS: Record<Frequency, string> = {
      mensile: "Ogni mese", bimestrale: "Ogni 2 mesi", trimestrale: "Ogni 3 mesi",
      semestrale: "Ogni 6 mesi", annuale: "Ogni anno",
      personalizzata: `Ogni ${rForm.custom_days} giorni`,
    };

    return (
      <div className="flex flex-col gap-6 max-w-md mx-auto w-full">
        <div className="flex items-center justify-between">
          <BackButton onClick={rBack} />
          <StepIndicator current={rStep} total={TOTAL_STEPS} />
        </div>

        {/* Step 1 — Tipo */}
        {rStep === 1 && (
          <div className="flex flex-col gap-6">
            <h2 className="text-xl font-bold">Che tipo di movimento vuoi aggiungere?</h2>
            <div className="flex flex-col gap-3">
              {([
                { value: "uscita_fissa",    icon: "💸", title: "Uscita fissa",    desc: "Importo sempre uguale (es. abbonamento, affitto)" },
                { value: "uscita_variabile", icon: "📊", title: "Uscita variabile", desc: "Importo che cambia ogni volta (es. bollette, spesa)" },
                { value: "entrata",         icon: "💰", title: "Entrata",          desc: "Reddito ricorrente (es. stipendio, affitto ricevuto)" },
              ] as { value: TipoCard; icon: string; title: string; desc: string }[]).map(opt => (
                <button
                  key={opt.value}
                  onClick={() => { setRForm(f => ({ ...f, tipo: opt.value })); setRStep(2); }}
                  className={`flex items-center gap-4 rounded-2xl border-2 p-4 text-left transition-all active:scale-[0.98] ${
                    rTipo === opt.value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50 hover:bg-muted/50"
                  }`}
                >
                  <span className="text-3xl">{opt.icon}</span>
                  <div>
                    <div className="font-semibold">{opt.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{opt.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2 — Nome */}
        {rStep === 2 && (() => {
          const q = rForm.name.trim().toLowerCase();
          const duplicate = q.length >= 2
            ? recurringItems.find(it => it.name.toLowerCase().includes(q) || q.includes(it.name.toLowerCase()))
            : null;
          return (
          <div className="flex flex-col gap-6">
            <h2 className="text-xl font-bold">Come si chiama?</h2>
            <div className="flex flex-col gap-2">
              <input
                type="text"
                value={rForm.name}
                onChange={e => setRForm(f => ({ ...f, name: e.target.value }))}
                placeholder={isEntrata ? "es. Stipendio, Affitto ricevuto…" : "es. Netflix, Affitto, Enel…"}
                className={`border-2 rounded-xl px-4 py-3 text-base bg-background focus:outline-none transition-colors ${duplicate ? "border-amber-400 focus:border-amber-400" : "focus:border-primary"}`}
                autoFocus
              />

              {/* Avviso duplicato */}
              {duplicate && (
                <div className="rounded-xl border-2 border-amber-400/60 bg-amber-50 dark:bg-amber-950/30 p-3 flex flex-col gap-2">
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                    ⚠️ Hai già una voce simile: <span className="font-bold">&ldquo;{duplicate.name}&rdquo;</span>
                  </p>
                  <p className="text-xs text-amber-600 dark:text-amber-500">
                    {duplicate.tipologia === "fissa" ? "Uscita fissa"
                      : duplicate.tipologia === "variabile" ? "Uscita variabile"
                      : "Entrata"} · {freqLabel(duplicate)} · {fmt(duplicate.amount)}
                  </p>
                  <button
                    type="button"
                    onClick={() => { goEditRecurring(duplicate); }}
                    className="text-xs text-amber-700 dark:text-amber-400 underline text-left hover:no-underline"
                  >
                    Vai a modificarla invece →
                  </button>
                </div>
              )}

              {/* Suggerimenti da transazioni */}
              {txSuggestions.length > 0 && !duplicate && (
                <div className="flex flex-col gap-1 mt-1">
                  <p className="text-xs text-muted-foreground">Trovato nelle tue transazioni:</p>
                  {txSuggestions.map((t, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        const d = new Date(t.date + "T00:00:00");
                        setRForm(f => ({
                          ...f,
                          name: f.name || t.description || t.merchant || f.name,
                          secondary_name: t.description ?? t.merchant ?? "",
                          amount: Math.abs(Number(t.amount)).toString().replace(".", ","),
                          due_day: d.getDate(),
                        }));
                      }}
                      className="text-left text-sm px-3 py-2 rounded-lg border hover:bg-muted/50 transition-colors"
                    >
                      <span className="font-medium">{t.description || t.merchant}</span>
                      <span className="text-muted-foreground text-xs ml-2">
                        {fmt(Math.abs(Number(t.amount)))} · {new Date(t.date).toLocaleDateString("it-IT")}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => {
                if (!rForm.name.trim()) { toast.error("Inserisci un nome."); return; }
                setRStep(3);
              }}
              className="bg-primary text-primary-foreground rounded-xl px-6 py-3 font-semibold hover:bg-primary/90 transition-colors"
            >
              {duplicate ? "Continua comunque →" : "Continua →"}
            </button>
          </div>
          );
        })()}

        {/* Step 3 — Frequenza */}
        {rStep === 3 && (
          <div className="flex flex-col gap-6">
            <h2 className="text-xl font-bold">Ogni quanto si ripete?</h2>
            <div className="grid grid-cols-2 gap-3">
              {FREQ_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setRForm(f => ({ ...f, frequency: opt.value }))}
                  className={`flex flex-col items-center gap-2 rounded-2xl border-2 p-4 transition-all active:scale-[0.98] ${
                    rForm.frequency === opt.value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <span className="text-2xl">{opt.icon}</span>
                  <span className="text-sm font-medium">{opt.label}</span>
                </button>
              ))}
            </div>
            {rForm.frequency === "personalizzata" && (
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Ogni quanti giorni?</label>
                <input
                  type="number"
                  value={rForm.custom_days}
                  onChange={e => setRForm(f => ({ ...f, custom_days: e.target.value }))}
                  placeholder="es. 14 = ogni 2 settimane"
                  min={1}
                  className="border-2 rounded-xl px-4 py-3 text-base bg-background focus:outline-none focus:border-primary transition-colors"
                />
              </div>
            )}
            <button
              onClick={() => {
                if (rForm.frequency === "personalizzata") {
                  const d = parseInt(rForm.custom_days);
                  if (!d || d <= 0) { toast.error("Inserisci un numero di giorni valido."); return; }
                }
                setRStep(4);
              }}
              className="bg-primary text-primary-foreground rounded-xl px-6 py-3 font-semibold hover:bg-primary/90 transition-colors"
            >
              Continua →
            </button>
          </div>
        )}

        {/* Step 4 — Importo */}
        {rStep === 4 && (
          <div className="flex flex-col gap-6">
            <h2 className="text-xl font-bold">Quanto è l&apos;importo?</h2>
            {isVariabile ? (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium">Importo minimo (€)</label>
                  <input
                    type="text" value={rForm.amount}
                    onChange={e => setRForm(f => ({ ...f, amount: e.target.value }))}
                    placeholder="es. 50"
                    className="border-2 rounded-xl px-4 py-3 text-base bg-background focus:outline-none focus:border-primary transition-colors"
                    autoFocus
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium">Importo massimo (€)</label>
                  <input
                    type="text" value={rForm.amount_max}
                    onChange={e => setRForm(f => ({ ...f, amount_max: e.target.value }))}
                    placeholder="es. 150"
                    className="border-2 rounded-xl px-4 py-3 text-base bg-background focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">
                  {isEntrata ? "Importo entrata (€)" : "Importo fisso (€)"}
                </label>
                <input
                  type="text" value={rForm.amount}
                  onChange={e => setRForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder="es. 500"
                  className="border-2 rounded-xl px-4 py-3 text-base bg-background focus:outline-none focus:border-primary transition-colors"
                  autoFocus
                />
              </div>
            )}
            <button
              onClick={() => {
                const a = parseFloat(rForm.amount.replace(",", "."));
                if (isNaN(a) || a <= 0) { toast.error("Inserisci un importo valido."); return; }
                if (isVariabile && rForm.amount_max) {
                  const max = parseFloat(rForm.amount_max.replace(",", "."));
                  if (!isNaN(max) && max < a) { toast.error("Il massimo deve essere ≥ del minimo."); return; }
                }
                setRStep(5);
              }}
              className="bg-primary text-primary-foreground rounded-xl px-6 py-3 font-semibold hover:bg-primary/90 transition-colors"
            >
              Continua →
            </button>
          </div>
        )}

        {/* Step 5 — Giorno del mese */}
        {rStep === 5 && (
          <div className="flex flex-col gap-6">
            <h2 className="text-xl font-bold">Quando cade di solito?</h2>
            <p className="text-muted-foreground text-sm -mt-3">
              Seleziona il giorno del mese in cui avviene solitamente.
            </p>
            <div className="grid grid-cols-7 gap-2">
              {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                <button
                  key={d}
                  onClick={() => setRForm(f => ({ ...f, due_day: f.due_day === d ? null : d }))}
                  className={`aspect-square rounded-xl text-sm font-medium transition-all active:scale-90 ${
                    rForm.due_day === d
                      ? "bg-primary text-primary-foreground"
                      : "border hover:bg-muted/50"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
            <button
              onClick={() => setRForm(f => ({ ...f, due_day: null }))}
              className={`rounded-xl border-2 px-4 py-2.5 text-sm transition-colors ${
                rForm.due_day === null
                  ? "border-primary bg-primary/5 font-medium"
                  : "border-border hover:bg-muted/50"
              }`}
            >
              Non so / varia
            </button>
            {rForm.frequency !== "mensile" && (
              <div className="flex flex-col gap-2 pt-2 border-t">
                <label className="text-sm font-medium">
                  Prossima scadenza{" "}
                  <span className="text-muted-foreground font-normal">— per accantonamento</span>
                </label>
                <p className="text-xs text-muted-foreground -mt-1">
                  Inserisci quando sarà il prossimo pagamento per calcolare quanto accantonare ogni mese.
                </p>
                <input
                  type="date"
                  value={rForm.next_due_date}
                  onChange={e => setRForm(f => ({ ...f, next_due_date: e.target.value }))}
                  className="border-2 rounded-xl px-4 py-3 text-base bg-background focus:outline-none focus:border-primary transition-colors"
                />
              </div>
            )}
            <button
              onClick={() => setRStep(6)}
              className="bg-primary text-primary-foreground rounded-xl px-6 py-3 font-semibold hover:bg-primary/90 transition-colors"
            >
              Continua →
            </button>
          </div>
        )}

        {/* Step 6 — Riepilogo */}
        {rStep === 6 && (
          <div className="flex flex-col gap-6">
            <h2 className="text-xl font-bold">Tutto corretto?</h2>
            <div className="rounded-2xl border-2 border-border p-5 flex flex-col gap-3">
              <RecapRow
                label="Tipo"
                value={
                  rTipo === "uscita_fissa" ? "💸 Uscita fissa"
                  : rTipo === "uscita_variabile" ? "📊 Uscita variabile"
                  : "💰 Entrata"
                }
              />
              <RecapRow label="Nome" value={rForm.name} />
              <RecapRow label="Frequenza" value={FREQ_LABELS[rForm.frequency]} />
              <RecapRow
                label="Importo"
                value={
                  isVariabile && rForm.amount_max
                    ? `${fmt(parseFloat(rForm.amount.replace(",", ".")))} – ${fmt(parseFloat(rForm.amount_max.replace(",", ".")))}`
                    : fmt(parseFloat(rForm.amount.replace(",", ".")))
                }
              />
              <RecapRow
                label="Giorno"
                value={rForm.due_day ? `${rForm.due_day} del mese` : "Non specificato"}
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setRStep(1)}
                className="flex-1 rounded-xl border-2 px-5 py-3 text-sm font-medium hover:bg-muted/50 transition-colors"
              >
                ✏️ Modifica
              </button>
              <button
                onClick={handleSaveRecurring}
                disabled={rSaving}
                className="flex-1 bg-primary text-primary-foreground rounded-xl px-5 py-3 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {rSaving ? "Salvataggio…" : "Salva ✓"}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RECURRING EDIT (form singolo, tutti i campi visibili)
  // ═══════════════════════════════════════════════════════════════════════════

  if (view === "edit-recurring") {
    const isVariabile = eForm.tipo === "uscita_variabile";
    const TIPO_OPTIONS: { value: TipoCard; icon: string; label: string }[] = [
      { value: "uscita_fissa",     icon: "💸", label: "Uscita fissa" },
      { value: "uscita_variabile", icon: "📊", label: "Uscita variabile" },
      { value: "entrata",          icon: "💰", label: "Entrata" },
    ];
    const FREQ_OPTIONS: { value: Frequency; label: string }[] = [
      { value: "mensile",       label: "Ogni mese" },
      { value: "bimestrale",    label: "Ogni 2 mesi" },
      { value: "trimestrale",   label: "Ogni 3 mesi" },
      { value: "semestrale",    label: "Ogni 6 mesi" },
      { value: "annuale",       label: "Ogni anno" },
      { value: "personalizzata", label: "Personalizzato" },
    ];

    return (
      <div className="flex flex-col gap-6 max-w-md mx-auto w-full">
        <div className="flex items-center gap-3">
          <BackButton onClick={() => goBack("accantonamenti")} />
          <h1 className="text-xl font-bold">Modifica voce</h1>
        </div>

        <div className="flex flex-col gap-5">
          {/* Nome */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Nome</label>
            <input
              type="text" value={eForm.name}
              onChange={e => setEForm(f => ({ ...f, name: e.target.value }))}
              className="border-2 rounded-xl px-4 py-3 text-base bg-background focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          {/* Tipo */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Tipo</label>
            <div className="flex gap-2">
              {TIPO_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setEForm(f => ({ ...f, tipo: opt.value, amount_max: opt.value !== "uscita_variabile" ? "" : f.amount_max }))}
                  className={`flex-1 flex flex-col items-center gap-1 rounded-xl border-2 py-3 text-xs font-medium transition-all ${
                    eForm.tipo === opt.value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <span className="text-xl">{opt.icon}</span>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Frequenza */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Frequenza</label>
            <select
              value={eForm.frequency}
              onChange={e => setEForm(f => ({ ...f, frequency: e.target.value as Frequency }))}
              className="border-2 rounded-xl px-4 py-3 text-base bg-background focus:outline-none focus:border-primary transition-colors"
            >
              {FREQ_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {eForm.frequency === "personalizzata" && (
              <input
                type="number" value={eForm.custom_days}
                onChange={e => setEForm(f => ({ ...f, custom_days: e.target.value }))}
                placeholder="Ogni quanti giorni?"
                min={1}
                className="border-2 rounded-xl px-4 py-3 text-base bg-background focus:outline-none focus:border-primary transition-colors mt-2"
              />
            )}
          </div>

          {/* Importo */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">
              {isVariabile ? "Importo minimo (€)" : "Importo (€)"}
            </label>
            <input
              type="text" value={eForm.amount}
              onChange={e => setEForm(f => ({ ...f, amount: e.target.value }))}
              placeholder="es. 500"
              className="border-2 rounded-xl px-4 py-3 text-base bg-background focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          {isVariabile && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Importo massimo (€)</label>
              <input
                type="text" value={eForm.amount_max}
                onChange={e => setEForm(f => ({ ...f, amount_max: e.target.value }))}
                placeholder="es. 150"
                className="border-2 rounded-xl px-4 py-3 text-base bg-background focus:outline-none focus:border-primary transition-colors"
              />
            </div>
          )}

          {/* Mese (solo se annuale) */}
          {eForm.frequency === "annuale" && (
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">
                Mese{" "}
                <span className="text-muted-foreground font-normal">
                  {eForm.due_month
                    ? `— ${new Date(2000, eForm.due_month - 1).toLocaleString("it-IT", { month: "long" })}`
                    : "— non specificato"}
                </span>
              </label>
              <div className="grid grid-cols-4 gap-2">
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setEForm(f => ({ ...f, due_month: f.due_month === m ? null : m }))}
                    className={`rounded-lg py-2 text-sm font-medium capitalize transition-all ${
                      eForm.due_month === m
                        ? "bg-primary text-primary-foreground"
                        : "border hover:bg-muted/50"
                    }`}
                  >
                    {new Date(2000, m - 1).toLocaleString("it-IT", { month: "short" })}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Collega a transazione */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Collega a transazione</label>
            <p className="text-xs text-muted-foreground -mt-1">
              Collega una transazione reale per dedurre importo, giorno e nome secondario.
            </p>
            {eForm.secondary_name ? (
              <div className="flex items-center gap-3 rounded-xl border-2 border-primary/40 bg-primary/5 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{eForm.secondary_name}</p>
                  <p className="text-xs text-muted-foreground">Collegata · importo e giorno sincronizzati</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEForm(f => ({ ...f, secondary_name: "" }))}
                  className="text-xs text-muted-foreground hover:text-destructive transition-colors shrink-0"
                >
                  ✕ Scollega
                </button>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  value={eTxSearch}
                  onChange={e => setETxSearch(e.target.value)}
                  placeholder="Cerca, o sfoglia le più recenti qui sotto…"
                  className="border-2 rounded-xl px-4 py-3 text-base bg-background focus:outline-none focus:border-primary transition-colors"
                />
                <div className="flex flex-col gap-1">
                  <p className="text-xs text-muted-foreground px-1">
                    {eTxSearch.trim().length >= 2 ? "Risultati" : "Transazioni recenti"}
                  </p>
                  {pickTxCandidates(transactions, eTxSearch).map((t, i) => {
                    const d = new Date(t.date + "T00:00:00");
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          setEForm(f => ({
                            ...f,
                            amount: Math.abs(Number(t.amount)).toString().replace(".", ","),
                            due_day: d.getDate(),
                            due_month: f.frequency === "annuale" ? d.getMonth() + 1 : f.due_month,
                            secondary_name: t.description ?? t.merchant ?? "",
                          }));
                          setETxSearch("");
                        }}
                        className="text-left px-3 py-2.5 rounded-xl border hover:bg-muted/50 transition-colors flex items-center gap-3"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{t.description || t.merchant}</p>
                          <p className="text-xs text-muted-foreground">
                            {fmt(Math.abs(Number(t.amount)))} · {d.toLocaleDateString("it-IT")}
                          </p>
                        </div>
                        <span className="text-xs text-primary shrink-0">Collega →</span>
                      </button>
                    );
                  })}
                  {pickTxCandidates(transactions, eTxSearch).length === 0 && (
                    <p className="text-xs text-muted-foreground px-1">Nessuna transazione trovata.</p>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Data fine (rate) */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">
              Data fine{" "}
              <span className="text-muted-foreground font-normal">— opzionale, per rate o finanziamenti</span>
            </label>
            <div className="flex gap-2 items-center">
              <input
                type="date"
                value={eForm.end_date}
                onChange={e => setEForm(f => ({ ...f, end_date: e.target.value }))}
                className="flex-1 border-2 rounded-xl px-4 py-3 text-base bg-background focus:outline-none focus:border-primary transition-colors"
              />
              {eForm.end_date && (
                <button
                  type="button"
                  onClick={() => setEForm(f => ({ ...f, end_date: "" }))}
                  className="text-xs text-muted-foreground hover:text-destructive border rounded-lg px-3 py-3 transition-colors"
                >
                  ✕
                </button>
              )}
            </div>
            {eForm.end_date && (
              <p className="text-xs text-muted-foreground">
                La voce scadrà il {new Date(eForm.end_date).toLocaleDateString("it-IT")}
              </p>
            )}
          </div>

          {/* Giorno del mese */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">
              Giorno del mese{" "}
              <span className="text-muted-foreground font-normal">
                {eForm.due_day ? `— ${eForm.due_day}` : "— non specificato"}
              </span>
            </label>
            <div className="grid grid-cols-7 gap-1.5">
              {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setEForm(f => ({ ...f, due_day: f.due_day === d ? null : d }))}
                  className={`aspect-square rounded-lg text-sm font-medium transition-all ${
                    eForm.due_day === d
                      ? "bg-primary text-primary-foreground"
                      : "border hover:bg-muted/50"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
            {eForm.due_day !== null && (
              <button
                type="button"
                onClick={() => setEForm(f => ({ ...f, due_day: null }))}
                className="text-xs text-muted-foreground hover:text-foreground underline text-left"
              >
                Rimuovi giorno
              </button>
            )}
          </div>

          {/* Prossima scadenza (accantonamento) */}
          {eForm.frequency !== "mensile" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">
                Prossima scadenza{" "}
                <span className="text-muted-foreground font-normal">— per accantonamento</span>
              </label>
              <div className="flex gap-2 items-center">
                <input
                  type="date"
                  value={eForm.next_due_date}
                  onChange={e => setEForm(f => ({ ...f, next_due_date: e.target.value }))}
                  className="flex-1 border-2 rounded-xl px-4 py-3 text-base bg-background focus:outline-none focus:border-primary transition-colors"
                />
                {eForm.next_due_date && (
                  <button
                    type="button"
                    onClick={() => setEForm(f => ({ ...f, next_due_date: "" }))}
                    className="text-xs text-muted-foreground hover:text-destructive border rounded-lg px-3 py-3 transition-colors"
                  >
                    ✕
                  </button>
                )}
              </div>
              {eForm.next_due_date && (
                <p className="text-xs text-muted-foreground">
                  Calcoleremo quanto accantonare ogni mese fino al{" "}
                  {new Date(eForm.next_due_date).toLocaleDateString("it-IT")}
                </p>
              )}
            </div>
          )}

          {/* Salvadanaio collegato (accantonamento) */}
          {eForm.frequency !== "mensile" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">
                Salvadanaio{" "}
                <span className="text-muted-foreground font-normal">— facoltativo, per accantonamento</span>
              </label>
              <p className="text-xs text-muted-foreground -mt-1">
                &ldquo;Segna come pagata&rdquo; scalerà da questo salvadanaio invece che dal primo disponibile.
              </p>
              <div className="flex flex-col gap-2">
                {pots.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setEForm(f => ({ ...f, savings_pot_id: p.id }))}
                    className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all ${
                      eForm.savings_pot_id === p.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <span className="text-xl">{p.emoji}</span>
                    <span className="flex-1 text-sm font-medium">{p.name}</span>
                    <span className="text-xs text-muted-foreground">{fmt(Number(p.current_balance))}</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setEForm(f => ({ ...f, savings_pot_id: "" }))}
                  className={`rounded-xl border-2 px-4 py-3 text-left text-sm transition-all ${
                    !eForm.savings_pot_id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                  }`}
                >
                  Nessuno
                </button>
                {pots.length === 0 && (
                  <a href="/dashboard/salvadanai" className="text-xs text-primary hover:underline">
                    Crea un salvadanaio →
                  </a>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Salva */}
        <button
          onClick={handleUpdateRecurring}
          disabled={eSaving}
          className="bg-primary text-primary-foreground rounded-xl px-6 py-3 font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {eSaving ? "Salvataggio…" : "Salva modifiche"}
        </button>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GOAL WIZARD
  // ═══════════════════════════════════════════════════════════════════════════

  if (view === "add-goal") {
    const TOTAL_STEPS = 6;
    const isFree = plan === "free";
    const atLimit = isFree && goals.length >= FREE_GOAL_LIMIT && !gEditId;

    const gTarget = parseFloat(gForm.target_amount.replace(",", ".")) || 0;
    const gCurrent = parseFloat(gForm.current_amount.replace(",", ".") || "0") || 0;
    const gMonthsLeft = gForm.deadline
      ? Math.max(1, Math.ceil((new Date(gForm.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30)))
      : 0;
    const gSuggestedMonthly = gMonthsLeft > 0 ? Math.max(0, (gTarget - gCurrent) / gMonthsLeft) : 0;

    function gBack() {
      if (gStep === 1) { goBack("list-goals"); return; }
      setGStep(s => s - 1);
    }

    if (atLimit) {
      return (
        <div className="flex flex-col gap-6">
          <BackButton onClick={() => goBack("cover")} />
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <span className="text-5xl">🔒</span>
            <h2 className="text-lg font-bold">Limite raggiunto</h2>
            <p className="text-muted-foreground text-sm max-w-xs">
              Con il piano gratuito puoi avere 1 solo obiettivo. Passa a Premium per obiettivi illimitati.
            </p>
            <a
              href="/pricing"
              className="bg-primary text-primary-foreground rounded-xl px-5 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Scopri Premium
            </a>
          </div>
        </div>
      );
    }

    const GOAL_CHIPS = [
      { label: "🏖️ Vacanza",         icon: "🏖️" },
      { label: "🛡️ Fondo emergenza",  icon: "🛡️" },
      { label: "🏠 Casa",             icon: "🏠" },
      { label: "💻 Tech",             icon: "💻" },
      { label: "🎓 Formazione",       icon: "🎓" },
    ];

    return (
      <div className="flex flex-col gap-6 max-w-md mx-auto w-full">
        <div className="flex items-center justify-between">
          <BackButton onClick={gBack} />
          <StepIndicator current={gStep} total={TOTAL_STEPS} />
        </div>

        {/* Step 1 — Cosa */}
        {gStep === 1 && (
          <div className="flex flex-col gap-6">
            <h2 className="text-xl font-bold">Per cosa stai risparmiando?</h2>
            <div className="flex flex-col gap-3">
              <input
                type="text" value={gForm.name}
                onChange={e => setGForm(f => ({ ...f, name: e.target.value }))}
                placeholder="es. Vacanza, Casa, Emergenza…"
                className="border-2 rounded-xl px-4 py-3 text-base bg-background focus:outline-none focus:border-primary transition-colors"
                autoFocus
              />
              <div className="flex flex-wrap gap-2">
                {GOAL_CHIPS.map(chip => (
                  <button
                    key={chip.label}
                    type="button"
                    onClick={() => setGForm(f => ({
                      ...f,
                      name: chip.label.split(" ").slice(1).join(" "),
                      icon: chip.icon,
                    }))}
                    className="rounded-full border px-3 py-1.5 text-sm hover:bg-muted/50 transition-colors"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-2 mt-2">
                <label className="text-sm font-medium">Scegli un&apos;icona</label>
                <div className="flex flex-wrap gap-2">
                  {GOAL_ICONS.map(ic => (
                    <button
                      key={ic}
                      type="button"
                      onClick={() => setGForm(f => ({ ...f, icon: ic }))}
                      className={`text-xl p-2 rounded-xl border-2 transition-all ${
                        gForm.icon === ic
                          ? "border-primary bg-primary/10"
                          : "border-transparent hover:bg-muted/50"
                      }`}
                    >
                      {ic}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                if (!gForm.name.trim()) { toast.error("Inserisci un nome."); return; }
                setGStep(2);
              }}
              className="bg-primary text-primary-foreground rounded-xl px-6 py-3 font-semibold hover:bg-primary/90 transition-colors"
            >
              Continua →
            </button>
          </div>
        )}

        {/* Step 2 — Quanto */}
        {gStep === 2 && (
          <div className="flex flex-col gap-6">
            <h2 className="text-xl font-bold">Quanto ti serve?</h2>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Importo obiettivo (€)</label>
                <input
                  type="text" value={gForm.target_amount}
                  onChange={e => setGForm(f => ({ ...f, target_amount: e.target.value }))}
                  placeholder="es. 3000"
                  className="border-2 rounded-xl px-4 py-3 text-base bg-background focus:outline-none focus:border-primary transition-colors"
                  autoFocus
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Già risparmiato (€) — opzionale</label>
                <input
                  type="text" value={gForm.current_amount}
                  onChange={e => setGForm(f => ({ ...f, current_amount: e.target.value }))}
                  placeholder="0"
                  className="border-2 rounded-xl px-4 py-3 text-base bg-background focus:outline-none focus:border-primary transition-colors"
                />
              </div>
            </div>
            <button
              onClick={() => {
                const a = parseFloat(gForm.target_amount.replace(",", "."));
                if (isNaN(a) || a <= 0) { toast.error("Inserisci un importo valido."); return; }
                setGStep(3);
              }}
              className="bg-primary text-primary-foreground rounded-xl px-6 py-3 font-semibold hover:bg-primary/90 transition-colors"
            >
              Continua →
            </button>
          </div>
        )}

        {/* Step 3 — Quando */}
        {gStep === 3 && (
          <div className="flex flex-col gap-6">
            <h2 className="text-xl font-bold">Entro quando?</h2>
            <div className="flex flex-col gap-3">
              <input
                type="date" value={gForm.deadline}
                onChange={e => setGForm(f => ({ ...f, deadline: e.target.value }))}
                className="border-2 rounded-xl px-4 py-3 text-base bg-background focus:outline-none focus:border-primary transition-colors"
              />
              <button
                onClick={() => { setGForm(f => ({ ...f, deadline: "" })); setGStep(4); }}
                className={`rounded-xl border-2 px-4 py-3 text-sm font-medium transition-colors ${
                  !gForm.deadline
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/50"
                }`}
              >
                Non ho fretta — nessuna scadenza
              </button>
            </div>
            {gForm.deadline && gSuggestedMonthly > 0 && (
              <p className="text-sm text-muted-foreground">
                Dovrai mettere da parte <strong className="text-foreground">{fmt(gSuggestedMonthly)}</strong> al mese.
              </p>
            )}
            <button
              onClick={() => setGStep(4)}
              className="bg-primary text-primary-foreground rounded-xl px-6 py-3 font-semibold hover:bg-primary/90 transition-colors"
            >
              Continua →
            </button>
          </div>
        )}

        {/* Step 4 — Salvadanaio collegato */}
        {gStep === 4 && (
          <div className="flex flex-col gap-6">
            <h2 className="text-xl font-bold">Collegare a un salvadanaio?</h2>
            <div className="flex flex-col gap-2">
              {pots.map(p => (
                <button key={p.id} type="button"
                  onClick={() => setGForm(f => ({ ...f, savings_pot_id: p.id }))}
                  className={`rounded-xl border-2 px-4 py-3 text-left text-sm flex justify-between items-center transition-colors ${
                    gForm.savings_pot_id === p.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                  }`}>
                  <span>{p.emoji} {p.name}</span>
                  <span className="text-muted-foreground">{fmt(Number(p.current_balance))}</span>
                </button>
              ))}
              <button type="button"
                onClick={() => setGForm(f => ({ ...f, savings_pot_id: "" }))}
                className={`rounded-xl border-2 px-4 py-3 text-left text-sm transition-colors ${
                  !gForm.savings_pot_id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                }`}>
                No, tienili separati
              </button>
              {pots.length === 0 && (
                <a href="/dashboard/salvadanai" className="text-xs text-primary hover:underline">
                  Crea un salvadanaio →
                </a>
              )}
            </div>
            <button onClick={() => setGStep(5)}
              className="bg-primary text-primary-foreground rounded-xl px-6 py-3 font-semibold hover:bg-primary/90 transition-colors">
              Continua →
            </button>
          </div>
        )}

        {/* Step 5 — Contributo mensile */}
        {gStep === 5 && (
          <div className="flex flex-col gap-6">
            <h2 className="text-xl font-bold">Quanto accantoni al mese?</h2>
            <input
              type="text" inputMode="decimal"
              value={gForm.monthly_contribution}
              onChange={e => setGForm(f => ({ ...f, monthly_contribution: e.target.value }))}
              placeholder={gSuggestedMonthly > 0 ? gSuggestedMonthly.toFixed(0) : "es. 100"}
              className="border-2 rounded-xl px-4 py-3 text-base bg-background focus:outline-none focus:border-primary transition-colors"
              autoFocus
            />
            {gSuggestedMonthly > 0 && (
              <button type="button"
                onClick={() => setGForm(f => ({ ...f, monthly_contribution: gSuggestedMonthly.toFixed(2).replace(".", ",") }))}
                className="text-sm text-primary hover:underline self-start">
                Usa il suggerito ({fmt(gSuggestedMonthly)})
              </button>
            )}
            <div className="flex gap-3">
              <button onClick={() => setGStep(6)}
                className="flex-1 rounded-xl border-2 px-5 py-3 text-sm font-medium hover:bg-muted/50 transition-colors">
                Salta
              </button>
              <button onClick={() => setGStep(6)}
                className="flex-1 bg-primary text-primary-foreground rounded-xl px-5 py-3 text-sm font-semibold hover:bg-primary/90 transition-colors">
                Continua →
              </button>
            </div>
          </div>
        )}

        {/* Step 6 — Riepilogo */}
        {gStep === 6 && (
          <div className="flex flex-col gap-6">
            <h2 className="text-xl font-bold">Tutto corretto?</h2>
            <div className="rounded-2xl border-2 border-border p-5 flex flex-col gap-3">
              <div className="flex items-center gap-3 pb-2 border-b">
                <span className="text-4xl">{gForm.icon}</span>
                <span className="font-bold text-lg">{gForm.name}</span>
              </div>
              <RecapRow label="Obiettivo" value={fmt(parseFloat(gForm.target_amount.replace(",", ".")))} />
              {parseFloat(gForm.current_amount.replace(",", ".") || "0") > 0 && (
                <RecapRow
                  label="Già risparmiato"
                  value={fmt(parseFloat(gForm.current_amount.replace(",", ".")))}
                />
              )}
              <RecapRow
                label="Scadenza"
                value={gForm.deadline
                  ? new Date(gForm.deadline).toLocaleDateString("it-IT")
                  : "Nessuna"}
              />
              {gForm.savings_pot_id && (
                <RecapRow
                  label="Salvadanaio"
                  value={(() => { const p = pots.find(x => x.id === gForm.savings_pot_id); return p ? `${p.emoji} ${p.name}` : "—"; })()}
                />
              )}
              {parseFloat(gForm.monthly_contribution.replace(",", ".") || "0") > 0 && (
                <RecapRow label="Al mese" value={fmt(parseFloat(gForm.monthly_contribution.replace(",", ".")))} />
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setGStep(1)}
                className="flex-1 rounded-xl border-2 px-5 py-3 text-sm font-medium hover:bg-muted/50 transition-colors"
              >
                ✏️ Modifica
              </button>
              <button
                onClick={handleSaveGoal}
                disabled={gSaving}
                className="flex-1 bg-primary text-primary-foreground rounded-xl px-5 py-3 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {gSaving ? "Salvataggio…" : "Salva ✓"}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GOALS LIST
  // ═══════════════════════════════════════════════════════════════════════════

  if (view === "list-goals") {
    const isFree = plan === "free";
    const atLimit = isFree && goals.length >= FREE_GOAL_LIMIT;

    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <BackButton onClick={() => goBack("cover")} />
          <h1 className="text-xl font-bold flex-1">I miei obiettivi</h1>
          <button
            onClick={goAddGoal}
            disabled={atLimit}
            title={atLimit ? "Limite piano gratuito" : ""}
            className="text-sm bg-primary text-primary-foreground rounded-lg px-3 py-1.5 hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            + Aggiungi
          </button>
        </div>

        {atLimit && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm flex items-center justify-between gap-4">
            <span>Piano gratuito: 1 solo obiettivo.</span>
            <a href="/pricing" className="text-primary font-medium hover:underline whitespace-nowrap">
              Passa a Premium
            </a>
          </div>
        )}

        {goals.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <span className="text-5xl">🎯</span>
            <p className="text-muted-foreground">Nessun obiettivo ancora.</p>
            <button
              onClick={goAddGoal}
              className="bg-primary text-primary-foreground rounded-xl px-5 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Crea il primo
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {goals.map(g => {
              const pct = Math.min(100, (Number(g.current_amount) / Number(g.target_amount)) * 100);
              const remaining = Number(g.target_amount) - Number(g.current_amount);
              const completed = pct >= 100;
              return (
                <div
                  key={g.id}
                  className={`rounded-2xl border-2 p-5 flex flex-col gap-4 ${
                    completed ? "border-green-500/50 bg-green-500/5" : "border-border"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{g.icon}</span>
                      <div>
                        <h3 className="font-semibold">{g.name}</h3>
                        {g.deadline && (
                          <p className="text-xs text-muted-foreground">
                            Scadenza: {new Date(g.deadline).toLocaleDateString("it-IT")}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => goEditGoal(g)}
                        className="text-xs text-muted-foreground hover:text-foreground border rounded-lg px-2 py-1 transition-colors"
                        title="Modifica"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDeleteGoal(g.id)}
                        className="text-xs text-muted-foreground hover:text-destructive border rounded-lg px-2 py-1 transition-colors"
                        title="Elimina"
                      >
                        🗑
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${completed ? "bg-green-500" : "bg-primary"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{fmt(Number(g.current_amount))}</span>
                      <span className="font-semibold">{pct.toFixed(0)}%</span>
                      <span>{fmt(Number(g.target_amount))}</span>
                    </div>
                  </div>

                  {completed
                    ? <p className="text-xs text-green-600 dark:text-green-400 font-medium">🎉 Obiettivo raggiunto!</p>
                    : <p className="text-xs text-muted-foreground">Mancano {fmt(remaining)}</p>
                  }

                  {(g.monthly_contribution || g.savings_pot_id) && (
                    <p className="text-xs text-muted-foreground">
                      {g.monthly_contribution ? `${fmt(Number(g.monthly_contribution))}/mese` : ""}
                      {g.monthly_contribution && g.savings_pot_id ? " · " : ""}
                      {g.savings_pot_id ? (() => { const p = pots.find(x => x.id === g.savings_pot_id); return p ? `collegato a ${p.emoji} ${p.name}` : ""; })() : ""}
                    </p>
                  )}

                  <button
                    onClick={() => goGoalDetail(g)}
                    className="text-xs text-primary hover:underline self-start"
                  >
                    Dettagli e contributi →
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GOAL DETAIL
  // ═══════════════════════════════════════════════════════════════════════════

  if (view === "goal-detail") {
    const g = goals.find(x => x.id === gDetailId);
    if (!g) return null; // l'effetto qui sotto riporta alla lista
    const cur = Number(g.current_amount), tgt = Number(g.target_amount);
    const pct = Math.min(100, tgt > 0 ? (cur / tgt) * 100 : 0);
    const remaining = Math.max(0, tgt - cur);
    const monthly = Number(g.monthly_contribution) || 0;
    const linkedPot = g.savings_pot_id ? pots.find(p => p.id === g.savings_pot_id) : null;
    const eta = estimateGoalCompletion(
      { id: g.id, name: g.name, target_amount: tgt, current_amount: cur, deadline: g.deadline, icon: g.icon },
      monthly,
    );
    const history = contributions.filter(c => c.goal_id === g.id);
    const monthsToDeadline = g.deadline
      ? Math.max(1, Math.ceil((new Date(g.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30)))
      : 0;
    const neededMonthly = monthsToDeadline > 0 ? remaining / monthsToDeadline : 0;

    return (
      <div className="flex flex-col gap-5 max-w-lg mx-auto w-full">
        <div className="flex items-center gap-3">
          <BackButton onClick={() => goBack("list-goals")} />
          <h1 className="text-xl font-bold flex-1">{g.icon} {g.name}</h1>
          <button onClick={() => goEditGoal(g)} className="text-xs border rounded-lg px-2 py-1 hover:bg-muted/50">✏️</button>
          <button onClick={() => { handleDeleteGoal(g.id); goBack("list-goals"); }} className="text-xs border rounded-lg px-2 py-1 hover:text-destructive">🗑</button>
        </div>

        <div className="rounded-2xl border-2 p-5 flex flex-col gap-3">
          <div className="flex items-end justify-between">
            <span className="text-3xl font-bold tabular-nums">{fmt(cur)}</span>
            <span className="text-sm text-muted-foreground">di {fmt(tgt)}</span>
          </div>
          <div className="h-2.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{pct.toFixed(0)}%</span>
            <span>Mancano {fmt(remaining)}</span>
          </div>
          <div className="flex flex-col gap-1 pt-2 border-t text-sm">
            {g.deadline && (
              <div className="flex justify-between"><span className="text-muted-foreground">Scadenza</span>
                <span>{new Date(g.deadline).toLocaleDateString("it-IT")}</span></div>
            )}
            {monthsToDeadline > 0 && (
              <div className="flex justify-between"><span className="text-muted-foreground">Quota necessaria</span>
                <span>{fmt(neededMonthly)}/mese</span></div>
            )}
            <div className="flex justify-between"><span className="text-muted-foreground">Quota impostata</span>
              <span>{monthly > 0 ? `${fmt(monthly)}/mese` : "—"}</span></div>
            {eta && (
              <div className="flex justify-between"><span className="text-muted-foreground">Stima raggiungimento</span>
                <span>{eta}</span></div>
            )}
            {linkedPot && (
              <div className="flex justify-between"><span className="text-muted-foreground">Salvadanaio</span>
                <span>{linkedPot.emoji} {linkedPot.name} · {fmt(Number(linkedPot.current_balance))}</span></div>
            )}
          </div>
        </div>

        {/* Proiezione */}
        {monthly > 0 && remaining > 0 && (
          <GoalProjection current={cur} target={tgt} monthly={monthly} />
        )}

        {/* Aggiungi contributo */}
        <div className="rounded-xl border p-4 flex flex-col gap-2">
          <p className="text-sm font-semibold">Aggiungi contributo</p>
          <div className="flex gap-2">
            <input value={contribAmount} onChange={e => setContribAmount(e.target.value)} inputMode="decimal"
              placeholder="Importo €" className="border rounded-md px-3 py-2 text-sm bg-background flex-1" />
            <button onClick={handleAddContribution} disabled={contribSaving}
              className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
              {contribSaving ? "…" : "Aggiungi"}
            </button>
          </div>
          <input value={contribNote} onChange={e => setContribNote(e.target.value)}
            placeholder="Nota (opzionale)" className="border rounded-md px-3 py-2 text-sm bg-background" />
        </div>

        {/* Storico */}
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">Storico contributi</p>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground py-3 text-center">Ancora nessun contributo.</p>
          ) : (
            <ul className="divide-y border rounded-xl">
              {history.map(c => (
                <li key={c.id} className="flex items-center justify-between px-3 py-2.5 text-sm">
                  <div className="flex flex-col">
                    <span>{c.note || "Contributo"}</span>
                    <span className="text-xs text-muted-foreground">{new Date(c.date).toLocaleDateString("it-IT")}</span>
                  </div>
                  <span className="font-semibold tabular-nums text-green-600 dark:text-green-400">+{fmt(Number(c.amount))}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PREVISIONI
  // ═══════════════════════════════════════════════════════════════════════════

  if (view === "previsioni") {
    const fisse    = recurringItems.filter(it => it.tipologia === "fissa");
    const variabili = recurringItems.filter(it => it.tipologia === "variabile");
    const entrateR  = recurringItems.filter(it => it.tipologia === "entrata");
    const prevFisse     = fisse.reduce((s, it) => s + toMonthlyAmount(it), 0);
    const prevVariabili = variabili.reduce((s, it) => s + toMonthlyAmount(it), 0);
    const prevEntrate   = entrateR.reduce((s, it) => s + toMonthlyAmount(it), 0);
    const totalSpeso    = monthTxs.reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
    const totalPrevisto = prevFisse + prevVariabili;

    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <BackButton onClick={() => goBack("cover")} />
          <h1 className="text-xl font-bold">Previsioni questo mese</h1>
        </div>

        {recurringLoading ? (
          <div className="animate-pulse flex flex-col gap-4">
            {[1, 2, 3].map(i => <div key={i} className="h-24 rounded-2xl bg-muted" />)}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Spese previste */}
            <div className="rounded-2xl border-2 p-5 flex flex-col gap-4">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Spese ricorrenti previste
              </h2>
              {prevFisse === 0 && prevVariabili === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nessuna spesa ricorrente configurata.{" "}
                  <button
                    onClick={goAddRecurring}
                    className="text-primary hover:underline"
                  >
                    Aggiungi una
                  </button>
                </p>
              ) : (
                <>
                  {prevFisse > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm">💸 Uscite fisse</span>
                      <span className="font-semibold">{fmt(prevFisse)}</span>
                    </div>
                  )}
                  {prevVariabili > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm">📊 Uscite variabili (stima media)</span>
                      <span className="font-semibold">{fmt(prevVariabili)}</span>
                    </div>
                  )}
                  <div className="border-t pt-3 flex justify-between items-center font-bold">
                    <span>Totale previsto</span>
                    <span>{fmt(totalPrevisto)}</span>
                  </div>
                </>
              )}
            </div>

            {/* Entrate previste */}
            {prevEntrate > 0 && (
              <div className="rounded-2xl border-2 border-green-500/30 bg-green-500/5 p-5 flex flex-col gap-3">
                <h2 className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase tracking-wider">
                  💰 Entrate previste
                </h2>
                <div className="flex justify-between items-center font-bold text-green-700 dark:text-green-400">
                  <span>Totale</span>
                  <span>{fmt(prevEntrate)}</span>
                </div>
              </div>
            )}

            {/* Andamento attuale */}
            <div className="rounded-2xl border-2 p-5 flex flex-col gap-4">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Andamento attuale
              </h2>
              <div className="flex justify-between items-center">
                <span className="text-sm">Speso questo mese</span>
                <span className={`font-semibold ${totalSpeso > totalPrevisto && totalPrevisto > 0 ? "text-destructive" : ""}`}>
                  {fmt(totalSpeso)}
                </span>
              </div>
              {totalPrevisto > 0 && (
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Progresso sul previsto</span>
                    <span>{Math.round(Math.min(100, (totalSpeso / totalPrevisto) * 100))}%</span>
                  </div>
                  <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        totalSpeso > totalPrevisto ? "bg-destructive" : "bg-primary"
                      }`}
                      style={{ width: `${Math.min(100, (totalSpeso / totalPrevisto) * 100)}%` }}
                    />
                  </div>
                  {totalSpeso > totalPrevisto && (
                    <p className="text-xs text-destructive font-medium">
                      Sforamento di {fmt(totalSpeso - totalPrevisto)} rispetto al previsto.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Obiettivi in corso */}
            {goals.filter(g => Number(g.current_amount) < Number(g.target_amount)).length > 0 && (
              <div className="rounded-2xl border-2 p-5 flex flex-col gap-4">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  🎯 Obiettivi in corso
                </h2>
                {goals
                  .filter(g => Number(g.current_amount) < Number(g.target_amount))
                  .map(g => {
                    const pct = Math.min(100, (Number(g.current_amount) / Number(g.target_amount)) * 100);
                    return (
                      <div key={g.id} className="flex flex-col gap-2">
                        <div className="flex justify-between text-sm">
                          <span>{g.icon} {g.name}</span>
                          <span className="font-medium text-muted-foreground">{pct.toFixed(0)}%</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Mancano {fmt(Number(g.target_amount) - Number(g.current_amount))}
                        </p>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ACCANTONAMENTI
  // ═══════════════════════════════════════════════════════════════════════════

  if (view === "accantonamenti") {
    const sinkingInputs: SinkingFundInput[] = recurringItems
      .filter(it => it.next_due_date && it.saving_start_date)
      .map(it => ({
        id: it.id,
        name: it.name,
        amount_per_cycle: it.tipologia === "variabile" && it.amount_max != null
          ? (it.amount + it.amount_max) / 2
          : it.amount,
        saving_start_date: it.saving_start_date!,
        next_due_date: it.next_due_date!,
      }));

    // Confronto con il salvadanaio degli accantonamenti, se scelto; altrimenti con i salvadanai
    // non collegati a un obiettivo (vedi potsForSinkingFunds).
    const commonPot = sinkingPot();
    const commonPotName = pots.find(p => p.id === commonPot)?.name ?? null;
    const summary = aggregateSinkingFunds(sinkingInputs, potsForSinkingFunds(
      pots, goals.map(g => g.savings_pot_id), recurringItems.filter(it => it.next_due_date).map(it => it.savings_pot_id)));
    const potLabel = commonPotName ? `Nel salvadanaio "${commonPotName}"`
      : commonPot === "mixed" ? "Nei salvadanai collegati" : "Nei salvadanai (esclusi quelli degli obiettivi)";

    // Catch-up: per ogni voce calcola la quota "a regime" (= importo ÷ mesi del ciclo completo)
    // Se total_months < cycle_months significa che la saving_start_date è più vicina
    // della scadenza del ciclo normale → l'utente sta recuperando mesi non accantonati.
    const catchupData = summary.projections.map(p => {
      const item = recurringItems.find(it => it.id === p.input.id)!;
      const cycle_months = monthsPerCycle(item.frequency, item.custom_days);
      const steady_monthly = p.input.amount_per_cycle / cycle_months;
      const is_catchup = p.months_remaining > 0 && p.total_months < cycle_months;
      return { proj: p, cycle_months, steady_monthly, is_catchup };
    });
    const steady_state_total = catchupData.reduce(
      (s, d) => s + (d.proj.months_remaining > 0 ? d.steady_monthly : 0), 0,
    );
    const in_catchup = summary.this_month_total > steady_state_total + 0.01;

    const statusConfig = {
      ahead:    { color: "text-green-600 dark:text-green-400",  bg: "bg-green-500/10 border-green-500/30",   label: "In anticipo 🟢" },
      on_track: { color: "text-primary",                        bg: "bg-primary/5 border-primary/30",        label: "In pari ✅" },
      behind:   { color: "text-destructive",                    bg: "bg-destructive/5 border-destructive/30", label: "In ritardo 🔴" },
    }[summary.status];

    const readyToPay = summary.projections.filter(p => p.months_remaining <= 0);

    // Saldo del salvadanaio collegato alla voce (fallback: totale aggregato, come "Segna come pagata").
    const potBalanceFor = (it: RecurringExpense) =>
      it.savings_pot_id
        ? Number(pots.find(p => p.id === it.savings_pot_id)?.current_balance ?? 0)
        : piggyBalance;

    // Notifica: quanto è stato accantonato davvero questo mese, dalle transazioni
    // categorizzate "Accantonamenti" (che contano come spesa, vedi CLAUDE.md).
    const accCategoryId = categories.find(c => c.name.toLowerCase() === "accantonamenti")?.id ?? null;
    const accTxThisMonth = accCategoryId
      ? transactions
          .filter(t => t.category_id === accCategoryId && Number(t.amount) < 0 && t.date >= pStart && (pEnd ? t.date <= pEnd : true))
          .reduce((s, t) => s + Math.abs(Number(t.amount)), 0)
      : 0;

    // ── Mark-paid dialog preview calculations ─────────────────────────────────
    const dialogItem = paidDialog?.item ?? null;
    const dialogProj = paidDialog?.proj ?? null;
    const dialogDefaultAmount = dialogProj
      ? dialogProj.input.amount_per_cycle
      : 0;
    const dialogPaidAmt = parseFloat(paidAmount.replace(",", "."));
    const dialogEffectiveAmt = !isNaN(dialogPaidAmt) && dialogPaidAmt > 0
      ? dialogPaidAmt
      : dialogDefaultAmount;
    const dialogNewDueDate = dialogItem
      ? addMonths(
          new Date(dialogItem.next_due_date! + "T00:00:00"),
          monthsPerCycle(dialogItem.frequency, dialogItem.custom_days),
        )
      : null;
    const dialogNewDueDateStr = dialogNewDueDate
      ? dialogNewDueDate.toLocaleDateString("it-IT")
      : "";
    const dialogNewCycleMonths = dialogItem
      ? Math.max(
          1,
          monthsBetween(new Date(), dialogNewDueDate ?? new Date()) + 1,
        )
      : 0;
    const dialogNewQuota = dialogNewCycleMonths > 0
      ? dialogEffectiveAmt / dialogNewCycleMonths
      : 0;
    const dialogPot = dialogItem?.savings_pot_id
      ? pots.find(p => p.id === dialogItem.savings_pot_id) ?? null
      : null;
    const dialogPotBalance = dialogPot ? Number(dialogPot.current_balance) : piggyBalance;
    const dialogPiggyAfter = dialogPotBalance - dialogEffectiveAmt;
    const dialogGoesNegative = paidDeduct && dialogPiggyAfter < 0;

    return (
      <>
        {/* ── Mark-paid dialog ─────────────────────────────────────────────── */}
        {paidDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => { if (!paidSaving) setPaidDialog(null); }}
            />
            <div className="relative bg-background border rounded-2xl p-6 max-w-sm w-full flex flex-col gap-5 shadow-xl">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-base">Marca come pagata</h2>
                <button
                  onClick={() => setPaidDialog(null)}
                  disabled={paidSaving}
                  className="text-muted-foreground hover:text-foreground text-lg leading-none disabled:opacity-50"
                >
                  ✕
                </button>
              </div>

              <div className="flex flex-col gap-1.5 text-sm text-muted-foreground rounded-xl bg-muted/40 p-3">
                <p>
                  <span className="font-medium text-foreground">&ldquo;{paidDialog.item.name}&rdquo;</span>{" "}
                  sarà marcata come pagata.
                </p>
                {dialogNewDueDate && (
                  <p>La prossima scadenza diventerà <span className="font-medium text-foreground">{dialogNewDueDateStr}</span>.</p>
                )}
                {dialogNewQuota > 0 && (
                  <p>
                    Nuovo accantonamento:{" "}
                    <span className="font-medium text-foreground">{fmt(dialogNewQuota)}/mese</span>
                    {" "}per {dialogNewCycleMonths} {dialogNewCycleMonths === 1 ? "mese" : "mesi"}.
                  </p>
                )}
              </div>

              {/* Importo pagato */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Importo pagato (€)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={paidAmount}
                  onChange={e => setPaidAmount(e.target.value)}
                  placeholder={dialogDefaultAmount.toFixed(2)}
                  className="border-2 rounded-xl px-4 py-3 text-base bg-background focus:outline-none focus:border-primary transition-colors"
                />
                <p className="text-xs text-muted-foreground">
                  Modifica se l&apos;importo effettivo è diverso da quello previsto.
                </p>
              </div>

              {/* Scala dal salvadanaio */}
              <div className="flex flex-col gap-2">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={paidDeduct}
                    onChange={e => setPaidDeduct(e.target.checked)}
                    className="mt-0.5 shrink-0"
                  />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">
                      {dialogPot ? `Scala da ${dialogPot.emoji} ${dialogPot.name}` : "Scala dal salvadanaio"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {dialogPot ? dialogPot.name : "Salvadanaio"}: {fmt(dialogPotBalance)} → dopo: {fmt(dialogPiggyAfter)}
                    </span>
                  </div>
                </label>
                {!dialogPot && (
                  <p className="text-xs text-muted-foreground pl-6">
                    Nessun salvadanaio collegato a questa voce: verrà usato il primo disponibile.
                    Collegane uno con ✏️.
                  </p>
                )}
                {dialogGoesNegative && (
                  <p className="text-xs text-destructive font-medium pl-6">
                    ⚠️ Il salvadanaio andrebbe in negativo ({fmt(dialogPiggyAfter)}).
                  </p>
                )}
              </div>

              <p className="text-xs text-muted-foreground -mt-2">
                Questa azione modificherà la scadenza e, se selezionato, il salvadanaio.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setPaidDialog(null)}
                  disabled={paidSaving}
                  className="flex-1 rounded-xl border-2 px-4 py-2.5 text-sm font-medium hover:bg-muted/50 disabled:opacity-50 transition-colors"
                >
                  Annulla
                </button>
                <button
                  onClick={async () => {
                    setPaidSaving(true);
                    const res = await markSinkingFundPaid(paidDialog.proj.input.id, {
                      deductFromPiggy: paidDeduct,
                      paidAmount: !isNaN(dialogPaidAmt) && dialogPaidAmt > 0
                        ? dialogPaidAmt
                        : undefined,
                    });
                    setPaidSaving(false);
                    if ("error" in res && res.error) {
                      toast.error(res.error);
                    } else if ("success" in res && res.success) {
                      const r = res as {
                        newDueDate: string; newSavingStart: string;
                        deducted: number; newPiggyBalance: number | null;
                      };
                      if (paidDeduct && r.deducted > 0) {
                        toast.success(`Pagato ${fmt(r.deducted)}. Prossima scadenza: ${new Date(r.newDueDate + "T00:00:00").toLocaleDateString("it-IT")}.`);
                      } else {
                        toast.success("Marcata come pagata.");
                      }
                      setRecurringItems(prev => prev.map(it =>
                        it.id === paidDialog.proj.input.id
                          ? { ...it, next_due_date: r.newDueDate, saving_start_date: r.newSavingStart }
                          : it
                      ));
                      setPaidDialog(null);
                      setPaidAmount("");
                    }
                  }}
                  disabled={paidSaving}
                  className="flex-1 bg-primary text-primary-foreground rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {paidSaving ? "Conferma…" : "Conferma pagamento"}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <BackButton onClick={() => goBack("cover")} />
            <h1 className="text-xl font-bold flex-1">Accantonamenti</h1>
            <button
              onClick={goAddAccantonamento}
              className="text-sm bg-primary text-primary-foreground rounded-lg px-3 py-1.5 hover:bg-primary/90 transition-colors"
            >
              + Aggiungi
            </button>
          </div>

          {recurringLoading ? (
            <div className="animate-pulse flex flex-col gap-4">
              {[1, 2, 3].map(i => <div key={i} className="h-24 rounded-2xl bg-muted" />)}
            </div>
          ) : sinkingInputs.length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-16 text-center">
              <span className="text-5xl">🏦</span>
              <h2 className="text-lg font-bold">Nessun accantonamento</h2>
              <p className="text-muted-foreground text-sm max-w-xs">
                Configura una spesa ricorrente non mensile con una &ldquo;Prossima scadenza&rdquo; per attivare il calcolo dell&apos;accantonamento mensile.
              </p>
              <button
                onClick={goAddAccantonamento}
                className="bg-primary text-primary-foreground rounded-xl px-5 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                Aggiungi accantonamento
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Banner "tocca pagare" */}
              {readyToPay.length > 0 && (
                <div className="rounded-xl border border-amber-400/60 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
                  ⏰{" "}
                  <span className="font-medium">
                    {readyToPay.length === 1 ? "1 accantonamento pronto" : `${readyToPay.length} accantonamenti pronti`}
                  </span>
                  {" "}per il pagamento:{" "}
                  {readyToPay.map(p => p.input.name).join(", ")}
                </div>
              )}

              {/* Banner recupero */}
              {in_catchup && (
                <div className="rounded-xl border border-amber-400/60 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 flex flex-col gap-1.5 text-sm">
                  <p className="font-semibold text-amber-700 dark:text-amber-400">
                    ⏫ Sei in fase di recupero
                  </p>
                  <p className="text-amber-700/80 dark:text-amber-500 text-xs leading-relaxed">
                    Alcune scadenze arrivano prima che tu abbia avuto il tempo di accantonare l&apos;importo completo,
                    quindi la rata mensile attuale è più alta del normale.
                    Una volta superate queste prime scadenze, la quota mensile si stabilizzerà.
                  </p>
                  <div className="flex justify-between items-center pt-1 border-t border-amber-400/30">
                    <span className="text-xs text-amber-700/80 dark:text-amber-500">Quota a regime (da prossimo ciclo)</span>
                    <span className="text-sm font-bold text-amber-700 dark:text-amber-400">{fmt(steady_state_total)}/mese</span>
                  </div>
                </div>
              )}

              {/* Riepilogo globale */}
              <div className={`rounded-2xl border-2 p-5 flex flex-col gap-4 ${statusConfig.bg}`}>
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Situazione accantonamenti
                  </h2>
                  <span className={`text-xs font-semibold ${statusConfig.color}`}>
                    {statusConfig.label}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">
                      Da accantonare questo mese
                      {in_catchup && <span className="ml-1 text-xs text-amber-500">(recupero)</span>}
                    </span>
                    <span className="font-bold text-base">{fmt(summary.this_month_total)}</span>
                  </div>
                  {in_catchup && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">A regime</span>
                      <span className="font-semibold text-muted-foreground">{fmt(steady_state_total)}/mese</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Previsto accantonato finora</span>
                    <span className="font-semibold">{fmt(summary.expected_saved_total)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">{potLabel}</span>
                    <span className="font-semibold">{fmt(summary.piggy_balance)}</span>
                  </div>
                  <div className="border-t pt-2 flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Delta</span>
                    <span className={`font-bold ${summary.delta >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
                      {summary.delta >= 0 ? "+" : ""}{fmt(summary.delta)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Dove stanno i soldi degli accantonamenti: un salvadanaio per tutti */}
              {pots.length > 0 ? (
                <div className="rounded-xl border px-4 py-3 flex flex-col gap-2">
                  <label className="text-sm font-medium" htmlFor="sinking-pot">🐷 Dove tieni questi soldi?</label>
                  <select
                    id="sinking-pot"
                    value={commonPot}
                    disabled={potSaving}
                    onChange={e => { if (e.target.value !== "mixed") void handleSetSinkingPot(e.target.value); }}
                    className="border-2 rounded-xl px-3 py-2.5 text-base bg-background focus:outline-none focus:border-primary transition-colors disabled:opacity-50"
                  >
                    {pots.map(p => <option key={p.id} value={p.id}>{p.emoji} {p.name} ({fmt(Number(p.current_balance))})</option>)}
                    <option value="">Tutti (tranne quelli degli obiettivi)</option>
                    {commonPot === "mixed" && <option value="mixed" disabled>Salvadanai diversi, scelti voce per voce</option>}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    {commonPotName
                      ? `Il confronto usa solo "${commonPotName}", e "Segna come pagata" scala da lì.`
                      : "Se li tieni in un salvadanaio solo, sceglilo: il confronto userà solo quello e \"Segna come pagata\" scalerà da lì."}
                  </p>
                </div>
              ) : (
                <Link href="/dashboard/salvadanai" className="rounded-xl border px-4 py-3 text-sm text-primary hover:bg-muted/40 transition-colors">
                  🐷 Crea un salvadanaio per gli accantonamenti, così vedi se sei in pari →
                </Link>
              )}

              {/* Notifica: accantonato da transazioni reali questo mese */}
              {accTxThisMonth > 0 && (
                <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">💰 Accantonato da transazioni questo mese</span>
                  <span className="font-semibold">{fmt(accTxThisMonth)}</span>
                </div>
              )}

              {/* Lista voci */}
              <div className="flex flex-col gap-3">
                {summary.projections.map(proj => {
                  const item = recurringItems.find(it => it.id === proj.input.id);
                  if (!item) return null;
                  const pct = proj.total_months > 0
                    ? Math.round((proj.months_elapsed / proj.total_months) * 100)
                    : 100;
                  const isExpired = proj.months_remaining <= 0;
                  const showPaidProminent = proj.months_remaining <= 1;
                  const catchup = catchupData.find(c => c.proj.input.id === proj.input.id);
                  const isCatchup = catchup?.is_catchup ?? false;

                  // Riconoscimento automatico: una transazione reale che sembra questo pagamento,
                  // successiva all'inizio del ciclo corrente (saving_start_date) — evita di
                  // ripescare un pagamento di un ciclo già confermato in precedenza.
                  const kws = effectiveKws(item);
                  const today = todayISO();
                  const candidateTx = kws.length > 0 ? transactions
                    .filter(t => Number(t.amount) < 0 && t.date >= item.saving_start_date! && t.date <= today && txMatchesKws(t, kws))
                    .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null : null;

                  return (
                    <div
                      key={proj.input.id}
                      className={`rounded-2xl border-2 p-4 flex flex-col gap-3 ${isExpired ? "border-amber-400/50 bg-amber-50/30 dark:bg-amber-950/10" : "border-border"}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold truncate">{proj.input.name}</span>
                            {isCatchup && (
                              <span className="text-xs bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-300/50 rounded-full px-2 py-0.5 whitespace-nowrap">
                                ⏫ recupero
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Scadenza: {new Date(proj.input.next_due_date + "T00:00:00").toLocaleDateString("it-IT")}
                            {" · "}
                            {proj.months_remaining > 0
                              ? `${proj.months_remaining} ${proj.months_remaining === 1 ? "mese rimasto" : "mesi rimasti"}`
                              : "pronto per il pagamento"}
                          </div>
                          {(() => {
                            const linkedPot = item.savings_pot_id ? pots.find(p => p.id === item.savings_pot_id) : null;
                            return linkedPot ? (
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {linkedPot.emoji} {linkedPot.name}
                              </div>
                            ) : null;
                          })()}
                          {isCatchup && catchup && (
                            <div className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                              A regime: {fmt(catchup.steady_monthly)}/mese
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => goEditRecurring(item)}
                          className="text-xs text-muted-foreground hover:text-foreground border rounded-lg px-2 py-1 transition-colors shrink-0"
                          title="Modifica"
                        >
                          ✏️
                        </button>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>
                            Quota mensile:{" "}
                            <span className="font-semibold text-foreground">{fmt(proj.monthly_quota)}</span>
                          </span>
                          <span>{Math.min(100, pct)}%</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              isExpired ? "bg-amber-500" : "bg-primary"
                            }`}
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Previsto: {fmt(proj.expected_saved_so_far)}</span>
                          <span>Totale: {fmt(proj.input.amount_per_cycle)}</span>
                        </div>
                      </div>

                      {candidateTx && (
                        <div className="rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 flex items-center justify-between gap-3 text-xs">
                          <div className="min-w-0">
                            <p className="font-medium">
                              💡 Trovato: {fmt(Math.abs(Number(candidateTx.amount)))} il{" "}
                              {new Date(candidateTx.date + "T00:00:00").toLocaleDateString("it-IT")}
                            </p>
                            <p className="text-muted-foreground truncate">{candidateTx.description || candidateTx.merchant}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const foundAmt = Math.abs(Number(candidateTx.amount));
                              setPaidAmount(foundAmt % 1 === 0 ? foundAmt.toString() : foundAmt.toFixed(2));
                              setPaidDeduct(potBalanceFor(item) >= foundAmt);
                              setPaidDialog({ proj, item });
                            }}
                            className="shrink-0 bg-primary text-primary-foreground rounded-lg px-3 py-1.5 font-medium hover:bg-primary/90 transition-colors"
                          >
                            Conferma
                          </button>
                        </div>
                      )}

                      <div className="flex items-center gap-3">
                        {/* Pagata button */}
                        <button
                          type="button"
                          onClick={() => {
                            const defaultAmt = proj.input.amount_per_cycle;
                            setPaidAmount(defaultAmt % 1 === 0
                              ? defaultAmt.toString()
                              : defaultAmt.toFixed(2));
                            setPaidDeduct(potBalanceFor(item) >= defaultAmt);
                            setPaidDialog({ proj, item });
                          }}
                          className={`text-xs font-medium rounded-lg px-3 py-1.5 transition-colors ${
                            showPaidProminent
                              ? "bg-primary text-primary-foreground hover:bg-primary/90"
                              : "border hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          ✓ Pagata
                        </button>

                        {/* Ricalcola da oggi */}
                        <button
                          type="button"
                          onClick={async () => {
                            const res = await resetSavingStartDate(proj.input.id);
                            if (res.error) toast.error(res.error);
                            else {
                              toast.success("Ricalcolo aggiornato.");
                              const today = todayISO();
                              setRecurringItems(prev => prev.map(it =>
                                it.id === proj.input.id
                                  ? { ...it, saving_start_date: today }
                                  : it
                              ));
                            }
                          }}
                          className="text-xs text-muted-foreground hover:text-foreground underline"
                        >
                          🔄 Ricalcola da oggi
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Info salvadanaio */}
              <div className="rounded-xl border border-dashed p-4 flex flex-col gap-1.5">
                <p className="text-xs font-medium text-muted-foreground">Come funziona il salvadanaio?</p>
                <p className="text-xs text-muted-foreground">
                  Accantonando {fmt(summary.this_month_total)} ogni mese nel salvadanaio, arriverai pronto a ogni scadenza non mensile.
                </p>
                <a href="/dashboard/account" className="text-xs text-primary hover:underline mt-1">
                  Aggiorna il saldo del salvadanaio →
                </a>
              </div>
            </div>
          )}
        </div>
      </>
    );
  }

  return null;
}
