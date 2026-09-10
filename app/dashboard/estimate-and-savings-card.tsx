"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  formatEuro,
  recurringMonthlyEquivalent,
  txMatchesKeywords,
  estimateMonthlyExpenses,
  suggestMonthlySavings,
  aggregateExpectedIncome,
  type IncomeInfo,
} from "@/lib/calculations";

const INCOME_COLS = "income_type, monthly_income, income_frequency, income_payday, income_variability, active_months";

type RecurringRow = {
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

type Props = { userId: string; periodFrom: string; periodTo: string };

const TRANSFER_CATS = new Set(["spostamenti", "salvadanaio"]);

function monthBounds(year: number, month: number) {
  const from = new Date(year, month, 1).toISOString().split("T")[0];
  const to = new Date(year, month + 1, 0).toISOString().split("T")[0];
  return { from, to };
}

export function EstimateAndSavingsCard({ userId, periodFrom, periodTo }: Props) {
  const [items, setItems] = useState<RecurringRow[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [ownerIncome, setOwnerIncome] = useState<IncomeInfo | null>(null);
  const [membersIncome, setMembersIncome] = useState<Partial<IncomeInfo>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase.from("recurring_expenses")
        .select("tipologia, frequency, custom_days, amount, amount_max, match_keywords, category_id")
        .eq("user_id", userId),
      supabase.from("transactions")
        .select("amount, date, description, merchant, category_id, categories(name)")
        .eq("user_id", userId),
      supabase.from("profiles").select(INCOME_COLS).eq("id", userId).single(),
      supabase.from("family_members").select(INCOME_COLS).eq("user_id", userId),
    ]).then(([recRes, txRes, profRes, memRes]) => {
      setItems((recRes.data ?? []) as RecurringRow[]);
      setTxs((txRes.data ?? []) as unknown as Tx[]);
      setOwnerIncome((profRes.data ?? null) as IncomeInfo | null);
      setMembersIncome((memRes.data ?? []) as Partial<IncomeInfo>[]);
      setLoading(false);
    });
  }, [userId]);

  const result = useMemo(() => {
    if (loading) return null;
    const now = new Date();
    const calYear = now.getFullYear(), calMonth = now.getMonth();

    const fixedItems = items.filter(it => it.tipologia === "fissa");
    const incomeItems = items.filter(it => it.tipologia === "entrata");
    const fixedTotal = fixedItems.reduce((s, it) => s + recurringMonthlyEquivalent(it), 0);
    const recurringIncomeTotal = incomeItems.reduce((s, it) => s + recurringMonthlyEquivalent(it), 0);

    const isTransfer = (t: Tx) => TRANSFER_CATS.has(t.categories?.name?.toLowerCase() ?? "");
    const isFixedMatch = (t: Tx) => fixedItems.some(it =>
      it.match_keywords.length > 0 ? txMatchesKeywords(t, it.match_keywords) : (it.category_id && it.category_id === t.category_id)
    );

    function variableTotalForMonth(year: number, month: number): { total: number; hasData: boolean } {
      const { from, to } = monthBounds(year, month);
      const monthTxs = txs.filter(t => t.date >= from && t.date <= to);
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

    const actualIncomeThisPeriod = txs
      .filter(t => t.date >= periodFrom && t.date <= periodTo && Number(t.amount) > 0 && !isTransfer(t))
      .reduce((s, t) => s + Number(t.amount), 0);
    const anagraficaIncome = aggregateExpectedIncome(ownerIncome, membersIncome, calMonth + 1);
    const expectedIncome = Math.max(recurringIncomeTotal, actualIncomeThisPeriod, anagraficaIncome);

    const savings = suggestMonthlySavings(expectedIncome, fixedTotal, estimate.variableAvg);

    return { estimate, savings, hasEnoughData: variableMonthlyTotals.length > 0 || fixedTotal > 0 };
  }, [loading, items, txs, ownerIncome, membersIncome, periodFrom, periodTo]);

  if (loading || !result || !result.hasEnoughData) return null;

  const { estimate, savings } = result;
  const monthLabel = new Date().toLocaleDateString("it-IT", { month: "long" });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Feature 3 — Stima spese */}
      <div className="rounded-xl border p-5 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">📊</span>
          <h2 className="font-semibold">Stima spese di {monthLabel}</h2>
        </div>
        <div className="flex flex-col gap-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Spese fisse (certe)</span>
            <span className="font-semibold tabular-nums">{formatEuro(estimate.fixedTotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Spese variabili (stimate)</span>
            <span className="font-semibold tabular-nums">{formatEuro(estimate.variableMin)} – {formatEuro(estimate.variableMax)}</span>
          </div>
          <div className="pt-2 mt-1 border-t flex justify-between items-baseline">
            <span className="font-medium">Totale previsto</span>
            <span className="text-lg font-bold tabular-nums">{formatEuro(estimate.totalMin)} – {formatEuro(estimate.totalMax)}</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          💡 La stima si basa sugli ultimi 3 mesi{estimate.usedSeasonalWeight ? ", con peso sullo stesso mese dell'anno scorso" : ""}.
        </p>
      </div>

      {/* Feature 4 — Suggerimento risparmio */}
      <div className="rounded-xl border p-5 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">💰</span>
          <h2 className="font-semibold">Quanto dovresti risparmiare</h2>
        </div>
        {savings.isTight ? (
          <p className="text-sm text-orange-600 dark:text-orange-400">
            Questo mese il margine è stretto — concentrati sull&apos;essenziale.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Potenziale di risparmio</span>
              <span className="font-semibold tabular-nums">{formatEuro(savings.rawPotential)}</span>
            </div>
            <div className="pt-2 mt-1 border-t flex justify-between items-baseline">
              <span className="font-medium">Suggerito (80%)</span>
              <span className="text-lg font-bold tabular-nums text-green-600 dark:text-green-400">{formatEuro(savings.suggested)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cuscinetto imprevisti (20%)</span>
              <span className="tabular-nums">{formatEuro(savings.buffer)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
