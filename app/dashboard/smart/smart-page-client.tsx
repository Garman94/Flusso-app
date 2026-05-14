"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

type Category = { id: string; name: string; color: string; icon: string };
type Transaction = {
  date: string; amount: number; category_id?: string | null;
  description?: string | null; merchant?: string | null;
};
type Goal = {
  id: string; name: string; target_amount: number; current_amount: number;
  deadline: string | null; icon: string; created_at: string;
};
type Tipologia = "fissa" | "variabile" | "entrata";
type Frequency = "mensile" | "bimestrale" | "trimestrale" | "semestrale" | "annuale" | "personalizzata";
type RecurringExpense = {
  id: string; name: string; tipologia: Tipologia; frequency: Frequency;
  custom_days: number | null; amount: number; amount_max: number | null;
  category_id: string | null; notes: string | null; match_keywords: string[];
  matching_strategy: string; due_day: number | null; due_month: number | null;
  secondary_name: string | null;
  end_date: string | null;
};
type TipoCard = "uscita_fissa" | "uscita_variabile" | "entrata";
type View = "cover" | "add-recurring" | "edit-recurring" | "list-recurring" | "add-goal" | "list-goals" | "previsioni";

type Props = {
  userId: string; plan: string; initialGoals: Goal[];
  transactions: Transaction[]; categories: Category[];
  payDay?: number; periodFrom?: string; periodTo?: string;
  periodYear?: number; periodMonth?: number;
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

function nextOccurrence(item: RecurringExpense, allTxs: Transaction[]): Date | null {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (item.end_date && new Date(item.end_date + "T00:00:00") < today) return null;

  if (item.frequency === "mensile" && item.due_day) {
    const c = new Date(today.getFullYear(), today.getMonth(), item.due_day);
    return c >= today ? c : new Date(today.getFullYear(), today.getMonth() + 1, item.due_day);
  }

  if (item.frequency === "annuale") {
    const mo = (item.due_month ?? 1) - 1;
    const d = item.due_day ?? 1;
    const c = new Date(today.getFullYear(), mo, d);
    return c >= today ? c : new Date(today.getFullYear() + 1, mo, d);
  }

  // Per frequenze multi-mese: usa l'ultima transazione corrispondente come riferimento
  if (item.due_day) {
    const freqMonths = FREQ_MONTHS[item.frequency] ?? 2;
    const kws = effectiveKws(item);
    if (kws.length > 0) {
      const last = [...allTxs]
        .filter(t => Number(t.amount) < 0 && txMatchesKws(t, kws))
        .sort((a, b) => b.date.localeCompare(a.date))[0];
      if (last) {
        const lastDate = new Date(last.date + "T00:00:00");
        const next = new Date(lastDate.getFullYear(), lastDate.getMonth() + freqMonths, item.due_day);
        if (next >= today) return next;
      }
    }
  }

  return null;
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
};

const EMPTY_G = {
  name: "",
  icon: "🎯",
  target_amount: "",
  current_amount: "0",
  deadline: "",
};

const GOAL_ICONS = ["🎯", "🏖️", "🛡️", "🏠", "💻", "🎓", "🚗", "✈️", "💍", "🌱", "💪", "🎁"];
const FREE_GOAL_LIMIT = 1;

// ─── Main component ───────────────────────────────────────────────────────────

export function SmartPageClient({
  userId, plan, initialGoals, transactions,
  payDay = 0, periodFrom, periodTo,
}: Props) {
  const [view, setView] = useState<View>("cover");
  const [recurringItems, setRecurringItems] = useState<RecurringExpense[]>([]);
  const [recurringLoading, setRecurringLoading] = useState(true);
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

  // Goal wizard
  const [gStep, setGStep] = useState(1);
  const [gForm, setGForm] = useState(EMPTY_G);
  const [gSaving, setGSaving] = useState(false);
  const [gEditId, setGEditId] = useState<string | null>(null);

  useEffect(() => {
    createClient()
      .from("recurring_expenses")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        setRecurringItems((data ?? []) as RecurringExpense[]);
        setRecurringLoading(false);
      });
  }, [userId]);

  // ── Period helpers ─────────────────────────────────────────────────────────
  const now = new Date();
  const pStart = periodFrom ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const pEnd = periodTo;
  const monthTxs = transactions.filter(
    t => Number(t.amount) < 0 && t.date >= pStart && (pEnd ? t.date <= pEnd : true)
  );

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
    });
    setEEditId(item.id); setETxSearch(""); setView("edit-recurring");
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
    });
    setGStep(1); setGEditId(g.id); setView("add-goal");
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
    const payload = {
      name: rForm.name.trim(), tipologia, frequency: rForm.frequency,
      custom_days: custDays, amount: amt, amount_max: amtMax,
      match_keywords: [], matching_strategy: "keyword",
      due_day: rForm.due_day, category_id: null, notes: null,
      secondary_name: rForm.secondary_name.trim() || null,
    };

    if (rEditId) {
      const { data, error } = await supabase
        .from("recurring_expenses").update(payload).eq("id", rEditId).select("*").single();
      if (error) toast.error("Errore nel salvataggio.");
      else {
        setRecurringItems(prev => prev.map(it => it.id === rEditId ? data as RecurringExpense : it));
        toast.success("Modificata!"); setView("list-recurring");
      }
    } else {
      const { data, error } = await supabase
        .from("recurring_expenses").insert({ user_id: userId, ...payload }).select("*").single();
      if (error) toast.error("Errore nel salvataggio.");
      else {
        setRecurringItems(prev => [...prev, data as RecurringExpense]);
        toast.success("Aggiunta!"); setView("list-recurring");
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
    const payload = {
      name: eForm.name.trim(), tipologia, frequency: eForm.frequency,
      custom_days: custDays, amount: amt, amount_max: amtMax,
      due_day: eForm.due_day,
      due_month: eForm.frequency === "annuale" ? eForm.due_month : null,
      secondary_name: eForm.secondary_name.trim() || null,
      end_date: eForm.end_date || null,
    };
    const { data, error } = await createClient()
      .from("recurring_expenses").update(payload).eq("id", eEditId).select("*").single();
    if (error) toast.error("Errore nel salvataggio.");
    else {
      setRecurringItems(prev => prev.map(it => it.id === eEditId ? data as RecurringExpense : it));
      toast.success("Modificata!"); setView("list-recurring");
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
    const payload = {
      name: gForm.name.trim(), icon: gForm.icon,
      target_amount: ta, current_amount: isNaN(ca) ? 0 : ca,
      deadline: gForm.deadline || null,
    };
    if (gEditId) {
      const { data, error } = await supabase
        .from("goals").update(payload).eq("id", gEditId).select().single();
      if (error) toast.error("Errore.");
      else {
        setGoals(prev => prev.map(g => g.id === gEditId ? data as Goal : g));
        toast.success("Obiettivo aggiornato!"); setView("list-goals");
      }
    } else {
      const { data, error } = await supabase
        .from("goals").insert({ user_id: userId, ...payload }).select().single();
      if (error) toast.error("Errore.");
      else {
        setGoals(prev => [data as Goal, ...prev]);
        toast.success("Obiettivo creato!"); setView("list-goals");
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

  if (view === "cover") {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">Smart</h1>
        {([
          { icon: "➕", label: "Aggiungi spesa ricorrente", action: goAddRecurring },
          { icon: "📋", label: "Le mie spese ricorrenti", action: () => setView("list-recurring") },
          { icon: "🎯", label: "I miei obiettivi", action: () => setView("list-goals") },
          { icon: "🔮", label: "Previsioni", action: () => setView("previsioni") },
        ] as const).map(({ icon, label, action }) => (
          <button
            key={label}
            onClick={action}
            className="flex items-center gap-4 rounded-2xl border-2 border-border hover:border-primary/50 hover:bg-primary/5 px-5 py-4 text-left transition-all active:scale-[0.98]"
          >
            <span className="text-2xl">{icon}</span>
            <span className="text-base font-medium">{label}</span>
            <span className="ml-auto text-muted-foreground">›</span>
          </button>
        ))}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RECURRING WIZARD
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
      if (rStep === 1) { setView("cover"); return; }
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
          <BackButton onClick={() => setView("list-recurring")} />
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
                  placeholder="Cerca nelle tue transazioni…"
                  className="border-2 rounded-xl px-4 py-3 text-base bg-background focus:outline-none focus:border-primary transition-colors"
                />
                {eTxSearch.length >= 2 && (
                  <div className="flex flex-col gap-1">
                    {transactions
                      .filter(t => {
                        const q = eTxSearch.toLowerCase();
                        return t.description?.toLowerCase().includes(q) || t.merchant?.toLowerCase().includes(q);
                      })
                      .slice(0, 5)
                      .map((t, i) => {
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
                    {transactions.filter(t => {
                      const q = eTxSearch.toLowerCase();
                      return t.description?.toLowerCase().includes(q) || t.merchant?.toLowerCase().includes(q);
                    }).length === 0 && (
                      <p className="text-xs text-muted-foreground px-1">Nessuna transazione trovata.</p>
                    )}
                  </div>
                )}
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
  // RECURRING LIST
  // ═══════════════════════════════════════════════════════════════════════════

  if (view === "list-recurring") {
    const usciteFisse    = recurringItems.filter(it => it.tipologia === "fissa");
    const usciteVariabili = recurringItems.filter(it => it.tipologia === "variabile");
    const entrate        = recurringItems.filter(it => it.tipologia === "entrata");

    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <BackButton onClick={() => setView("cover")} />
          <h1 className="text-xl font-bold flex-1">Le mie spese ricorrenti</h1>
          <button
            onClick={goAddRecurring}
            className="text-sm bg-primary text-primary-foreground rounded-lg px-3 py-1.5 hover:bg-primary/90 transition-colors"
          >
            + Aggiungi
          </button>
        </div>

        {recurringLoading ? (
          <div className="animate-pulse flex flex-col gap-3">
            {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl bg-muted" />)}
          </div>
        ) : recurringItems.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <span className="text-5xl">📋</span>
            <p className="text-muted-foreground">Nessuna spesa ricorrente ancora.</p>
            <button
              onClick={goAddRecurring}
              className="bg-primary text-primary-foreground rounded-xl px-5 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Aggiungi la prima
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {[
              { label: "💸 Uscite fisse",    items: usciteFisse },
              { label: "📊 Uscite variabili", items: usciteVariabili },
              { label: "💰 Entrate",          items: entrate },
            ]
              .filter(g => g.items.length > 0)
              .map(group => (
                <div key={group.label} className="flex flex-col gap-2">
                  <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {group.label}
                  </h2>
                  {group.items.map(item => (
                    <div key={item.id} className="rounded-xl border p-4 flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">
                          {item.name}
                          {item.secondary_name && (
                            <span className="text-muted-foreground font-normal"> ({item.secondary_name})</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {item.tipologia === "variabile" && item.amount_max
                            ? `${fmt(item.amount)} – ${fmt(item.amount_max)}`
                            : fmt(item.amount)}
                          {" · "}{freqLabel(item)}
                          {item.frequency === "annuale" && item.due_month
                            ? ` · ${new Date(2000, item.due_month - 1).toLocaleString("it-IT", { month: "long" })}${item.due_day ? ` ${item.due_day}` : ""}`
                            : item.due_day ? ` · giorno ${item.due_day}` : ""}
                          {item.end_date ? ` · fino al ${new Date(item.end_date).toLocaleDateString("it-IT")}` : ""}
                        </div>

                        {/* Speso questo mese + prossima uscita */}
                        {(() => {
                          const kws = effectiveKws(item);
                          const isUscita = item.tipologia !== "entrata";
                          const periodTxs = transactions.filter(
                            t => t.date >= pStart && (pEnd ? t.date <= pEnd : true)
                          );
                          const matchedTxs = kws.length > 0
                            ? periodTxs.filter(t => isUscita ? Number(t.amount) < 0 : Number(t.amount) > 0)
                                .filter(t => txMatchesKws(t, kws))
                            : item.category_id
                            ? periodTxs.filter(t => isUscita ? Number(t.amount) < 0 : Number(t.amount) > 0)
                                .filter(t => t.category_id === item.category_id)
                            : [];
                          const spent = matchedTxs.reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
                          const next = nextOccurrence(item, transactions);
                          const hasData = spent > 0 || next !== null;
                          if (!hasData) return null;
                          return (
                            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 pt-2 border-t border-dashed">
                              {spent > 0 && (
                                <span className="text-xs flex items-center gap-1">
                                  <span className="text-muted-foreground">{isUscita ? "Speso" : "Ricevuto"} questo mese:</span>
                                  <span className="font-semibold text-foreground">{fmt(spent)}</span>
                                </span>
                              )}
                              {spent === 0 && kws.length > 0 && (
                                <span className="text-xs text-muted-foreground italic">Nessuna transazione questo mese</span>
                              )}
                              {next && (
                                <span className="text-xs flex items-center gap-1">
                                  <span className="text-muted-foreground">Prossima:</span>
                                  <span className="font-semibold text-foreground">
                                    {next.toLocaleDateString("it-IT", { day: "numeric", month: "short" })}
                                  </span>
                                  <span className="text-muted-foreground">·</span>
                                  <span className="font-medium">
                                    {item.tipologia === "variabile" && item.amount_max
                                      ? `${fmt(item.amount)}–${fmt(item.amount_max)}`
                                      : fmt(item.amount)}
                                  </span>
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => goEditRecurring(item)}
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
                  ))}
                </div>
              ))}
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GOAL WIZARD
  // ═══════════════════════════════════════════════════════════════════════════

  if (view === "add-goal") {
    const TOTAL_STEPS = 4;
    const isFree = plan === "free";
    const atLimit = isFree && goals.length >= FREE_GOAL_LIMIT && !gEditId;

    function gBack() {
      if (gStep === 1) { setView("cover"); return; }
      setGStep(s => s - 1);
    }

    if (atLimit) {
      return (
        <div className="flex flex-col gap-6">
          <BackButton onClick={() => setView("cover")} />
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
            <button
              onClick={() => setGStep(4)}
              className="bg-primary text-primary-foreground rounded-xl px-6 py-3 font-semibold hover:bg-primary/90 transition-colors"
            >
              Continua →
            </button>
          </div>
        )}

        {/* Step 4 — Riepilogo */}
        {gStep === 4 && (
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
          <BackButton onClick={() => setView("cover")} />
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
                </div>
              );
            })}
          </div>
        )}
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
          <BackButton onClick={() => setView("cover")} />
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

  return null;
}
