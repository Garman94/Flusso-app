"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  formatEuro,
  calculateDailyBalanceProjection,
  evaluateBalanceHealth,
  findOverdueRecurring,
  recurringMonthlyEquivalent,
  txMatchesKeywords,
  estimateMonthlyExpenses,
  aggregateExpectedIncome,
  type RecurringScheduleItem,
  type OverdueCheckItem,
  type BalanceProjectionDay,
  type IncomeInfo,
} from "@/lib/calculations";
import { updateStartingBalance } from "./saldo-action";
import { toast } from "sonner";

const INCOME_COLS = "income_type, monthly_income, income_frequency, income_payday, income_variability, active_months";
const TRANSFER_CATS = new Set(["spostamenti", "salvadanaio"]);

type RecurringRow = RecurringScheduleItem & OverdueCheckItem & { custom_days: number | null };

type Tx = {
  amount: number; date: string;
  description?: string | null; merchant?: string | null; category_id?: string | null;
  categories?: { name: string } | null;
};

type Props = {
  userId: string;
  periodFrom: string;
  periodTo: string;
  piggyBalance: number;
};

function todayIso() {
  return new Date().toISOString().split("T")[0];
}

function monthBounds(year: number, month: number) {
  const from = new Date(year, month, 1).toISOString().split("T")[0];
  const to = new Date(year, month + 1, 0).toISOString().split("T")[0];
  return { from, to };
}

const isTransfer = (t: Tx) => TRANSFER_CATS.has(t.categories?.name?.toLowerCase() ?? "");

// ─── Setup: primo utilizzo / modifica ───────────────────────────────────────
// L'utente inserisce il saldo che ha OGGI sul conto. Per ancorare la proiezione
// all'inizio del periodo sottraiamo le transazioni gia' registrate nel periodo
// (periodFrom → oggi), cosi' `period_starting_balance` resta il saldo a periodFrom
// e il "saldo reale attuale" non conta due volte stipendio/spese del periodo.
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
    const today = parseFloat(value.replace(",", "."));
    if (isNaN(today)) {
      toast.error("Importo non valido.");
      return;
    }
    setSaving(true);
    // Riporta il saldo di oggi all'inizio del periodo
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
        <span className="text-xl">📈</span>
        <h2 className="font-semibold">Saldo attuale stimato</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Inserisci quanto hai <strong>oggi</strong> sul conto: calcoleremo quanto dovresti
        avere in base alle spese ricorrenti previste e lo confronteremo col saldo reale.
      </p>
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder="Es. 1913,00"
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

