"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

type Category = { id: string; name: string; color: string; icon: string };
type Tipologia = "fissa" | "variabile";
type Frequency = "mensile" | "bimestrale" | "trimestrale" | "semestrale" | "annuale" | "personalizzata";
type MatchingStrategy = "keyword" | "historical_avg";

type RecurringExpense = {
  id: string;
  name: string;
  tipologia: Tipologia;
  frequency: Frequency;
  custom_days: number | null;
  amount: number;
  amount_max: number | null;
  category_id: string | null;
  notes: string | null;
  match_keywords: string[];
  matching_strategy: MatchingStrategy;
};

type Transaction = {
  amount: number;
  date: string;
  category_id?: string | null;
  description?: string | null;
  merchant?: string | null;
};

type Props = {
  userId: string;
  categories: Category[];
  transactions: Transaction[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FREQ_MONTHS: Record<Exclude<Frequency, "personalizzata">, number> = {
  mensile: 1, bimestrale: 2, trimestrale: 3, semestrale: 6, annuale: 12,
};

function formatEuro(n: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
}

function toMonthlyAmount(exp: RecurringExpense): number {
  const mid = exp.tipologia === "variabile" && exp.amount_max != null
    ? (exp.amount + exp.amount_max) / 2
    : exp.amount;
  if (exp.frequency === "personalizzata" && exp.custom_days)
    return mid * (30 / exp.custom_days);
  return mid / (FREQ_MONTHS[exp.frequency as Exclude<Frequency, "personalizzata">] ?? 1);
}

function freqLabel(exp: RecurringExpense): string {
  if (exp.frequency === "personalizzata" && exp.custom_days) {
    if (exp.custom_days % 365 === 0) return `ogni ${exp.custom_days / 365}a`;
    if (exp.custom_days % 30 === 0) return `ogni ${exp.custom_days / 30}m`;
    if (exp.custom_days % 7 === 0) return `ogni ${exp.custom_days / 7}sett`;
    return `ogni ${exp.custom_days}gg`;
  }
  const map: Record<Frequency, string> = {
    mensile: "mensile", bimestrale: "ogni 2m", trimestrale: "ogni 3m",
    semestrale: "ogni 6m", annuale: "annuale", personalizzata: "",
  };
  return map[exp.frequency];
}

function txMatchesKeywords(tx: Transaction, keywords: string[]): boolean {
  if (!keywords.length) return false;
  const d = (tx.description ?? "").toLowerCase();
  const m = (tx.merchant ?? "").toLowerCase();
  return keywords.some(k => {
    const kk = k.toLowerCase().trim();
    return kk.length > 0 && (d.includes(kk) || m.includes(kk));
  });
}

function computeHistoricalAvg(
  allTxs: Transaction[], keywords: string[], calMonth: number, calYear: number,
): number {
  const byYear = new Map<number, number>();
  for (const t of allTxs) {
    if (Number(t.amount) >= 0) continue;
    const d = new Date(t.date + "T00:00:00");
    if (d.getFullYear() === calYear && d.getMonth() === calMonth) continue;
    if (d.getMonth() !== calMonth) continue;
    if (!txMatchesKeywords(t, keywords)) continue;
    const yr = d.getFullYear();
    byYear.set(yr, (byYear.get(yr) ?? 0) + Math.abs(Number(t.amount)));
  }
  const totals = Array.from(byYear.values());
  return totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : 0;
}

function computeRecentAvg(
  keywords: string[], allTxs: Transaction[], calMonth: number, calYear: number, numMonths = 3,
): number {
  const monthTotals: number[] = [];
  for (let i = 1; i <= numMonths; i++) {
    let m = calMonth - i;
    let y = calYear;
    while (m < 0) { m += 12; y--; }
    const start = `${y}-${String(m + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(y, m + 1, 0).getDate();
    const end = `${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    const total = allTxs
      .filter(t => Number(t.amount) < 0 && t.date >= start && t.date <= end && txMatchesKeywords(t, keywords))
      .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
    if (total > 0) monthTotals.push(total);
  }
  return monthTotals.length ? monthTotals.reduce((a, b) => a + b, 0) / monthTotals.length : 0;
}

function getForecastHint(
  item: RecurringExpense, allTxs: Transaction[], calMonth: number, calYear: number,
): string | null {
  if (!item.match_keywords.length) return null;
  if (item.matching_strategy === "historical_avg") {
    const avg = computeHistoricalAvg(allTxs, item.match_keywords, calMonth, calYear);
    if (avg > 0) {
      const name = new Date(calYear, calMonth, 1).toLocaleString("it-IT", { month: "long" });
      return `${name[0].toUpperCase()}${name.slice(1)} anni scorsi: media ${formatEuro(avg)}`;
    }
    return null;
  }
  if (item.tipologia === "variabile") {
    const avg = computeRecentAvg(item.match_keywords, allTxs, calMonth, calYear);
    if (avg > 0) return `Media ultimi 3 mesi: ${formatEuro(avg)}`;
  }
  return null;
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconEdit() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

// ─── Form default ─────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  name: "", tipologia: "fissa" as Tipologia, frequency: "mensile" as Frequency,
  custom_days: "", amount: "", amount_max: "", notes: "",
  matching_strategy: "keyword" as MatchingStrategy,
  keywordInput: "", keywords: [] as string[], txSearch: "",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function BudgetClient({ userId, categories, transactions }: Props) {
  const [items, setItems] = useState<RecurringExpense[]>([]);
  const [loading, setLoading] = useState(true);

  // accordion + visibility
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set());
  const [editMode, setEditMode] = useState(false);
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try { return new Set(JSON.parse(localStorage.getItem("budget_hidden_categories") ?? "[]") as string[]); }
    catch { return new Set(); }
  });

  // subcategory panel
  const [panelCategoryId, setPanelCategoryId] = useState<string | null>(null);
  const [panelEditingId, setPanelEditingId] = useState<string | null>(null);
  const [panelShowForm, setPanelShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const keywordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    createClient()
      .from("recurring_expenses")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .then(({ data }) => { setItems((data ?? []) as RecurringExpense[]); setLoading(false); });
  }, [userId]);

  // ── Date helpers ───────────────────────────────────────────────────────────
  const now = new Date();
  const calYear = now.getFullYear();
  const calMonth = now.getMonth();
  const monthStart = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-01`;
  const monthTxs = transactions.filter(t => Number(t.amount) < 0 && t.date >= monthStart);

  // ── Match transactions to subcategories ────────────────────────────────────
  const matchedBySubcatId = new Map<string, Transaction[]>();
  for (const item of items) {
    if (!item.match_keywords.length && !item.category_id) continue;
    const matched = item.match_keywords.length > 0
      ? monthTxs.filter(t => txMatchesKeywords(t, item.match_keywords))
      : monthTxs.filter(t => t.category_id === item.category_id);
    matchedBySubcatId.set(item.id, matched);
  }

  // ── Build per-category data ────────────────────────────────────────────────
  type SubcatData = {
    item: RecurringExpense;
    expectedMonthly: number;
    forecastHint: string | null;
    matchedTxs: Transaction[];
    actualSpent: number;
    delta: number;
  };
  type CatData = {
    cat: Category;
    subcats: SubcatData[];
    unmatchedTxs: Transaction[];
    expectedMonthly: number;
    actualSpent: number;
  };

  const catDataList: CatData[] = categories.map(cat => {
    const subcatItems = items.filter(it => it.category_id === cat.id);

    const subcats: SubcatData[] = subcatItems.map(item => {
      let expectedMonthly: number;
      if (item.matching_strategy === "historical_avg" && item.match_keywords.length > 0) {
        const hist = computeHistoricalAvg(transactions, item.match_keywords, calMonth, calYear);
        expectedMonthly = hist > 0 ? hist : toMonthlyAmount(item);
      } else {
        expectedMonthly = toMonthlyAmount(item);
      }
      const matchedTxs = matchedBySubcatId.get(item.id) ?? [];
      const actualSpent = matchedTxs.reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
      return {
        item, expectedMonthly,
        forecastHint: getForecastHint(item, transactions, calMonth, calYear),
        matchedTxs, actualSpent,
        delta: actualSpent - expectedMonthly,
      };
    });

    const thisCatClaimedTxs = new Set<Transaction>(
      subcatItems.flatMap(it => matchedBySubcatId.get(it.id) ?? [])
    );
    const unmatchedTxs = monthTxs.filter(t =>
      t.category_id === cat.id && !thisCatClaimedTxs.has(t)
    );
    const expectedMonthly = subcats.reduce((s, d) => s + d.expectedMonthly, 0);
    const actualSpent =
      subcats.reduce((s, d) => s + d.actualSpent, 0) +
      unmatchedTxs.reduce((s, t) => s + Math.abs(Number(t.amount)), 0);

    return { cat, subcats, unmatchedTxs, expectedMonthly, actualSpent };
  });

  // ── Summary ────────────────────────────────────────────────────────────────
  const allSubcats = catDataList.flatMap(d => d.subcats);
  const trackedExpected = allSubcats.reduce((s, d) => s + d.expectedMonthly, 0);
  const trackedActual  = allSubcats.reduce((s, d) => s + d.actualSpent, 0);
  const trackedDelta   = trackedActual - trackedExpected;

  // ── UI handlers ────────────────────────────────────────────────────────────
  function toggleCategory(catId: string) {
    setOpenCategories(prev => {
      const next = new Set(prev);
      next.has(catId) ? next.delete(catId) : next.add(catId);
      return next;
    });
  }

  function toggleHide(catId: string) {
    setHiddenCategories(prev => {
      const next = new Set(prev);
      next.has(catId) ? next.delete(catId) : next.add(catId);
      localStorage.setItem("budget_hidden_categories", JSON.stringify(Array.from(next)));
      return next;
    });
  }

  function openPanel(catId: string) {
    if (panelCategoryId === catId) {
      setPanelCategoryId(null); setPanelShowForm(false);
      setPanelEditingId(null); setForm(EMPTY_FORM);
    } else {
      setPanelCategoryId(catId); setPanelShowForm(false);
      setPanelEditingId(null); setForm(EMPTY_FORM);
    }
  }

  // ── Keywords ───────────────────────────────────────────────────────────────
  function addKeyword() {
    const kw = form.keywordInput.trim();
    if (!kw) return;
    if (form.keywords.map(k => k.toLowerCase()).includes(kw.toLowerCase())) { toast.error("Keyword già presente."); return; }
    setForm(f => ({ ...f, keywords: [...f.keywords, kw], keywordInput: "" }));
    keywordRef.current?.focus();
  }
  function removeKeyword(kw: string) { setForm(f => ({ ...f, keywords: f.keywords.filter(k => k !== kw) })); }
  function onKwKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") { e.preventDefault(); addKeyword(); }
    if (e.key === "Backspace" && !form.keywordInput && form.keywords.length)
      setForm(f => ({ ...f, keywords: f.keywords.slice(0, -1) }));
  }

  const txSearchResults = form.txSearch.trim().length >= 2
    ? transactions.filter(t => {
        const q = form.txSearch.toLowerCase();
        return (t.description?.toLowerCase().includes(q) || t.merchant?.toLowerCase().includes(q)) && Number(t.amount) < 0;
      }).slice(0, 6)
    : [];

  function applyTxAnchor(tx: Transaction) {
    const newKw = [tx.description, tx.merchant]
      .filter(Boolean)
      .map(s => s!.trim().toLowerCase())
      .filter(s => s && !form.keywords.map(k => k.toLowerCase()).includes(s));
    setForm(f => ({ ...f, keywords: [...f.keywords, ...newKw], txSearch: "" }));
  }

  // ── CRUD ───────────────────────────────────────────────────────────────────
  function startEdit(item: RecurringExpense, catId: string) {
    setForm({
      name: item.name, tipologia: item.tipologia, frequency: item.frequency,
      custom_days: item.custom_days?.toString() ?? "",
      amount: item.amount.toString().replace(".", ","),
      amount_max: item.amount_max?.toString().replace(".", ",") ?? "",
      notes: item.notes ?? "", matching_strategy: item.matching_strategy,
      keywordInput: "", keywords: [...item.match_keywords], txSearch: "",
    });
    setPanelEditingId(item.id);
    setPanelCategoryId(catId);
    setPanelShowForm(true);
  }

  function cancelForm() {
    setForm(EMPTY_FORM); setPanelEditingId(null); setPanelShowForm(false);
  }

  async function handleSave(e: React.FormEvent, categoryId: string) {
    e.preventDefault();
    const amt = parseFloat(form.amount.replace(",", "."));
    const amtMax = form.tipologia === "variabile" && form.amount_max
      ? parseFloat(form.amount_max.replace(",", ".")) : null;
    const custDays = form.frequency === "personalizzata" ? parseInt(form.custom_days) : null;

    if (!form.name.trim() || isNaN(amt) || amt <= 0) { toast.error("Inserisci nome e importo."); return; }
    if (form.tipologia === "variabile" && amtMax != null && amtMax < amt) { toast.error("Il massimo deve essere ≥ del minimo."); return; }
    if (form.frequency === "personalizzata" && (!custDays || custDays <= 0)) { toast.error("Inserisci un intervallo valido."); return; }

    setSaving(true);
    const supabase = createClient();
    const payload = {
      name: form.name.trim(), tipologia: form.tipologia, frequency: form.frequency,
      custom_days: custDays, amount: amt, amount_max: amtMax,
      category_id: categoryId, notes: form.notes.trim() || null,
      match_keywords: form.keywords, matching_strategy: form.matching_strategy,
    };

    if (panelEditingId) {
      const { data, error } = await supabase
        .from("recurring_expenses").update(payload).eq("id", panelEditingId).select("*").single();
      if (error) toast.error("Errore nel salvataggio.");
      else { setItems(prev => prev.map(it => it.id === panelEditingId ? data as RecurringExpense : it)); cancelForm(); toast.success("Sottocategoria aggiornata!"); }
    } else {
      const { data, error } = await supabase
        .from("recurring_expenses").insert({ user_id: userId, ...payload }).select("*").single();
      if (error) toast.error("Errore nel salvataggio.");
      else { setItems(prev => [...prev, data as RecurringExpense]); cancelForm(); toast.success("Sottocategoria aggiunta!"); }
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    const { error } = await createClient().from("recurring_expenses").delete().eq("id", id);
    if (error) toast.error("Errore nella cancellazione.");
    else { setItems(prev => prev.filter(it => it.id !== id)); toast.success("Rimossa."); }
    setDeletingId(null);
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  const visibleCats = editMode
    ? catDataList
    : catDataList.filter(d => !hiddenCategories.has(d.cat.id));

  return (
    <div className="flex flex-col gap-4">

      {/* Summary + Gestisci */}
      <div className="flex items-center justify-between gap-4">
        <div className="text-sm text-muted-foreground">
          {trackedExpected > 0 ? (
            <>
              Previsto: <span className="font-semibold text-foreground">{formatEuro(trackedExpected)}</span>
              {" · "}Speso: <span className="font-semibold text-red-500">{formatEuro(trackedActual)}</span>
              {" · "}
              <span className={trackedDelta > 0 ? "font-semibold text-red-500" : "font-semibold text-green-600 dark:text-green-400"}>
                {trackedDelta > 0 ? "+" : ""}{formatEuro(trackedDelta)}
              </span>
            </>
          ) : (
            <span>Configura le sottocategorie per tracciare il budget</span>
          )}
        </div>
        <button
          onClick={() => { setEditMode(v => !v); if (editMode) setPanelCategoryId(null); }}
          className={`text-xs border rounded-md px-3 py-1.5 shrink-0 transition-colors ${editMode ? "bg-primary text-primary-foreground" : "hover:bg-muted/50"}`}
        >
          {editMode ? "Fine" : "Gestisci"}
        </button>
      </div>

      {/* Category list */}
      {loading ? (
        <div className="rounded-xl border p-8 text-center text-sm text-muted-foreground animate-pulse">Caricamento…</div>
      ) : (
        <div className="rounded-xl border overflow-hidden divide-y">
          {visibleCats.map(({ cat, subcats, unmatchedTxs, expectedMonthly, actualSpent }) => {
            const isOpen = openCategories.has(cat.id);
            const isPanelOpen = panelCategoryId === cat.id;
            const isHidden = hiddenCategories.has(cat.id);
            const matchedSubcats = subcats.filter(s => s.matchedTxs.length > 0);
            const canExpand = matchedSubcats.length > 0 || unmatchedTxs.length > 0;
            const hasSubcats = subcats.length > 0;
            const pct = expectedMonthly > 0 ? Math.min(100, (actualSpent / expectedMonthly) * 100) : 0;

            return (
              <div key={cat.id} className={isHidden && !editMode ? "hidden" : ""}>

                {/* Category header */}
                <div className={`flex items-center gap-2 px-4 py-3 transition-colors ${isHidden ? "opacity-40" : "hover:bg-muted/10"}`}>
                  <span className="text-lg shrink-0">{cat.icon || "📦"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">{cat.name}</span>
                      <div className="flex items-center gap-1.5 shrink-0 text-xs">
                        {hasSubcats && expectedMonthly > 0 && actualSpent > 0 ? (
                          <>
                            <span className="text-muted-foreground">Previsto:</span>
                            <span className="font-medium tabular-nums">{formatEuro(expectedMonthly)}</span>
                            <span className="text-muted-foreground/50">·</span>
                            <span className="text-muted-foreground">Speso:</span>
                            <span className="font-medium tabular-nums text-red-500">{formatEuro(actualSpent)}</span>
                            <span className="text-muted-foreground/50">·</span>
                            <span className="text-muted-foreground">Differenza:</span>
                            <span className={`font-semibold tabular-nums ${actualSpent > expectedMonthly ? "text-red-500" : "text-green-600 dark:text-green-400"}`}>
                              {formatEuro(Math.abs(actualSpent - expectedMonthly))}{" "}
                              {actualSpent > expectedMonthly ? "sforati" : "risparmiati"}
                            </span>
                          </>
                        ) : hasSubcats && expectedMonthly > 0 ? (
                          <>
                            <span className="text-muted-foreground">Previsto:</span>
                            <span className="font-medium tabular-nums">{formatEuro(expectedMonthly)}</span>
                          </>
                        ) : actualSpent > 0 ? (
                          <>
                            <span className="text-muted-foreground">Speso:</span>
                            <span className="font-medium tabular-nums text-red-500">{formatEuro(actualSpent)}</span>
                          </>
                        ) : null}
                      </div>
                    </div>
                    {hasSubcats && expectedMonthly > 0 && (
                      <div className="mt-1 h-1 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${pct > 100 ? "bg-red-500" : pct > 80 ? "bg-yellow-500" : ""}`}
                          style={{ width: `${pct}%`, backgroundColor: pct > 0 && pct <= 80 ? cat.color : undefined }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    {editMode && (
                      <button
                        onClick={() => toggleHide(cat.id)}
                        className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors"
                        title={isHidden ? "Mostra" : "Nascondi"}
                      >
                        {isHidden ? (
                          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </svg>
                        ) : (
                          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                    )}
                    <button
                      onClick={() => openPanel(cat.id)}
                      className={`p-1.5 rounded transition-colors ${isPanelOpen ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}
                      title="Gestisci sottocategorie"
                    >
                      <IconEdit />
                    </button>
                    {canExpand && (
                      <button
                        onClick={() => toggleCategory(cat.id)}
                        className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors text-xs w-7 text-center"
                      >
                        {isOpen ? "▲" : "▼"}
                      </button>
                    )}
                  </div>
                </div>

                {/* Subcategory management panel */}
                {isPanelOpen && (
                  <div className="border-t bg-muted/5 px-4 py-3 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Sottocategorie · {cat.name}
                      </p>
                      {!panelShowForm && (
                        <button
                          onClick={() => { setPanelShowForm(true); setPanelEditingId(null); setForm(EMPTY_FORM); }}
                          className="text-xs bg-primary text-primary-foreground rounded-md px-3 py-1 hover:bg-primary/90 transition-colors"
                        >
                          + Aggiungi
                        </button>
                      )}
                    </div>

                    {/* Existing subcategories list */}
                    {items.filter(it => it.category_id === cat.id).length === 0 && !panelShowForm && (
                      <p className="text-xs text-muted-foreground py-1">
                        Nessuna sottocategoria. Aggiungine una per tracciare e prevedere questa spesa.
                      </p>
                    )}
                    <div className="flex flex-col gap-1.5">
                      {items.filter(it => it.category_id === cat.id).map(it => (
                        <div key={it.id} className={`flex items-center gap-2 rounded-lg px-3 py-2 border ${panelEditingId === it.id ? "bg-primary/5 border-primary/30" : "bg-background"}`}>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{it.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {it.tipologia === "fissa" ? "🔒 fissa" : "📊 variabile"} · {freqLabel(it)}
                              {" · "}{formatEuro(it.amount)}{it.amount_max ? `–${formatEuro(it.amount_max)}` : ""}
                              {it.matching_strategy === "historical_avg" ? " · 📊 storico" : ""}
                            </p>
                            {it.match_keywords.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {it.match_keywords.slice(0, 4).map(kw => (
                                  <span key={kw} className="text-[10px] bg-violet-500/10 text-violet-600 dark:text-violet-400 px-1.5 py-0.5 rounded-full">{kw}</span>
                                ))}
                                {it.match_keywords.length > 4 && (
                                  <span className="text-[10px] text-muted-foreground">+{it.match_keywords.length - 4}</span>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => startEdit(it, cat.id)} className="p-1 text-muted-foreground hover:text-primary transition-colors" title="Modifica">
                              <IconEdit />
                            </button>
                            <button onClick={() => handleDelete(it.id)} disabled={deletingId === it.id} className="p-1 text-muted-foreground hover:text-red-500 transition-colors disabled:opacity-40" title="Rimuovi">
                              <IconTrash />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Add / Edit form */}
                    {panelShowForm && (
                      <form onSubmit={e => handleSave(e, cat.id)} className="flex flex-col gap-3 border rounded-lg p-3 bg-background mt-1">
                        <p className="text-xs font-semibold text-muted-foreground">
                          {panelEditingId ? "Modifica sottocategoria" : "Nuova sottocategoria"}
                        </p>

                        <input type="text" placeholder="Nome (es. Affitto, Netflix, Bolletta gas…)"
                          value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                          className="border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" autoFocus
                        />

                        <div className="flex gap-2">
                          {(["fissa", "variabile"] as Tipologia[]).map(t => (
                            <button key={t} type="button" onClick={() => setForm(f => ({ ...f, tipologia: t }))}
                              className={`flex-1 text-xs py-1.5 rounded-md border font-medium transition-colors ${form.tipologia === t ? (t === "fissa" ? "bg-blue-500 text-white border-blue-500" : "bg-orange-500 text-white border-orange-500") : "hover:bg-muted/50"}`}
                            >
                              {t === "fissa" ? "🔒 Fissa" : "📊 Variabile"}
                            </button>
                          ))}
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <select value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value as Frequency }))}
                            className="border rounded-md px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                          >
                            <option value="mensile">Mensile</option>
                            <option value="bimestrale">Ogni 2 mesi</option>
                            <option value="trimestrale">Ogni 3 mesi</option>
                            <option value="semestrale">Ogni 6 mesi</option>
                            <option value="annuale">Annuale</option>
                            <option value="personalizzata">Personalizzata</option>
                          </select>
                          <input type="text" inputMode="decimal" placeholder={form.tipologia === "variabile" ? "Min (€)" : "Importo (€)"}
                            value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                            className="border rounded-md px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                        </div>

                        {form.frequency === "personalizzata" && (
                          <input type="number" min={1} placeholder="Intervallo in giorni (es. 90 = 3 mesi)"
                            value={form.custom_days} onChange={e => setForm(f => ({ ...f, custom_days: e.target.value }))}
                            className="border rounded-md px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                        )}

                        {form.tipologia === "variabile" && (
                          <input type="text" inputMode="decimal" placeholder="Max (€)"
                            value={form.amount_max} onChange={e => setForm(f => ({ ...f, amount_max: e.target.value }))}
                            className="border rounded-md px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                        )}

                        <div className="flex gap-2">
                          <button type="button" onClick={() => setForm(f => ({ ...f, matching_strategy: "keyword" }))}
                            className={`flex-1 text-xs py-1.5 rounded-md border transition-colors ${form.matching_strategy === "keyword" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted/50"}`}
                          >💡 Importo fisso</button>
                          <button type="button" onClick={() => setForm(f => ({ ...f, matching_strategy: "historical_avg" }))}
                            className={`flex-1 text-xs py-1.5 rounded-md border transition-colors ${form.matching_strategy === "historical_avg" ? "bg-amber-500 text-white border-amber-500" : "hover:bg-muted/50"}`}
                          >📊 Media storica</button>
                        </div>
                        {form.matching_strategy === "historical_avg" && (
                          <p className="text-xs text-amber-600 dark:text-amber-400 -mt-1">
                            Usa la media dello stesso mese negli anni precedenti — ideale per luce/gas.
                          </p>
                        )}

                        {/* TX anchor search */}
                        <div className="relative">
                          <input type="text" placeholder="🔗 Cerca transazione per collegare keywords…"
                            value={form.txSearch} onChange={e => setForm(f => ({ ...f, txSearch: e.target.value }))}
                            className="border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary w-full"
                          />
                          {txSearchResults.length > 0 && (
                            <div className="absolute top-full left-0 right-0 z-10 bg-background border rounded-md shadow-lg mt-1 divide-y max-h-40 overflow-y-auto">
                              {txSearchResults.map((tx, i) => (
                                <button key={i} type="button" onClick={() => applyTxAnchor(tx)}
                                  className="w-full flex items-center justify-between px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors text-left"
                                >
                                  <span className="truncate text-foreground/80">{tx.description || tx.merchant || "—"}</span>
                                  <span className="shrink-0 ml-2 text-red-500 font-medium">{formatEuro(Math.abs(Number(tx.amount)))}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Keywords */}
                        <div
                          className="border rounded-md px-3 py-2 bg-background flex flex-wrap gap-1.5 items-center min-h-[38px] cursor-text focus-within:ring-2 focus-within:ring-primary"
                          onClick={() => keywordRef.current?.focus()}
                        >
                          {form.keywords.map(kw => (
                            <span key={kw} className="inline-flex items-center gap-1 bg-violet-500/10 text-violet-700 dark:text-violet-300 text-xs px-2 py-0.5 rounded-full font-medium">
                              {kw}
                              <button type="button" onClick={e => { e.stopPropagation(); removeKeyword(kw); }} className="hover:text-red-500 transition-colors">×</button>
                            </span>
                          ))}
                          <input ref={keywordRef} type="text"
                            placeholder={form.keywords.length === 0 ? "Parole chiave (es. netflix, affitto…)" : ""}
                            value={form.keywordInput}
                            onChange={e => setForm(f => ({ ...f, keywordInput: e.target.value }))}
                            onKeyDown={onKwKeyDown}
                            className="flex-1 min-w-[80px] bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
                          />
                          {form.keywordInput.trim() && (
                            <button type="button" onClick={addKeyword} className="text-xs bg-violet-500 text-white px-2 py-0.5 rounded-full hover:bg-violet-600">+</button>
                          )}
                        </div>

                        <input type="text" placeholder="Note (opzionale)"
                          value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                          className="border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                        />

                        <div className="flex gap-2 justify-end">
                          <button type="button" onClick={cancelForm} className="text-xs border rounded-md px-3 py-1.5 hover:bg-muted/50 transition-colors">Annulla</button>
                          <button type="submit" disabled={saving} className="text-xs bg-primary text-primary-foreground rounded-md px-4 py-1.5 hover:bg-primary/90 disabled:opacity-50 transition-colors font-medium">
                            {saving ? "Salvataggio…" : panelEditingId ? "Salva" : "Aggiungi"}
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                )}

                {/* Transactions accordion */}
                {isOpen && canExpand && (
                  <div className="border-t bg-muted/5 divide-y">

                    {/* Grouped by subcategory */}
                    {matchedSubcats.map(sd => (
                      <div key={sd.item.id} className="px-5 py-2.5">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs font-semibold truncate">{sd.item.name}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${sd.item.tipologia === "fissa" ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" : "bg-orange-500/10 text-orange-600 dark:text-orange-400"}`}>
                              {sd.item.tipologia}
                            </span>
                            {sd.item.matching_strategy === "historical_avg" && (
                              <span className="text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded-full">📊 storico</span>
                            )}
                          </div>
                          <div className="text-xs text-right shrink-0">
                            <span className="text-muted-foreground">prev. </span>
                            <span className="font-semibold tabular-nums">{formatEuro(sd.expectedMonthly)}</span>
                            <span className="mx-1 text-muted-foreground">→</span>
                            <span className={`font-bold tabular-nums ${sd.delta > 0 ? "text-red-500" : "text-green-600 dark:text-green-400"}`}>
                              {formatEuro(sd.actualSpent)}
                            </span>
                          </div>
                        </div>
                        {sd.forecastHint && (
                          <p className="text-xs text-amber-600 dark:text-amber-400 mb-1.5">{sd.forecastHint}</p>
                        )}
                        <div className="flex flex-col gap-0.5">
                          {sd.matchedTxs.map((tx, i) => (
                            <div key={i} className="flex items-center justify-between gap-2 pl-3 py-1 text-xs text-muted-foreground">
                              <span className="truncate">{tx.description || tx.merchant || "Transazione"}</span>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[10px] text-muted-foreground/60">
                                  {new Date(tx.date + "T00:00:00").toLocaleDateString("it-IT", { day: "2-digit", month: "short" })}
                                </span>
                                <span className="text-red-500 font-medium tabular-nums">{formatEuro(Math.abs(Number(tx.amount)))}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}

                    {/* Unmatched transactions */}
                    {unmatchedTxs.length > 0 && (
                      <div className="px-5 py-2.5">
                        {matchedSubcats.length > 0 && (
                          <p className="text-xs text-muted-foreground font-medium mb-1.5">Altre transazioni</p>
                        )}
                        <div className="flex flex-col gap-0.5">
                          {unmatchedTxs.map((tx, i) => (
                            <div key={i} className="flex items-center justify-between gap-2 pl-3 py-1 text-xs text-muted-foreground">
                              <span className="truncate">{tx.description || tx.merchant || "Transazione"}</span>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[10px] text-muted-foreground/60">
                                  {new Date(tx.date + "T00:00:00").toLocaleDateString("it-IT", { day: "2-digit", month: "short" })}
                                </span>
                                <span className="text-red-500 font-medium tabular-nums">{formatEuro(Math.abs(Number(tx.amount)))}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
