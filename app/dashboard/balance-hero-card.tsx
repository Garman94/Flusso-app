"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  formatEuro,
  recurringMonthlyEquivalent,
  txMatchesKeywords,
  estimateMonthlyExpenses,
  aggregateExpectedIncome,
  hasIncomeInfo,
  normalizeMonthlyIncome,
  type IncomeInfo,
  type MonthlyExpenseEstimate,
} from "@/lib/calculations";
import { updateStartingBalance } from "./saldo-action";
import { toast } from "sonner";

const INCOME_COLS = "income_type, monthly_income, income_frequency, income_payday, income_variability, active_months";
const TRANSFER_CATS = new Set(["spostamenti", "salvadanaio"]);

type RecurringRow = {
  id: string;
  name: string;
  tipologia: "fissa" | "variabile" | "entrata";
  frequency: string;
  custom_days: number | null;
  amount: number;
  amount_max: number | null;
  match_keywords: string[];
  category_id: string | null;
};

type Tx = {
  amount: number; date: string;
  description?: string | null; merchant?: string | null; category_id?: string | null;
  categories?: { name: string } | null;
};

type MemberIncome = Partial<IncomeInfo> & { name: string };

type Props = {
  userId: string;
  periodFrom: string;
  periodTo: string;
  piggyBalance: number;
};

type ExpandKey =
  | "saldo" | "spese" | "entrate"
  | "saldo-previsto" | "spese-previste" | "spese-variabili" | "entrate-previste"
  | "delta-saldo" | "delta-spese" | "delta-entrate";

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

function StatButton({
  label, value, valueClassName, open, onClick,
}: {
  label: string; value: string; valueClassName: string; open: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="flex flex-col gap-0.5 text-left hover:opacity-80 transition-opacity">
      <span className="text-[11px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
        {label} <Chevron open={open} />
      </span>
      <span className={valueClassName}>{value}</span>
    </button>
  );
}

