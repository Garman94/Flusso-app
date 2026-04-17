"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

type Category = { id: string; name: string; color: string; icon: string };

type Tipologia = "fissa" | "variabile";
type Frequency =
  | "mensile"
  | "bimestrale"
  | "trimestrale"
  | "semestrale"
  | "annuale"
  | "personalizzata";

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

const FREQ_LABELS: Record<Frequency, string> = {
  mensile:       "Mensile",
  bimestrale:    "Ogni 2 mesi",
  trimestrale:   "Ogni 3 mesi",
  semestrale:    "Ogni 6 mesi",
  annuale:       "Annuale",
  personalizzata:"Personalizzata",
};

const FREQ_MONTHS: Record<Exclude<Frequency, "personalizzata">, number> = {
  mensile:    1,
  bimestrale: 2,
  trimestrale:3,
  semestrale: 6,
  annuale:    12,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatEuro(n: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
}

/** Converte l'importo di una spesa ricorrente in equivalente mensile (usa mid se variabile) */
function toMonthlyAmount(expense: RecurringExpense): number {
  const mid =
    expense.tipologia === "variabile" && expense.amount_max != null
      ? (expense.amount + expense.amount_max) / 2
      : expense.amount;
  if (expense.frequency === "personalizzata" && expense.custom_days) {
    return mid * (30 / expense.custom_days);
  }
  return mid / (FREQ_MONTHS[expense.frequency as Exclude<Frequency, "personalizzata">] ?? 1);
}

/** Etichetta frequenza leggibile */
function freqLabel(expense: RecurringExpense): string {
  if (expense.frequency === "personalizzata" && expense.custom_days) {
    if (expense.custom_days % 365 === 0)
      return `Ogni ${expense.custom_days / 365} ann${expense.custom_days / 365 === 1 ? "o" : "i"}`;
    if (expense.custom_days % 30 === 0)
      return `Ogni ${expense.custom_days / 30} mes${expense.custom_days / 30 === 1 ? "e" : "i"}`;
    if (expense.custom_days % 7 === 0)
      return `Ogni ${expense.custom_days / 7} settiman${expense.custom_days / 7 === 1 ? "a" : "e"}`;
    return `Ogni ${expense.custom_days} giorni`;
  }
  return FREQ_LABELS[expense.frequency];
}

/**
 * Verifica se una transazione matcha almeno una keyword (case-insensitive, contains).
 * Cerca nei campi description e merchant.
 */
function txMatchesKeywords(tx: Transaction, keywords: string[]): boolean {
  if (keywords.length === 0) return false;
  const desc     = (tx.description ?? "").toLowerCase();
  const merchant = (tx.merchant   ?? "").toLowerCase();
  return keywords.some(kw => {
    const k = kw.toLowerCase().trim();
    return k.length > 0 && (desc.includes(k) || merchant.includes(k));
  });
}

/**
 * Calcola la spesa reale del mese corrente per una voce ricorrente.
 * Priorità: keyword matching > category matching.
 * Restituisce { total, matchedTxs } oppure null se nessun criterio è configurato.
 */
function computeActual(
  expense: RecurringExpense,
  transactions: Transaction[],
  monthStart: string,
): { total: number; matchedTxs: Transaction[] } | null {
  const hasKeywords = expense.match_keywords.length > 0;
  const hasCategory = !!expense.category_id;

  if (!hasKeywords && !hasCategory) return null;

  const monthlyTxs = transactions.filter(t => Number(t.amount) < 0 && t.date >= monthStart);

  let matched: Transaction[];
  if (hasKeywords) {
    matched = monthlyTxs.filter(t => txMatchesKeywords(t, expense.match_keywords));
  } else {
    matched = monthlyTxs.filter(t => t.category_id === expense.category_id);
  }

  return {
    total: matched.reduce((s, t) => s + Math.abs(Number(t.amount)), 0),
    matchedTxs: matched,
  };
}

// ─── Form vuoto ───────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  name:        "",
  tipologia:   "fissa" as Tipologia,
  frequency:   "mensile" as Frequency,
  custom_days: "",
  amount:      "",
  amount_max:  "",
  category_id: "",
  notes:       "",
  keywordInput:"",
  keywords:    [] as string[],
};

