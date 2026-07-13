"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  formatEuro,
  calculateFinancialScore,
  calculateCategoryBreakdown,
  type Transaction,
} from "@/lib/calculations";

const MONTH_NAMES = [
  "Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno",
  "Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre",
];

const TRANSFER_CATS = new Set(["spostamenti", "salvadanaio"]);

function pad(n: number) { return String(n).padStart(2, "0"); }

interface MonthReportModalProps {
  userId: string;
  onClose: () => void;
}

export function MonthReportModal({ userId, onClose }: MonthReportModalProps) {
  const now = new Date();
  // Start at previous month
  const initMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
  const initYear  = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

  const [year, setYear]   = useState(initYear);
  const [month, setMonth] = useState(initMonth);
  const [txs, setTxs]     = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const isCurrentOrFuture = year > now.getFullYear() ||
    (year === now.getFullYear() && month >= now.getMonth());

  const fetchMonth = useCallback(async (y: number, m: number) => {
    setLoading(true);
    const from = `${y}-${pad(m + 1)}-01`;
    const lastDay = new Date(y, m + 1, 0).getDate();
    const to   = `${y}-${pad(m + 1)}-${pad(lastDay)}`;
    const supabase = createClient();
    const { data } = await supabase
      .from("transactions")
      .select("id, amount, date, description, category_id, categories(name, color, icon)")
      .eq("user_id", userId)
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: false });
    setTxs((data ?? []) as unknown as Transaction[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchMonth(year, month); }, [year, month, fetchMonth]);

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  }

  function nextMonth() {
    if (isCurrentOrFuture) return;
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  }

  const spendable = txs.filter(t => !TRANSFER_CATS.has(t.categories?.name?.toLowerCase() ?? ""));
  const income     = spendable.filter(t => Number(t.amount) > 0).reduce((s, t) => s + Number(t.amount), 0);
  const expenses   = spendable.filter(t => Number(t.amount) < 0).reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const savings    = income - expenses;
  const score      = calculateFinancialScore(income, expenses);
  const macro      = calculateCategoryBreakdown(spendable);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm overflow-y-auto py-8 px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-background border rounded-xl w-full max-w-lg flex flex-col gap-0 shadow-xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold text-base">Report mesi precedenti</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors text-xl leading-none">✕</button>
        </div>

        {/* Month navigator */}
        <div className="flex items-center justify-between px-5 py-3 border-b bg-muted/20">
          <button
            onClick={prevMonth}
            className="p-1.5 rounded-md hover:bg-muted/60 transition-colors text-muted-foreground hover:text-foreground"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <span className="font-semibold text-sm">
            {MONTH_NAMES[month]} {year}
          </span>
          <button
            onClick={nextMonth}
            disabled={isCurrentOrFuture}
            className="p-1.5 rounded-md hover:bg-muted/60 transition-colors text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 flex flex-col gap-5">
          {loading ? (
            <div className="flex flex-col gap-3 animate-pulse">
              <div className="h-20 rounded-lg bg-muted/40" />
              <div className="h-32 rounded-lg bg-muted/40" />
            </div>
          ) : txs.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <span className="text-4xl">📭</span>
              <p className="text-sm text-muted-foreground">Nessuna transazione per {MONTH_NAMES[month]} {year}.</p>
            </div>
          ) : (
            <>
              {/* KPI row */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border p-3 flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Entrate</span>
                  <span className="text-base font-bold text-green-600 dark:text-green-400 tabular-nums">{formatEuro(income)}</span>
                </div>
                <div className="rounded-lg border p-3 flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Uscite</span>
                  <span className="text-base font-bold text-red-500 tabular-nums">{formatEuro(expenses)}</span>
                </div>
                <div className="rounded-lg border p-3 flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Risparmio</span>
                  <span className={`text-base font-bold tabular-nums ${savings >= 0 ? "text-primary" : "text-red-500"}`}>
                    {formatEuro(savings)}
                  </span>
                </div>
              </div>

              {/* Score */}
              {income > 0 || expenses > 0 ? (
                <div className={`rounded-lg px-4 py-3 flex items-center gap-3 ${score.bgClass}`}>
                  <span className="text-xl">{score.dot}</span>
                  <div className="flex flex-col gap-0.5">
                    <span className={`text-sm font-semibold ${score.colorClass}`}>{score.label}</span>
                    <span className="text-xs text-muted-foreground">{score.message}</span>
                  </div>
                </div>
              ) : null}

              {/* Category breakdown */}
              {macro.length > 0 && (
                <div className="flex flex-col gap-1">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Dove sono andati i soldi</h3>
                  {macro.map(mc => (
                    <div key={mc.key} className="flex flex-col gap-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1.5">
                          <span>{mc.icon}</span>
                          <span className="text-sm">{mc.label}</span>
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{mc.pct.toFixed(0)}%</span>
                          <span className="font-semibold tabular-nums text-sm">{formatEuro(mc.total)}</span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-1">
                        <div className="h-full rounded-full" style={{ width: `${mc.pct}%`, backgroundColor: mc.color }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Recent transactions */}
              <div className="flex flex-col gap-1">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  Transazioni ({txs.length})
                </h3>
                <div className="flex flex-col rounded-lg border overflow-hidden max-h-64 overflow-y-auto">
                  {txs.map((t, i) => (
                    <div
                      key={t.id ?? i}
                      className="flex items-center justify-between px-3 py-2 border-b last:border-b-0 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-base shrink-0">{t.categories?.icon ?? "📦"}</span>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs truncate">{t.description || "Transazione"}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(t.date + "T00:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "short" })}
                          </span>
                        </div>
                      </div>
                      <span className={`text-xs font-semibold tabular-nums whitespace-nowrap ml-3 ${Number(t.amount) >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
                        {Number(t.amount) >= 0 ? "+" : ""}{formatEuro(Number(t.amount))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
