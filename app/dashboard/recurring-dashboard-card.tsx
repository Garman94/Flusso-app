"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatEuro } from "@/lib/calculations";

// ─── Types ────────────────────────────────────────────────────────────────────

type Category = { id: string; name: string; color: string; icon: string };

type RecurringExpense = {
  id: string;
  name: string;
  tipologia: "fissa" | "variabile";
  frequency: string;
  custom_days: number | null;
  amount: number;
  amount_max: number | null;
  match_keywords: string[];
  matching_strategy: "keyword" | "historical_avg";
  category_id: string | null;
  categories?: Category | null;
};

type Tx = {
  amount: number;
  date: string;
  category_id?: string | null;
  description?: string | null;
  merchant?: string | null;
};

type Props = { userId: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FREQ_MONTHS: Record<string, number> = {
  mensile: 1, bimestrale: 2, trimestrale: 3, semestrale: 6, annuale: 12,
};

function toMonthlyAmount(it: RecurringExpense): number {
  const mid =
    it.tipologia === "variabile" && it.amount_max != null
      ? (it.amount + it.amount_max) / 2
      : it.amount;
  if (it.frequency === "personalizzata" && it.custom_days)
    return mid * (30 / it.custom_days);
  return mid / (FREQ_MONTHS[it.frequency] ?? 1);
}

function txMatchesKeywords(tx: Tx, keywords: string[]): boolean {
  if (!keywords.length) return false;
  const d = (tx.description ?? "").toLowerCase();
  const m = (tx.merchant   ?? "").toLowerCase();
  return keywords.some(k => {
    const kk = k.toLowerCase().trim();
    return kk && (d.includes(kk) || m.includes(kk));
  });
}

function computeHistoricalAvg(allTxs: Tx[], keywords: string[], calMonth: number, calYear: number): number {
  const matched = allTxs.filter(t => {
    if (Number(t.amount) >= 0) return false;
    const d = new Date(t.date + "T00:00:00");
    if (d.getFullYear() === calYear && d.getMonth() === calMonth) return false;
    return d.getMonth() === calMonth && txMatchesKeywords(t, keywords);
  });
  if (!matched.length) return 0;
  const byYear = new Map<number, number>();
  for (const t of matched) {
    const yr = new Date(t.date + "T00:00:00").getFullYear();
    byYear.set(yr, (byYear.get(yr) ?? 0) + Math.abs(Number(t.amount)));
  }
  const totals = Array.from(byYear.values());
  return totals.reduce((a, b) => a + b, 0) / totals.length;
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function RecurringDashboardCard({ userId }: Props) {
  const [items,   setItems]   = useState<RecurringExpense[]>([]);
  const [txs,     setTxs]     = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  // id categoria aperta nel accordion
  const [openCat, setOpenCat] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];

    Promise.all([
      supabase
        .from("recurring_expenses")
        .select("*, categories(id, name, color, icon)")
        .eq("user_id", userId)
        .order("created_at", { ascending: true }),
      // Fetch tutte le transazioni (servono per historical_avg)
      supabase
        .from("transactions")
        .select("amount, date, category_id, description, merchant")
        .eq("user_id", userId),
    ]).then(([recRes, txRes]) => {
      setItems((recRes.data ?? []) as RecurringExpense[]);
      setTxs((txRes.data ?? []) as Tx[]);
      setLoading(false);
    });
  }, [userId]);

  if (loading) {
    return (
      <div className="rounded-xl border p-5 animate-pulse">
        <div className="h-4 w-40 bg-muted rounded mb-4" />
        <div className="space-y-2">
          <div className="h-3 w-full bg-muted/60 rounded" />
          <div className="h-3 w-3/4 bg-muted/60 rounded" />
        </div>
      </div>
    );
  }

  if (!items.length) return null;

  const now = new Date();
  const calYear  = now.getFullYear();
  const calMonth = now.getMonth();
  const monthStart = new Date(calYear, calMonth, 1).toISOString().split("T")[0];

  // Spesa reale mese corrente per categoria
  const actualByCategory = new Map<string, number>();
  for (const t of txs) {
    if (Number(t.amount) < 0 && t.date >= monthStart && t.category_id) {
      actualByCategory.set(t.category_id, (actualByCategory.get(t.category_id) ?? 0) + Math.abs(Number(t.amount)));
    }
  }

  // Calcola dettaglio per ogni voce
  const detailed = items.map(it => {
    let expectedMonthly: number;
    if (it.matching_strategy === "historical_avg" && it.match_keywords.length > 0) {
      const hist = computeHistoricalAvg(txs, it.match_keywords, calMonth, calYear);
      expectedMonthly = hist > 0 ? hist : toMonthlyAmount(it);
    } else {
      expectedMonthly = toMonthlyAmount(it);
    }

    let actual: number | null = null;
    if (it.match_keywords.length > 0) {
      const monthTxs = txs.filter(t => Number(t.amount) < 0 && t.date >= monthStart);
      actual = monthTxs
        .filter(t => txMatchesKeywords(t, it.match_keywords))
        .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
    } else if (it.category_id) {
      actual = actualByCategory.get(it.category_id) ?? 0;
    }

    return { ...it, expectedMonthly, actual };
  });

  // Raggruppa per categoria
  type CatGroup = {
    key: string;
    label: string;
    icon: string;
    color: string;
    expectedTotal: number;
    actualTotal: number | null;
    items: typeof detailed;
  };

  const catMap = new Map<string, CatGroup>();
  for (const it of detailed) {
    const key   = it.category_id ?? "__none__";
    const label = it.categories?.name  ?? "Senza categoria";
    const icon  = it.categories?.icon  ?? "📦";
    const color = it.categories?.color ?? "#94a3b8";
    if (!catMap.has(key)) catMap.set(key, { key, label, icon, color, expectedTotal: 0, actualTotal: null, items: [] });
    const g = catMap.get(key)!;
    g.expectedTotal += it.expectedMonthly;
    if (it.actual != null) {
      g.actualTotal = (g.actualTotal ?? 0) + it.actual;
    }
    g.items.push(it);
  }

  const groups = Array.from(catMap.values()).sort((a, b) => b.expectedTotal - a.expectedTotal);
  const totalExpected = groups.reduce((s, g) => s + g.expectedTotal, 0);
  const totalActual   = groups.reduce((s, g) => s + (g.actualTotal ?? 0), 0);
  const delta         = totalActual - totalExpected;

  return (
    <div className="rounded-xl border flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <h2 className="font-semibold">Spese ricorrenti</h2>
        <Link href="/dashboard/smart" className="text-xs text-primary hover:underline">
          Gestisci →
        </Link>
      </div>

      {/* Riepilogo top */}
      <div className="grid grid-cols-3 divide-x border-b">
        <div className="px-4 py-3 flex flex-col gap-0.5">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Previsto</span>
          <span className="text-base font-bold tabular-nums">{formatEuro(totalExpected)}</span>
          <span className="text-[10px] text-muted-foreground">questo mese</span>
        </div>
        <div className="px-4 py-3 flex flex-col gap-0.5">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Speso</span>
          <span className="text-base font-bold tabular-nums text-red-500">{formatEuro(totalActual)}</span>
          <span className="text-[10px] text-muted-foreground">rilevato</span>
        </div>
        <div className="px-4 py-3 flex flex-col gap-0.5">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
            {delta >= 0 ? "Sforamento" : "Risparmio"}
          </span>
          <span className={`text-base font-bold tabular-nums ${delta >= 0 ? "text-red-500" : "text-green-600 dark:text-green-400"}`}>
            {delta > 0 ? "+" : ""}{formatEuro(delta)}
          </span>
          <span className="text-[10px] text-muted-foreground">vs previsto</span>
        </div>
      </div>

      {/* Accordion categorie */}
      <div className="divide-y">
        {groups.map(g => {
          const isOpen   = openCat === g.key;
          const gDelta   = g.actualTotal != null ? g.actualTotal - g.expectedTotal : null;
          const pct      = g.expectedTotal > 0 ? Math.min(100, ((g.actualTotal ?? 0) / g.expectedTotal) * 100) : 0;

          return (
            <div key={g.key}>
              {/* Header categoria */}
              <button
                onClick={() => setOpenCat(isOpen ? null : g.key)}
                className="w-full flex items-center gap-3 px-5 py-3 hover:bg-muted/30 transition-colors text-left"
              >
                <span className="text-base shrink-0">{g.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate">{g.label}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      {gDelta != null && (
                        <span className={`text-xs font-semibold tabular-nums ${
                          gDelta > 0 ? "text-red-500" : gDelta < 0 ? "text-green-600 dark:text-green-400" : "text-muted-foreground"
                        }`}>
                          {gDelta > 0 ? "+" : ""}{formatEuro(gDelta)}
                        </span>
                      )}
                      <span className="text-sm font-bold tabular-nums">{formatEuro(g.expectedTotal)}</span>
                      <span className="text-muted-foreground text-xs">{isOpen ? "▲" : "▼"}</span>
                    </div>
                  </div>
                  {/* Mini progress bar */}
                  <div className="mt-1.5 h-1 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        pct > 100 ? "bg-red-500" : pct > 80 ? "bg-yellow-500" : "bg-green-500"
                      }`}
                      style={{ width: `${pct}%`, backgroundColor: pct > 0 && pct <= 80 ? g.color : undefined }}
                    />
                  </div>
                </div>
              </button>

              {/* Voci categoria (espanso) */}
              {isOpen && (
                <div className="bg-muted/10 border-t">
                  {g.items.map(it => (
                    <div key={it.id} className="flex items-center justify-between px-7 py-2 text-xs border-b last:border-b-0 gap-2">
                      <span className="text-muted-foreground truncate min-w-0">{it.name}</span>
                      <div className="flex items-center gap-3 shrink-0 text-right">
                        <span className="text-muted-foreground">{formatEuro(it.expectedMonthly)}/mese</span>
                        {it.actual != null && (
                          <>
                            <span className="text-red-400 font-medium">{formatEuro(it.actual)}</span>
                            <span className={`font-semibold ${
                              it.actual > it.expectedMonthly ? "text-red-500" :
                              it.actual < it.expectedMonthly ? "text-green-600 dark:text-green-400" :
                              "text-muted-foreground"
                            }`}>
                              {it.actual > it.expectedMonthly ? "+" : ""}
                              {formatEuro(it.actual - it.expectedMonthly)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