// ─── Timeline SVG ────────────────────────────────────────────────────────────
function Timeline({ projection, todayIndex }: { projection: BalanceProjectionDay[]; todayIndex: number }) {
  const [hover, setHover] = useState<number | null>(null);

  const W = 600, H = 140, PAD = 8;
  const values = projection.map(d => d.balance);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const range = max - min || 1;

  const x = (i: number) => PAD + (i / Math.max(1, projection.length - 1)) * (W - PAD * 2);
  const y = (v: number) => H - PAD - ((v - min) / range) * (H - PAD * 2);

  const path = projection.map((d, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(d.balance).toFixed(1)}`).join(" ");

  const activeIdx = hover ?? todayIndex;
  const active = projection[activeIdx];

  return (
    <div className="flex flex-col gap-1">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-32 touch-none"
        onMouseLeave={() => setHover(null)}
        onMouseMove={e => {
          const rect = e.currentTarget.getBoundingClientRect();
          const relX = ((e.clientX - rect.left) / rect.width) * W;
          const idx = Math.round(((relX - PAD) / (W - PAD * 2)) * (projection.length - 1));
          setHover(Math.max(0, Math.min(projection.length - 1, idx)));
        }}
      >
        {/* Zero line se il range attraversa lo zero */}
        {min < 0 && max > 0 && (
          <line x1={PAD} x2={W - PAD} y1={y(0)} y2={y(0)} stroke="currentColor" className="text-muted-foreground/30" strokeDasharray="3 3" />
        )}

        {/* Linea saldo previsto */}
        <path d={path} fill="none" stroke="currentColor" className="text-muted-foreground" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

        {/* Marker eventi (spese/entrate) */}
        {projection.map((d, i) =>
          d.events.map((ev, j) => (
            <circle
              key={`${i}-${j}`}
              cx={x(i)} cy={y(d.balance)} r={3.5}
              className={ev.amount < 0 ? "fill-red-500" : "fill-green-500"}
            />
          ))
        )}

        {/* Oggi */}
        <circle cx={x(todayIndex)} cy={y(projection[todayIndex]?.balance ?? 0)} r={5} className="fill-primary stroke-background" strokeWidth={2} />

        {/* Hover crosshair */}
        {hover != null && (
          <line x1={x(hover)} x2={x(hover)} y1={PAD} y2={H - PAD} stroke="currentColor" className="text-muted-foreground/40" />
        )}
      </svg>

      {active && (
        <div className="flex items-center justify-between text-xs px-1">
          <span className="text-muted-foreground">
            {new Date(active.date + "T00:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "short" })}
            {activeIdx === todayIndex && <span className="text-primary font-medium"> · oggi</span>}
          </span>
          <span className="font-semibold tabular-nums">{formatEuro(active.balance)}</span>
          {active.events.length > 0 && (
            <span className="text-muted-foreground truncate max-w-[50%]">
              {active.events.map(e => e.name).join(", ")}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────
export function BalanceHeroCard({ userId, periodFrom, periodTo, piggyBalance }: Props) {
  const [loading, setLoading] = useState(true);
  const [startingBalance, setStartingBalance] = useState<number | null>(null);
  const [items, setItems] = useState<RecurringRow[]>([]);
  const [periodTxs, setPeriodTxs] = useState<Tx[]>([]);
  const [historyTxs, setHistoryTxs] = useState<Tx[]>([]);
  const [ownerIncome, setOwnerIncome] = useState<Partial<IncomeInfo> | null>(null);
  const [membersIncome, setMembersIncome] = useState<Partial<IncomeInfo>[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const now = new Date();
    // Storico necessario per la stima spese variabili: ultimi 3 mesi + stesso mese anno scorso.
    const historyFrom = new Date(now.getFullYear() - 1, now.getMonth(), 1).toISOString().split("T")[0];

    Promise.all([
      supabase.from("profiles").select(`period_starting_balance, period_starting_balance_date, ${INCOME_COLS}`).eq("id", userId).single(),
      supabase.from("recurring_expenses")
        .select("id, name, tipologia, frequency, custom_days, due_day, due_month, amount, amount_max, next_due_date, last_paid_date, match_keywords, category_id")
        .eq("user_id", userId),
      // Query filtrate per data: senza bound si rischia il limite di default di 1000 righe
      // di Supabase, che senza un ordinamento esplicito puo' tagliare fuori proprio le
      // transazioni del periodo corrente.
      supabase.from("transactions")
        .select("amount, date, description, merchant, category_id, categories(name)")
        .eq("user_id", userId).gte("date", periodFrom).lte("date", periodTo),
      supabase.from("transactions")
        .select("amount, date, description, merchant, category_id, categories(name)")
        .eq("user_id", userId).gte("date", historyFrom).lte("date", periodTo),
      supabase.from("family_members").select(INCOME_COLS).eq("user_id", userId),
    ]).then(([profileRes, recRes, periodTxRes, historyTxRes, memRes]) => {
      const pStart = profileRes.data?.period_starting_balance_date;
      setStartingBalance(
        pStart === periodFrom && profileRes.data?.period_starting_balance != null
          ? Number(profileRes.data.period_starting_balance)
          : null
      );
      setOwnerIncome((profileRes.data ?? null) as Partial<IncomeInfo> | null);
      setItems((recRes.data ?? []) as RecurringRow[]);
      setPeriodTxs((periodTxRes.data ?? []) as unknown as Tx[]);
      setHistoryTxs((historyTxRes.data ?? []) as unknown as Tx[]);
      setMembersIncome((memRes.data ?? []) as Partial<IncomeInfo>[]);
      setLoading(false);
    });
  }, [userId, periodFrom, periodTo, refreshKey]);

  const iso = todayIso();

  const txSumToToday = useMemo(
    () => periodTxs.filter(t => t.date <= iso).reduce((s, t) => s + Number(t.amount), 0),
    [periodTxs, iso]
  );

  const result = useMemo(() => {
    if (startingBalance == null) return null;

    // ── Effettivi (periodo corrente) ──
    const spendableTxs = periodTxs.filter(t => !isTransfer(t));
    const income      = spendableTxs.filter(t => Number(t.amount) > 0).reduce((s, t) => s + Number(t.amount), 0);
    const expensesAbs = spendableTxs.filter(t => Number(t.amount) < 0).reduce((s, t) => s + Math.abs(Number(t.amount)), 0);

    // ── Proiezione giornaliera + saldo reale ──
    const projection = calculateDailyBalanceProjection(startingBalance, items, periodFrom, periodTo);
    let todayIndex = projection.findIndex(d => d.date === iso);
    if (todayIndex === -1) todayIndex = iso < periodFrom ? 0 : projection.length - 1;

    const expectedToday = projection[todayIndex]?.balance ?? startingBalance;
    const actualToday = startingBalance + txSumToToday;

    const health = evaluateBalanceHealth(actualToday, expectedToday);
    const overdue = findOverdueRecurring(items, periodTxs);
    const overdueTotal = overdue.reduce((s, o) => s + o.amount, 0);

    // ── Previsti (mese corrente, reddito da anagrafica) ──
    const now = new Date();
    const calYear = now.getFullYear(), calMonth = now.getMonth();

    const fixedItems = items.filter(it => it.tipologia === "fissa");
    const fixedTotal = fixedItems.reduce((s, it) => s + recurringMonthlyEquivalent(it), 0);
    const isFixedMatch = (t: Tx) => fixedItems.some(it =>
      it.match_keywords.length > 0 ? txMatchesKeywords(t, it.match_keywords) : (it.category_id && it.category_id === t.category_id)
    );

    function variableTotalForMonth(year: number, month: number): { total: number; hasData: boolean } {
      const { from, to } = monthBounds(year, month);
      const monthTxs = historyTxs.filter(t => t.date >= from && t.date <= to);
      const variable = monthTxs.filter(t => Number(t.amount) < 0 && !isTransfer(t) && !isFixedMatch(t));
      return {
        total: variable.reduce((s, t) => s + Math.abs(Number(t.amount)), 0),
        hasData: monthTxs.length > 0,
      };
    }

    const variableMonthlyTotals: number[] = [];
    for (let i = 1; i <= 3; i++) {
      const d = new Date(calYear, calMonth - i, 1);
      const r = variableTotalForMonth(d.getFullYear(), d.getMonth());
      if (r.hasData) variableMonthlyTotals.push(r.total);
    }
    const lastYear = variableTotalForMonth(calYear - 1, calMonth);
    const sameMonthLastYearTotal = lastYear.hasData ? lastYear.total : null;

    const estimate = estimateMonthlyExpenses(fixedTotal, variableMonthlyTotals, sameMonthLastYearTotal);
    const specePreviste = estimate.fixedTotal + estimate.variableAvg;
    const entratePreviste = aggregateExpectedIncome(ownerIncome, membersIncome, calMonth + 1);
    const saldoFineMeseStimato = entratePreviste - specePreviste;

    return {
      income, expensesAbs,
      projection, todayIndex, expectedToday, actualToday, health, overdueTotal,
      specePreviste, entratePreviste, saldoFineMeseStimato,
    };
  }, [startingBalance, items, periodTxs, historyTxs, ownerIncome, membersIncome, periodFrom, periodTo, iso, txSumToToday]);

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
    income, expensesAbs,
    projection, todayIndex, expectedToday, actualToday, health, overdueTotal,
    specePreviste, entratePreviste, saldoFineMeseStimato,
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

  const statusStyle = {
    ahead: { text: "text-green-600 dark:text-green-400", bg: "bg-green-500/10", label: "Sei in linea 👍" },
    green: { text: "text-green-600 dark:text-green-400", bg: "bg-green-500/10", label: "Sei in linea 👍" },
    yellow: { text: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-500/10", label: `Attenzione: hai ${formatEuro(Math.abs(health.diff))} in meno del previsto` },
    red: { text: "text-red-500", bg: "bg-red-500/10", label: `Hai ${formatEuro(Math.abs(health.diff))} in meno del previsto — controlla le spese` },
  }[health.status];

  return (
    <div data-tour="hero" className="rounded-xl border p-4 sm:p-6 flex flex-col gap-5">

      {/* Row 1 — effettivi */}
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">Saldo attuale stimato</span>
          <span className="text-3xl sm:text-4xl font-bold tabular-nums">{formatEuro(actualToday)}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wide">Spese affrontate</span>
          <span className="text-lg sm:text-xl font-bold tabular-nums text-red-500">{formatEuro(expensesAbs)}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wide">Entrate effettive</span>
          <span className="text-lg sm:text-xl font-bold tabular-nums text-green-600 dark:text-green-400">{formatEuro(income)}</span>
        </div>
        <button
          onClick={() => setEditing(true)}
          className="ml-auto text-xs text-muted-foreground hover:text-foreground underline"
        >
          Modifica
        </button>
      </div>

      {/* Row 2 — previsti (mese corrente) */}
      <div className="flex flex-wrap items-start gap-x-5 gap-y-2 pt-3 border-t">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Saldo fine mese stimato</span>
          <span className="text-lg sm:text-xl font-semibold tabular-nums">{formatEuro(saldoFineMeseStimato)}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Spese previste</span>
          <span className="text-sm sm:text-base font-semibold tabular-nums text-red-500">{formatEuro(specePreviste)}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Entrate da stipendio previste</span>
          <span className="text-sm sm:text-base font-semibold tabular-nums text-green-600 dark:text-green-400">{formatEuro(entratePreviste)}</span>
        </div>
      </div>

      {/* Row 3 — delta previsto/effettivo (oggi) */}
      <div className="flex flex-wrap items-center gap-3">
        <div className={`rounded-lg px-3 py-2 text-sm font-medium ${statusStyle.bg} ${statusStyle.text}`}>
          {statusStyle.label}
        </div>
        <span className="text-xs text-muted-foreground">
          Previsto per oggi: <strong className="tabular-nums">{formatEuro(expectedToday)}</strong>
          {overdueTotal > 0 && <> · include {formatEuro(overdueTotal)} di spese non ancora pagate</>}
        </span>
      </div>

      <Timeline projection={projection} todayIndex={todayIndex} />

      <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> spesa prevista</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> entrata prevista</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-primary inline-block" /> oggi</span>
      </div>

      {/* Salvadanai — separato in fondo */}
      <Link href="/dashboard/salvadanai" className="pt-4 mt-1 border-t flex items-center justify-between group">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">Salvadanai 🐷</span>
          <span className="text-xl font-semibold tabular-nums">{formatEuro(piggyBalance)}</span>
        </div>
        <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
          Gestisci i salvadanai →
        </span>
      </Link>
    </div>
  );
}
