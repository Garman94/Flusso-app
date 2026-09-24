"use client";

import { todayISO } from "@/lib/dates";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  formatEuro,
  aggregateExpectedIncome,
  hasIncomeInfo,
  normalizeMonthlyIncome,
  aggregateSinkingFunds,
  computeDebtProgress,
  isTransferCategory,
  rollBalance,
  projectPeriodEnd,
  type IncomeInfo,
  type SinkingFundInput,
} from "@/lib/calculations";
import { parseAmount } from "@/lib/import-parse";
import { isFixedExpense, planStatus, splitPlan, type PlanItem } from "@/lib/fixed-expenses";
import { updateStartingBalance } from "./saldo-action";
import { toast } from "sonner";

// Card principale della dashboard. Tre domande, in quest'ordine:
//   1. quanto ho oggi?            → Saldo di oggi
//   2. quanto avrò a fine periodo? → saldo di oggi + entrate ancora attese − spese ancora previste
//      (le spese fisse e le rate ancora da pagare si tolgono a parte: vedi splitPlan)
//   3. come sto andando?          → barre "speso X di Y" e "ricevuto X di Y"
// Prima c'erano 9 numeri in tre righe, e "Saldo fine mese stimato" era in realtà
// entrate previste − spese previste (il risparmio del mese, non un saldo): confrontato col
// saldo reale dava differenze senza senso. Vedi projectPeriodEnd in lib/calculations.ts.

const INCOME_COLS = "income_type, monthly_income, income_frequency, income_payday, income_variability, active_months";
const PAGE = 1000;

type RecurringRow = {
  id: string;
  name: string;
  tipologia: "fissa" | "variabile" | "entrata";
  frequency: string;
  custom_days: number | null;
  amount: number;
  amount_max: number | null;
  next_due_date: string | null;
  saving_start_date: string | null;
  debt_type: string | null;
  debt_total_amount: number | null;
  debt_start_date: string | null;
  due_day: number | null;
  due_month: number | null;
  match_keywords: string[] | null;
  secondary_name: string | null;
  end_date: string | null;
  last_paid_date: string | null;
};

type Tx = {
  amount: number; date: string;
  description?: string | null; merchant?: string | null;
  member_id?: string | null;
  categories?: { name: string } | null;
};

type MemberIncome = Partial<IncomeInfo> & { id: string; name: string; color: string; is_owner: boolean };

type Props = {
  userId: string;
  periodFrom: string;
  periodTo: string;
  piggyBalance: number;
};

type ExpandKey = "saldo" | "fine" | "spese" | "entrate";

const isTransfer = (t: Tx) => isTransferCategory(t.categories?.name);

const fmtDay = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "short" });

/** Movimenti (data, importo) in [from, to): a pagine, per non fermarsi al limite di 1000 righe. */
async function fetchAmounts(userId: string, from: string, to: string): Promise<{ date: string; amount: number }[]> {
  const supabase = createClient();
  const out: { date: string; amount: number }[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from("transactions")
      .select("date, amount")
      .eq("user_id", userId)
      .gte("date", from)
      .lt("date", to)
      .order("date", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error || !data) break;
    out.push(...(data as { date: string; amount: number }[]));
    if (data.length < PAGE) break;
  }
  return out;
}

