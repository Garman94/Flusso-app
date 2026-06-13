"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { aggregateSinkingFunds } from "@/lib/calculations";
import type { SinkingFundInput } from "@/lib/calculations";

type RecurringRow = {
  id: string;
  name: string;
  tipologia: string;
  amount: number;
  amount_max: number | null;
  next_due_date: string | null;
  saving_start_date: string | null;
};

function fmt(n: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
}

export function SinkingFundsCard({ userId }: { userId: string }) {
  const [items, setItems] = useState<RecurringRow[]>([]);
  const [piggyBalance, setPiggyBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase
        .from("recurring_expenses")
        .select("id, name, tipologia, amount, amount_max, next_due_date, saving_start_date")
        .eq("user_id", userId)
        .not("next_due_date", "is", null),
      supabase
        .from("profiles")
        .select("piggy_balance")
        .eq("id", userId)
        .single(),
    ]).then(([recurringRes, profileRes]) => {
      setItems((recurringRes.data ?? []) as RecurringRow[]);
      setPiggyBalance(Number(profileRes.data?.piggy_balance ?? 0));
      setLoading(false);
    });
  }, [userId]);

  if (loading) return null;

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

  if (sinkingInputs.length === 0) return null;

  const summary = aggregateSinkingFunds(sinkingInputs, piggyBalance);

  const statusColor =
    summary.status === "ahead"  ? "text-green-600 dark:text-green-400" :
    summary.status === "behind" ? "text-destructive" :
                                  "text-primary";

  const statusLabel =
    summary.status === "ahead"  ? "In anticipo 🟢" :
    summary.status === "behind" ? "In ritardo 🔴" :
                                  "In pari ✅";

  return (
    <a
      href="/dashboard/smart"
      className="block rounded-2xl border-2 border-border hover:border-primary/50 transition-colors p-5"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">🏦</span>
          <h2 className="font-semibold text-sm">Accantonamenti</h2>
        </div>
        <span className={`text-xs font-semibold ${statusColor}`}>{statusLabel}</span>
      </div>

      <div className="flex flex-col gap-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Da accantonare questo mese</span>
          <span className="font-bold">{fmt(summary.this_month_total)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Salvadanaio</span>
          <span className="font-semibold">{fmt(summary.piggy_balance)}</span>
        </div>
        <div className="flex justify-between border-t pt-1.5 mt-0.5">
          <span className="text-muted-foreground">Delta</span>
          <span className={`font-bold ${summary.delta >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
            {summary.delta >= 0 ? "+" : ""}{fmt(summary.delta)}
          </span>
        </div>
      </div>
    </a>
  );
}
