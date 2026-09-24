"use client";

import { computePeriodRange, currentPeriod, previousPeriods } from "@/lib/period";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { formatEuro, classifyCategoryMonths, aggregateSinkingFunds, type MonthSpend, type SinkingFundInput } from "@/lib/calculations";
import { expectedAmount, isFixedExpense, planPayments, type PlanItem } from "@/lib/fixed-expenses";

type Category = { id: string; name: string; color: string; icon: string };
type Tx = { date: string; amount: number; category_id?: string | null; description?: string | null; merchant?: string | null };
type BudgetRow = { category_id: string; monthly_budget: number };
type NoteRow = { category_id: string; year: number; month: number; note: string };
type RecurringItem = {
  id: string; name: string; tipologia: string;
  amount: number; amount_max: number | null;
  next_due_date: string | null; saving_start_date: string | null;
};

type Props = {
  userId: string;
  categories: Category[];
  transactions: Tx[];
  recurringItems: RecurringItem[];
  /** spese fisse e rate: i loro pagamenti non contano nella spesa per categoria */
  planItems?: PlanItem[];
  piggyBalance: number;
  /** giorno di paga (0 = mese solare): il "mese" del budget è lo stesso periodo della dashboard */
  payDay: number;
  initialBudgets: BudgetRow[];
  initialNotes: NoteRow[];
  onBack: () => void;
  onOpenAccantonamenti?: () => void;
  onOpenFixed?: () => void;
};

const HISTORY_MONTHS = 12;
const ACCANTONAMENTI_NAME = "accantonamenti";
// Categorie di trasferimento interno e reddito: non hanno senso come voce di budget.
const EXCLUDED_CATEGORY_NAMES = new Set(["stipendio", "spostamenti", "salvadanaio"]);

/** Etichetta di un periodo dello storico (month 1-12): il mese, o l'intervallo se si parte dal giorno di paga. */
function periodLabel(payDay: number, year: number, month: number) {
  if (payDay === 0) {
    return new Date(year, month - 1, 1).toLocaleDateString("it-IT", { month: "long", year: "numeric" });
  }
  const { from, to } = computePeriodRange(payDay, year, month - 1);
  const d = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "short" });
  return `${d(from)} – ${d(to)} ${year}`;
}

function noteKey(categoryId: string, year: number, month: number) {
  return `${categoryId}:${year}-${month}`;
}