// ─── Setup: primo utilizzo / correzione ─────────────────────────────────────
// L'utente inserisce il saldo che ha OGGI sul conto. Per ancorare la proiezione
// all'inizio del periodo sottraiamo le transazioni gia' registrate nel periodo
// (periodFrom → oggi), cosi' `period_starting_balance` resta il saldo a periodFrom.
// Nei periodi successivi il saldo si riporta da solo (rollBalance): va reinserito
// solo per correggerlo.
function SetupForm({
  periodFrom,
  txSumInPeriod,
  initialValue,
  onSaved,
  onCancel,
}: {
  periodFrom: string;
  txSumInPeriod: number;
  initialValue?: number;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const [value, setValue] = useState(
    initialValue != null ? initialValue.toFixed(2).replace(".", ",") : ""
  );
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const today = parseAmount(value);
    if (today === null) {
      toast.error("Importo non valido.");
      return;
    }
    setSaving(true);
    const atPeriodStart = today - txSumInPeriod;
    const fd = new FormData();
    fd.set("starting_balance", String(atPeriodStart));
    fd.set("start_date", periodFrom);
    const res = await updateStartingBalance(fd);
    if (res?.error) {
      toast.error(res.error);
    } else {
      toast.success("Saldo aggiornato!");
      onSaved();
    }
    setSaving(false);
  }

  return (
    <div data-tour="hero" className="rounded-xl border p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-xl">🏦</span>
        <h2 className="font-semibold">Quanto hai oggi sul conto?</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Guarda l&apos;app della banca e scrivi il saldo di oggi. Basta farlo una volta:
        da lì in poi Flusso lo aggiorna da solo con i movimenti che carichi.
      </p>
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder="Es. 1.913,00"
          inputMode="decimal"
          className="border rounded-md px-3 py-2 text-sm bg-background w-40 focus:outline-none focus:ring-2 focus:ring-primary"
          autoFocus
        />
        <button
          type="submit"
          disabled={saving || !value}
          className="text-sm bg-primary text-primary-foreground rounded-md px-4 py-2 hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {saving ? "..." : "Salva"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-sm text-muted-foreground px-2 hover:text-foreground">
            Annulla
          </button>
        )}
      </form>
    </div>
  );
}

// ─── UI helpers ──────────────────────────────────────────────────────────────
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2.5}
      className={`text-muted-foreground transition-transform duration-200 shrink-0 ${open ? "rotate-180" : ""}`}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function TxRow({ t }: { t: Tx }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 border-b last:border-b-0 hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-xs text-muted-foreground whitespace-nowrap">{fmtDay(t.date)}</span>
        <span className="text-xs truncate">{t.description || t.merchant || "Transazione"}</span>
      </div>
      <span className={`text-xs font-semibold tabular-nums whitespace-nowrap ml-3 ${Number(t.amount) < 0 ? "text-red-500" : "text-green-600 dark:text-green-400"}`}>
        {Number(t.amount) >= 0 ? "+" : ""}{formatEuro(Number(t.amount))}
      </span>
    </div>
  );
}

function TxListPanel({ txs, emptyLabel }: { txs: Tx[]; emptyLabel: string }) {
  const sorted = [...txs].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="rounded-lg border bg-muted/30 overflow-hidden max-h-64 overflow-y-auto">
      {sorted.length === 0 ? (
        <p className="text-xs text-muted-foreground px-3 py-2">{emptyLabel}</p>
      ) : sorted.map((t, i) => <TxRow key={i} t={t} />)}
    </div>
  );
}

function Line({ label, value, strong, className = "" }: { label: string; value: string; strong?: boolean; className?: string }) {
  return (
    <div className={`flex justify-between gap-3 ${className}`}>
      <span className={strong ? "font-medium" : "text-muted-foreground"}>{label}</span>
      <span className={`tabular-nums ${strong ? "font-semibold" : "font-medium"}`}>{value}</span>
    </div>
  );
}

