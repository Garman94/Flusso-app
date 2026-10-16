"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { aggregateSinkingFunds, potsForSinkingFunds, sinkingFundInput } from "@/lib/calculations";
import type { SinkingFundProjection } from "@/lib/calculations";

type RecurringRow = {
  id: string;
  name: string;
  tipologia: string;
  amount: number;
  amount_max: number | null;
  next_due_date: string | null;
  saving_start_date: string | null;
  saving_offset?: number | null;
  savings_pot_id: string | null;
  categories?: { icon: string | null }[] | null;
};

function fmt(n: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" }).format(n);
}

function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });
}

function DueDateBadge({ iso }: { iso: string }) {
  const due = new Date(iso + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  const urgent = diffDays <= 30;
  return (
    <span className={`text-xs tabular-nums ${urgent ? "text-orange-500 font-semibold" : "text-muted-foreground"}`}>
      {fmtDate(iso)}
    </span>
  );
}

export function SinkingFundsCard({ userId }: { userId: string }) {
  const [items, setItems] = useState<RecurringRow[]>([]);
  const [piggyBalance, setPiggyBalance] = useState(0);
  const [potLabel, setPotLabel] = useState("Nei salvadanai (esclusi quelli degli obiettivi)");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase
        .from("recurring_expenses")
        // "*": comprende saving_offset (migration 041) e regge anche se la colonna non c'è ancora
        .select("*, categories(icon)")
        .eq("user_id", userId)
        .not("next_due_date", "is", null),
      supabase.from("savings_pots").select("id, name, current_balance").eq("user_id", userId),
      supabase.from("goals").select("savings_pot_id").eq("user_id", userId),
    ]).then(([recurringRes, potsRes, goalsRes]) => {
      const rows = (recurringRes.data ?? []) as RecurringRow[];
      setItems(rows);
      // Il salvadanaio degli accantonamenti se scelto, altrimenti quelli non collegati a un
      // obiettivo (quei soldi sono già "per l'obiettivo"): vedi potsForSinkingFunds.
      const linked = rows.map(r => r.savings_pot_id);
      setPiggyBalance(potsForSinkingFunds(potsRes.data ?? [], (goalsRes.data ?? []).map(g => g.savings_pot_id), linked));
      const ids = new Set(linked.filter(Boolean));
      const single = ids.size === 1 ? (potsRes.data ?? []).find(p => ids.has(p.id)) : null;
      if (single) setPotLabel(`Nel salvadanaio "${single.name}"`);
      else if (ids.size > 1) setPotLabel("Nei salvadanai collegati");
      setLoading(false);
    });
  }, [userId]);

  if (loading) return null;

  const sinkingInputs = items
    .filter(it => it.next_due_date && it.saving_start_date)
    .map(sinkingFundInput);

  if (sinkingInputs.length === 0) return null;

  const summary = aggregateSinkingFunds(sinkingInputs, piggyBalance);

  // Dopo un'Emergenza (voci ripartite con saving_offset) essere indietro è normale: si recupera.
  const recovering = summary.status === "behind" && sinkingInputs.some(i => (i.saved_offset ?? 0) !== 0);

  const statusColor =
    summary.status === "ahead"  ? "text-green-600 dark:text-green-400" :
    recovering                  ? "text-amber-600 dark:text-amber-400" :
    summary.status === "behind" ? "text-destructive" :
                                  "text-primary";

  const statusLabel =
    summary.status === "ahead"  ? "In anticipo 🟢" :
    recovering                  ? "In recupero ⏫" :
    summary.status === "behind" ? "In ritardo 🔴" :
                                  "In pari ✅";

  // Next 3 upcoming items sorted by due date
  const upcoming: (SinkingFundProjection & { icon: string })[] = summary.projections
    .filter(p => p.months_remaining >= 0)
    .sort((a, b) => a.input.next_due_date.localeCompare(b.input.next_due_date))
    .slice(0, 3)
    .map(p => {
      const row = items.find(it => it.id === p.input.id);
      return { ...p, icon: row?.categories?.[0]?.icon ?? "💰" };
    });

  return (
    <a
      href="/dashboard/smart?v=accantonamenti"
      className="block rounded-2xl border-2 border-border hover:border-primary/50 transition-colors p-5"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xl">🏦</span>
          <h2 className="font-semibold text-sm">Accantonamenti</h2>
        </div>
        <span className={`text-xs font-semibold ${statusColor}`}>{statusLabel}</span>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-xl bg-muted/50 px-3 py-2.5 flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">Da accantonare/mese</span>
          <span className="font-bold text-base tabular-nums">{fmt(summary.this_month_total)}</span>
        </div>
        <div className="rounded-xl bg-muted/50 px-3 py-2.5 flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">Dovresti avere da parte</span>
          <span className="font-bold text-base tabular-nums">{fmt(summary.expected_saved_total)}</span>
        </div>
      </div>

      {/* Piggy vs expected */}
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-muted-foreground">{potLabel}</span>
        <span className="font-semibold tabular-nums">{fmt(summary.piggy_balance)}</span>
      </div>
      <div className="flex items-center justify-between text-sm pb-4 border-b">
        <span className="text-muted-foreground">Differenza</span>
        <span className={`font-bold tabular-nums ${summary.delta >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
          {summary.delta >= 0 ? "+" : ""}{fmt(summary.delta)}
        </span>
      </div>

      {/* Next 3 upcoming */}
      {upcoming.length > 0 && (
        <div className="mt-4 flex flex-col gap-2">
          <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Prossime scadenze</span>
          {upcoming.map(p => (
            <div key={p.input.id} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base shrink-0">{p.icon}</span>
                <span className="text-sm truncate">{p.input.name}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <DueDateBadge iso={p.input.next_due_date} />
                <span className="text-sm font-semibold tabular-nums">{fmt(p.input.amount_per_cycle)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </a>
  );
}