export function BudgetPanel({
  userId, categories, transactions, recurringItems, planItems = [], piggyBalance, payDay,
  initialBudgets, initialNotes, onBack, onOpenAccantonamenti, onOpenFixed,
}: Props) {
  const budgetCategories = useMemo(
    () => categories.filter(c => !EXCLUDED_CATEGORY_NAMES.has(c.name.toLowerCase())),
    [categories]
  );
  const accantonamentiId = useMemo(
    () => categories.find(c => c.name.toLowerCase() === ACCANTONAMENTI_NAME)?.id ?? null,
    [categories]
  );

  // Quota mensile consigliata dalla sezione Accantonamenti: per quella categoria il
  // budget non è impostabile a mano, è sempre questo valore (evita due numeri diversi
  // per la stessa cosa e il doppio conteggio in dashboard).
  const sinkingSummary = useMemo(() => {
    const inputs: SinkingFundInput[] = recurringItems
      .filter(it => it.next_due_date && it.saving_start_date)
      .map(it => ({
        id: it.id, name: it.name,
        amount_per_cycle: it.tipologia === "variabile" && it.amount_max != null ? (it.amount + it.amount_max) / 2 : it.amount,
        saving_start_date: it.saving_start_date!,
        next_due_date: it.next_due_date!,
      }));
    return aggregateSinkingFunds(inputs, piggyBalance);
  }, [recurringItems, piggyBalance]);

  const [budgets, setBudgets] = useState<Record<string, number>>(
    () => Object.fromEntries(initialBudgets.filter(b => b.category_id !== accantonamentiId).map(b => [b.category_id, Number(b.monthly_budget)]))
  );
  const [notes, setNotes] = useState<Record<string, string>>(
    () => Object.fromEntries(initialNotes.map(n => [noteKey(n.category_id, n.year, n.month), n.note]))
  );

  // Pulizia difensiva: se esiste già una riga manuale su Accantonamenti da prima di
  // questa regola (es. impostata quando il blocco non c'era ancora), la rimuove.
  useEffect(() => {
    if (!accantonamentiId) return;
    if (!initialBudgets.some(b => b.category_id === accantonamentiId)) return;
    createClient().from("category_budgets").delete().eq("user_id", userId).eq("category_id", accantonamentiId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accantonamentiId]);

  function effectiveBudget(catId: string): number {
    return catId === accantonamentiId ? sinkingSummary.this_month_total : (budgets[catId] ?? 0);
  }

  const [subview, setSubview] = useState<"list" | "detail">("list");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");
  const [savingBudget, setSavingBudget] = useState(false);
  const [editingNoteKey, setEditingNoteKey] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState("");
  const [savingNoteKey, setSavingNoteKey] = useState<string | null>(null);

  // Stesso periodo della dashboard: prima qui si usava il mese solare, così chi imposta
  // il giorno di paga vedeva due "speso questo mese" diversi tra Dashboard e Budget.
  const cur = currentPeriod(payDay);
  const curFrom = cur.from, curTo = cur.to;

  // Affitto, abbonamenti, bollette e rate hanno la loro sezione: i movimenti che le pagano
  // non contano qui, né nel periodo né nello storico (che suggerisce il budget). Senza,
  // l'affitto finiva sia nelle Spese fisse sia nella spesa di "Casa".
  const planPaid = useMemo(
    () => planPayments(planItems, transactions, [
      { from: curFrom, to: curTo },
      ...previousPeriods(payDay, cur.year, cur.month, HISTORY_MONTHS),
    ]),
    [planItems, transactions, payDay, cur.year, cur.month, curFrom, curTo],
  );
  const fixedByCategory = useMemo(() => {
    const map: Record<string, PlanItem[]> = {};
    for (const it of planItems) {
      if (!isFixedExpense(it) || !it.category_id) continue;
      (map[it.category_id] ??= []).push(it);
    }
    return map;
  }, [planItems]);

  const currentSpend = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of budgetCategories) {
      map[c.id] = transactions
        .filter(t => t.category_id === c.id && t.date >= curFrom && t.date <= curTo && Number(t.amount) < 0 && !planPaid.has(t))
        .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
    }
    return map;
  }, [budgetCategories, transactions, curFrom, curTo, planPaid]);

  const totalBudget = useMemo(
    () => budgetCategories.reduce((s, c) => {
      const b = c.id === accantonamentiId ? sinkingSummary.this_month_total : (budgets[c.id] ?? 0);
      return s + b;
    }, 0),
    [budgetCategories, budgets, accantonamentiId, sinkingSummary.this_month_total]
  );
  const totalSpent = useMemo(
    () => budgetCategories.reduce((s, c) => s + (currentSpend[c.id] ?? 0), 0),
    [budgetCategories, currentSpend]
  );

  const category = budgetCategories.find(c => c.id === detailId) ?? null;

  // Ordine dell'elenco: prima le categorie con un budget o con spese negli ultimi tre
  // periodi (le più pesanti in cima), poi le altre. In ordine alfabetico le 20 categorie
  // "Da impostare" nascondevano quelle che contano.
  const { usedCategories, unusedCategories } = useMemo(() => {
    const recent = previousPeriods(payDay, cur.year, cur.month, 3);
    const since = recent.length ? recent[recent.length - 1].from : curFrom;
    const weight: Record<string, number> = {};
    for (const t of transactions) {
      if (!t.category_id || Number(t.amount) >= 0 || t.date < since || t.date > curTo || planPaid.has(t)) continue;
      weight[t.category_id] = (weight[t.category_id] ?? 0) + Math.abs(Number(t.amount));
    }
    const used = budgetCategories
      .filter(c => (weight[c.id] ?? 0) > 0 || effectiveBudget(c.id) > 0)
      .sort((a, b) => Math.max(weight[b.id] ?? 0, effectiveBudget(b.id)) - Math.max(weight[a.id] ?? 0, effectiveBudget(a.id)));
    const usedIds = new Set(used.map(c => c.id));
    return { usedCategories: used, unusedCategories: budgetCategories.filter(c => !usedIds.has(c.id)) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budgetCategories, transactions, payDay, cur.year, cur.month, curFrom, curTo, budgets, sinkingSummary.this_month_total, planPaid]);
  const [showUnused, setShowUnused] = useState(false);

  const analysis = useMemo(() => {
    if (!category) return null;
    const months: MonthSpend[] = [];
    for (const p of previousPeriods(payDay, cur.year, cur.month, HISTORY_MONTHS)) {
      const total = transactions
        .filter(t => t.category_id === category.id && t.date >= p.from && t.date <= p.to && Number(t.amount) < 0 && !planPaid.has(t))
        .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
      months.push({ year: p.year, month: p.month, total });
    }
    return classifyCategoryMonths(months);
  }, [category, transactions, payDay, cur.year, cur.month, planPaid]);

  function openDetail(catId: string) {
    setDetailId(catId);
    setSubview("detail");
    setEditingBudget(false);
    setEditingNoteKey(null);
  }

  async function saveBudget(catId: string) {
    if (catId === accantonamentiId) return; // budget automatico, non modificabile
    const amt = parseFloat(budgetInput.replace(",", "."));
    if (isNaN(amt) || amt < 0) { toast.error("Inserisci un importo valido."); return; }
    setSavingBudget(true);
    const { error } = await createClient()
      .from("category_budgets")
      .upsert(
        { user_id: userId, category_id: catId, monthly_budget: amt, updated_at: new Date().toISOString() },
        { onConflict: "user_id,category_id" }
      );
    setSavingBudget(false);
    if (error) { toast.error(`Errore: ${error.message}`); return; }
    setBudgets(prev => ({ ...prev, [catId]: amt }));
    setEditingBudget(false);
    toast.success("Budget aggiornato!");
  }

  async function saveNote(catId: string, year: number, month: number) {
    const text = noteInput.trim();
    if (!text) { toast.error("Scrivi una nota."); return; }
    const key = noteKey(catId, year, month);
    setSavingNoteKey(key);
    const { error } = await createClient()
      .from("category_budget_notes")
      .upsert(
        { user_id: userId, category_id: catId, year, month, note: text, updated_at: new Date().toISOString() },
        { onConflict: "user_id,category_id,year,month" }
      );
    setSavingNoteKey(null);
    if (error) { toast.error(`Errore: ${error.message}`); return; }
    setNotes(prev => ({ ...prev, [key]: text }));
    setEditingNoteKey(null);
    setNoteInput("");
    toast.success("Nota salvata!");
  }

  async function removeNote(catId: string, year: number, month: number) {
    const key = noteKey(catId, year, month);
    const { error } = await createClient()
      .from("category_budget_notes")
      .delete()
      .eq("user_id", userId).eq("category_id", catId).eq("year", year).eq("month", month);
    if (error) { toast.error("Errore."); return; }
    setNotes(prev => { const next = { ...prev }; delete next[key]; return next; });
  }

  // ═══════════════════════════════ DETAIL ══════════════════════════════
  if (subview === "detail" && category && analysis) {
    const budget = effectiveBudget(category.id);
    const isAccantonamenti = category.id === accantonamentiId;
    return (
      <div className="flex flex-col gap-6 max-w-lg mx-auto w-full">
        <button onClick={() => setSubview("list")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors self-start">
          ← Indietro
        </button>

        <h1 className="text-xl font-bold">{category.icon} {category.name}</h1>

        <div className="rounded-2xl border-2 p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Budget mensile</span>
            {!isAccantonamenti && !editingBudget && (
              <button
                onClick={() => { setEditingBudget(true); setBudgetInput(budget > 0 ? String(budget).replace(".", ",") : ""); }}
                className="text-xs text-primary underline hover:no-underline"
              >
                Modifica
              </button>
            )}
          </div>
          {isAccantonamenti ? (
            <>
              <span className="text-2xl font-bold tabular-nums">{formatEuro(budget)}</span>
              <p className="text-xs text-muted-foreground">
                🔒 Calcolato automaticamente dalla quota mensile consigliata in Smart → Accantonamenti — non è modificabile qui, per evitare due numeri diversi per la stessa cosa.
                {onOpenAccantonamenti && (
                  <>{" "}<button type="button" onClick={onOpenAccantonamenti} className="text-primary underline hover:no-underline">Vai ad Accantonamenti →</button></>
                )}
              </p>
            </>
          ) : editingBudget ? (
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <input
                  type="text" autoFocus value={budgetInput}
                  onChange={e => setBudgetInput(e.target.value)}
                  placeholder="es. 200"
                  className="flex-1 border-2 rounded-xl px-3 py-2 text-base bg-background focus:outline-none focus:border-primary transition-colors"
                />
                <button
                  onClick={() => saveBudget(category.id)}
                  disabled={savingBudget}
                  className="bg-primary text-primary-foreground rounded-xl px-4 py-2 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {savingBudget ? "…" : "Salva"}
                </button>
                <button
                  onClick={() => setEditingBudget(false)}
                  className="rounded-xl border px-4 py-2 text-sm hover:bg-muted/50 transition-colors"
                >
                  Annulla
                </button>
              </div>
              {analysis.average > 0 && (
                <p className="text-xs text-muted-foreground">
                  💡 Media mesi normali (esclusi gli speciali): <span className="font-medium">{formatEuro(analysis.average)}</span>
                  {" — "}
                  <button
                    type="button"
                    onClick={() => setBudgetInput(String(analysis.average.toFixed(2)).replace(".", ","))}
                    className="text-primary underline hover:no-underline"
                  >
                    usa questo valore
                  </button>
                </p>
              )}
            </div>
          ) : (
            <span className="text-2xl font-bold tabular-nums">{formatEuro(budget)}</span>
          )}
          <span className="text-xs text-muted-foreground">
            Speso in questo periodo: {formatEuro(currentSpend[category.id] ?? 0)}
            {analysis.average > 0 && ` · Media mesi normali: ${formatEuro(analysis.average)}`}
          </span>
          {(fixedByCategory[category.id]?.length ?? 0) > 0 && (
            <p className="text-xs text-muted-foreground border-t pt-2">
              Non contano qui, perché sono tra le{" "}
              {onOpenFixed
                ? <button type="button" onClick={onOpenFixed} className="text-primary underline hover:no-underline">spese fisse</button>
                : "spese fisse"}
              : {fixedByCategory[category.id].map(it => `${it.name} ${formatEuro(expectedAmount(it))}`).join(" · ")}.
            </p>
          )}
        </div>

        <div className="rounded-xl border p-5 flex flex-col gap-1">
          <h2 className="font-semibold text-sm mb-2">Storico ultimi {HISTORY_MONTHS} mesi</h2>
          <div className="flex flex-col divide-y">
            {analysis.months.map(m => {
              const key = noteKey(category.id, m.year, m.month);
              const note = notes[key];
              const deltaPct = analysis.average > 0 ? ((m.total - analysis.average) / analysis.average) * 100 : 0;
              return (
                <div key={key} className="py-3 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm capitalize">{periodLabel(payDay, m.year, m.month)}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium tabular-nums">{formatEuro(m.total)}</span>
                      {m.isSpecial && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 whitespace-nowrap">
                          ⭐ Speciale {deltaPct > 0 ? "+" : ""}{deltaPct.toFixed(0)}%
                        </span>
                      )}
                    </div>
                  </div>
                  {m.isSpecial && (
                    editingNoteKey === key ? (
                      <div className="flex flex-col gap-2">
                        <textarea
                          autoFocus value={noteInput}
                          onChange={e => setNoteInput(e.target.value)}
                          placeholder="Perché questo mese è diverso dal solito?"
                          rows={2}
                          className="border-2 rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:border-primary transition-colors resize-none"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => saveNote(category.id, m.year, m.month)}
                            disabled={savingNoteKey === key}
                            className="bg-primary text-primary-foreground rounded-lg px-3 py-1.5 text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
                          >
                            Salva nota
                          </button>
                          <button
                            onClick={() => { setEditingNoteKey(null); setNoteInput(""); }}
                            className="rounded-lg border px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors"
                          >
                            Annulla
                          </button>
                        </div>
                      </div>
                    ) : note ? (
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs text-muted-foreground italic">&ldquo;{note}&rdquo;</p>
                        <div className="flex gap-2 shrink-0">
                          <button onClick={() => { setEditingNoteKey(key); setNoteInput(note); }} className="text-xs text-primary underline hover:no-underline">Modifica</button>
                          <button onClick={() => removeNote(category.id, m.year, m.month)} className="text-xs text-muted-foreground hover:text-destructive">Rimuovi</button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditingNoteKey(key); setNoteInput(""); }}
                        className="text-xs text-primary underline hover:no-underline self-start"
                      >
                        + Aggiungi nota
                      </button>
                    )
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════ LIST ═══════════════════════════════
  return (
    <div className="flex flex-col gap-6 max-w-lg mx-auto w-full">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors self-start">
        ← Indietro
      </button>

      <div>
        <h1 className="text-xl font-bold">Budget</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Quanto vuoi spendere ogni mese per le spese che cambiano: spesa, benzina, ristoranti, svago. Apri una categoria per vedere lo storico e la media.
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          Affitto, bollette, abbonamenti e rate non contano qui: stanno nelle loro sezioni.
          {onOpenFixed && (
            <>{" "}<button type="button" onClick={onOpenFixed} className="text-primary underline hover:no-underline">Vai alle spese fisse →</button></>
          )}
        </p>
      </div>

      <div className="rounded-2xl border-2 p-5 flex flex-col gap-1">
        <span className="text-xs text-muted-foreground uppercase tracking-wide">Budget del periodo</span>
        <span className="text-2xl font-bold tabular-nums">{formatEuro(totalBudget)}</span>
        <span className="text-xs text-muted-foreground">Speso finora in questo periodo: {formatEuro(totalSpent)}</span>
      </div>

      <div className="rounded-xl border p-2 flex flex-col divide-y">
        {usedCategories.length === 0 && (
          <p className="text-sm text-muted-foreground px-3 py-3">
            Non ci sono ancora spese categorizzate: importa l&apos;estratto conto e qui compariranno le categorie in cui spendi di più.
          </p>
        )}
        {[...usedCategories, ...(showUnused ? unusedCategories : [])].map(c => {
          const budget = effectiveBudget(c.id);
          const isLocked = c.id === accantonamentiId;
          const spent = currentSpend[c.id] ?? 0;
          const over = budget > 0 && spent > budget;
          return (
            <button
              key={c.id}
              onClick={() => openDetail(c.id)}
              className="flex items-center justify-between gap-3 px-3 py-3 text-left hover:bg-muted/50 rounded-lg transition-colors"
            >
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium truncate">{c.icon} {c.name}{isLocked && " 🔒"}</span>
                <span className="text-xs text-muted-foreground">
                  Speso: {formatEuro(spent)}{budget > 0 && ` · Budget: ${formatEuro(budget)}`}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {isLocked ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap bg-muted text-muted-foreground">
                    Automatico
                  </span>
                ) : budget > 0 ? (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap ${
                    over ? "bg-red-500/10 text-red-500" : "bg-green-500/10 text-green-600 dark:text-green-400"
                  }`}>
                    {over ? "Sopra budget" : "Nel budget"}
                  </span>
                ) : (
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">Da impostare</span>
                )}
                <span className="text-muted-foreground">›</span>
              </div>
            </button>
          );
        })}
        {unusedCategories.length > 0 && (
          <button
            onClick={() => setShowUnused(v => !v)}
            className="text-sm text-muted-foreground hover:text-foreground px-3 py-3 text-left"
          >
            {showUnused ? "Nascondi le categorie senza spese" : `Mostra altre ${unusedCategories.length} categorie senza spese`}
          </button>
        )}
      </div>
    </div>
  );
}