/** Barra "fatto X di Y previsti", toccabile per aprire il dettaglio. */
function ProgressStat({
  label, done, planned, color, hint, open, onClick,
}: {
  label: string; done: number; planned: number; color: "red" | "green";
  hint: React.ReactNode; open: boolean; onClick: () => void;
}) {
  const pct = planned > 0 ? Math.min(100, (done / planned) * 100) : 0;
  const over = planned > 0 && done > planned;
  const bar = color === "red" ? (over ? "bg-red-600" : "bg-red-400") : "bg-green-500";
  return (
    <button onClick={onClick} className="flex flex-col gap-1.5 text-left w-full hover:opacity-90 transition-opacity">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium flex items-center gap-1">{label} <Chevron open={open} /></span>
        <span className="text-sm tabular-nums">
          <strong>{formatEuro(done)}</strong>
          {planned > 0 && <span className="text-muted-foreground"> di {formatEuro(planned)}</span>}
        </span>
      </div>
      {planned > 0 && (
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${bar}`} style={{ width: `${pct}%` }} />
        </div>
      )}
      <span className="text-xs text-muted-foreground">{hint}</span>
    </button>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────
export function BalanceHeroCard({ userId, periodFrom, periodTo, piggyBalance }: Props) {
  const [loading, setLoading] = useState(true);
  const [startingBalance, setStartingBalance] = useState<number | null>(null);
  /** data dell'ultimo saldo inserito a mano, se il saldo di questo periodo è stato riportato */
  const [carriedFrom, setCarriedFrom] = useState<string | null>(null);
  const [items, setItems] = useState<RecurringRow[]>([]);
  const [periodTxs, setPeriodTxs] = useState<Tx[]>([]);
  const [budgetTotal, setBudgetTotal] = useState(0);
  const [ownerIncome, setOwnerIncome] = useState<Partial<IncomeInfo> | null>(null);
  const [membersIncome, setMembersIncome] = useState<MemberIncome[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState<ExpandKey | null>(null);

  function toggle(key: ExpandKey) {
    setExpanded(k => k === key ? null : key);
  }

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    (async () => {
      const [profileRes, recRes, periodTxRes, memRes, budgetRes] = await Promise.all([
        supabase.from("profiles").select(`period_starting_balance, period_starting_balance_date, ${INCOME_COLS}`).eq("id", userId).single(),
        supabase.from("recurring_expenses")
          .select("id, name, tipologia, frequency, custom_days, amount, amount_max, next_due_date, saving_start_date, debt_type, debt_total_amount, debt_start_date, due_day, due_month, match_keywords, secondary_name, end_date, last_paid_date")
          .eq("user_id", userId),
        // Filtro per data: senza, il limite di default di 1000 righe potrebbe tagliare il periodo corrente.
        supabase.from("transactions")
          .select("amount, date, description, merchant, member_id, categories(name)")
          .eq("user_id", userId).gte("date", periodFrom).lte("date", periodTo),
        supabase.from("family_members").select(`id, name, color, is_owner, ${INCOME_COLS}`).eq("user_id", userId),
        // categories(name) per escludere "Accantonamenti": quella quota è già contata
        // separatamente via aggregateSinkingFunds, sommarla anche qui la conterebbe due volte.
        supabase.from("category_budgets").select("monthly_budget, categories(name)").eq("user_id", userId),
      ]);

      // Saldo a inizio periodo: quello inserito per questo periodo, oppure l'ultimo inserito
      // riportato in avanti con i movimenti registrati nel frattempo.
      const known = profileRes.data?.period_starting_balance;
      const knownDate = profileRes.data?.period_starting_balance_date as string | null | undefined;
      let start: number | null = null;
      let carried: string | null = null;
      if (known != null && knownDate) {
        if (knownDate === periodFrom) {
          start = Number(known);
        } else {
          const [from, to] = knownDate < periodFrom ? [knownDate, periodFrom] : [periodFrom, knownDate];
          const gap = await fetchAmounts(userId, from, to);
          start = rollBalance(Number(known), knownDate, periodFrom, gap);
          carried = knownDate;
        }
      }

      if (cancelled) return;
      setStartingBalance(start);
      setCarriedFrom(carried);
      setOwnerIncome((profileRes.data ?? null) as Partial<IncomeInfo> | null);
      setItems((recRes.data ?? []) as RecurringRow[]);
      setPeriodTxs((periodTxRes.data ?? []) as unknown as Tx[]);
      setMembersIncome((memRes.data ?? []) as MemberIncome[]);
      setBudgetTotal((budgetRes.data ?? [])
        .filter(r => (r.categories as unknown as { name: string } | null)?.name?.toLowerCase() !== "accantonamenti")
        .reduce((s, r) => s + Number(r.monthly_budget), 0));
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [userId, periodFrom, periodTo, refreshKey]);

  const iso = todayISO();

  const txSumToToday = useMemo(
    () => periodTxs.filter(t => t.date <= iso).reduce((s, t) => s + Number(t.amount), 0),
    [periodTxs, iso]
  );

  const result = useMemo(() => {
    if (startingBalance == null) return null;

    // ── Effettivi (periodo corrente) ──
    const spendableTxs = periodTxs.filter(t => !isTransfer(t));
    const expenseTxs = spendableTxs.filter(t => Number(t.amount) < 0);
    const incomeTxs  = spendableTxs.filter(t => Number(t.amount) > 0);
    const income      = incomeTxs.reduce((s, t) => s + Number(t.amount), 0);
    const expensesAbs = expenseTxs.reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
    const actualToday = startingBalance + txSumToToday;

    // ── Contributo netto per componente (entrate reali - spese reali, periodo corrente) ──
    const memberMap = new Map<string, { name: string; color: string; income: number; expense: number }>();
    membersIncome.forEach(m => memberMap.set(m.id, { name: m.name, color: m.color, income: 0, expense: 0 }));
    for (const t of spendableTxs) {
      const key = t.member_id ?? "__none__";
      if (!memberMap.has(key)) memberMap.set(key, { name: "Non assegnato", color: "#94a3b8", income: 0, expense: 0 });
      const entry = memberMap.get(key)!;
      if (Number(t.amount) > 0) entry.income += Number(t.amount);
      else entry.expense += Math.abs(Number(t.amount));
    }
    const memberBreakdown = Array.from(memberMap.entries())
      .map(([id, v]) => ({ id, ...v }))
      .filter(m => m.income > 0 || m.expense > 0);

    // ── Previsti: reddito dall'anagrafica (mese in cui inizia il periodo) ──
    const periodMonth = new Date(periodFrom + "T00:00:00").getMonth() + 1;

    // Rate in corso (esclude quelle non ancora iniziate e quelle già terminate).
    const rateItems = items
      .filter(it => it.debt_type && it.debt_total_amount && it.debt_start_date)
      .map(it => ({
        item: it,
        progress: computeDebtProgress({ totalAmount: it.debt_total_amount!, monthlyAmount: it.amount, startDate: it.debt_start_date! }),
      }))
      .filter(r => r.progress.status === "active");
    const rateMonthly = rateItems.reduce((s, r) => s + r.item.amount, 0);

    // Spese fisse (affitto, abbonamenti, bollette) e rate: per ognuna si sa se in questo
    // periodo è già stata pagata. Quelle ancora da pagare si tolgono a parte dalla stima, così
    // "puoi ancora spendere" non comprende l'affitto che deve ancora partire.
    const fixedStatuses = items.filter(isFixedExpense)
      .map(it => planStatus(it as PlanItem, periodTxs, periodFrom, periodTo, iso))
      .filter(st => st.state !== "not-due");
    const rateStatuses = rateItems.map(r => planStatus(r.item as PlanItem, periodTxs, periodFrom, periodTo, iso));
    const plan = splitPlan([...fixedStatuses, ...rateStatuses], t => !isTransfer(t));
    const fixedMonthly = fixedStatuses.reduce((s, st) => s + st.expected, 0);

    // Spese previste = spese fisse + rate in corso + quota mensile accantonamenti + budget
    // per categoria (Pianifica).
    const sinkingInputs: SinkingFundInput[] = items
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
    const sinkingMonthly = aggregateSinkingFunds(sinkingInputs, piggyBalance).this_month_total;
    const spesePreviste = fixedMonthly + rateMonthly + sinkingMonthly + budgetTotal;
    // Il resto delle spese previste, quelle "da spendere": budget, accantonamenti e le voci
    // di cui Flusso non può verificare il pagamento.
    const flexiblePlanned = budgetTotal + sinkingMonthly + plan.flexible;

    // Se il titolare si e' identificato come Componente, il suo reddito e' li' (evita di sommarlo due volte).
    const hasOwnerMember = membersIncome.some(m => m.is_owner);
    const entratePreviste = aggregateExpectedIncome(hasOwnerMember ? null : ownerIncome, membersIncome, periodMonth);

    const projection = projectPeriodEnd({
      balanceToday: actualToday,
      incomeSoFar: income,
      expensesSoFar: expensesAbs - plan.paidSpent,
      expectedIncome: entratePreviste,
      expectedExpenses: flexiblePlanned,
      committedRemaining: plan.remaining,
    });

    return {
      income, expensesAbs, incomeTxs, expenseTxs, memberBreakdown, actualToday,
      rateMonthly, rateItems, sinkingMonthly, spesePreviste, entratePreviste,
      fixedMonthly, fixedStatuses, flexiblePlanned,
      projection, periodMonth, hasOwnerMember,
    };
  }, [startingBalance, items, periodTxs, budgetTotal, ownerIncome, membersIncome, piggyBalance, txSumToToday, periodFrom, periodTo, iso]);

  if (loading) {
    return (
      <div data-tour="hero" className="rounded-xl border p-5 animate-pulse">
        <div className="h-4 w-56 bg-muted rounded mb-4" />
        <div className="h-24 w-full bg-muted/60 rounded" />
      </div>
    );
  }

  if (startingBalance == null || !result) {
    return (
      <SetupForm
        periodFrom={periodFrom}
        txSumInPeriod={txSumToToday}
        onSaved={() => setRefreshKey(k => k + 1)}
      />
    );
  }

  const {
    income, expensesAbs, incomeTxs, expenseTxs, memberBreakdown, actualToday,
    rateMonthly, rateItems, sinkingMonthly, spesePreviste, entratePreviste,
    fixedMonthly, fixedStatuses, flexiblePlanned,
    projection, periodMonth, hasOwnerMember,
  } = result;

  if (editing) {
    return (
      <SetupForm
        periodFrom={periodFrom}
        txSumInPeriod={txSumToToday}
        initialValue={actualToday}
        onSaved={() => { setEditing(false); setRefreshKey(k => k + 1); }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  const hasPlan = spesePreviste > 0;
  const hasIncome = entratePreviste > 0;
  const incomeSources = [
    ...(hasOwnerMember ? [] : [{ name: "Tu", amount: hasIncomeInfo(ownerIncome) ? normalizeMonthlyIncome(ownerIncome, periodMonth) : 0 }]),
    ...membersIncome
      .filter(m => hasIncomeInfo(m))
      .map(m => ({ name: m.is_owner ? `${m.name} (tu)` : m.name, amount: normalizeMonthlyIncome(m, periodMonth) })),
  ].filter(s => s.amount > 0);

  const committed = projection.committedRemaining;
  const spendHint = !hasPlan
    ? <Link href="/dashboard/smart?v=spese-fisse" onClick={e => e.stopPropagation()} className="text-primary hover:underline">Aggiungi le spese fisse (affitto, bollette, abbonamenti) per avere una previsione →</Link>
    : flexiblePlanned <= 0
      // solo spese fisse e rate: senza un budget non si sa quanto si vuole spendere per il resto
      ? <>
          {committed > 0
            ? <>Spese fisse e rate ancora da pagare: <strong className="text-foreground">{formatEuro(committed)}</strong>.</>
            : <>Spese fisse e rate pagate ✓</>}{" "}
          <Link href="/dashboard/smart?v=budget" onClick={e => e.stopPropagation()} className="text-primary hover:underline">Imposta un budget per sapere quanto puoi spendere per il resto →</Link>
        </>
      : projection.leftToSpend >= 0
        ? <>
            Puoi ancora spendere <strong className="text-foreground">{formatEuro(projection.leftToSpend)}</strong> senza uscire dalle previsioni
            {committed > 0 && <> (le spese fisse ancora da pagare, {formatEuro(committed)}, sono già tolte)</>}
          </>
        : <span className="text-red-500">Hai superato le spese previste di <strong>{formatEuro(-projection.leftToSpend)}</strong></span>;

  const incomeHint = !hasIncome
    ? <Link href="/dashboard/account" onClick={e => e.stopPropagation()} className="text-primary hover:underline">Indica il tuo stipendio per la previsione →</Link>
    : projection.remainingIncome > 0
      ? <>Ancora attese: {formatEuro(projection.remainingIncome)}</>
      : <>Entrate previste arrivate ✓</>;

  return (
    <div data-tour="hero" className="rounded-xl border p-4 sm:p-6 flex flex-col gap-5">

      {/* 1 — Saldo di oggi */}
      <div className="flex items-start justify-between gap-3">
        <button onClick={() => toggle("saldo")} className="flex flex-col gap-0.5 text-left hover:opacity-80 transition-opacity">
          <span className="text-xs text-muted-foreground flex items-center gap-1">Saldo di oggi <Chevron open={expanded === "saldo"} /></span>
          <span className="text-3xl sm:text-4xl font-bold tabular-nums">{formatEuro(actualToday)}</span>
        </button>
        <button onClick={() => setEditing(true)} className="text-xs text-muted-foreground hover:text-foreground underline shrink-0 mt-1">
          Correggi
        </button>
      </div>
      {carriedFrom && expanded !== "saldo" && (
        <p className="text-[11px] text-muted-foreground -mt-4">
          Aggiornato da solo con i movimenti dal {fmtDay(carriedFrom)}. Non torna con la banca? Tocca &quot;Correggi&quot;.
        </p>
      )}

      {expanded === "saldo" && (
        <div className="flex flex-col gap-2 -mt-2">
          <div className="rounded-lg border bg-muted/30 px-3 py-2 flex flex-col gap-1 text-xs">
            <Line label={`Saldo a inizio periodo (${fmtDay(periodFrom)})`} value={formatEuro(startingBalance)} />
            <Line label="+ movimenti fino a oggi" value={formatEuro(txSumToToday)} />
            <Line label="= Saldo di oggi" value={formatEuro(actualToday)} strong className="pt-1 border-t" />
            {carriedFrom && (
              <p className="text-muted-foreground pt-1">
                Il saldo a inizio periodo è calcolato dall&apos;ultimo che hai inserito ({fmtDay(carriedFrom)}) più i movimenti caricati da allora.
              </p>
            )}
          </div>
          {memberBreakdown.length > 0 && (
            <div className="rounded-lg border bg-muted/30 px-3 py-2 flex flex-col gap-1.5 text-xs">
              <span className="text-muted-foreground uppercase tracking-wide text-[10px]">
                Contributo netto per componente (questo periodo)
              </span>
              {memberBreakdown.map(m => {
                const net = m.income - m.expense;
                return (
                  <div key={m.id} className="flex flex-col gap-0.5 pt-1.5 border-t first:border-t-0 first:pt-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 min-w-0 font-medium text-foreground">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: m.color }} />
                        <span className="truncate">{m.name}</span>
                      </span>
                      <span className={`font-semibold tabular-nums shrink-0 ${net >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
                        {net >= 0 ? "+" : ""}{formatEuro(net)}
                      </span>
                    </div>
                    <span className="text-muted-foreground pl-3.5">
                      +{formatEuro(m.income)} entrate · -{formatEuro(m.expense)} spese
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <TxListPanel txs={periodTxs.filter(t => t.date <= iso)} emptyLabel="Nessun movimento registrato fino a oggi." />
        </div>
      )}

      {/* 2 — Fine periodo */}
      <div className="pt-4 border-t flex flex-col gap-2">
        {hasPlan || hasIncome ? (
          <button onClick={() => toggle("fine")} className="flex items-baseline justify-between gap-3 text-left hover:opacity-80 transition-opacity">
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              A fine periodo ({fmtDay(periodTo)}) avrai circa <Chevron open={expanded === "fine"} />
            </span>
            <span className={`text-xl font-semibold tabular-nums ${projection.endBalance < 0 ? "text-red-500" : ""}`}>
              {formatEuro(projection.endBalance)}
            </span>
          </button>
        ) : (
          <p className="text-sm text-muted-foreground">
            Per sapere quanto avrai a fine periodo, indica il tuo{" "}
            <Link href="/dashboard/account" className="text-primary hover:underline">stipendio</Link>{" "}
            e{" "}
            <Link href="/dashboard/smart?v=spese-fisse" className="text-primary hover:underline">le spese fisse</Link>.
          </p>
        )}
        {expanded === "fine" && (
          <div className="rounded-lg border bg-muted/30 px-3 py-2 flex flex-col gap-1 text-xs">
            <Line label="Saldo di oggi" value={formatEuro(actualToday)} />
            <Line label="+ entrate ancora attese" value={formatEuro(projection.remainingIncome)} />
            {committed > 0 ? (
              <>
                <Line label="− spese fisse e rate da pagare" value={formatEuro(committed)} />
                <Line label="− altre spese previste" value={formatEuro(projection.remainingExpenses - committed)} />
              </>
            ) : (
              <Line label="− spese ancora previste" value={formatEuro(projection.remainingExpenses)} />
            )}
            <Line label="= Stima a fine periodo" value={formatEuro(projection.endBalance)} strong className="pt-1 border-t" />
            {hasPlan && hasIncome && (
              <p className="text-muted-foreground pt-1">
                In tutto il periodo prevedi di mettere da parte {formatEuro(entratePreviste - spesePreviste)} (entrate previste − spese previste).
              </p>
            )}
          </div>
        )}
      </div>

      {/* 3 — Come stai andando */}
      <div className="flex flex-col gap-4">
        <ProgressStat
          label="Spese" done={expensesAbs} planned={spesePreviste} color="red"
          hint={spendHint} open={expanded === "spese"} onClick={() => toggle("spese")}
        />
        {expanded === "spese" && (
          <div className="flex flex-col gap-2 -mt-2">
            {hasPlan && (
              <div className="rounded-lg border bg-muted/30 px-3 py-2 flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground uppercase tracking-wide text-[10px]">Da dove vengono le spese previste</span>
                {fixedMonthly > 0 && (
                  <>
                    <Line label="Spese fisse" value={formatEuro(fixedMonthly)} />
                    {fixedStatuses.map(st => (
                      <Line key={st.item.id} label={`· ${st.item.name}${st.state === "paid" ? " ✓" : ""}`} value={formatEuro(st.expected)} className="pl-2" />
                    ))}
                  </>
                )}
                <Line label="Rate in corso" value={formatEuro(rateMonthly)} className={fixedMonthly > 0 ? "pt-1 border-t" : ""} />
                {rateItems.map(({ item }) => (
                  <Line key={item.id} label={`· ${item.name}`} value={formatEuro(item.amount)} className="pl-2" />
                ))}
                {sinkingMonthly > 0 && <Line label="Accantonamenti (quota del mese)" value={formatEuro(sinkingMonthly)} className="pt-1 border-t" />}
                <Line label="Budget per categoria" value={formatEuro(budgetTotal)} className="pt-1 border-t" />
                <Line label="= Spese previste" value={formatEuro(spesePreviste)} strong className="pt-1 border-t" />
                <Link href="/dashboard/smart" className="text-primary hover:underline pt-1">Modifica in Pianifica →</Link>
              </div>
            )}
            <TxListPanel txs={expenseTxs} emptyLabel="Nessuna spesa questo periodo." />
          </div>
        )}

        <ProgressStat
          label="Entrate" done={income} planned={entratePreviste} color="green"
          hint={incomeHint} open={expanded === "entrate"} onClick={() => toggle("entrate")}
        />
        {expanded === "entrate" && (
          <div className="flex flex-col gap-2 -mt-2">
            {incomeSources.length > 0 && (
              <div className="rounded-lg border bg-muted/30 overflow-hidden">
                <span className="block text-muted-foreground uppercase tracking-wide text-[10px] px-3 pt-2">Entrate previste</span>
                {incomeSources.map((s, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 border-b last:border-b-0 text-xs">
                    <span>{s.name}</span>
                    <span className="font-semibold tabular-nums text-green-600 dark:text-green-400">{formatEuro(s.amount)}</span>
                  </div>
                ))}
              </div>
            )}
            <TxListPanel txs={incomeTxs} emptyLabel="Nessuna entrata questo periodo." />
          </div>
        )}
      </div>

      {/* Salvadanai */}
      <Link href="/dashboard/salvadanai" className="pt-4 border-t flex items-center justify-between group">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">Messi da parte nei salvadanai 🐷</span>
          <span className="text-lg font-semibold tabular-nums">{formatEuro(piggyBalance)}</span>
        </div>
        <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
          Apri →
        </span>
      </Link>
    </div>
  );
}
