"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

type Category = { id: string; name: string; color: string; icon: string };

type Tipologia = "fissa" | "variabile";
type Frequency =
  | "mensile" | "bimestrale" | "trimestrale"
  | "semestrale" | "annuale" | "personalizzata";
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
  categories?: Category | null;
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

// ─── Costanti ─────────────────────────────────────────────────────────────────

const FREQ_MONTHS: Record<Exclude<Frequency, "personalizzata">, number> = {
  mensile: 1, bimestrale: 2, trimestrale: 3, semestrale: 6, annuale: 12,
};

// Template rapidi preimpostati
type Template = {
  id: string;
  emoji: string;
  label: string;
  tipologia: Tipologia;
  frequency: Frequency;
  matching_strategy: MatchingStrategy;
  keywords: string[];
  notes: string;
};

const TEMPLATES: Template[] = [
  {
    id: "luce_gas",
    emoji: "🔌",
    label: "Luce & Gas",
    tipologia: "variabile",
    frequency: "bimestrale",
    matching_strategy: "historical_avg",
    // Solo nomi provider specifici — evita falsi positivi con parole generiche come "gas" o "luce"
    // L'utente deve aggiungere il nome esatto del proprio provider (es. "enel energia", "eni gas luce")
    keywords: ["enel energia", "enel gas", "eni gas luce", "a2a energia", "hera energia", "hera gas", "iren energia", "iren gas", "italgas", "snam rete gas", "2i rete gas"],
    notes: "Previsione basata sulla media dello stesso mese negli anni precedenti. Personalizza le keyword con il nome esatto del tuo fornitore.",
  },
  {
    id: "affitto",
    emoji: "🏠",
    label: "Affitto",
    tipologia: "fissa",
    frequency: "mensile",
    matching_strategy: "keyword",
    keywords: ["affitto", "canone locazione", "locazione"],
    notes: "",
  },
  {
    id: "telefono",
    emoji: "📱",
    label: "Telefono",
    tipologia: "fissa",
    frequency: "mensile",
    matching_strategy: "keyword",
    keywords: ["vodafone", "tim", "wind", "iliad", "fastweb", "ho mobile", "very mobile"],
    notes: "",
  },
  {
    id: "internet",
    emoji: "🌐",
    label: "Internet / TV",
    tipologia: "fissa",
    frequency: "mensile",
    matching_strategy: "keyword",
    keywords: ["fibra", "adsl", "sky", "mediaset", "internet"],
    notes: "",
  },
  {
    id: "assicurazione",
    emoji: "🛡️",
    label: "Assicurazione",
    tipologia: "fissa",
    frequency: "annuale",
    matching_strategy: "keyword",
    keywords: ["assicurazione", "polizza", "rc auto", "generali", "allianz", "unipolsai"],
    notes: "",
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatEuro(n: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
}

function toMonthlyAmount(expense: RecurringExpense): number {
  const mid =
    expense.tipologia === "variabile" && expense.amount_max != null
      ? (expense.amount + expense.amount_max) / 2
      : expense.amount;
  if (expense.frequency === "personalizzata" && expense.custom_days)
    return mid * (30 / expense.custom_days);
  return mid / (FREQ_MONTHS[expense.frequency as Exclude<Frequency, "personalizzata">] ?? 1);
}

function freqShort(expense: RecurringExpense): string {
  if (expense.frequency === "personalizzata" && expense.custom_days) {
    if (expense.custom_days % 365 === 0) return `ogni ${expense.custom_days / 365}a`;
    if (expense.custom_days % 30  === 0) return `ogni ${expense.custom_days / 30}m`;
    if (expense.custom_days % 7   === 0) return `ogni ${expense.custom_days / 7}sett`;
    return `ogni ${expense.custom_days}gg`;
  }
  const map: Record<Frequency, string> = {
    mensile: "mensile", bimestrale: "2 mesi", trimestrale: "3 mesi",
    semestrale: "6 mesi", annuale: "annuale", personalizzata: "",
  };
  return map[expense.frequency];
}

function txMatchesKeywords(tx: Transaction, keywords: string[]): boolean {
  if (!keywords.length) return false;
  const d = (tx.description ?? "").toLowerCase();
  const m = (tx.merchant   ?? "").toLowerCase();
  return keywords.some(k => {
    const kk = k.toLowerCase().trim();
    return kk.length > 0 && (d.includes(kk) || m.includes(kk));
  });
}

/** Media dello stesso mese calendar negli anni precedenti (storico). */
function computeHistoricalAvg(
  allTxs: Transaction[],
  keywords: string[],
  calMonth: number,
  calYear: number,
): number {
  const byYear = new Map<number, number>();
  for (const t of allTxs) {
    if (Number(t.amount) >= 0) continue;
    const d = new Date(t.date + "T00:00:00");
    if (d.getFullYear() === calYear && d.getMonth() === calMonth) continue; // escludi mese corrente
    if (d.getMonth() !== calMonth) continue;
    if (!txMatchesKeywords(t, keywords)) continue;
    const yr = d.getFullYear();
    byYear.set(yr, (byYear.get(yr) ?? 0) + Math.abs(Number(t.amount)));
  }
  const totals = Array.from(byYear.values());
  if (!totals.length) return 0;
  return totals.reduce((a, b) => a + b, 0) / totals.length;
}

function computeActual(
  expense: RecurringExpense,
  transactions: Transaction[],
  monthStart: string,
): { total: number; matched: Transaction[] } | null {
  if (!expense.match_keywords.length && !expense.category_id) return null;
  const out = transactions.filter(t => Number(t.amount) < 0 && t.date >= monthStart);
  const matched = expense.match_keywords.length > 0
    ? out.filter(t => txMatchesKeywords(t, expense.match_keywords))
    : out.filter(t => t.category_id === expense.category_id);
  return { total: matched.reduce((s, t) => s + Math.abs(Number(t.amount)), 0), matched };
}

// ─── Form vuoto ───────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  name: "", tipologia: "fissa" as Tipologia, frequency: "mensile" as Frequency,
  custom_days: "", amount: "", amount_max: "", category_id: "", notes: "",
  matching_strategy: "keyword" as MatchingStrategy,
  keywordInput: "", keywords: [] as string[],
  txSearch: "", showTxSearch: false,
};

// ─── Componente principale ────────────────────────────────────────────────────

export function RecurringClient({ userId, categories, transactions }: Props) {
  const [items,      setItems]      = useState<RecurringExpense[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [showForm,   setShowForm]   = useState(false);
  const [editingId,  setEditingId]  = useState<string | null>(null); // null = add, id = edit
  const [form,       setForm]       = useState(EMPTY_FORM);
  const [saving,     setSaving]     = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(true);
  const [openCat,    setOpenCat]    = useState<string | null>(null); // accordion report
  const keywordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("recurring_expenses")
      .select("*, categories(id, name, color, icon)")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .then(({ data }) => { setItems((data ?? []) as RecurringExpense[]); setLoading(false); });
  }, [userId]);

  // ── Date correnti ─────────────────────────────────────────────────────────
  const now       = new Date();
  const calYear   = now.getFullYear();
  const calMonth  = now.getMonth();
  const monthStart = new Date(calYear, calMonth, 1).toISOString().split("T")[0];

  // ── Calcolo dettaglio per voce ────────────────────────────────────────────
  const detailed = items.map(it => {
    let expectedMonthly: number;
    if (it.matching_strategy === "historical_avg" && it.match_keywords.length > 0) {
      const hist = computeHistoricalAvg(transactions, it.match_keywords, calMonth, calYear);
      expectedMonthly = hist > 0 ? hist : toMonthlyAmount(it);
    } else {
      expectedMonthly = toMonthlyAmount(it);
    }
    const result     = computeActual(it, transactions, monthStart);
    const actual     = result?.total ?? null;
    const matchedTxs = result?.matched ?? [];
    const delta      = actual != null ? actual - expectedMonthly : null;
    const matchMode  = it.match_keywords.length > 0 ? "keyword" : it.category_id ? "categoria" : null;
    return { ...it, expectedMonthly, actual, matchedTxs, delta, matchMode };
  });

  // ── Gruppi per categoria (usati nel report) ───────────────────────────────
  type CatGroup = {
    key: string; label: string; icon: string; color: string;
    expectedTotal: number; actualTotal: number | null;
    items: typeof detailed;
  };
  const catMap = new Map<string, CatGroup>();
  for (const it of detailed) {
    const key   = it.category_id ?? "__none__";
    const label = it.categories?.name  ?? "Senza categoria";
    const icon  = it.categories?.icon  ?? "📦";
    const color = it.categories?.color ?? "#94a3b8";
    if (!catMap.has(key)) catMap.set(key, { key, label, icon, color, expectedTotal: 0, actualTotal: null, items: [] });
    const g = catMap.get(key)!;
    g.expectedTotal += it.expectedMonthly;
    if (it.actual != null) g.actualTotal = (g.actualTotal ?? 0) + it.actual;
    g.items.push(it);
  }
  const catGroups = Array.from(catMap.values()).sort((a, b) => b.expectedTotal - a.expectedTotal);

  // ── Totali report ─────────────────────────────────────────────────────────
  const totalMonthlyMin = items.reduce((s, it) => {
    const base = it.frequency === "personalizzata" && it.custom_days
      ? it.amount * (30 / it.custom_days)
      : it.amount / (FREQ_MONTHS[it.frequency as Exclude<Frequency,"personalizzata">] ?? 1);
    return s + base;
  }, 0);
  const totalMonthlyMax = items.reduce((s, it) => {
    const b = it.tipologia === "variabile" && it.amount_max != null ? it.amount_max : it.amount;
    const m = it.frequency === "personalizzata" && it.custom_days
      ? b * (30 / it.custom_days)
      : b / (FREQ_MONTHS[it.frequency as Exclude<Frequency,"personalizzata">] ?? 1);
    return s + m;
  }, 0);
  const totalMonthlyMid = (totalMonthlyMin + totalMonthlyMax) / 2;

  const trackedExpected = detailed.reduce((s, it) => s + (it.actual != null ? it.expectedMonthly : 0), 0);
  const trackedActual   = detailed.reduce((s, it) => s + (it.actual ?? 0), 0);
  const totalDelta      = trackedActual - trackedExpected;
  const potentialSaving = Math.max(0, trackedExpected - trackedActual);

  const actualMonthTotal = transactions
    .filter(t => Number(t.amount) < 0 && t.date >= monthStart)
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);

  // ── Ricerca transazione anchor ────────────────────────────────────────────
  const txSearchResults = form.txSearch.trim().length >= 2
    ? transactions
        .filter(t => {
          const q = form.txSearch.toLowerCase();
          return (
            (t.description?.toLowerCase().includes(q) || t.merchant?.toLowerCase().includes(q)) &&
            Number(t.amount) < 0
          );
        })
        .slice(0, 8)
    : [];

  function applyTxAnchor(tx: Transaction) {
    const candidates = [tx.description, tx.merchant].filter(Boolean) as string[];
    const newKw = candidates
      .map(s => s.trim().toLowerCase())
      .filter(s => s && !form.keywords.map(k => k.toLowerCase()).includes(s));
    setForm(f => ({
      ...f,
      keywords: [...f.keywords, ...newKw],
      txSearch: "",
      showTxSearch: false,
    }));
  }

  // ── Gestione keywords ─────────────────────────────────────────────────────
  function addKeyword() {
    const kw = form.keywordInput.trim();
    if (!kw) return;
    if (form.keywords.map(k => k.toLowerCase()).includes(kw.toLowerCase())) {
      toast.error("Keyword già presente.");
      return;
    }
    setForm(f => ({ ...f, keywords: [...f.keywords, kw], keywordInput: "" }));
    keywordRef.current?.focus();
  }
  function removeKeyword(kw: string) {
    setForm(f => ({ ...f, keywords: f.keywords.filter(k => k !== kw) }));
  }
  function onKwKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") { e.preventDefault(); addKeyword(); }
    if (e.key === "Backspace" && !form.keywordInput && form.keywords.length)
      setForm(f => ({ ...f, keywords: f.keywords.slice(0, -1) }));
  }

  // ── Applica template ──────────────────────────────────────────────────────
  function applyTemplate(tpl: Template) {
    setForm(f => ({
      ...f,
      name:               f.name || tpl.label,
      tipologia:          tpl.tipologia,
      frequency:          tpl.frequency,
      matching_strategy:  tpl.matching_strategy,
      keywords:           tpl.keywords,
      notes:              tpl.notes,
      keywordInput:       "",
    }));
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────

  function startEdit(it: RecurringExpense) {
    setForm({
      name:               it.name,
      tipologia:          it.tipologia,
      frequency:          it.frequency,
      custom_days:        it.custom_days?.toString() ?? "",
      amount:             it.amount.toString().replace(".", ","),
      amount_max:         it.amount_max?.toString().replace(".", ",") ?? "",
      category_id:        it.category_id ?? "",
      notes:              it.notes ?? "",
      matching_strategy:  it.matching_strategy,
      keywordInput:       "",
      keywords:           [...it.match_keywords],
      txSearch:           "",
      showTxSearch:       false,
    });
    setEditingId(it.id);
    setShowForm(true);
    setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 50);
  }

  function cancelForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const amt     = parseFloat(form.amount.replace(",", "."));
    const amtMax  = form.tipologia === "variabile" && form.amount_max
      ? parseFloat(form.amount_max.replace(",", ".")) : null;
    const custDays = form.frequency === "personalizzata" ? parseInt(form.custom_days) : null;

    if (!form.name.trim() || isNaN(amt) || amt <= 0) { toast.error("Inserisci nome e importo."); return; }
    if (form.tipologia === "variabile" && amtMax != null && amtMax < amt) { toast.error("Il massimo deve essere ≥ del minimo."); return; }
    if (form.frequency === "personalizzata" && (!custDays || custDays <= 0)) { toast.error("Inserisci un intervallo valido (giorni > 0)."); return; }

    setSaving(true);
    const supabase = createClient();
    const payload = {
      name: form.name.trim(), tipologia: form.tipologia,
      frequency: form.frequency, custom_days: custDays,
      amount: amt, amount_max: amtMax,
      category_id: form.category_id || null, notes: form.notes.trim() || null,
      match_keywords: form.keywords, matching_strategy: form.matching_strategy,
    };

    if (editingId) {
      // UPDATE
      const { data, error } = await supabase
        .from("recurring_expenses")
        .update(payload)
        .eq("id", editingId)
        .select("*, categories(id, name, color, icon)")
        .single();
      if (error) { toast.error("Errore nel salvataggio."); }
      else {
        setItems(prev => prev.map(it => it.id === editingId ? data as RecurringExpense : it));
        cancelForm();
        toast.success("Voce aggiornata!");
      }
    } else {
      // INSERT
      const { data, error } = await supabase
        .from("recurring_expenses")
        .insert({ user_id: userId, ...payload })
        .select("*, categories(id, name, color, icon)")
        .single();
      if (error) { toast.error("Errore nel salvataggio."); }
      else {
        setItems(prev => [...prev, data as RecurringExpense]);
        cancelForm();
        toast.success("Spesa ricorrente aggiunta!");
      }
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    const supabase = createClient();
    const { error } = await supabase.from("recurring_expenses").delete().eq("id", id);
    if (error) { toast.error("Errore nella cancellazione."); }
    else { setItems(prev => prev.filter(it => it.id !== id)); toast.success("Voce rimossa."); }
    setDeletingId(null);
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6">

      {/* ── Report in tempo reale ── */}
      {items.length > 0 && (
        <div className="rounded-xl border overflow-hidden">
          <button
            onClick={() => setReportOpen(v => !v)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors"
          >
            <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
              Report mese corrente
            </h2>
            <span className="text-muted-foreground text-xs">{reportOpen ? "▲" : "▼"}</span>
          </button>

          {reportOpen && (
            <div className="border-t">
              {/* Numeri top */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 px-5 py-4 bg-muted/10 border-b">
                <div>
                  <p className="text-xs text-muted-foreground">Previsto/mese</p>
                  <p className="text-xl font-bold tabular-nums">
                    {totalMonthlyMin === totalMonthlyMax
                      ? formatEuro(totalMonthlyMin)
                      : `${formatEuro(totalMonthlyMin)}–${formatEuro(totalMonthlyMax)}`}
                  </p>
                  <p className="text-xs text-muted-foreground">media {formatEuro(totalMonthlyMid)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Speso questo mese</p>
                  <p className="text-xl font-bold tabular-nums text-red-500">{formatEuro(actualMonthTotal)}</p>
                  <p className="text-xs text-muted-foreground">tutte le uscite</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{totalDelta >= 0 ? "Sforamento" : "Risparmio"}</p>
                  <p className={`text-xl font-bold tabular-nums ${totalDelta >= 0 ? "text-red-500" : "text-green-600 dark:text-green-400"}`}>
                    {totalDelta >= 0 ? "+" : ""}{formatEuro(totalDelta)}
                  </p>
                  <p className="text-xs text-muted-foreground">voci tracciate</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Risparmio potenziale</p>
                  <p className="text-xl font-bold tabular-nums text-green-600 dark:text-green-400">{formatEuro(potentialSaving)}</p>
                  <p className="text-xs text-muted-foreground">se resti nel budget</p>
                </div>
              </div>

              {/* Barra globale */}
              {trackedExpected > 0 && (
                <div className="px-5 py-3 border-b">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                    <span>Speso vs Previsto (voci tracciate)</span>
                    <span>{Math.round((trackedActual / trackedExpected) * 100)}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${trackedActual / trackedExpected > 1 ? "bg-red-500" : trackedActual / trackedExpected > 0.8 ? "bg-yellow-500" : "bg-green-500"}`}
                      style={{ width: `${Math.min(100, (trackedActual / trackedExpected) * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Accordion per categoria */}
              <div className="divide-y">
                {catGroups.map(g => {
                  const isOpen  = openCat === g.key;
                  const gDelta  = g.actualTotal != null ? g.actualTotal - g.expectedTotal : null;
                  const pct     = g.expectedTotal > 0 ? Math.min(100, ((g.actualTotal ?? 0) / g.expectedTotal) * 100) : 0;

                  return (
                    <div key={g.key}>
                      {/* Header categoria — sempre visibile */}
                      <button
                        onClick={() => setOpenCat(isOpen ? null : g.key)}
                        className="w-full flex items-center gap-3 px-5 py-3 hover:bg-muted/20 transition-colors text-left"
                      >
                        <span className="text-base shrink-0">{g.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium">{g.label}</span>
                            <div className="flex items-center gap-2 shrink-0">
                              {gDelta != null && (
                                <span className={`text-xs font-semibold tabular-nums ${gDelta > 0 ? "text-red-500" : gDelta < 0 ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                                  {gDelta > 0 ? "+" : ""}{formatEuro(gDelta)}
                                </span>
                              )}
                              <span className="text-sm font-bold tabular-nums">{formatEuro(g.expectedTotal)}</span>
                              <span className="text-muted-foreground text-xs w-4">{isOpen ? "▲" : "▼"}</span>
                            </div>
                          </div>
                          <div className="mt-1 h-1 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${pct > 100 ? "bg-red-500" : pct > 80 ? "bg-yellow-500" : ""}`}
                              style={{ width: `${pct}%`, backgroundColor: pct > 0 && pct <= 80 ? g.color : undefined }}
                            />
                          </div>
                        </div>
                      </button>

                      {/* Voci della categoria (espanso) */}
                      {isOpen && (
                        <div className="bg-muted/10 border-t divide-y">
                          {g.items.map(it => (
                            <div key={it.id} className="flex items-center justify-between px-7 py-2.5 gap-3">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{it.name}</p>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <span className="text-xs text-muted-foreground">{freqShort(it)}</span>
                                  {it.matching_strategy === "historical_avg" && (
                                    <span className="text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded-full">📊 storico</span>
                                  )}
                                  {it.match_keywords.length > 0 && (
                                    <span className="text-[10px] bg-violet-500/10 text-violet-600 dark:text-violet-400 px-1.5 py-0.5 rounded-full">🔍 kw</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-3 shrink-0 text-right text-xs">
                                <div>
                                  <p className="text-muted-foreground">previsto</p>
                                  <p className="font-semibold tabular-nums">{formatEuro(it.expectedMonthly)}</p>
                                </div>
                                {it.actual != null && (
                                  <>
                                    <div>
                                      <p className="text-muted-foreground">speso</p>
                                      <p className="font-semibold tabular-nums text-red-500">{formatEuro(it.actual)}</p>
                                    </div>
                                    <div>
                                      <p className="text-muted-foreground">delta</p>
                                      <p className={`font-bold tabular-nums ${it.delta! > 0 ? "text-red-500" : it.delta! < 0 ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                                        {it.delta! > 0 ? "+" : ""}{formatEuro(it.delta!)}
                                      </p>
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {items.some(it => !it.category_id && !it.match_keywords.length) && (
                <p className="px-5 py-3 text-xs text-muted-foreground bg-muted/10 border-t">
                  ℹ️ Alcune voci senza keyword né categoria non sono tracciate automaticamente.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Lista voci ── */}
      <div className="rounded-xl border flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold">
            {showForm ? (editingId ? "Modifica voce" : "Nuova voce") : "Spese ricorrenti"}
          </h2>
          <button
            onClick={() => showForm ? cancelForm() : setShowForm(true)}
            className="text-sm bg-primary text-primary-foreground rounded-md px-4 py-2 hover:bg-primary/90 transition-colors"
          >
            {showForm ? "Annulla" : "+ Aggiungi"}
          </button>
        </div>

        {/* ── Form ── */}
        {showForm && (
          <form onSubmit={handleSave} className="border-b px-5 py-5 flex flex-col gap-5 bg-muted/20">

            {/* Template rapidi */}
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground">Modelli rapidi</p>
              <div className="flex flex-wrap gap-2">
                {TEMPLATES.map(tpl => (
                  <button key={tpl.id} type="button"
                    onClick={() => applyTemplate(tpl)}
                    className="text-xs border rounded-full px-3 py-1 hover:bg-muted/50 transition-colors"
                  >
                    {tpl.emoji} {tpl.label}
                  </button>
                ))}
              </div>
            </div>

            <hr className="border-muted" />

            {/* Nome + Tipologia */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">Nome <span className="text-red-500">*</span></label>
                <input type="text" placeholder="es. Affitto, Netflix, Bolletta gas…"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  autoFocus
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">Tipologia</label>
                <div className="flex gap-2">
                  {(["fissa", "variabile"] as Tipologia[]).map(t => (
                    <button key={t} type="button"
                      onClick={() => setForm(f => ({ ...f, tipologia: t }))}
                      className={`flex-1 text-sm py-2 rounded-md border transition-colors font-medium ${
                        form.tipologia === t
                          ? t === "fissa" ? "bg-blue-500 text-white border-blue-500" : "bg-orange-500 text-white border-orange-500"
                          : "hover:bg-muted/50"}`}
                    >
                      {t === "fissa" ? "🔒 Fissa" : "📊 Variabile"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Frequenza */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">Frequenza</label>
                <select value={form.frequency}
                  onChange={e => setForm(f => ({ ...f, frequency: e.target.value as Frequency }))}
                  className="border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="mensile">Mensile</option>
                  <option value="bimestrale">Ogni 2 mesi</option>
                  <option value="trimestrale">Ogni 3 mesi</option>
                  <option value="semestrale">Ogni 6 mesi</option>
                  <option value="annuale">Annuale</option>
                  <option value="personalizzata">Personalizzata…</option>
                </select>
              </div>
              {form.frequency === "personalizzata" && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Intervallo (giorni) <span className="text-red-500">*</span></label>
                  <input type="number" min={1} placeholder="es. 90"
                    value={form.custom_days}
                    onChange={e => setForm(f => ({ ...f, custom_days: e.target.value }))}
                    className="border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <p className="text-xs text-muted-foreground">14 = bisettimanale · 90 = 3 mesi · 730 = 2 anni</p>
                </div>
              )}
            </div>

            {/* Importo + Strategia previsione */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  {form.tipologia === "variabile" ? "Importo minimo (€)" : "Importo (€)"}
                  <span className="text-red-500"> *</span>
                </label>
                <input type="text" inputMode="decimal" placeholder="0,00"
                  value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  className="border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              {form.tipologia === "variabile" && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Importo massimo (€)</label>
                  <input type="text" inputMode="decimal" placeholder="0,00"
                    value={form.amount_max}
                    onChange={e => setForm(f => ({ ...f, amount_max: e.target.value }))}
                    className="border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              )}
            </div>

            {/* Strategia di previsione */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Strategia previsione</label>
              <div className="flex gap-2">
                <button type="button"
                  onClick={() => setForm(f => ({ ...f, matching_strategy: "keyword" }))}
                  className={`flex-1 text-xs py-2 rounded-md border transition-colors ${form.matching_strategy === "keyword" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted/50"}`}
                >
                  💡 Importo manuale
                </button>
                <button type="button"
                  onClick={() => setForm(f => ({ ...f, matching_strategy: "historical_avg" }))}
                  className={`flex-1 text-xs py-2 rounded-md border transition-colors ${form.matching_strategy === "historical_avg" ? "bg-amber-500 text-white border-amber-500" : "hover:bg-muted/50"}`}
                >
                  📊 Media storica
                </button>
              </div>
              {form.matching_strategy === "historical_avg" && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  La previsione userà la media delle spese dello stesso mese negli anni precedenti (ideale per luce/gas con variabilità stagionale).
                </p>
              )}
            </div>

            {/* Ricerca transazione anchor */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">🔗 Collega a una transazione</label>
                <button type="button"
                  onClick={() => setForm(f => ({ ...f, showTxSearch: !f.showTxSearch, txSearch: "" }))}
                  className="text-xs text-primary hover:underline"
                >
                  {form.showTxSearch ? "Nascondi" : "Cerca transazione"}
                </button>
              </div>
              {form.showTxSearch && (
                <div className="relative">
                  <input type="text" placeholder="Cerca per descrizione o merchant…"
                    value={form.txSearch}
                    onChange={e => setForm(f => ({ ...f, txSearch: e.target.value }))}
                    className="border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary w-full"
                  />
                  {txSearchResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 z-10 bg-background border rounded-md shadow-lg mt-1 divide-y max-h-48 overflow-y-auto">
                      {txSearchResults.map((tx, i) => (
                        <button key={i} type="button"
                          onClick={() => applyTxAnchor(tx)}
                          className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-muted/50 transition-colors text-left"
                        >
                          <span className="truncate text-foreground/80">{tx.description || tx.merchant || "—"}</span>
                          <span className="shrink-0 ml-2 text-red-500 font-medium tabular-nums">
                            {formatEuro(Math.abs(Number(tx.amount)))}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    Clicca su una transazione per usarne la descrizione come keyword automatica.
                  </p>
                </div>
              )}
            </div>

            {/* Keyword chips */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                🔍 Parole chiave per riconoscimento automatico
              </label>
              <div
                className="border rounded-md px-3 py-2 bg-background flex flex-wrap gap-1.5 items-center min-h-[42px] cursor-text focus-within:ring-2 focus-within:ring-primary"
                onClick={() => keywordRef.current?.focus()}
              >
                {form.keywords.map(kw => (
                  <span key={kw}
                    className="inline-flex items-center gap-1 bg-violet-500/10 text-violet-700 dark:text-violet-300 text-xs px-2 py-0.5 rounded-full font-medium"
                  >
                    {kw}
                    <button type="button"
                      onClick={e => { e.stopPropagation(); removeKeyword(kw); }}
                      className="hover:text-red-500 transition-colors"
                    >×</button>
                  </span>
                ))}
                <input ref={keywordRef} type="text"
                  placeholder={form.keywords.length === 0 ? "es. enel gas, netflix…" : ""}
                  value={form.keywordInput}
                  onChange={e => setForm(f => ({ ...f, keywordInput: e.target.value }))}
                  onKeyDown={onKwKeyDown}
                  className="flex-1 min-w-[100px] bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
                />
                {form.keywordInput.trim() && (
                  <button type="button" onClick={addKeyword}
                    className="text-xs bg-violet-500 text-white px-2 py-0.5 rounded-full hover:bg-violet-600 transition-colors"
                  >+</button>
                )}
              </div>
            </div>

            {/* Categoria + Note */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Categoria <span className="text-muted-foreground/50 font-normal">(fallback se nessuna keyword)</span>
                </label>
                <select value={form.category_id}
                  onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
                  className="border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">— Nessuna —</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">Note (opzionale)</label>
                <input type="text" placeholder="es. Scade a luglio…"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={cancelForm}
                className="text-sm border rounded-md px-4 py-2 hover:bg-muted/50 transition-colors"
              >Annulla</button>
              <button type="submit" disabled={saving}
                className="text-sm bg-primary text-primary-foreground rounded-md px-5 py-2 hover:bg-primary/90 disabled:opacity-50 transition-colors font-medium"
              >{saving ? "Salvataggio…" : editingId ? "Salva modifiche" : "Aggiungi spesa"}</button>
            </div>
          </form>
        )}

        {/* ── Lista ── */}
        {loading ? (
          <div className="px-5 py-8 text-sm text-muted-foreground text-center animate-pulse">Caricamento…</div>
        ) : items.length === 0 ? (
          <div className="px-5 py-12 flex flex-col items-center gap-3 text-center">
            <span className="text-4xl">🔁</span>
            <p className="text-sm text-muted-foreground max-w-xs">
              Nessuna spesa ricorrente. Aggiungi affitto, abbonamenti, bollette per confrontarli con la spesa reale.
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {items.map(it => {
              const monthly  = toMonthlyAmount(it);
              const hasRange = it.tipologia === "variabile" && it.amount_max != null;
              return (
                <div key={it.id} className="flex items-center px-5 py-3 hover:bg-muted/30 transition-colors gap-3">
                  <span className="text-xl shrink-0">{it.categories?.icon ?? "📦"}</span>
                  {/* Info — occupa tutto lo spazio disponibile, senza andare a capo */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{it.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {it.categories?.name ?? "Senza cat."} · {freqShort(it)}
                      {" · "}
                      <span className={it.tipologia === "fissa" ? "text-blue-500" : "text-orange-500"}>
                        {it.tipologia}
                      </span>
                      {it.matching_strategy === "historical_avg" && " · 📊 storico"}
                    </p>
                    {it.match_keywords.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {it.match_keywords.slice(0, 3).map(kw => (
                          <span key={kw} className="text-[10px] bg-violet-500/10 text-violet-600 dark:text-violet-400 px-1.5 py-0.5 rounded-full">
                            {kw}
                          </span>
                        ))}
                        {it.match_keywords.length > 3 && (
                          <span className="text-[10px] text-muted-foreground">+{it.match_keywords.length - 3}</span>
                        )}
                      </div>
                    )}
                  </div>
                  {/* Importo + delete */}
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums whitespace-nowrap">
                        {hasRange ? `${formatEuro(it.amount)}–${formatEuro(it.amount_max!)}` : formatEuro(it.amount)}
                      </p>
                      <p className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                        {formatEuro(monthly)}/mese
                      </p>
                    </div>
                    {/* Modifica */}
                    <button onClick={() => startEdit(it)}
                      className="text-muted-foreground hover:text-primary transition-colors p-1 shrink-0"
                      title="Modifica"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                    {/* Elimina */}
                    <button onClick={() => handleDelete(it.id)} disabled={deletingId === it.id}
                      className="text-muted-foreground hover:text-red-500 transition-colors disabled:opacity-40 p-1 shrink-0"
                      title="Rimuovi"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6M14 11v6" />
                        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Footer stima risparmio ── */}
      {items.length > 0 && (
        <div className="rounded-xl border p-5 bg-muted/10">
          <h3 className="font-semibold text-sm mb-3">Stima risparmio potenziale</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Budget ricorrenti/mese</p>
              <p className="text-xl font-bold tabular-nums">
                {totalMonthlyMin === totalMonthlyMax
                  ? formatEuro(totalMonthlyMin)
                  : `${formatEuro(totalMonthlyMin)}–${formatEuro(totalMonthlyMax)}`}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Speso questo mese</p>
              <p className="text-xl font-bold tabular-nums text-red-500">{formatEuro(actualMonthTotal)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                {actualMonthTotal <= totalMonthlyMid ? "Sei nel budget 🎉" : "Stai sforando ⚠️"}
              </p>
              <p className={`text-xl font-bold tabular-nums ${actualMonthTotal <= totalMonthlyMid ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
                {formatEuro(Math.abs(actualMonthTotal - totalMonthlyMid))}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
