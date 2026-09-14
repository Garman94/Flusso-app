"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  formatEuro,
  recurringMonthlyEquivalent,
  suggestMonthlySavings,
  aggregateExpectedIncome,
  aggregateSinkingFunds,
  computeDebtProgress,
  type IncomeInfo,
  type SinkingFundInput,
} from "@/lib/calculations";

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
  next_due_date: string | null;
  saving_start_date: string | null;
  debt_type: string | null;
  debt_total_amount: number | null;
  debt_start_date: string | null;
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
  const [piggyBalance, setPiggyBalance] = useState(0);
  const [ownerIncome, setOwnerIncome] = useState<IncomeInfo | null>(null);
  const [membersIncome, setMembersIncome] = useState<(Partial<IncomeInfo> & { is_owner?: boolean })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    Promise.all([
      supabase.from("recurring_expenses")
        .select("id, name, tipologia, frequency, custom_days, amount, amount_max, next_due_date, saving_start_date, debt_type, debt_total_amount, debt_start_date")
        .eq("user_id", userId),
      supabase.from("transactions").select("amount, date, categories(name)")
        .eq("user_id", userId).gte("date", periodFrom).lte("date", periodTo),
      // categories(name) per escludere "Accantonamenti": quella categoria ha budget
      // bloccato sulla quota mensile calcolata in Smart > Accantonamenti, non va sommata
      // qui come voce manuale (evita un doppio conteggio, la sommiamo già a parte sotto).
      supabase.from("category_budgets").select("monthly_budget, categories(name)").eq("user_id", userId),
      supabase.from("profiles").select(`piggy_balance, ${INCOME_COLS}`).eq("id", userId).single(),
      supabase.from("family_members").select(`is_owner, ${INCOME_COLS}`).eq("user_id", userId),
    ]).then(([recRes, txRes, budgetRes, profRes, memRes]) => {
      setItems((recRes.data ?? []) as RecurringRow[]);
      setPeriodTxs((txRes.data ?? []) as unknown as Tx[]);
      setBudgetTotal((budgetRes.data ?? [])
        .filter(r => (r.categories as unknown as { name: string } | null)?.name?.toLowerCase() !== "accantonamenti")
        .reduce((s, r) => s + Number(r.monthly_budget), 0));
      setPiggyBalance(Number(profRes.data?.piggy_balance ?? 0));
      setOwnerIncome((profRes.data ?? null) as IncomeInfo | null);
      setMembersIncome((memRes.data ?? []) as (Partial<IncomeInfo> & { is_owner?: boolean })[]);
      setLoading(false);
    });
  }, [userId, periodFrom, periodTo]);

  const result = useMemo(() => {
    if (loading) return null;
    const calMonth = new Date().getMonth();

    const incomeItems = items.filter(it => it.tipologia === "entrata");
    const recurringIncomeTotal = incomeItems.reduce((s, it) => s + recurringMonthlyEquivalent(it), 0);

    // Rate in corso (esclude quelle future non ancora iniziate e quelle già terminate).
    const rateMonthly = items
      .filter(it => it.debt_type && it.debt_total_amount && it.debt_start_date)
      .filter(it => computeDebtProgress({ totalAmount: it.debt_total_amount!, monthlyAmount: it.amount, startDate: it.debt_start_date! }).status === "active")
      .reduce((s, it) => s + it.amount, 0);

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

    // Spese previste = Rate in corso + Accantonamenti + Budget spese variabili.
    const totalPrevisto = rateMonthly + sinkingMonthly + budgetTotal;

    const actualIncomeThisPeriod = periodTxs
      .filter(t => Number(t.amount) > 0 && !isTransfer(t))
      .reduce((s, t) => s + Number(t.amount), 0);
    // Se il titolare si e' identificato come Componente, il suo reddito e' li' (evita di sommarlo due volte).
    const hasOwnerMember = membersIncome.some(m => m.is_owner);
    const anagraficaIncome = aggregateExpectedIncome(hasOwnerMember ? null : ownerIncome, membersIncome, calMonth + 1);
    const expectedIncome = Math.max(recurringIncomeTotal, actualIncomeThisPeriod, anagraficaIncome);

    const savings = suggestMonthlySavings(expectedIncome, rateMonthly + sinkingMonthly, budgetTotal);

    return {
      rateMonthly, sinkingMonthly, totalPrevisto, savings,
      hasEnoughData: rateMonthly > 0 || sinkingMonthly > 0 || budgetTotal > 0,
    };
  }, [loading, items, periodTxs, budgetTotal, piggyBalance, ownerIncome, membersIncome]);

  if (loading || !result || !result.hasEnoughData) return null;

  const { rateMonthly, sinkingMonthly, totalPrevisto, savings } = result;
  const monthLabel = new Date().toLocaleDateString("it-IT", { month: "long" });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Spese previste = Rate in corso + Accantonamenti + Budget */}
      <div className="rounded-xl border p-5 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">📊</span>
          <h2 className="font-semibold">Spese previste di {monthLabel}</h2>
        </div>
        <div className="flex flex-col gap-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Rate in corso</span>
            <span className="font-semibold tabular-nums">{formatEuro(rateMonthly)}</span>
          </div>
          {sinkingMonthly > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Accantonamenti (quota mensile)</span>
              <span className="font-semibold tabular-nums">{formatEuro(sinkingMonthly)}</span>
            </div>
          )}
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
          Vai a Smart →
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