// ─── Componente principale ────────────────────────────────────────────────────

export function RecurringClient({ userId, categories, transactions }: Props) {
  const [items,     setItems]     = useState<RecurringExpense[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [showForm,  setShowForm]  = useState(false);
  const [form,      setForm]      = useState(EMPTY_FORM);
  const [saving,    setSaving]    = useState(false);
  const [deletingId,setDeletingId]= useState<string | null>(null);
  const [reportOpen,setReportOpen]= useState(true);
  // Dettaglio transazioni matched per voce (expand/collapse)
  const [expandedId,setExpandedId]= useState<string | null>(null);

  const keywordInputRef = useRef<HTMLInputElement>(null);

  // ── Caricamento dati ──────────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("recurring_expenses")
      .select("*, categories(id, name, color, icon)")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        setItems((data ?? []) as RecurringExpense[]);
        setLoading(false);
      });
  }, [userId]);

  // ── Calcolo mese corrente ─────────────────────────────────────────────────
  const now        = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];

  // ── Calcoli report ────────────────────────────────────────────────────────
  const totalMonthlyMin = items.reduce((s, it) => {
    const base = it.frequency === "personalizzata" && it.custom_days
      ? it.amount * (30 / it.custom_days)
      : it.amount / (FREQ_MONTHS[it.frequency as Exclude<Frequency,"personalizzata">] ?? 1);
    return s + base;
  }, 0);

  const totalMonthlyMax = items.reduce((s, it) => {
    const base2 = it.tipologia === "variabile" && it.amount_max != null ? it.amount_max : it.amount;
    const monthly = it.frequency === "personalizzata" && it.custom_days
      ? base2 * (30 / it.custom_days)
      : base2 / (FREQ_MONTHS[it.frequency as Exclude<Frequency,"personalizzata">] ?? 1);
    return s + monthly;
  }, 0);

  const totalMonthlyMid = (totalMonthlyMin + totalMonthlyMax) / 2;

  // Spesa reale totale mese corrente (tutte le uscite)
  const actualMonthTotal = transactions
    .filter(t => Number(t.amount) < 0 && t.date >= monthStart)
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);

  // Dettaglio per voce ricorrente
  const itemDetails = items.map(it => {
    const expectedMonthly = toMonthlyAmount(it);
    const result          = computeActual(it, transactions, monthStart);
    const actual          = result?.total ?? null;
    const matchedTxs      = result?.matchedTxs ?? [];
    const delta           = actual != null ? actual - expectedMonthly : null;
    const matchMode       = it.match_keywords.length > 0 ? "keyword" : it.category_id ? "categoria" : null;
    return { ...it, expectedMonthly, actual, matchedTxs, delta, matchMode };
  });

  const trackedActual   = itemDetails.reduce((s, it) => s + (it.actual ?? 0), 0);
  const trackedExpected = itemDetails.reduce((s, it) => s + (it.actual != null ? it.expectedMonthly : 0), 0);
  const totalDelta      = trackedActual - trackedExpected;
  const potentialSaving = Math.max(0, trackedExpected - trackedActual);

  // ── Gestione keywords nel form ────────────────────────────────────────────
  function addKeyword() {
    const kw = form.keywordInput.trim();
    if (!kw) return;
    if (form.keywords.map(k => k.toLowerCase()).includes(kw.toLowerCase())) {
      toast.error("Keyword già presente.");
      return;
    }
    setForm(f => ({ ...f, keywords: [...f.keywords, kw], keywordInput: "" }));
    keywordInputRef.current?.focus();
  }

  function removeKeyword(kw: string) {
    setForm(f => ({ ...f, keywords: f.keywords.filter(k => k !== kw) }));
  }

  function handleKeywordKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") { e.preventDefault(); addKeyword(); }
    if (e.key === "Backspace" && form.keywordInput === "" && form.keywords.length > 0) {
      setForm(f => ({ ...f, keywords: f.keywords.slice(0, -1) }));
    }
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────
  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const amt    = parseFloat(form.amount.replace(",", "."));
    const amtMax = form.tipologia === "variabile" && form.amount_max
      ? parseFloat(form.amount_max.replace(",", "."))
      : null;
    const customDays = form.frequency === "personalizzata" ? parseInt(form.custom_days) : null;

    if (!form.name.trim() || isNaN(amt) || amt <= 0) {
      toast.error("Inserisci nome e importo valido.");
      return;
    }
    if (form.tipologia === "variabile" && amtMax != null && amtMax < amt) {
      toast.error("Il massimo deve essere ≥ del minimo.");
      return;
    }
    if (form.frequency === "personalizzata" && (!customDays || customDays <= 0)) {
      toast.error("Inserisci un intervallo personalizzato valido (giorni > 0).");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("recurring_expenses")
      .insert({
        user_id:        userId,
        name:           form.name.trim(),
        tipologia:      form.tipologia,
        frequency:      form.frequency,
        custom_days:    customDays,
        amount:         amt,
        amount_max:     amtMax,
        category_id:    form.category_id || null,
        notes:          form.notes.trim() || null,
        match_keywords: form.keywords,
      })
      .select("*, categories(id, name, color, icon)")
      .single();

    if (error) {
      toast.error("Errore nel salvataggio.");
    } else {
      setItems(prev => [...prev, data as RecurringExpense]);
      setForm(EMPTY_FORM);
      setShowForm(false);
      toast.success("Spesa ricorrente aggiunta!");
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    const supabase = createClient();
    const { error } = await supabase.from("recurring_expenses").delete().eq("id", id);
    if (error) {
      toast.error("Errore nella cancellazione.");
    } else {
      setItems(prev => prev.filter(it => it.id !== id));
      toast.success("Voce rimossa.");
    }
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
            <span className="text-muted-foreground text-xs">
              {reportOpen ? "▲ Comprimi" : "▼ Espandi"}
            </span>
          </button>

          {reportOpen && (
            <div className="border-t flex flex-col">

              {/* Riepilogo numerico */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 px-5 py-4 bg-muted/10">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">Previsto mensile</span>
                  <span className="text-xl font-bold tabular-nums">
                    {totalMonthlyMin === totalMonthlyMax
                      ? formatEuro(totalMonthlyMin)
                      : `${formatEuro(totalMonthlyMin)} – ${formatEuro(totalMonthlyMax)}`}
                  </span>
                  <span className="text-xs text-muted-foreground">media {formatEuro(totalMonthlyMid)}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">Speso questo mese</span>
                  <span className="text-xl font-bold tabular-nums text-red-500">
                    {formatEuro(actualMonthTotal)}
                  </span>
                  <span className="text-xs text-muted-foreground">tutte le uscite</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">
                    {totalDelta >= 0 ? "Sforamento" : "Risparmio reale"}
                  </span>
                  <span className={`text-xl font-bold tabular-nums ${totalDelta >= 0 ? "text-red-500" : "text-green-600 dark:text-green-400"}`}>
                    {totalDelta >= 0 ? "+" : ""}{formatEuro(totalDelta)}
                  </span>
                  <span className="text-xs text-muted-foreground">voci tracciate</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">Risparmio potenziale</span>
                  <span className="text-xl font-bold tabular-nums text-green-600 dark:text-green-400">
                    {formatEuro(potentialSaving)}
                  </span>
                  <span className="text-xs text-muted-foreground">se resti nel budget</span>
                </div>
              </div>

              {/* Barra progresso globale */}
              {trackedExpected > 0 && (
                <div className="px-5 pb-4 flex flex-col gap-1.5">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Speso vs Previsto (voci tracciate)</span>
                    <span>{Math.round((trackedActual / trackedExpected) * 100)}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        trackedActual / trackedExpected > 1 ? "bg-red-500"
                        : trackedActual / trackedExpected > 0.8 ? "bg-yellow-500"
                        : "bg-green-500"
                      }`}
                      style={{ width: `${Math.min(100, (trackedActual / trackedExpected) * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Dettaglio per voce */}
              <div className="divide-y border-t">
                {itemDetails.map(it => (
                  <div key={it.id} className="flex flex-col">
                    {/* Riga principale */}
                    <div className="flex items-center justify-between px-5 py-3 hover:bg-muted/20 transition-colors gap-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className="text-lg shrink-0">{it.categories?.icon ?? "📦"}</span>
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm font-medium truncate">{it.name}</span>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs text-muted-foreground">{freqLabel(it)}</span>
                            <span className="text-muted-foreground/40 text-xs">·</span>
                            <span className={`text-xs font-medium ${it.tipologia === "fissa" ? "text-blue-500" : "text-orange-500"}`}>
                              {it.tipologia}
                            </span>
                            {/* Badge modalità matching */}
                            {it.matchMode === "keyword" && (
                              <>
                                <span className="text-muted-foreground/40 text-xs">·</span>
                                <span className="text-xs bg-violet-500/10 text-violet-600 dark:text-violet-400 px-1.5 py-0.5 rounded-full font-medium">
                                  🔍 keyword
                                </span>
                              </>
                            )}
                            {it.matchMode === "categoria" && (
                              <>
                                <span className="text-muted-foreground/40 text-xs">·</span>
                                <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
                                  📂 categoria
                                </span>
                              </>
                            )}
                            {!it.matchMode && (
                              <>
                                <span className="text-muted-foreground/40 text-xs">·</span>
                                <span className="text-xs text-muted-foreground/50 italic">non tracciata</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Valori numerici */}
                      <div className="flex items-center gap-3 sm:gap-4 shrink-0 text-right">
                        <div className="flex flex-col">
                          <span className="text-xs text-muted-foreground">previsto/mese</span>
                          <span className="text-sm font-semibold tabular-nums">{formatEuro(it.expectedMonthly)}</span>
                        </div>
                        {it.actual != null ? (
                          <div className="flex flex-col">
                            <span className="text-xs text-muted-foreground">speso</span>
                            <span className="text-sm font-semibold tabular-nums text-red-500">{formatEuro(it.actual)}</span>
                          </div>
                        ) : (
                          <div className="flex flex-col">
                            <span className="text-xs text-muted-foreground/40">speso</span>
                            <span className="text-xs text-muted-foreground/40 italic">n/d</span>
                          </div>
                        )}
                        {it.delta != null && (
                          <div className="flex flex-col items-end">
                            <span className="text-xs text-muted-foreground">delta</span>
                            <span className={`text-sm font-bold tabular-nums ${
                              it.delta > 0 ? "text-red-500"
                              : it.delta < 0 ? "text-green-600 dark:text-green-400"
                              : "text-muted-foreground"
                            }`}>
                              {it.delta > 0 ? "+" : ""}{formatEuro(it.delta)}
                            </span>
                          </div>
                        )}
                        {/* Espandi transazioni matched */}
                        {it.matchedTxs.length > 0 && (
                          <button
                            onClick={() => setExpandedId(prev => prev === it.id ? null : it.id)}
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors px-1"
                            title="Vedi transazioni riconosciute"
                          >
                            {expandedId === it.id ? "▲" : "▼"}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Transazioni matched (expand) */}
                    {expandedId === it.id && it.matchedTxs.length > 0 && (
                      <div className="bg-muted/20 border-t">
                        <p className="px-5 pt-2 pb-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Transazioni riconosciute ({it.matchedTxs.length})
                        </p>
                        {it.matchedTxs.map((tx, i) => (
                          <div key={i} className="flex items-center justify-between px-5 py-1.5 text-xs">
                            <div className="flex flex-col min-w-0">
                              <span className="truncate text-foreground/80">
                                {tx.description || tx.merchant || "—"}
                              </span>
                              {tx.merchant && tx.description && (
                                <span className="text-muted-foreground truncate">{tx.merchant}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="text-muted-foreground">{tx.date}</span>
                              <span className="font-semibold text-red-500 tabular-nums">
                                {formatEuro(Math.abs(Number(tx.amount)))}
                              </span>
                            </div>
                          </div>
                        ))}
                        <div className="px-5 py-2" />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Nota per voci senza tracciamento */}
              {items.some(it => !it.category_id && it.match_keywords.length === 0) && (
                <p className="px-5 py-3 text-xs text-muted-foreground bg-muted/10 border-t">
                  ℹ️ Alcune voci non hanno keyword né categoria: non vengono confrontate con le transazioni reali.
                  Aggiungi almeno una keyword o una categoria per abilitare il tracciamento.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Lista voci ricorrenti ── */}
      <div className="rounded-xl border flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold">Spese ricorrenti</h2>
          <button
            onClick={() => setShowForm(v => !v)}
            className="text-sm bg-primary text-primary-foreground rounded-md px-4 py-2 hover:bg-primary/90 transition-colors"
          >
            {showForm ? "Annulla" : "+ Aggiungi"}
          </button>
        </div>

        {/* ── Form aggiunta ── */}
        {showForm && (
          <form onSubmit={handleAdd} className="border-b px-5 py-5 flex flex-col gap-5 bg-muted/20">

            {/* Nome + Tipologia */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Nome spesa <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="es. Affitto, Netflix, Bolletta gas…"
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
                          : "border hover:bg-muted/50"
                      }`}
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
                <label className="text-xs font-medium text-muted-foreground">Frequenza ricorrenza</label>
                <select
                  value={form.frequency}
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
                  <label className="text-xs font-medium text-muted-foreground">
                    Intervallo (giorni) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number" min={1} placeholder="es. 90"
                    value={form.custom_days}
                    onChange={e => setForm(f => ({ ...f, custom_days: e.target.value }))}
                    className="border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <p className="text-xs text-muted-foreground">
                    14 gg = bisettimanale · 90 gg = trimestrale · 730 gg = ogni 2 anni
                  </p>
                </div>
              )}
            </div>

            {/* Importo */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  {form.tipologia === "variabile" ? "Importo minimo (€)" : "Importo (€)"}
                  <span className="text-red-500"> *</span>
                </label>
                <input
                  type="text" inputMode="decimal" placeholder="0,00"
                  value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  className="border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              {form.tipologia === "variabile" && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Importo massimo (€)</label>
                  <input
                    type="text" inputMode="decimal" placeholder="0,00 (opzionale)"
                    value={form.amount_max}
                    onChange={e => setForm(f => ({ ...f, amount_max: e.target.value }))}
                    className="border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              )}
            </div>

            {/* ── Keyword matching ── */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                🔍 Parole chiave per riconoscimento automatico
              </label>
              <p className="text-xs text-muted-foreground -mt-0.5">
                Le transazioni che contengono queste parole (in descrizione o merchant) vengono
                attribuite automaticamente a questa voce.
                Premi <kbd className="border rounded px-1 py-0.5 text-[10px] font-mono">Enter</kbd> o il
                pulsante + per aggiungere.
              </p>
              {/* Input con chips */}
              <div
                className="border rounded-md px-3 py-2 bg-background flex flex-wrap gap-1.5 items-center min-h-[42px] cursor-text focus-within:ring-2 focus-within:ring-primary"
                onClick={() => keywordInputRef.current?.focus()}
              >
                {form.keywords.map(kw => (
                  <span
                    key={kw}
                    className="inline-flex items-center gap-1 bg-violet-500/10 text-violet-700 dark:text-violet-300 text-xs px-2 py-0.5 rounded-full font-medium"
                  >
                    {kw}
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); removeKeyword(kw); }}
                      className="hover:text-red-500 transition-colors leading-none"
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  ref={keywordInputRef}
                  type="text"
                  placeholder={form.keywords.length === 0 ? "es. enel gas, netflix, affitto…" : ""}
                  value={form.keywordInput}
                  onChange={e => setForm(f => ({ ...f, keywordInput: e.target.value }))}
                  onKeyDown={handleKeywordKeyDown}
                  className="flex-1 min-w-[120px] bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
                />
                {form.keywordInput.trim() && (
                  <button
                    type="button"
                    onClick={addKeyword}
                    className="text-xs bg-violet-500 text-white px-2 py-0.5 rounded-full hover:bg-violet-600 transition-colors"
                  >
                    +
                  </button>
                )}
              </div>
              <p className="text-xs text-muted-foreground/60">
                La ricerca è case-insensitive. Es: "enel bolletta gas" matcha "Enel Bolletta Gas Aprile 2026".
              </p>
            </div>

            {/* Categoria + Note */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Categoria <span className="text-muted-foreground/50 font-normal">(fallback se nessuna keyword)</span>
                </label>
                <select
                  value={form.category_id}
                  onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
                  className="border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">— Nessuna —</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">Note (opzionale)</label>
                <input
                  type="text" placeholder="es. Scade a luglio, include IVA…"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button type="button"
                onClick={() => { setForm(EMPTY_FORM); setShowForm(false); }}
                className="text-sm border rounded-md px-4 py-2 hover:bg-muted/50 transition-colors"
              >
                Annulla
              </button>
              <button type="submit" disabled={saving}
                className="text-sm bg-primary text-primary-foreground rounded-md px-5 py-2 hover:bg-primary/90 disabled:opacity-50 transition-colors font-medium"
              >
                {saving ? "Salvataggio…" : "Aggiungi spesa"}
              </button>
            </div>
          </form>
        )}

        {/* ── Lista voci ── */}
        {loading ? (
          <div className="px-5 py-8 text-sm text-muted-foreground text-center animate-pulse">Caricamento…</div>
        ) : items.length === 0 ? (
          <div className="px-5 py-12 flex flex-col items-center gap-3 text-center">
            <span className="text-4xl">🔁</span>
            <p className="text-sm text-muted-foreground max-w-xs">
              Nessuna spesa ricorrente inserita. Aggiungi affitto, abbonamenti, bollette e tutto
              ciò che paghi periodicamente per confrontarlo con la spesa reale.
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {items.map(it => {
              const monthly  = toMonthlyAmount(it);
              const hasRange = it.tipologia === "variabile" && it.amount_max != null;
              return (
                <div key={it.id} className="flex items-center justify-between px-5 py-3 hover:bg-muted/30 transition-colors gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xl shrink-0">{it.categories?.icon ?? "📦"}</span>
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-medium truncate">{it.name}</span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs text-muted-foreground">
                          {it.categories?.name ?? "Senza categoria"} · {freqLabel(it)}
                        </span>
                        <span className={`text-xs font-medium ${it.tipologia === "fissa" ? "text-blue-500" : "text-orange-500"}`}>
                          · {it.tipologia}
                        </span>
                      </div>
                      {/* Chips keyword */}
                      {it.match_keywords.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {it.match_keywords.map(kw => (
                            <span key={kw} className="text-[10px] bg-violet-500/10 text-violet-600 dark:text-violet-400 px-1.5 py-0.5 rounded-full">
                              🔍 {kw}
                            </span>
                          ))}
                        </div>
                      )}
                      {it.notes && (
                        <span className="text-xs text-muted-foreground/60 truncate italic mt-0.5">{it.notes}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums">
                        {hasRange
                          ? `${formatEuro(it.amount)} – ${formatEuro(it.amount_max!)}`
                          : formatEuro(it.amount)}
                      </p>
                      <p className="text-xs text-muted-foreground tabular-nums">{formatEuro(monthly)}/mese</p>
                    </div>
                    <button
                      onClick={() => handleDelete(it.id)}
                      disabled={deletingId === it.id}
                      className="text-muted-foreground hover:text-red-500 transition-colors disabled:opacity-40 p-1"
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
          <p className="text-xs text-muted-foreground mb-3">
            Se rimani entro il budget previsto su tutte le voci ricorrenti, il risparmio mensile stimato è:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Budget ricorrenti/mese</p>
              <p className="text-xl font-bold tabular-nums">
                {totalMonthlyMin === totalMonthlyMax
                  ? formatEuro(totalMonthlyMin)
                  : `${formatEuro(totalMonthlyMin)} – ${formatEuro(totalMonthlyMax)}`}
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