function TxRow({ t }: { t: Tx }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 border-b last:border-b-0 hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {new Date(t.date + "T00:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "short" })}
        </span>
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

// ─── Main ────────────────────────────────────────────────────────────────────
export function BalanceHeroCard({ userId, periodFrom, periodTo, piggyBalance }: Props) {
  const [loading, setLoading] = useState(true);
  const [startingBalance, setStartingBalance] = useState<number | null>(null);
  const [items, setItems] = useState<RecurringRow[]>([]);
  const [periodTxs, setPeriodTxs] = useState<Tx[]>([]);
  const [historyTxs, setHistoryTxs] = useState<Tx[]>([]);
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
    const now = new Date();
    // Storico necessario per la stima spese variabili: ultimi 3 mesi + stesso mese anno scorso.
    const historyFrom = new Date(now.getFullYear() - 1, now.getMonth(), 1).toISOString().split("T")[0];

    Promise.all([
      supabase.from("profiles").select(`period_starting_balance, period_starting_balance_date, ${INCOME_COLS}`).eq("id", userId).single(),
      supabase.from("recurring_expenses")
        .select("id, name, tipologia, frequency, custom_days, amount, amount_max, match_keywords, category_id")
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
      supabase.from("family_members").select(`name, ${INCOME_COLS}`).eq("user_id", userId),
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
      setMembersIncome((memRes.data ?? []) as MemberIncome[]);
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
    const expenseTxs = spendableTxs.filter(t => Number(t.amount) < 0);
    const incomeTxs  = spendableTxs.filter(t => Number(t.amount) > 0);
    const income      = incomeTxs.reduce((s, t) => s + Number(t.amount), 0);
    const expensesAbs = expenseTxs.reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
    const actualToday = startingBalance + txSumToToday;

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
    const variableMonthsDetail: { label: string; total: number }[] = [];
    for (let i = 1; i <= 3; i++) {
      const d = new Date(calYear, calMonth - i, 1);
      const r = variableTotalForMonth(d.getFullYear(), d.getMonth());
      if (r.hasData) {
        variableMonthlyTotals.push(r.total);
        variableMonthsDetail.push({ label: d.toLocaleDateString("it-IT", { month: "long", year: "numeric" }), total: r.total });
      }
    }
    const lastYear = variableTotalForMonth(calYear - 1, calMonth);
    const sameMonthLastYearTotal = lastYear.hasData ? lastYear.total : null;
    const sameMonthLastYearLabel = lastYear.hasData
      ? new Date(calYear - 1, calMonth, 1).toLocaleDateString("it-IT", { month: "long", year: "numeric" })
      : null;

    const estimate = estimateMonthlyExpenses(fixedTotal, variableMonthlyTotals, sameMonthLastYearTotal);
    const specePreviste = estimate.fixedTotal + estimate.variableAvg;
    const entratePreviste = aggregateExpectedIncome(ownerIncome, membersIncome, calMonth + 1);
    const saldoFineMeseStimato = entratePreviste - specePreviste;

    return {
      income, expensesAbs, incomeTxs, expenseTxs,
      actualToday, estimate, fixedItems,
      variableMonthsDetail, sameMonthLastYearTotal, sameMonthLastYearLabel,
      specePreviste, entratePreviste, saldoFineMeseStimato,
      deltaSaldo: saldoFineMeseStimato - actualToday,
      deltaSpese: specePreviste - expensesAbs,
      deltaEntrate: entratePreviste - income,
      calMonth: calMonth + 1,
    };
  }, [startingBalance, items, periodTxs, historyTxs, ownerIncome, membersIncome, txSumToToday]);

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
    income, expensesAbs, incomeTxs, expenseTxs,
    actualToday, estimate, fixedItems,
    variableMonthsDetail, sameMonthLastYearTotal, sameMonthLastYearLabel,
    specePreviste, entratePreviste, saldoFineMeseStimato,
    deltaSaldo, deltaSpese, deltaEntrate, calMonth,
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

  const periodStartLabel = new Date(periodFrom + "T00:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "short" });
  const incomeSources = [
    { name: "Tu", amount: hasIncomeInfo(ownerIncome) ? normalizeMonthlyIncome(ownerIncome, calMonth) : 0 },
    ...membersIncome
      .filter(m => hasIncomeInfo(m))
      .map(m => ({ name: m.name, amount: normalizeMonthlyIncome(m, calMonth) })),
  ].filter(s => s.amount > 0);

  return (
    <div data-tour="hero" className="rounded-xl border p-4 sm:p-6 flex flex-col gap-5">

      {/* Row 1 — effettivi */}
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <StatButton
          label="Saldo attuale stimato"
          value={formatEuro(actualToday)}
          valueClassName="text-3xl sm:text-4xl font-bold tabular-nums"
          open={expanded === "saldo"}
          onClick={() => toggle("saldo")}
        />
        <StatButton
          label="Spese affrontate"
          value={formatEuro(expensesAbs)}
          valueClassName="text-lg sm:text-xl font-bold tabular-nums text-red-500"
          open={expanded === "spese"}
          onClick={() => toggle("spese")}
        />
        <StatButton
          label="Entrate effettive"
          value={formatEuro(income)}
          valueClassName="text-lg sm:text-xl font-bold tabular-nums text-green-600 dark:text-green-400"
          open={expanded === "entrate"}
          onClick={() => toggle("entrate")}
        />
        <button
          onClick={() => setEditing(true)}
          className="ml-auto text-xs text-muted-foreground hover:text-foreground underline"
        >
          Modifica
        </button>
      </div>

      {expanded === "saldo" && (
        <div className="flex flex-col gap-2 -mt-2">
          <p className="text-xs text-muted-foreground">
            Saldo a inizio periodo ({periodStartLabel}): <strong className="text-foreground tabular-nums">{formatEuro(startingBalance)}</strong> + movimenti fino a oggi
          </p>
          <TxListPanel txs={periodTxs.filter(t => t.date <= iso)} emptyLabel="Nessun movimento registrato fino a oggi." />
        </div>
      )}
      {expanded === "spese" && (
        <div className="-mt-2">
          <TxListPanel txs={expenseTxs} emptyLabel="Nessuna spesa questo periodo." />
        </div>
      )}
      {expanded === "entrate" && (
        <div className="-mt-2">
          <TxListPanel txs={incomeTxs} emptyLabel="Nessuna entrata questo periodo." />
        </div>
      )}

      {/* Row 2 — previsti (mese corrente) */}
      <div className="flex flex-wrap items-start gap-x-5 gap-y-2 pt-3 border-t">
        <StatButton
          label="Saldo fine mese stimato"
          value={formatEuro(saldoFineMeseStimato)}
          valueClassName="text-lg sm:text-xl font-semibold tabular-nums"
          open={expanded === "saldo-previsto"}
          onClick={() => toggle("saldo-previsto")}
        />
        <StatButton
          label="Spese previste"
          value={formatEuro(specePreviste)}
          valueClassName="text-sm sm:text-base font-semibold tabular-nums text-red-500"
          open={expanded === "spese-previste"}
          onClick={() => toggle("spese-previste")}
        />
        <StatButton
          label="Spese variabili"
          value={formatEuro(estimate.variableAvg)}
          valueClassName="text-sm sm:text-base font-semibold tabular-nums text-red-500"
          open={expanded === "spese-variabili"}
          onClick={() => toggle("spese-variabili")}
        />
        <StatButton
          label="Entrate da stipendio previste"
          value={formatEuro(entratePreviste)}
          valueClassName="text-sm sm:text-base font-semibold tabular-nums text-green-600 dark:text-green-400"
          open={expanded === "entrate-previste"}
          onClick={() => toggle("entrate-previste")}
        />
      </div>

      {expanded === "saldo-previsto" && (
        <div className="rounded-lg border bg-muted/30 px-3 py-2 flex flex-col gap-1 text-xs -mt-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Entrate da stipendio previste</span>
            <span className="font-medium tabular-nums text-green-600 dark:text-green-400">{formatEuro(entratePreviste)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">− Spese previste</span>
            <span className="font-medium tabular-nums text-red-500">{formatEuro(specePreviste)}</span>
          </div>
          <div className="flex justify-between pt-1 mt-1 border-t">
            <span className="font-medium">= Saldo fine mese stimato</span>
            <span className="font-semibold tabular-nums">{formatEuro(saldoFineMeseStimato)}</span>
          </div>
        </div>
      )}
      {expanded === "spese-previste" && (
        <SpesePreviste estimate={estimate} fixedItems={fixedItems} />
      )}
      {expanded === "spese-variabili" && (
        <div className="rounded-lg border bg-muted/30 px-3 py-2 flex flex-col gap-1 text-xs -mt-1">
          {variableMonthsDetail.length === 0 ? (
            <p className="text-muted-foreground">Storico insufficiente per una stima.</p>
          ) : variableMonthsDetail.map((m, i) => (
            <div key={i} className="flex justify-between">
              <span className="text-muted-foreground capitalize">{m.label}</span>
              <span className="tabular-nums">{formatEuro(m.total)}</span>
            </div>
          ))}
          {sameMonthLastYearTotal != null && (
            <div className="flex justify-between pt-1 border-t">
              <span className="text-muted-foreground capitalize">{sameMonthLastYearLabel} (anno scorso, peso 40%)</span>
              <span className="tabular-nums">{formatEuro(sameMonthLastYearTotal)}</span>
            </div>
          )}
          <div className="flex justify-between pt-1 border-t">
            <span className="font-medium">Media stimata</span>
            <span className="font-semibold tabular-nums">{formatEuro(estimate.variableAvg)}</span>
          </div>
          <p className="text-muted-foreground">Range {formatEuro(estimate.variableMin)} – {formatEuro(estimate.variableMax)}.</p>
        </div>
      )}
      {expanded === "entrate-previste" && (
        <div className="rounded-lg border bg-muted/30 overflow-hidden -mt-1">
          {incomeSources.length === 0 ? (
            <p className="text-xs text-muted-foreground px-3 py-2">
              Nessun reddito compilato — vai in Account → Il tuo reddito.
            </p>
          ) : incomeSources.map((s, i) => (
            <div key={i} className="flex items-center justify-between px-3 py-2 border-b last:border-b-0 text-xs">
              <span>{s.name}</span>
              <span className="font-semibold tabular-nums text-green-600 dark:text-green-400">{formatEuro(s.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Row 3 — differenze previsto/effettivo */}
      <div className="flex flex-wrap items-start gap-x-5 gap-y-2 pt-3 border-t">
        <DeltaStatButton
          label="Differenza saldo"
          value={deltaSaldo}
          open={expanded === "delta-saldo"}
          onClick={() => toggle("delta-saldo")}
        />
        <DeltaStatButton
          label="Differenza spese"
          value={deltaSpese}
          open={expanded === "delta-spese"}
          onClick={() => toggle("delta-spese")}
        />
        <DeltaStatButton
          label="Differenza entrate"
          value={deltaEntrate}
          open={expanded === "delta-entrate"}
          onClick={() => toggle("delta-entrate")}
        />
      </div>

      {expanded === "delta-saldo" && (
        <DeltaDetail previstoLabel="Saldo fine mese stimato" previsto={saldoFineMeseStimato} effettivoLabel="Saldo attuale stimato" effettivo={actualToday} delta={deltaSaldo} />
      )}
      {expanded === "delta-spese" && (
        <DeltaDetail previstoLabel="Spese previste" previsto={specePreviste} effettivoLabel="Spese affrontate" effettivo={expensesAbs} delta={deltaSpese} />
      )}
      {expanded === "delta-entrate" && (
        <DeltaDetail previstoLabel="Entrate da stipendio previste" previsto={entratePreviste} effettivoLabel="Entrate effettive" effettivo={income} delta={deltaEntrate} />
      )}

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

function SpesePreviste({ estimate, fixedItems }: { estimate: MonthlyExpenseEstimate; fixedItems: RecurringRow[] }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2 flex flex-col gap-1 text-xs -mt-1">
      <div className="flex justify-between">
        <span className="text-muted-foreground">Spese fisse (certe)</span>
        <span className="font-medium tabular-nums">{formatEuro(estimate.fixedTotal)}</span>
      </div>
      {fixedItems.map(it => (
        <div key={it.id} className="flex justify-between pl-3 text-muted-foreground">
          <span className="truncate">{it.name}</span>
          <span className="tabular-nums">{formatEuro(recurringMonthlyEquivalent(it))}</span>
        </div>
      ))}
      <div className="flex justify-between pt-1 border-t">
        <span className="text-muted-foreground">+ Spese variabili (stimate)</span>
        <span className="font-medium tabular-nums">{formatEuro(estimate.variableAvg)}</span>
      </div>
      <div className="flex justify-between pt-1 border-t">
        <span className="font-medium">= Spese previste</span>
        <span className="font-semibold tabular-nums">{formatEuro(estimate.fixedTotal + estimate.variableAvg)}</span>
      </div>
    </div>
  );
}

function DeltaStatButton({
  label, value, open, onClick,
}: { label: string; value: number; open: boolean; onClick: () => void }) {
  return (
    <StatButton
      label={label}
      value={formatEuro(value)}
      valueClassName={`text-sm sm:text-base font-semibold tabular-nums ${value >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500"}`}
      open={open}
      onClick={onClick}
    />
  );
}

function DeltaDetail({
  previstoLabel, previsto, effettivoLabel, effettivo, delta,
}: { previstoLabel: string; previsto: number; effettivoLabel: string; effettivo: number; delta: number }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2 flex flex-col gap-1 text-xs -mt-1">
      <div className="flex justify-between">
        <span className="text-muted-foreground">{previstoLabel} (previsto)</span>
        <span className="font-medium tabular-nums">{formatEuro(previsto)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">{effettivoLabel} (effettivo)</span>
        <span className="font-medium tabular-nums">{formatEuro(effettivo)}</span>
      </div>
      <div className="flex justify-between pt-1 border-t">
        <span className="font-medium">Differenza</span>
        <span className={`font-semibold tabular-nums ${delta >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
          {formatEuro(delta)}
        </span>
      </div>
    </div>
  );
}
