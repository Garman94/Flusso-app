"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { todayISO } from "@/lib/dates";
import { formatEuro, monthsPerCycle } from "@/lib/calculations";
import { parseAmount } from "@/lib/import-parse";
import { normalizeText, ruleKeyword } from "@/lib/categorize";
import {
  detectRecurring, expectedAmount, isFixedExpense, nextDueDate, planStatus,
  FIXED_GROUPS, fixedGroupOf, guessFixedGroup,
  type FixedGroup, type PlanItem, type PlanStatus, type RecurringSuggestion,
} from "@/lib/fixed-expenses";
import { markRecurringAsPaid } from "../recurring-payment-actions";

// Pianifica → Spese fisse: affitto, telefono, abbonamenti, bollette. Elenco con lo stato del
// periodo (pagata / in arrivo / non trovata), le spese che si ripetono trovate nei movimenti
// da aggiungere con un tocco, e il modulo per aggiungerne o modificarne una.
// Calcoli in lib/fixed-expenses.ts.

type Category = { id: string; name: string; color: string; icon: string };
type Tx = {
  id?: string; date: string; amount: number; category_id?: string | null;
  description?: string | null; merchant?: string | null;
};
export type FixedItem = PlanItem & { notes?: string | null };
type CategoryBudget = { category_id: string; monthly_budget: number };

type Freq = "mensile" | "bimestrale" | "trimestrale" | "semestrale" | "annuale";
const FREQS: { value: Freq; label: string; short: string }[] = [
  { value: "mensile", label: "Ogni mese", short: "ogni mese" },
  { value: "bimestrale", label: "Ogni 2 mesi", short: "ogni 2 mesi" },
  { value: "trimestrale", label: "Ogni 3 mesi", short: "ogni 3 mesi" },
  { value: "semestrale", label: "Ogni 6 mesi", short: "ogni 6 mesi" },
  { value: "annuale", label: "Ogni anno", short: "ogni anno" },
];
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const monthShort = (m: number) => new Date(2000, m - 1).toLocaleString("it-IT", { month: "short" });
const monthLong = (m: number) => new Date(2000, m - 1).toLocaleString("it-IT", { month: "long" });
const fmtDay = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "short" });
/** "il 10", ma "l'8" e "l'11". */
const ilDay = (day: number) => (day === 8 || day === 11 ? `l'${day}` : `il ${day}`);
/** "il 10 set", "l'8 set". */
const onDate = (iso: string) => `${ilDay(+iso.slice(8, 10)).replace(/\d+$/, "")}${fmtDay(iso)}`;

/** Categorie che non sono spese: non se ne propongono spese fisse. */
const NOT_EXPENSE_CATEGORIES = new Set(["stipendio", "spostamenti", "salvadanaio", "accantonamenti"]);
const DISMISSED_KEY = "flusso_spese_fisse_ignorate";
const DEBT_WORDS = /\b(mutuo|rata|rate|finanziament|prestito|leasing)/i;

/**
 * Parole delle spese trovate che l'utente ha scartato (✕). Stanno nel browser: è solo una
 * comodità, al peggio una proposta ricompare. Lette dopo il montaggio, così la pagina
 * disegnata dal server e quella del browser coincidono.
 */
