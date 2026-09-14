"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  formatEuro,
  recurringMonthlyEquivalent,
  suggestMonthlySavings,
  aggregateExpectedIncome,
  type IncomeInfo,
} from "@/lib/calculations";

const INCOME_COLS = "income_type, monthly_income, income_frequency, income_payday, income_variability, active_months";
const TRANSFER_CATS = new Set(["spostamenti", "salvadanaio"]);

type RecurringRow = {
  tipologia: "fissa" | "variabile" | "entrata";
  frequency: string;
  custom_days: number | null;
  amount: number;
  amount_max: number | null;
};

type Tx = {
  amount: number; date: string;
  categories?: { name: string } | null;
};

type Props = { userId: string; periodFrom: string; periodTo: string };

const isTransfer = (t: Tx) => TRANSFER_CATS.has(t.categories?.name?.toLowerCase() ?? "");

export function EstimateAndSavingsCard({ userId, periodFrom, periodTo }: Props) {
  const [items, setItems] = useState<RecurringRow[]>([]);
  const [periodTxs, setPeriodTxs] = useState<Tx[]>([]);
  const [budgetTotal, setBudgetTotal] = useState(0);
  const [ownerIncome, setOwnerIncome] = useState<IncomeInfo | null>(null);
  const [membersIncome, setMembersIncome] = useState<(Partial<IncomeInfo> & { is_owner?: boolean })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    Promise.all([
      supabase.from("recurring_expenses").select("tipologia, frequency, custom_days, amount, amount_max").eq("user_id", userId),
      supabase.from("transactions").select("amount, date, categories(name)")
        .eq("user_id", userId).gte("date", periodFrom).lte("date", periodTo),
      supabase.from("category_budgets").select("monthly_budget").eq("user_id", userId),
      supabase.from("profiles").select(INCOME_COLS).eq("id", userId).single(),
      supabase.from("family_members").select(`is_owner, ${INCOME_COLS}`).eq("user_id", userId),
    ]).then(([recRes, txRes, budgetRes, profRes, memRes]) => {
      setItems((recRes.data ?? []) as RecurringRow[]);
      setPeriodTxs((txRes.data ?? []) as unknown as Tx[]);
      setBudgetTotal((budgetRes.data ?? []).reduce((s, r) => s + Number(r.monthly_budget), 0));
      setOwnerIncome((profRes.data ?? null) as IncomeInfo | null);
      setMembersIncome((memRes.data ?? []) as (Partial<IncomeInfo> & { is_owner?: boolean })[]);
      setLoading(false);
    });
  }, [userId, periodFrom, periodTo]);

  const result = useMemo(() => {
    if (loading) return null;
    const calMonth = new Date().getMonth();

    const fixedItems = items.filter(it => it.tipologia === "fissa");
    const incomeItems = items.filter(it => it.tipologia === "entrata");
    const fixedTotal = fixedItems.reduce((s, it) => s + recurringMonthlyEquivalent(it), 0);
    const recurringIncomeTotal = incomeItems.reduce((s, it) => s + recurringMonthlyEquivalent(it), 0);

    const totalPrevisto = fixedTotal + budgetTotal;

    const actualIncomeThisPeriod = periodTxs
      .filter(t => Number(t.amount) > 0 && !isTransfer(t))
      .reduce((s, t) => s + Number(t.amount), 0);
    // Se il titolare si e' identificato come Componente, il suo reddito e' li' (evita di sommarlo due volte).
    const hasOwnerMember = membersIncome.some(m => m.is_owner);
    const anagraficaIncome = aggregateExpectedIncome(hasOwnerMember ? null : ownerIncome, membersIncome, calMonth + 1);
    const expectedIncome = Math.max(recurringIncomeTotal, actualIncomeThisPeriod, anagraficaIncome);

    const savings = suggestMonthlySavings(expectedIncome, fixedTotal, budgetTotal);

    return { fixedTotal, totalPrevisto, savings, hasEnoughData: fixedTotal > 0 || budgetTotal > 0 };
  }, [loading, items, periodTxs, budgetTotal, ownerIncome, membersIncome]);

  if (loading || !result || !result.hasEnoughData) return null;

  const { fixedTotal, totalPrevisto, savings } = result;
  const monthLabel = new Date().toLocaleDateString("it-IT", { month: "long" });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Spese previste (fisse + budget variabile impostato in Smart) */}
      <div className="rounded-xl border p-5 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">📊</span>
          <h2 className="font-semibold">Spese previste di {monthLabel}</h2>
        </div>
        <div className="flex flex-col gap-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Spese fisse (certe)</span>
            <span className="font-semibold tabular-nums">{formatEuro(fixedTotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Budget spese variabili</span>
            <span className="font-semibold tabular-nums">{formatEuro(budgetTotal)}</span>
          </div>
          <div className="pt-2 mt-1 border-t flex justify-between items-baseline">
            <span className="font-medium">Totale previsto</span>
            <span className="text-lg font-bold tabular-nums">{formatEuro(totalPrevisto)}</span>
          </div>
        </div>
        <Link href="/dashboard/smart" className="text-xs text-primary hover:underline">
          Imposta un budget per categoria in Smart →
        </Link>
      </div>

      {/* Suggerimento risparmio */}
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