export function useDismissedSuggestions(): [string[], (keyword: string) => void] {
  const [dismissed, setDismissed] = useState<string[]>([]);
  useEffect(() => {
    try { setDismissed(JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]") as string[]); } catch { /* niente */ }
  }, []);
  const dismiss = useCallback((keyword: string) => {
    setDismissed(prev => {
      const next = [...prev, keyword];
      try { localStorage.setItem(DISMISSED_KEY, JSON.stringify(next)); } catch { /* niente */ }
      return next;
    });
  }, []);
  return [dismissed, dismiss];
}

/** Spese che si ripetono ogni mese non ancora in Pianifica, tolte quelle scartate dall'utente. */
export function fixedSuggestions(items: FixedItem[], transactions: Tx[], categories: Category[], dismissed: string[]): RecurringSuggestion[] {
  const exclude = new Set(categories.filter(c => NOT_EXPENSE_CATEGORIES.has(c.name.toLowerCase())).map(c => c.id));
  return detectRecurring(transactions, items, todayISO(), exclude).filter(s => !dismissed.includes(s.keyword));
}

function amountLabel(it: Pick<PlanItem, "tipologia" | "amount" | "amount_max">) {
  return it.tipologia === "variabile" && it.amount_max != null
    ? `${formatEuro(Number(it.amount))} – ${formatEuro(Number(it.amount_max))}`
    : formatEuro(Number(it.amount));
}

function whenLabel(it: PlanItem) {
  const f = FREQS.find(x => x.value === it.frequency)?.short ?? "";
  if (it.frequency === "mensile") return it.due_day ? `${f} · giorno ${it.due_day}` : f;
  if (it.due_month) return `${f} · ${monthLong(it.due_month)}${it.due_day ? ` ${it.due_day}` : ""}`;
  return f;
}

const STATE_ORDER: Record<string, number> = { missing: 0, upcoming: 1, unverifiable: 2, paid: 3, "not-due": 4 };

type Props = {
  mode: "list" | "form";
  userId: string;
  items: FixedItem[];
  setItems: (fn: (prev: FixedItem[]) => FixedItem[]) => void;
  transactions: Tx[];
  categories: Category[];
  categoryBudgets: CategoryBudget[];
  periodFrom: string;
  periodTo: string;
  /** modulo: voce da modificare, null = nuova */
  editId: string | null;
  dismissed: string[];
  onDismiss: (keyword: string) => void;
  onOpenForm: (id: string | null) => void;
  onBack: () => void;
  onOpenBudget: () => void;
  onOpenRate: () => void;
  onOpenUtenze: () => void;
};

export function FixedExpensesPanel(props: Props) {
  return props.mode === "form"
    ? <FixedForm key={props.editId ?? "new"} {...props} />
    : <FixedList {...props} />;
}

// ═══════════════════════════════ ELENCO ═══════════════════════════════

function FixedList({
  userId, items, setItems, transactions, categories, periodFrom, periodTo,
  dismissed, onDismiss, onOpenForm, onBack, onOpenBudget, onOpenRate, onOpenUtenze,
}: Props) {
  const today = todayISO();
  const fixed = useMemo(() => items.filter(isFixedExpense), [items]);
  const oldIncome = useMemo(() => items.filter(it => !it.debt_type && !it.next_due_date && it.tipologia === "entrata"), [items]);
  const catById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);

  const statuses = useMemo(
    () => fixed
      .map(it => planStatus(it, transactions, periodFrom, periodTo, today))
      .sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state]
        || (a.due.dates[0] ?? nextDueDate(a.item, today) ?? "9").localeCompare(b.due.dates[0] ?? nextDueDate(b.item, today) ?? "9")),
    [fixed, transactions, periodFrom, periodTo, today],
  );
  const catName = (id?: string | null) => (id ? catById.get(id)?.name : undefined);
  const grouped = FIXED_GROUPS
    .map(g => ({ ...g, list: statuses.filter(st => fixedGroupOf(st.item, catName(st.item.category_id)) === g.key) }))
    .filter(g => g.list.length > 0);
  const inPeriod = statuses.filter(s => s.state !== "not-due");
  const total = inPeriod.reduce((s, x) => s + x.expected, 0);
  const paid = inPeriod.filter(s => s.state === "paid").reduce((s, x) => s + (x.paidAmount || x.expected), 0);
  const toPay = inPeriod.filter(s => s.state !== "paid").reduce((s, x) => s + x.expected, 0);

  const suggestions = useMemo(
    () => fixedSuggestions(items, transactions, categories, dismissed),
    [items, transactions, categories, dismissed],
  );
  const [adding, setAdding] = useState<string | null>(null);
  const [marking, setMarking] = useState<string | null>(null);

  async function addSuggestion(s: RecurringSuggestion) {
    setAdding(s.keyword);
    const { data, error } = await createClient().from("recurring_expenses").insert({
      user_id: userId, name: s.name,
      tipologia: s.amountMax != null ? "variabile" : "fissa", frequency: "mensile",
      custom_days: null, amount: s.amount, amount_max: s.amountMax,
      due_day: s.dueDay, due_month: null, category_id: s.categoryId,
      fixed_group: guessFixedGroup(s.name, catName(s.categoryId)),
      match_keywords: [s.keyword], matching_strategy: "keyword", secondary_name: null, notes: null,
      next_due_date: null, saving_start_date: null,
    }).select("*").single();
    setAdding(null);
    if (error) { toast.error(`Errore: ${error.message}`); return; }
    setItems(prev => [...prev, data as FixedItem]);
    toast.success(`Aggiunta: ${s.name}`);
  }

  async function markPaid(st: PlanStatus) {
    setMarking(st.item.id);
    const res = await markRecurringAsPaid(st.item.id, st.expected, today);
    setMarking(null);
    if (res?.error) { toast.error(res.error); return; }
    setItems(prev => prev.map(it => it.id === st.item.id ? { ...it, last_paid_date: today } : it));
    toast.success(`"${st.item.name}" segnata come pagata`);
  }

  async function remove(it: PlanItem) {
    if (!window.confirm(`Eliminare "${it.name}"?`)) return;
    const { error } = await createClient().from("recurring_expenses").delete().eq("id", it.id);
    if (error) { toast.error("Errore."); return; }
    setItems(prev => prev.filter(x => x.id !== it.id));
    toast.success("Eliminata.");
  }

  function statusLine(st: PlanStatus) {
    const date = st.due.dates[0];
    switch (st.state) {
      case "paid": {
        const p = st.payments[0];
        return (
          <span className="text-green-600 dark:text-green-400">
            ✅ {p ? `Pagata ${onDate(p.date)} · ${formatEuro(st.paidAmount)}` : "Segnata come pagata"}
          </span>
        );
      }
      case "upcoming":
        return (
          <span className="text-muted-foreground">
            🕓 {!date ? "Da pagare in questo periodo" : date < today ? `Prevista ${onDate(date)}: aspetto il movimento` : `Arriva ${onDate(date)}`}
          </span>
        );
      case "missing":
        return (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-amber-600 dark:text-amber-400">⏳ Doveva arrivare {onDate(date)}: non la trovo nei movimenti</span>
            <button onClick={() => markPaid(st)} disabled={marking === st.item.id} className="text-primary underline hover:no-underline disabled:opacity-50">
              {marking === st.item.id ? "…" : "L'ho pagata"}
            </button>
          </span>
        );
      case "unverifiable":
        return (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {st.due.spread
              ? <span className="text-muted-foreground">Contata in media: {formatEuro(st.expected)} al mese</span>
              : date && <span className="text-muted-foreground">🕓 Arriva {onDate(date)}</span>}
            <button onClick={() => onOpenForm(st.item.id)} className="text-primary underline hover:no-underline">
              {st.due.spread ? "Indica il mese, per contarla quando arriva" : "🔗 Collega un movimento per sapere quando è pagata"}
            </button>
          </span>
        );
      default: {
        const next = nextDueDate(st.item, today);
        return <span className="text-muted-foreground">{next ? `Prossima: ${fmtDay(next)}` : "Non in questo periodo"}</span>;
      }
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">← Indietro</button>
        <h1 className="text-xl font-bold flex-1">Spese fisse</h1>
        <button onClick={() => onOpenForm(null)} className="text-sm bg-primary text-primary-foreground rounded-lg px-3 py-1.5 hover:bg-primary/90 transition-colors">
          + Aggiungi
        </button>
      </div>
      <p className="text-sm text-muted-foreground -mt-3">
        Affitto, telefono, abbonamenti, bollette: quelle che arrivano da sole. Flusso le conta nel mese in cui arrivano e ti dice quando sono pagate.
      </p>

      {inPeriod.length > 0 && (
        <div className="rounded-2xl border-2 p-5 flex flex-col gap-2">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">
            In questo periodo ({fmtDay(periodFrom)} – {fmtDay(periodTo)})
          </span>
          <span className="text-2xl font-bold tabular-nums">{formatEuro(total)}</span>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${total > 0 ? Math.min(100, (paid / total) * 100) : 0}%` }} />
          </div>
          <span className="text-xs text-muted-foreground">
            Già pagate {formatEuro(paid)} · Ancora da pagare <strong className="text-foreground">{formatEuro(toPay)}</strong>
          </span>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="rounded-xl border border-primary/40 bg-primary/5 p-4 flex flex-col gap-3" data-tour="spese-fisse-trovate">
          <div>
            <p className="text-sm font-medium">🔎 Trovate nei tuoi movimenti</p>
            <p className="text-xs text-muted-foreground">Si ripetono ogni mese. Aggiungile con un tocco, o tocca ✕ se non sono spese fisse.</p>
          </div>
          {suggestions.map(s => (
            <div key={s.keyword} className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{s.name}</p>
                <p className="text-xs text-muted-foreground">
                  {s.amountMax != null ? `${formatEuro(s.amount)} – ${formatEuro(s.amountMax)}` : formatEuro(s.amount)}
                  {" · "}ogni mese, verso {ilDay(s.dueDay)}
                </p>
              </div>
              <button
                onClick={() => addSuggestion(s)}
                disabled={adding === s.keyword}
                className="text-xs bg-primary text-primary-foreground rounded-lg px-3 py-1.5 hover:bg-primary/90 disabled:opacity-50 transition-colors shrink-0"
              >
                {adding === s.keyword ? "…" : "Aggiungi"}
              </button>
              <button onClick={() => onDismiss(s.keyword)} className="text-xs text-muted-foreground hover:text-foreground px-1 shrink-0" title="Non è una spesa fissa">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {fixed.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-10 text-center">
          <span className="text-5xl">📋</span>
          <p className="text-muted-foreground max-w-sm">
            Aggiungi affitto, telefono, abbonamenti e bollette: Flusso li toglie da quello che puoi spendere prima che arrivino.
          </p>
          <button onClick={() => onOpenForm(null)} className="bg-primary text-primary-foreground rounded-xl px-5 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors">
            Aggiungi la prima
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {grouped.map(g => {
            const subtotal = g.list.filter(st => st.state !== "not-due").reduce((sum, st) => sum + st.expected, 0);
            return (
              <div key={g.key} className="flex flex-col gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-baseline justify-between gap-2">
                  <span>{g.icon} {g.label}</span>
                  {subtotal > 0 && <span className="normal-case tracking-normal font-medium tabular-nums">{formatEuro(subtotal)} in questo periodo</span>}
                </h2>
                {g.key === "utenze" && (
                  <button onClick={onOpenUtenze} className="text-sm text-primary hover:underline self-start -mt-1">
                    ⚡ Calcola luce e gas: stima la bolletta di questo mese →
                  </button>
                )}
                {g.list.map(st => {
                  const it = st.item;
                  const cat = it.category_id ? catById.get(it.category_id) : undefined;
                  return (
                    <div key={it.id} className={`rounded-xl border p-4 flex items-start gap-3 ${st.state === "not-due" ? "opacity-70" : ""}`}>
                      <span className="text-xl leading-none mt-0.5">{cat?.icon ?? g.icon}</span>
                      <div className="flex-1 min-w-0 flex flex-col gap-1">
                        <span className="font-medium truncate">{it.name}</span>
                        <span className="text-xs text-muted-foreground">{amountLabel(it)} · {whenLabel(it)}</span>
                        <span className="text-xs">{statusLine(st)}</span>
                        {DEBT_WORDS.test(it.name) && (
                          <span className="text-xs text-muted-foreground">
                            Sembra una rata:{" "}
                            <button onClick={onOpenRate} className="text-primary underline hover:no-underline">in Rate e mutui</button>{" "}
                            vedi anche quanto manca alla fine.
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => onOpenForm(it.id)} className="text-xs text-muted-foreground hover:text-foreground border rounded-lg px-2 py-1 transition-colors" title="Modifica">✏️</button>
                        <button onClick={() => remove(it)} className="text-xs text-muted-foreground hover:text-destructive border rounded-lg px-2 py-1 transition-colors" title="Elimina">🗑</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {oldIncome.length > 0 && (
        <div className="rounded-xl border bg-muted/30 p-4 flex flex-col gap-2 text-sm">
          <p>
            <strong>Entrate inserite col vecchio sistema.</strong> Non contano: stipendio e altre entrate si indicano in{" "}
            <a href="/dashboard/account" className="text-primary hover:underline">Account</a>. Puoi eliminarle.
          </p>
          {oldIncome.map(it => (
            <div key={it.id} className="flex items-center justify-between gap-3">
              <span className="truncate">{it.name} · {formatEuro(Number(it.amount))}</span>
              <button onClick={() => remove(it)} className="text-xs text-muted-foreground hover:text-destructive border rounded-lg px-2 py-1 transition-colors">🗑</button>
            </div>
          ))}
        </div>
      )}

      <button onClick={onOpenUtenze} className="rounded-xl border px-4 py-3 text-left flex items-center gap-3 hover:bg-muted/40 transition-colors">
        <span className="text-xl">⚡🔥</span>
        <span className="flex flex-col flex-1">
          <span className="text-sm font-medium">Calcolatore luce e gas</span>
          <span className="text-xs text-muted-foreground">Quanto pagherai questo mese, dai consumi degli anni passati e dai prezzi del tuo fornitore.</span>
        </span>
        <span className="text-muted-foreground">›</span>
      </button>

      <p className="text-xs text-muted-foreground">
        Le spese fisse non contano nel{" "}
        <button onClick={onOpenBudget} className="text-primary underline hover:no-underline">Budget</button>: lì metti solo le spese che cambiano di mese in mese, come spesa, benzina e ristoranti.
      </p>
    </div>
  );
}

// ═══════════════════════════════ MODULO ═══════════════════════════════

const FREQ_BY_MONTHS: Record<number, Freq> = { 1: "mensile", 2: "bimestrale", 3: "trimestrale", 6: "semestrale", 12: "annuale" };

function toForm(it: FixedItem | undefined) {
  // le vecchie voci "personalizzate" (ogni N giorni) diventano la frequenza più vicina
  const frequency: Freq = !it ? "mensile"
    : FREQS.some(x => x.value === it.frequency) ? it.frequency as Freq
    : FREQ_BY_MONTHS[monthsPerCycle(it.frequency, it.custom_days)] ?? "mensile";
  return {
    name: it?.name ?? "",
    amount: it ? String(it.amount).replace(".", ",") : "",
    amountMax: it?.amount_max != null ? String(it.amount_max).replace(".", ",") : "",
    varies: it?.tipologia === "variabile" && it.amount_max != null,
    frequency,
    dueDay: it?.due_day ? String(it.due_day) : "",
    dueMonth: it?.due_month ?? null,
    categoryId: it?.category_id ?? "",
    keyword: it?.match_keywords?.[0] ?? (it?.secondary_name ? ruleKeyword(it.secondary_name) ?? "" : ""),
    secondaryName: it?.secondary_name ?? "",
  };
}

const num = (s: string) => parseAmount(s) ?? NaN;
const inputClass = "border-2 rounded-xl px-4 py-3 text-base bg-background focus:outline-none focus:border-primary transition-colors";

function FixedForm({ userId, items, setItems, transactions, categories, categoryBudgets, editId, onBack }: Props) {
  const editing = editId ? items.find(it => it.id === editId) : undefined;
  const [f, setF] = useState(() => toForm(editing));
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<typeof f>) => setF(prev => ({ ...prev, ...patch }));

  // Tipo: quello scelto a mano, altrimenti dedotto dal nome mentre lo si scrive.
  const catNameOf = (id: string) => categories.find(c => c.id === id)?.name;
  const [groupChoice, setGroupChoice] = useState<FixedGroup | null>(() =>
    editing?.fixed_group && FIXED_GROUPS.some(g => g.key === editing.fixed_group) ? editing.fixed_group as FixedGroup : null);
  const group: FixedGroup = groupChoice ?? guessFixedGroup(f.name, catNameOf(f.categoryId));
  const groupMeta = FIXED_GROUPS.find(g => g.key === group)!;

  const expenseCategories = categories.filter(c => !NOT_EXPENSE_CATEGORIES.has(c.name.toLowerCase()));
  const budget = f.categoryId ? Number(categoryBudgets.find(b => b.category_id === f.categoryId)?.monthly_budget ?? 0) : 0;
  const budgetCat = categories.find(c => c.id === f.categoryId);

  // Senza ricerca propone i movimenti che somigliano al nome, altrimenti i più recenti.
  const candidates = useMemo(() => {
    const q = normalizeText(search || (f.name.trim().length >= 3 ? f.name : ""));
    const expenses = transactions.filter(t => Number(t.amount) < 0);
    if (!q) return expenses.slice(0, 6);
    return expenses.filter(t => normalizeText(`${t.description ?? ""} ${t.merchant ?? ""}`).includes(q)).slice(0, 6);
  }, [transactions, search, f.name]);

  function link(t: Tx) {
    const d = +t.date.slice(8, 10);
    set({
      secondaryName: t.description || t.merchant || "",
      keyword: ruleKeyword(t.description || t.merchant || "") ?? "",
      amount: f.amount || String(Math.abs(Number(t.amount))).replace(".", ","),
      dueDay: f.dueDay || String(d),
      categoryId: f.categoryId || t.category_id || "",
    });
    setSearch("");
  }

  async function save() {
    const amount = num(f.amount);
    const amountMax = f.varies ? num(f.amountMax) : NaN;
    const dueDay = f.dueDay ? parseInt(f.dueDay) : null;
    if (!f.name.trim()) { toast.error("Scrivi un nome."); return; }
    if (isNaN(amount) || amount <= 0) { toast.error("Inserisci l'importo."); return; }
    if (f.varies && (isNaN(amountMax) || amountMax < amount)) { toast.error("L'importo massimo deve essere almeno quello minimo."); return; }
    if (dueDay != null && (isNaN(dueDay) || dueDay < 1 || dueDay > 31)) { toast.error("Il giorno va da 1 a 31."); return; }
    if (f.frequency !== "mensile" && !f.dueMonth) { toast.error("Indica in che mese arriva la prossima."); return; }

    const payload = {
      name: f.name.trim(),
      tipologia: f.varies ? "variabile" : "fissa",
      frequency: f.frequency, custom_days: null,
      amount, amount_max: f.varies ? amountMax : null,
      due_day: dueDay, due_month: f.frequency === "mensile" ? null : f.dueMonth,
      category_id: f.categoryId || null,
      fixed_group: group,
      match_keywords: f.keyword.trim() ? [f.keyword.trim().toLowerCase()] : [],
      matching_strategy: "keyword",
      secondary_name: f.secondaryName || null,
      next_due_date: null, saving_start_date: null,
    };
    setSaving(true);
    const supabase = createClient();
    const { data, error } = editing
      ? await supabase.from("recurring_expenses").update(payload).eq("id", editing.id).select("*").single()
      : await supabase.from("recurring_expenses").insert({ user_id: userId, notes: null, ...payload }).select("*").single();
    setSaving(false);
    if (error) { toast.error(`Errore: ${error.message}`); return; }
    setItems(prev => editing ? prev.map(it => it.id === editing.id ? data as FixedItem : it) : [...prev, data as FixedItem]);
    toast.success(editing ? "Modificata!" : "Aggiunta!");
    onBack();
  }

  const expected = expectedAmount({ tipologia: f.varies ? "variabile" : "fissa", amount: num(f.amount) || 0, amount_max: f.varies ? num(f.amountMax) || null : null });

  return (
    <div className="flex flex-col gap-6 max-w-md mx-auto w-full">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">← Indietro</button>
        <h1 className="text-xl font-bold">{editing ? "Modifica spesa fissa" : "Nuova spesa fissa"}</h1>
      </div>

      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Nome</label>
          <input type="text" value={f.name} onChange={e => set({ name: e.target.value })}
            placeholder="es. Affitto, Telefono, Netflix, Luce" className={inputClass} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Tipo</label>
          <div className="grid grid-cols-3 gap-2">
            {FIXED_GROUPS.map(g => (
              <button key={g.key} type="button" onClick={() => setGroupChoice(g.key)}
                className={`rounded-xl border-2 px-2 py-2 text-sm flex flex-col items-center gap-0.5 transition-all ${group === g.key ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}>
                <span className="text-lg leading-none">{g.icon}</span>
                {g.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {!groupChoice && f.name.trim() ? "Scelto dal nome, tocca per cambiarlo. " : ""}
            {groupMeta.hint && `${groupMeta.label}: ${groupMeta.hint}.`}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">{f.varies ? "Importo, da… a…" : "Importo (€)"}</label>
          <div className="flex items-center gap-2">
            <input type="text" inputMode="decimal" value={f.amount} onChange={e => set({ amount: e.target.value })}
              placeholder={f.varies ? "min" : "es. 13,99"} className={`${inputClass} flex-1 min-w-0`} />
            {f.varies && (
              <>
                <span className="text-muted-foreground">–</span>
                <input type="text" inputMode="decimal" value={f.amountMax} onChange={e => set({ amountMax: e.target.value })}
                  placeholder="max" className={`${inputClass} flex-1 min-w-0`} />
              </>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
            <input type="checkbox" checked={f.varies} onChange={e => set({ varies: e.target.checked })} className="size-4" />
            L&apos;importo cambia ogni volta (es. bollette)
          </label>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Ogni quanto</label>
          <div className="flex flex-wrap gap-2">
            {FREQS.map(o => (
              <button key={o.value} type="button" onClick={() => set({ frequency: o.value })}
                className={`rounded-xl border-2 px-3 py-2 text-sm transition-all ${f.frequency === o.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}>
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {f.frequency !== "mensile" && (
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">In che mese arriva la prossima?</label>
            <div className="grid grid-cols-6 gap-1.5">
              {MONTHS.map(m => (
                <button key={m} type="button" onClick={() => set({ dueMonth: m })}
                  className={`rounded-lg py-2 text-sm capitalize transition-all ${f.dueMonth === m ? "bg-primary text-primary-foreground" : "border hover:bg-muted/50"}`}>
                  {monthShort(m)}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Così Flusso la conta per intero nel mese in cui arriva, non un po&apos; ogni mese.</p>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">
            Giorno del mese <span className="text-muted-foreground font-normal">— più o meno, facoltativo</span>
          </label>
          <input type="number" min={1} max={31} value={f.dueDay} onChange={e => set({ dueDay: e.target.value })}
            placeholder="es. 10" className={inputClass} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Categoria <span className="text-muted-foreground font-normal">— facoltativa</span></label>
          <select value={f.categoryId} onChange={e => set({ categoryId: e.target.value })} className={inputClass}>
            <option value="">Nessuna</option>
            {expenseCategories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </select>
          {budget > 0 && budgetCat && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Hai anche un budget di {formatEuro(budget)} per {budgetCat.name}: se ci avevi messo dentro questa spesa, abbassalo
              {expected > 0 ? ` di ${formatEuro(expected)}` : ""}, altrimenti la conti due volte.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium">Collega a un movimento</label>
          <p className="text-xs text-muted-foreground -mt-1">Scegli un pagamento passato: Flusso riconoscerà da solo i prossimi e ti dirà quando è pagata.</p>
          {f.secondaryName || f.keyword ? (
            <div className="rounded-xl border-2 border-primary/40 bg-primary/5 px-4 py-3 flex flex-col gap-2">
              <div className="flex items-start gap-3">
                <p className="text-sm font-medium flex-1 min-w-0 break-words">{f.secondaryName || "Riconosciuta per parola chiave"}</p>
                <button type="button" onClick={() => set({ secondaryName: "", keyword: "" })}
                  className="text-xs text-muted-foreground hover:text-destructive transition-colors shrink-0">✕ Scollega</button>
              </div>
              <label className="text-xs text-muted-foreground flex items-center gap-2">
                La riconosce dalla parola
                <input type="text" value={f.keyword} onChange={e => set({ keyword: e.target.value })}
                  className="border rounded-md px-2 py-1 text-sm bg-background w-36 focus:outline-none focus:border-primary" />
              </label>
            </div>
          ) : (
            <>
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Cerca tra i movimenti…" className={inputClass} />
              <div className="flex flex-col gap-1">
                {candidates.map((t, i) => (
                  <button key={t.id ?? i} type="button" onClick={() => link(t)}
                    className="text-left px-3 py-2.5 rounded-xl border hover:bg-muted/50 transition-colors flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{t.description || t.merchant}</p>
                      <p className="text-xs text-muted-foreground">{formatEuro(Math.abs(Number(t.amount)))} · {fmtDay(t.date)}</p>
                    </div>
                    <span className="text-xs text-primary shrink-0">Collega →</span>
                  </button>
                ))}
                {candidates.length === 0 && <p className="text-xs text-muted-foreground px-1">Nessun movimento trovato.</p>}
              </div>
            </>
          )}
        </div>
      </div>

      <button onClick={save} disabled={saving}
        className="bg-primary text-primary-foreground rounded-xl px-6 py-3 font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors">
        {saving ? "Salvataggio…" : editing ? "Salva modifiche" : "Aggiungi"}
      </button>
    </div>
  );
}
